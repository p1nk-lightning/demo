import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

export interface Env {
  DEEPSEEK_API_KEY?: string;
  MOONSHOT_API_KEY?: string;
  RL?: KVNamespace;
  DB?: D1Database;
  FRONTEND_ORIGIN?: string;
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
const RegisterRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});
const LoginRequestSchema = RegisterRequestSchema;

const DIFFICULTY_PROMPT: Record<Difficulty, string> = {
  CET4: 'CET-4 level, common vocabulary, direct sentences, familiar daily topics.',
  CET6: 'CET-6 level, moderate complexity, news, science or social topics.',
  考研: 'Chinese postgraduate entrance exam level, academic tone and complex syntax.',
  雅思: 'IELTS Academic level, neutral formal tone and coherent argumentation.',
  托福: 'TOEFL level, university lecture or academic reading style.',
};

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (context, next) => cors({
  origin: context.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  allowHeaders: ['Content-Type', 'X-Provider-Key'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
})(context, next));

const SESSION_COOKIE_NAME = 'lexiscene_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 210_000;

interface AuthUser {
  id: string;
  email: string;
  email_verified_at: number | null;
  created_at: number;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(hash));
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-512',
    salt,
    iterations,
  }, key, 512);
  return new Uint8Array(bits);
}

async function hashPassword(password: string) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha512$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationValue, saltValue, expectedValue] = storedHash.split('$');
  const iterations = Number(iterationValue);
  if (algorithm !== 'pbkdf2-sha512' || !Number.isInteger(iterations) || iterations < 100_000 || !saltValue || !expectedValue) {
    return false;
  }
  try {
    const actual = await derivePasswordHash(password, base64ToBytes(saltValue), iterations);
    return sameBytes(actual, base64ToBytes(expectedValue));
  } catch {
    return false;
  }
}

function getCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

function sessionCookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(request: Request) {
  return sessionCookie(request, '', 0);
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified_at !== null,
    createdAt: user.created_at,
  };
}

async function createSession(database: D1Database, userId: string) {
  const now = Date.now();
  const token = randomToken();
  await database.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), userId, await sha256(token), now + SESSION_TTL_MS, now, now).run();
  return token;
}

async function getSessionUser(database: D1Database, request: Request) {
  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;
  const now = Date.now();
  const session = await database.prepare(
    'SELECT users.id, users.email, users.email_verified_at, users.created_at, sessions.id AS session_id FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?',
  ).bind(await sha256(token), now).first<AuthUser & { session_id: string }>();
  if (!session) return null;
  await database.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now, session.session_id).run();
  return session;
}

async function deleteCurrentSession(database: D1Database, request: Request) {
  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (token) await database.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
}

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

app.post('/api/auth/register', async (context) => {
  if (!(await checkRateLimit(context.env, getClientIp(context.req.raw)))) {
    return context.json({ error: '请求过于频繁，请稍后再试' }, 429);
  }
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);

  const parsed = RegisterRequestSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    return context.json({ error: '请输入有效邮箱和至少 8 位的密码' }, 400);
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return context.json({ error: '该邮箱已注册，请直接登录' }, 409);

  const now = Date.now();
  const user: AuthUser & { password_hash: string } = {
    id: crypto.randomUUID(),
    email,
    password_hash: await hashPassword(parsed.data.password),
    email_verified_at: null,
    created_at: now,
  };

  try {
    await context.env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(user.id, user.email, user.password_hash, user.email_verified_at, now, now).run();
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: users.email')) {
      return context.json({ error: '该邮箱已注册，请直接登录' }, 409);
    }
    return context.json({ error: '暂时无法创建账号，请稍后再试' }, 500);
  }

  const sessionToken = await createSession(context.env.DB, user.id);
  context.header('Set-Cookie', sessionCookie(context.req.raw, sessionToken, SESSION_TTL_MS / 1000));
  context.header('Cache-Control', 'no-store');
  return context.json({ user: publicUser(user) }, 201);
});

app.post('/api/auth/login', async (context) => {
  if (!(await checkRateLimit(context.env, getClientIp(context.req.raw)))) {
    return context.json({ error: '请求过于频繁，请稍后再试' }, 429);
  }
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);

  const parsed = LoginRequestSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '邮箱或密码错误' }, 400);

  const email = parsed.data.email.toLowerCase();
  const user = await context.env.DB.prepare(
    'SELECT id, email, password_hash, email_verified_at, created_at FROM users WHERE email = ?',
  ).bind(email).first<AuthUser & { password_hash: string }>();
  if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    return context.json({ error: '邮箱或密码错误' }, 401);
  }

  const sessionToken = await createSession(context.env.DB, user.id);
  context.header('Set-Cookie', sessionCookie(context.req.raw, sessionToken, SESSION_TTL_MS / 1000));
  context.header('Cache-Control', 'no-store');
  return context.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  await deleteCurrentSession(context.env.DB, context.req.raw);
  context.header('Set-Cookie', clearSessionCookie(context.req.raw));
  context.header('Cache-Control', 'no-store');
  return context.json({ ok: true });
});

app.get('/api/auth/me', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  context.header('Cache-Control', 'no-store');
  if (!user) return context.json({ error: '未登录' }, 401);
  return context.json({ user: publicUser(user) });
});

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
