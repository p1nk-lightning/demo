import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

export interface Env {
  DEEPSEEK_API_KEY?: string;
  MOONSHOT_API_KEY?: string;
  RL?: KVNamespace;
  DB?: D1Database;
}

type Difficulty = 'CET4' | 'CET6' | '考研' | '雅思' | '托福';

const DifficultySchema = z.enum(['CET4', 'CET6', '考研', '雅思', '托福']);
const TopicSchema = z.enum(['随机', '科技', '文化', '教育', '生活', '商业', '自然']);
const QuestionSchema = z.object({
  question: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  answer: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});
const ArticlePayloadSchema = z.object({
  title: z.string().min(1),
  article: z.string().min(80),
  questions: z.array(QuestionSchema).min(3).max(5),
  difficulty: DifficultySchema,
});
const ProviderSchema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1).max(100),
});
const GenerateRequestSchema = z.object({
  difficulty: DifficultySchema,
  sampleWords: z.array(z.string()).min(1).max(50),
  wordCount: z.number().int().min(100).max(1500).default(300),
  topic: TopicSchema.default('随机'),
  questionCount: z.union([z.literal(3), z.literal(5)]).default(5),
  provider: ProviderSchema.optional(),
});

const DIFFICULTY_PROMPT: Record<Difficulty, string> = {
  CET4: 'CET-4 level, common vocabulary, direct sentences, familiar daily topics.',
  CET6: 'CET-6 level, moderate complexity, news, science or social topics.',
  考研: 'Chinese postgraduate entrance exam level, academic tone and complex syntax.',
  雅思: 'IELTS Academic level, neutral formal tone and coherent argumentation.',
  托福: 'TOEFL level, university lecture or academic reading style.',
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'X-Provider-Key'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

function completionUrl(baseUrl: string) {
  const clean = baseUrl.replace(/\/$/, '');
  return clean.endsWith('/chat/completions') ? clean : `${clean}/chat/completions`;
}

function assertSafeProviderUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('API 地址必须使用 HTTPS');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
    throw new Error('不允许访问本地网络地址');
  }
}

async function callProvider(options: {
  baseUrl: string;
  model: string;
  key: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  assertSafeProviderUrl(options.baseUrl);
  const response = await fetch(completionUrl(options.baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.key}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.65,
    }),
  });
  if (!response.ok) throw new Error(`模型服务返回 ${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回内容');
  return JSON.parse(content) as unknown;
}

async function safeCallSystemProvider(env: Env, systemPrompt: string, userPrompt: string) {
  const providers = [
    env.DEEPSEEK_API_KEY && { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: env.DEEPSEEK_API_KEY },
    env.MOONSHOT_API_KEY && { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', key: env.MOONSHOT_API_KEY },
  ].filter(Boolean) as Array<{ baseUrl: string; model: string; key: string }>;
  let lastError: unknown;
  for (const provider of providers) {
    try {
      return await callProvider({ ...provider, systemPrompt, userPrompt });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('尚未配置可用的 API');
}

function countVocabHits(article: string, words: string[]) {
  const hits = new Set<string>();
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(article)) hits.add(word);
  }
  return [...hits];
}

function minimumHits(wordCount: number) {
  if (wordCount < 200) return 5;
  if (wordCount < 400) return 10;
  if (wordCount < 800) return 15;
  return 20;
}

function getClientIp(request: Request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

async function checkRateLimit(env: Env, ip: string) {
  if (!env.RL) return true;
  const key = `minute:${ip}:${Math.floor(Date.now() / 60000)}`;
  const count = Number((await env.RL.get(key)) ?? 0) + 1;
  await env.RL.put(key, String(count), { expirationTtl: 65 });
  return count <= 10;
}

app.get('/healthz', (context) => context.json({ ok: true, product: 'LexiScene', version: 2 }));

app.post('/api/test-provider', async (context) => {
  const key = context.req.header('x-provider-key');
  if (!key) return context.json({ error: '缺少 API Key' }, 400);
  const parsed = ProviderSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'API 地址或模型名称不正确' }, 400);
  try {
    await callProvider({
      ...parsed.data,
      key,
      systemPrompt: 'Reply with valid JSON only.',
      userPrompt: 'Return {"ok":true}.',
    });
    return context.json({ ok: true });
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : '连接失败' }, 502);
  }
});

app.get('/api/daily', async (context) => {
  if (!context.env.DB) return context.json({ items: [], source: 'fallback' });
  const difficulty = context.req.query('difficulty');
  const date = context.req.query('date') || new Date().toISOString().slice(0, 10);
  const query = context.env.DB.prepare(
    'SELECT * FROM daily_articles WHERE publish_date = ? AND (? IS NULL OR difficulty = ?) ORDER BY difficulty',
  ).bind(date, difficulty || null, difficulty || null);
  const result = await query.all();
  return context.json({ items: result.results, source: 'd1' });
});

app.post('/api/generate', async (context) => {
  if (!(await checkRateLimit(context.env, getClientIp(context.req.raw)))) {
    return context.json({ error: '请求过于频繁，请稍后再试' }, 429);
  }
  const parsed = GenerateRequestSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: '生成参数不正确', detail: parsed.error.format() }, 400);
  const input = parsed.data;
  const targetHits = minimumHits(input.wordCount);
  const systemPrompt = [
    'You create English reading comprehension for Chinese learners.',
    DIFFICULTY_PROMPT[input.difficulty],
    `Write approximately ${input.wordCount} English words about ${input.topic === '随机' ? 'a suitable engaging topic' : input.topic}.`,
    `Create exactly ${input.questionCount} Chinese multiple-choice questions, each with four options and one answer index.`,
    'Return JSON only: {title, article, questions:[{question,options:[4 strings],answer:0|1|2|3}], difficulty}.',
  ].join('\n');
  const userPrompt = `Naturally include at least ${targetHits} of these words: ${input.sampleWords.join(', ')}.`;
  const userKey = context.req.header('x-provider-key');

  try {
    let raw: unknown;
    if (input.provider && userKey) {
      raw = await callProvider({ ...input.provider, key: userKey, systemPrompt, userPrompt });
    } else {
      raw = await safeCallSystemProvider(context.env, systemPrompt, userPrompt);
    }
    const article = ArticlePayloadSchema.parse(raw);
    const hitIds = countVocabHits(article.article, input.sampleWords);
    return context.json({ ...article, vocabHitIds: hitIds, meetThreshold: hitIds.length >= targetHits });
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : '生成失败' }, 502);
  }
});

app.notFound((context) => context.json({ error: 'not found' }, 404));

export default app;
