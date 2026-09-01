// LLM provider 调用与生成配额(自 index.ts 纯移动,逻辑零变化)。
import type { Env } from '../types';
import type { ModelProvider } from '../schemas';
import { chinaDayKey } from './time';

export const DIFFICULTY_PROMPT: Record<string, string> = {
  CET4: 'CET-4 practice level: mostly high-frequency college vocabulary, direct argument, concrete context, and short readable sentences.',
  CET6: 'CET-6 practice level: moderate news, science, or social topics, controlled abstraction, comparison, and readable varied sentences.',
  考研: 'Chinese postgraduate entrance-exam practice level: academic argument, thesis and evidence, discourse markers, inference, and carefully controlled embedded clauses.',
  雅思: 'IELTS Academic reading practice level: neutral formal tone, information-rich paragraphs, precise references, cohesion, and factual detail.',
  托福: 'TOEFL academic reading practice level: university-style explanation, academic topic, cause-and-effect, examples, rhetorical purpose, and answerable inference.',
};

function completionUrl(baseUrl: string) {
  const clean = baseUrl.replace(/\/$/, '');
  return clean.endsWith('/chat/completions') ? clean : `${clean}/chat/completions`;
}

function assertSafeProviderUrl(raw: string, allowLocalProxy = false) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1';
  if (url.protocol !== 'https:' && !(allowLocalProxy && url.protocol === 'http:' && isLoopback)) {
    throw new Error('API 地址必须使用 HTTPS');
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
    if (allowLocalProxy && isLoopback) return;
    throw new Error('不允许访问本地网络地址');
  }
}

export async function callProvider(options: {
  baseUrl: string;
  model: string;
  key: string;
  systemPrompt: string;
  userPrompt: string;
  proxyToken?: string;
  proxyPurpose?: 'generation' | 'review';
}) {
  assertSafeProviderUrl(options.baseUrl, Boolean(options.proxyToken));
  let response: Response;
  try {
    response = await fetch(completionUrl(options.baseUrl), {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + (options.proxyToken ?? options.key),
        ...(options.proxyPurpose ? { 'x-lexiscene-model-purpose': options.proxyPurpose } : {}),
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
  } catch {
    throw new Error('模型服务网络连接失败。请检查网络，或使用 worker:dev:remote 进行远程开发调试。');
  }
  if (!response.ok) throw new Error(`模型服务返回 ${response.status}`);
  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回内容');
  return {
    value: JSON.parse(content) as unknown,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
    },
  };
}

export interface BuiltinProvider {
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  key: string;
  proxyToken?: string;
  proxyPurpose?: 'generation' | 'review';
}

export function getBuiltinProvider(env: Env, provider: ModelProvider): BuiltinProvider {
  if (provider === 'deepseek' && (env.DEEPSEEK_GENERATION_API_KEY || env.DEEPSEEK_API_KEY)) {
    const useDevProxy = Boolean(env.DEEPSEEK_DEV_PROXY_URL && env.DEEPSEEK_DEV_PROXY_TOKEN);
    return {
      provider,
      baseUrl: useDevProxy ? env.DEEPSEEK_DEV_PROXY_URL! : 'https://api.deepseek.com',
      model: env.DEEPSEEK_MODEL || 'deepseek-chat',
      key: env.DEEPSEEK_GENERATION_API_KEY || env.DEEPSEEK_API_KEY!,
      proxyToken: useDevProxy ? env.DEEPSEEK_DEV_PROXY_TOKEN : undefined,
      proxyPurpose: useDevProxy ? 'generation' : undefined,
    };
  }
  if (provider === 'qwen' && env.DASHSCOPE_API_KEY) {
    return { provider, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: env.QWEN_MODEL || 'qwen-plus', key: env.DASHSCOPE_API_KEY };
  }
  if (provider === 'doubao' && env.ARK_API_KEY && env.DOUBAO_MODEL) {
    return { provider, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: env.DOUBAO_MODEL, key: env.ARK_API_KEY };
  }
  throw new Error('选定模型暂未配置，请稍后再试');
}

export function getReviewProvider(env: Env): BuiltinProvider {
  if (!env.DEEPSEEK_REVIEW_API_KEY) throw new Error('AI 审核 Key 尚未配置');
  const useDevProxy = Boolean(env.DEEPSEEK_DEV_PROXY_URL && env.DEEPSEEK_DEV_PROXY_TOKEN);
  return {
    provider: 'deepseek',
    baseUrl: useDevProxy ? env.DEEPSEEK_DEV_PROXY_URL! : 'https://api.deepseek.com',
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    key: env.DEEPSEEK_REVIEW_API_KEY,
    proxyToken: useDevProxy ? env.DEEPSEEK_DEV_PROXY_TOKEN : undefined,
    proxyPurpose: useDevProxy ? 'review' : undefined,
  };
}

export async function reserveGeneration(database: D1Database, userId: string, provider: BuiltinProvider) {
  const now = Date.now();
  const usageId = crypto.randomUUID();
  const dayKey = chinaDayKey(now);
  const activePendingSince = now - 15 * 60_000;
  const result = await database.prepare(
    "INSERT INTO generation_usage (id,user_id,day_key,provider,model,status,created_at,updated_at) SELECT ?,?,?,?,?, 'pending',?,? WHERE (SELECT COUNT(*) FROM generation_usage WHERE user_id = ? AND day_key = ? AND (status = 'succeeded' OR (status = 'pending' AND created_at > ?))) < 10 AND (SELECT COUNT(*) FROM generation_usage WHERE user_id = ? AND created_at > ?) < 2",
  ).bind(usageId, userId, dayKey, provider.provider, provider.model, now, now, userId, dayKey, activePendingSince, userId, now - 60_000).run();
  return result.meta.changes === 1 ? usageId : null;
}

export async function finishGeneration(database: D1Database, usageId: string, values: {
  status: 'succeeded' | 'failed';
  articleId?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  errorCode?: string;
}) {
  await database.prepare(
    'UPDATE generation_usage SET status = ?, article_id = ?, prompt_tokens = ?, completion_tokens = ?, error_code = ?, updated_at = ? WHERE id = ?',
  ).bind(values.status, values.articleId ?? null, values.promptTokens ?? null, values.completionTokens ?? null, values.errorCode ?? null, Date.now(), usageId).run();
}
