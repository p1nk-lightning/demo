// Cloudflare Worker BFF
// 路由:
//   POST /api/generate       { difficulty, sampleWords, retryHint? }
//   GET  /api/dict/:word     兼容旧浏览器直连词典的 fallback (默认前端自己请求)
//   GET  /healthz
//
// 关键点:
// - DeepSeek (主) + Moonshot (备) 通过 safeCallLLM() 自动降级
// - Zod 校验 + 正则统计词表词命中数 (<15 自动追加 retryHint 重试, 最多 2 次)
// - 简易 KV 限流: 每 IP 每分钟 10 次, 每日 100 次

import { z } from 'zod';

export interface Env {
  DEEPSEEK_API_KEY?: string;
  MOONSHOT_API_KEY?: string;
  RL?: KVNamespace;
}

type Difficulty = 'CET4' | 'CET6' | '考研' | '雅思' | '托福';

const DifficultySchema = z.union([
  z.literal('CET4'),
  z.literal('CET6'),
  z.literal('考研'),
  z.literal('雅思'),
  z.literal('托福'),
]);

const QuestionSchema = z.object({
  question: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  answer: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

const ArticlePayloadSchema = z.object({
  title: z.string().min(1),
  article: z.string().min(50),
  questions: z.array(QuestionSchema).length(5),
  difficulty: DifficultySchema,
});

const GenerateRequestSchema = z.object({
  difficulty: DifficultySchema,
  sampleWords: z.array(z.string()).min(1).max(50),
  retryHint: z.string().optional(),
});

const PROVIDERS = {
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    keyEnv: 'DEEPSEEK_API_KEY' as const,
  },
  moonshot: {
    url: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
    keyEnv: 'MOONSHOT_API_KEY' as const,
  },
};

const DIFFICULTY_PROMPT: Record<Difficulty, string> = {
  CET4: 'CET-4 level: common 3500-word band, simple sentences, daily topics.',
  CET6: 'CET-6 level: 5500-word band, moderate complexity, news/academic topics.',
  考研: 'Graduate entrance exam level: academic reading, complex syntax, humanities/science.',
  雅思: 'IELTS Academic level: ~300 words, one neutral/academic topic, formal tone.',
  托福: 'TOEFL level: ~300 words, university lecture or academic topic, formal tone.',
};

async function safeCallLLM(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ json: any; provider: 'deepseek' | 'moonshot' }> {
  let lastErr: unknown;
  for (const name of ['deepseek', 'moonshot'] as const) {
    const cfg = PROVIDERS[name];
    const key = env[cfg.keyEnv];
    if (!key) continue;
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.6,
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${name} ${res.status}`);
        continue;
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`${name} ${res.status}: ${t}`);
      }
      const data: any = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error(`${name} empty content`);
      return { json: JSON.parse(text), provider: name };
    } catch (err) {
      lastErr = err;
      // 继续下一个 provider
    }
  }
  throw new Error(`LLM failed: ${(lastErr as Error)?.message ?? 'unknown'}`);
}

function countVocabHits(article: string, sampleWords: string[]): string[] {
  const lower = article.toLowerCase();
  const hits = new Set<string>();
  for (const w of sampleWords) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) hits.add(w);
  }
  return Array.from(hits);
}

async function generateOnce(
  env: Env,
  difficulty: Difficulty,
  sampleWords: string[],
  retryHint?: string,
) {
  const sys = [
    'You are a reading comprehension question setter for Chinese learners.',
    `Write at ${DIFFICULTY_PROMPT[difficulty]}`,
    'Output strictly JSON with shape:',
    '{ "title": string, "article": string (~300 English words), "questions": [ { "question": string (Chinese), "options": [string,string,string,string], "answer": 0|1|2|3 } x 5 ], "difficulty": "CET4"|"CET6"|"考研"|"雅思"|"托福" }',
    '- 中文题干应指向文章细节、主旨、推理、词义或作者态度',
    '- 4 个选项, 长度相近, 仅 1 个正确',
    '- answer 是正确选项下标 (0/1/2/3)',
    '- 不要出现 markdown 代码块, 直接 JSON',
  ].join('\n');

  const userParts = [
    `必须包含以下至少 15 个词 (自然嵌入正文, 不要堆叠或括注): ${sampleWords.join(', ')}`,
  ];
  if (retryHint) userParts.push(retryHint);
  const user = userParts.join('\n');

  const { json } = await safeCallLLM(env, sys, user);
  return ArticlePayloadSchema.parse(json);
}

async function generateWithRetry(
  env: Env,
  difficulty: Difficulty,
  sampleWords: string[],
): Promise<{ result: z.infer<typeof ArticlePayloadSchema>; hitIds: string[]; attempts: number }> {
  let attempts = 0;
  let lastHit = 0;
  let firstSuccess: z.infer<typeof ArticlePayloadSchema> | null = null;
  let retryHint: string | undefined;

  for (let i = 0; i < 3; i++) {
    attempts++;
    let result: z.infer<typeof ArticlePayloadSchema>;
    try {
      result = await generateOnce(env, difficulty, sampleWords, retryHint);
    } catch (err) {
      // JSON 非法 / 校验失败: 重试时附带更严格的输出要求
      retryHint = `IMPORTANT: Output strictly valid JSON only. No markdown. No trailing text. Retry the same task. ${i + 1}/3`;
      continue;
    }
    if (!firstSuccess) firstSuccess = result;
    const hits = countVocabHits(result.article, sampleWords);
    lastHit = hits.length;
    if (hits.length >= 15) {
      return { result, hitIds: hits, attempts: i + 1 };
    }
    // 追加更明确的指令再试
    retryHint = `CRITICAL: 上一次文章中只有 ${hits.length} 个词命中! 必须再次重写, 并通过自然语境把以下词都嵌入正文: ${sampleWords.slice(0, 30).join(', ')}. 让至少 15 个出现在文中. 这次是第 ${i + 2}/3 次尝试.`;
  }
  // 兜底: 接受最后一次结果 (即使 <15)
  if (firstSuccess) {
    const hits = countVocabHits(firstSuccess.article, sampleWords);
    return { result: firstSuccess, hitIds: hits, attempts };
  }
  throw new Error('生成失败: 所有尝试都未通过 JSON 校验');
}

// ---- 路由 ----

function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

async function checkRateLimit(env: Env, ip: string): Promise<{ ok: boolean; reason?: string }> {
  if (!env.RL) return { ok: true }; // 没绑 KV 就不限流 (开发态)
  const minuteKey = `m:${ip}:${Math.floor(Date.now() / 60000)}`;
  const dayKey = `d:${ip}:${new Date().toISOString().slice(0, 10)}`;
  const minute = Number((await env.RL.get(minuteKey)) ?? 0) + 1;
  const day = Number((await env.RL.get(dayKey)) ?? 0) + 1;
  await env.RL.put(minuteKey, String(minute), { expirationTtl: 65 });
  await env.RL.put(dayKey, String(day), { expirationTtl: 60 * 60 * 26 });
  if (minute > 10) return { ok: false, reason: '每分钟最多 10 次' };
  if (day > 100) return { ok: false, reason: '每日最多 100 次' };
  return { ok: true };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/healthz') {
      return json({ ok: true, ts: Date.now() });
    }

    if (url.pathname === '/api/generate' && req.method === 'POST') {
      // 限流
      const ip = getClientIp(req);
      const rl = await checkRateLimit(env, ip);
      if (!rl.ok) return json({ error: rl.reason }, 429);

      let body: any;
      try {
        body = await req.json();
      } catch {
        return json({ error: 'invalid json' }, 400);
      }
      const parsed = GenerateRequestSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: 'bad request', detail: parsed.error.format() }, 400);
      }

      const { difficulty, sampleWords } = parsed.data;
      if (sampleWords.length === 0) {
        return json({ error: 'sampleWords 不能为空' }, 400);
      }
      try {
        const { result, hitIds, attempts } = await generateWithRetry(env, difficulty, sampleWords);
        return json({
          title: result.title,
          article: result.article,
          questions: result.questions,
          difficulty: result.difficulty,
          vocabHitIds: hitIds,
          attempts,
          meetThreshold: hitIds.length >= 15,
        });
      } catch (err: any) {
        return json({ error: err?.message ?? 'llm error' }, 502);
      }
    }

    return json({ error: 'not found' }, 404);
  },
};
