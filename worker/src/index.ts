import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

export interface Env {
  DEEPSEEK_API_KEY?: string;
  DASHSCOPE_API_KEY?: string;
  ARK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  QWEN_MODEL?: string;
  DOUBAO_MODEL?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
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
const ModelProviderSchema = z.enum(['deepseek', 'qwen', 'doubao']);
const GenerateRequestSchema = z.object({
  provider: ModelProviderSchema,
  difficulty: DifficultySchema,
  sampleWords: z.array(z.string()).min(1).max(50),
  wordCount: z.number().int().min(100).max(1500).default(300),
  topic: TopicSchema.default('随机'),
  questionCount: z.union([z.literal(3), z.literal(5)]).default(5),
});
const RegisterRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().min(1).max(2048),
});
const LoginRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});
const VerifyEmailRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
const SyncVocabListSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().max(200),
  difficulty: DifficultySchema,
  wordCount: z.number().int().nonnegative(),
  masteredCount: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().optional(),
  schemaVersion: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional(),
});
const SyncVocabItemSchema = z.object({
  id: z.string().min(1).max(120),
  listId: z.string().min(1).max(120),
  text: z.string().min(1).max(300),
  normalized: z.string().min(1).max(300),
  source: z.enum(['pasted', 'xlsx', 'reading']),
  mastered: z.boolean(),
  addedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional(),
});
const SyncArticleSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  article: z.string().min(1).max(100000),
  questions: z.array(QuestionSchema).max(10),
  difficulty: DifficultySchema,
  vocabHitIds: z.array(z.string().max(300)).max(500),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative().optional(),
  summary: z.string().max(2000).optional(),
  topic: TopicSchema.optional(),
  wordCount: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().nonnegative().optional(),
  source: z.enum(['generated', 'daily']).optional(),
  coverUrl: z.string().max(2000).optional(),
  publishDate: z.string().max(40).optional(),
  provider: ModelProviderSchema.optional(),
  model: z.string().max(160).optional(),
  deletedAt: z.number().int().nonnegative().optional(),
});
const SyncProgressSchema = z.object({
  id: z.string().min(1).max(120),
  articleId: z.string().min(1).max(120),
  answers: z.array(z.union([z.number().int().min(0).max(3), z.null()])).max(20),
  score: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional(),
});
const SyncPayloadSchema = z.object({
  vocabLists: z.array(SyncVocabListSchema).max(2000),
  vocabItems: z.array(SyncVocabItemSchema).max(20000),
  articles: z.array(SyncArticleSchema).max(2000),
  progress: z.array(SyncProgressSchema).max(5000),
});

const DIFFICULTY_PROMPT: Record<Difficulty, string> = {
  CET4: 'CET-4 level, common vocabulary, direct sentences, familiar daily topics.',
  CET6: 'CET-6 level, moderate complexity, news, science or social topics.',
  考研: 'Chinese postgraduate entrance exam level, academic tone and complex syntax.',
  雅思: 'IELTS Academic level, neutral formal tone and coherent argumentation.',
  托福: 'TOEFL level, university lecture or academic reading style.',
};

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (context, next) => {
  const requestOrigin = context.req.header('origin') ?? '';
  const localOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
  ];
  return cors({
  origin: context.env.FRONTEND_ORIGIN || (localOrigins.includes(requestOrigin) ? requestOrigin : 'http://localhost:5173'),
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  })(context, next);
});

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
  const isSecure = new URL(request.url).protocol === 'https:';
  const secure = isSecure ? '; Secure' : '';
  const sameSite = isSecure ? 'None' : 'Lax';
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secure}`;
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
      authorization: 'Bearer ' + options.key,
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

type ModelProvider = z.infer<typeof ModelProviderSchema>;

interface BuiltinProvider {
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  key: string;
}

function getBuiltinProvider(env: Env, provider: ModelProvider): BuiltinProvider {
  if (provider === 'deepseek' && env.DEEPSEEK_API_KEY) {
    return { provider, baseUrl: 'https://api.deepseek.com/v1', model: env.DEEPSEEK_MODEL || 'deepseek-chat', key: env.DEEPSEEK_API_KEY };
  }
  if (provider === 'qwen' && env.DASHSCOPE_API_KEY) {
    return { provider, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: env.QWEN_MODEL || 'qwen-plus', key: env.DASHSCOPE_API_KEY };
  }
  if (provider === 'doubao' && env.ARK_API_KEY && env.DOUBAO_MODEL) {
    return { provider, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: env.DOUBAO_MODEL, key: env.ARK_API_KEY };
  }
  throw new Error('选定模型暂未配置，请稍后再试');
}

function chinaDayKey(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

async function reserveGeneration(database: D1Database, userId: string, provider: BuiltinProvider) {
  const now = Date.now();
  const usageId = crypto.randomUUID();
  const dayKey = chinaDayKey(now);
  const activePendingSince = now - 15 * 60_000;
  const result = await database.prepare(
    "INSERT INTO generation_usage (id,user_id,day_key,provider,model,status,created_at,updated_at) SELECT ?,?,?,?,?, 'pending',?,? WHERE (SELECT COUNT(*) FROM generation_usage WHERE user_id = ? AND day_key = ? AND (status = 'succeeded' OR (status = 'pending' AND created_at > ?))) < 10 AND (SELECT COUNT(*) FROM generation_usage WHERE user_id = ? AND created_at > ?) < 2",
  ).bind(usageId, userId, dayKey, provider.provider, provider.model, now, now, userId, dayKey, activePendingSince, userId, now - 60_000).run();
  return result.meta.changes === 1 ? usageId : null;
}

async function finishGeneration(database: D1Database, usageId: string, values: {
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

function randomVerificationCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

async function createVerificationToken(database: D1Database, userId: string) {
  const now = Date.now();
  const code = randomVerificationCode();
  await database.batch([
    database.prepare('DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL').bind(userId),
    database.prepare('INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, await sha256(`${userId}:${code}`), now + 10 * 60 * 1000, now),
  ]);
  return code;
}

async function sendVerificationEmail(env: Env, email: string, code: string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error('邮件服务尚未配置');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: `${code} - LexiScene 邮箱验证码`,
      html: `<p>你的 LexiScene 邮箱验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>验证码将在 10 分钟后失效，请勿转发给他人。</p>`,
    }),
  });
  if (!response.ok) throw new Error('验证邮件发送失败');
}

async function verifyTurnstile(env: Env, token: string, ip: string) {
  if (!env.TURNSTILE_SECRET_KEY) throw new Error('Turnstile 尚未配置');
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  form.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!response.ok) throw new Error('Turnstile 验证服务不可用');
  const result = await response.json() as { success?: boolean };
  return result.success === true;
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

const memoryRateLimits = new Map<string, { count: number; expiresAt: number }>();

async function checkRateLimit(env: Env, ip: string) {
  const key = `minute:${ip}:${Math.floor(Date.now() / 60000)}`;
  if (!env.RL) {
    const now = Date.now();
    const current = memoryRateLimits.get(key);
    const count = current && current.expiresAt > now ? current.count + 1 : 1;
    memoryRateLimits.set(key, { count, expiresAt: now + 65_000 });
    if (memoryRateLimits.size > 500) {
      for (const [storedKey, value] of memoryRateLimits) if (value.expiresAt <= now) memoryRateLimits.delete(storedKey);
    }
    return count <= 10;
  }
  const count = Number((await env.RL.get(key)) ?? 0) + 1;
  await env.RL.put(key, String(count), { expirationTtl: 65 });
  return count <= 10;
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return typeof value === 'string' ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

async function batchStatements(database: D1Database, statements: D1PreparedStatement[], size = 50) {
  for (let index = 0; index < statements.length; index += size) {
    await database.batch(statements.slice(index, index + size));
  }
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

  try {
    const verified = await verifyTurnstile(context.env, parsed.data.turnstileToken, getClientIp(context.req.raw));
    if (!verified) return context.json({ error: '人机验证未通过，请重试' }, 400);
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : '人机验证服务不可用' }, 503);
  }
  if (!context.env.RESEND_API_KEY || !context.env.EMAIL_FROM) {
    return context.json({ error: '邮件验证服务尚未配置' }, 503);
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
  let verificationEmailSent = true;
  try {
    const code = await createVerificationToken(context.env.DB, user.id);
    await sendVerificationEmail(context.env, user.email, code);
  } catch {
    verificationEmailSent = false;
  }
  context.header('Set-Cookie', sessionCookie(context.req.raw, sessionToken, SESSION_TTL_MS / 1000));
  context.header('Cache-Control', 'no-store');
  return context.json({ user: publicUser(user), verificationEmailSent }, 201);
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

app.post('/api/auth/verify-email', async (context) => {
  if (!(await checkRateLimit(context.env, getClientIp(context.req.raw)))) {
    return context.json({ error: '验证次数过多，请稍后再试' }, 429);
  }
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录后再验证邮箱' }, 401);
  if (user.email_verified_at !== null) return context.json({ ok: true, alreadyVerified: true });
  const parsed = VerifyEmailRequestSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '请输入 6 位数字验证码' }, 400);
  const now = Date.now();
  const record = await context.env.DB.prepare(
    'SELECT id, token_hash FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
  ).bind(user.id, now).first<{ id: string; token_hash: string }>();
  if (!record) return context.json({ error: '验证码已失效，请重新发送' }, 400);
  const actualHash = await sha256(`${user.id}:${parsed.data.code}`);
  if (!sameBytes(base64ToBytes(actualHash), base64ToBytes(record.token_hash))) {
    return context.json({ error: '验证码错误' }, 400);
  }
  await context.env.DB.batch([
    context.env.DB.prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?').bind(now, now, user.id),
    context.env.DB.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE id = ?').bind(now, record.id),
  ]);
  return context.json({ ok: true, alreadyVerified: false });
});

app.post('/api/auth/resend-verification', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '未登录' }, 401);
  if (user.email_verified_at !== null) return context.json({ ok: true, alreadyVerified: true });
  if (!context.env.RESEND_API_KEY || !context.env.EMAIL_FROM) return context.json({ error: '邮件验证服务尚未配置' }, 503);
  const recent = await context.env.DB.prepare(
    'SELECT id FROM email_verification_tokens WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1',
  ).bind(user.id, Date.now() - 60_000).first();
  if (recent) return context.json({ error: '验证邮件刚刚发送，请稍后再试' }, 429);
  try {
    const code = await createVerificationToken(context.env.DB, user.id);
    await sendVerificationEmail(context.env, user.email, code);
    return context.json({ ok: true });
  } catch {
    return context.json({ error: '验证邮件发送失败，请稍后重试' }, 502);
  }
});

app.get('/api/sync/snapshot', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '未登录' }, 401);
  const [lists, items, articles, progress] = await Promise.all([
    context.env.DB.prepare('SELECT * FROM vocab_lists WHERE user_id = ?').bind(user.id).all(),
    context.env.DB.prepare('SELECT * FROM vocab_items WHERE user_id = ?').bind(user.id).all(),
    context.env.DB.prepare('SELECT * FROM articles WHERE user_id = ?').bind(user.id).all(),
    context.env.DB.prepare('SELECT * FROM reading_progress WHERE user_id = ?').bind(user.id).all(),
  ]);
  return context.json({
    vocabLists: lists.results.map((row) => ({
      id: row.id, name: row.name, difficulty: row.difficulty, wordCount: row.word_count,
      masteredCount: row.mastered_count, createdAt: row.created_at, updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at ?? undefined, schemaVersion: row.schema_version, deletedAt: row.deleted_at ?? undefined,
    })),
    vocabItems: items.results.map((row) => ({
      id: row.id, listId: row.list_id, text: row.text, normalized: row.normalized, source: row.source,
      mastered: Boolean(row.mastered), addedAt: row.added_at, updatedAt: row.updated_at, deletedAt: row.deleted_at ?? undefined,
    })),
    articles: articles.results.map((row) => ({
      id: row.id, title: row.title, article: row.article, questions: parseJson(row.questions_json, []),
      difficulty: row.difficulty, vocabHitIds: parseJson(row.vocab_hit_ids_json, []), createdAt: row.created_at,
      updatedAt: row.updated_at, summary: row.summary ?? undefined, topic: row.topic ?? undefined,
      wordCount: row.word_count ?? undefined, estimatedMinutes: row.estimated_minutes ?? undefined,
      source: row.source ?? undefined, coverUrl: row.cover_url ?? undefined, publishDate: row.publish_date ?? undefined,
      provider: row.provider ?? undefined, model: row.model ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
    })),
    progress: progress.results.map((row) => ({
      id: row.id, articleId: row.article_id, answers: parseJson(row.answers_json, []),
      score: row.score, completedAt: row.completed_at, updatedAt: row.updated_at, deletedAt: row.deleted_at ?? undefined,
    })),
  });
});

app.post('/api/sync/push', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '未登录' }, 401);
  const parsed = SyncPayloadSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '同步数据格式不正确' }, 400);
  const { vocabLists, vocabItems, articles, progress } = parsed.data;
  const statements: D1PreparedStatement[] = [];
  for (const record of vocabLists) statements.push(context.env.DB.prepare(
    'INSERT INTO vocab_lists (user_id,id,name,difficulty,word_count,mastered_count,created_at,updated_at,last_used_at,schema_version,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,difficulty=excluded.difficulty,word_count=excluded.word_count,mastered_count=excluded.mastered_count,created_at=excluded.created_at,updated_at=excluded.updated_at,last_used_at=excluded.last_used_at,schema_version=excluded.schema_version,deleted_at=excluded.deleted_at WHERE excluded.updated_at >= vocab_lists.updated_at',
  ).bind(user.id, record.id, record.name, record.difficulty, record.wordCount, record.masteredCount, record.createdAt, record.updatedAt, record.lastUsedAt ?? null, record.schemaVersion, record.deletedAt ?? null));
  for (const record of vocabItems) statements.push(context.env.DB.prepare(
    'INSERT INTO vocab_items (user_id,id,list_id,text,normalized,source,mastered,added_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET list_id=excluded.list_id,text=excluded.text,normalized=excluded.normalized,source=excluded.source,mastered=excluded.mastered,added_at=excluded.added_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at WHERE excluded.updated_at >= vocab_items.updated_at',
  ).bind(user.id, record.id, record.listId, record.text, record.normalized, record.source, record.mastered ? 1 : 0, record.addedAt, record.updatedAt, record.deletedAt ?? null));
  for (const record of articles) statements.push(context.env.DB.prepare(
    'INSERT INTO articles (user_id,id,title,article,questions_json,difficulty,vocab_hit_ids_json,created_at,updated_at,summary,topic,word_count,estimated_minutes,source,cover_url,publish_date,provider,model,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET title=excluded.title,article=excluded.article,questions_json=excluded.questions_json,difficulty=excluded.difficulty,vocab_hit_ids_json=excluded.vocab_hit_ids_json,created_at=excluded.created_at,updated_at=excluded.updated_at,summary=excluded.summary,topic=excluded.topic,word_count=excluded.word_count,estimated_minutes=excluded.estimated_minutes,source=excluded.source,cover_url=excluded.cover_url,publish_date=excluded.publish_date,provider=excluded.provider,model=excluded.model,deleted_at=excluded.deleted_at WHERE excluded.updated_at >= articles.updated_at',
  ).bind(user.id, record.id, record.title, record.article, JSON.stringify(record.questions), record.difficulty, JSON.stringify(record.vocabHitIds), record.createdAt, record.updatedAt ?? record.createdAt, record.summary ?? null, record.topic ?? null, record.wordCount ?? null, record.estimatedMinutes ?? null, record.source ?? null, record.coverUrl ?? null, record.publishDate ?? null, record.provider ?? null, record.model ?? null, record.deletedAt ?? null));
  for (const record of progress) statements.push(context.env.DB.prepare(
    'INSERT INTO reading_progress (user_id,article_id,id,answers_json,score,completed_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,article_id) DO UPDATE SET id=excluded.id,answers_json=excluded.answers_json,score=excluded.score,completed_at=excluded.completed_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at WHERE excluded.updated_at >= reading_progress.updated_at',
  ).bind(user.id, record.articleId, record.id, JSON.stringify(record.answers), record.score, record.completedAt, record.updatedAt, record.deletedAt ?? null));
  await batchStatements(context.env.DB, statements);
  return context.json({ ok: true, count: statements.length });
});

/* app.post('/api/test-provider', async (context) => {
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
}); */

app.get('/api/daily', async (context) => {
  if (!context.env.DB) return context.json({ items: [], source: 'fallback' });
  const difficulty = context.req.query('difficulty');
  const date = context.req.query('date') || chinaDayKey();
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
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录后再生成文章' }, 401);
  if (user.email_verified_at === null) return context.json({ error: '请先验证邮箱后再生成文章' }, 403);
  const parsed = GenerateRequestSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '生成参数不正确', detail: parsed.error.format() }, 400);
  const input = parsed.data;
  let provider: BuiltinProvider;
  try {
    provider = getBuiltinProvider(context.env, input.provider);
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : '模型服务暂不可用' }, 503);
  }
  const usageId = await reserveGeneration(context.env.DB, user.id, provider);
  if (!usageId) return context.json({ error: '今日生成额度已用完，或请求过于频繁，请稍后再试' }, 429);
  const targetHits = minimumHits(input.wordCount);
  const systemPrompt = [
    'You create English reading comprehension for Chinese learners.',
    DIFFICULTY_PROMPT[input.difficulty],
    `Write approximately ${input.wordCount} English words about ${input.topic === '随机' ? 'a suitable engaging topic' : input.topic}.`,
    `Create exactly ${input.questionCount} Chinese multiple-choice questions, each with four options and one answer index.`,
    'Return JSON only: {title, article, questions:[{question,options:[4 strings],answer:0|1|2|3}], difficulty}.',
  ].join('\n');
  const userPrompt = `Naturally include at least ${targetHits} of these words: ${input.sampleWords.join(', ')}.`;
  try {
    const raw = await callProvider({ ...provider, systemPrompt, userPrompt });
    /* if (input.provider && userKey) {
      raw = await callProvider({ ...input.provider, key: userKey, systemPrompt, userPrompt });
    } else {
      raw = await safeCallSystemProvider(context.env, systemPrompt, userPrompt);
    } */
    const article = ArticlePayloadSchema.parse(raw.value);
    const hitIds = countVocabHits(article.article, input.sampleWords);
    const articleId = crypto.randomUUID();
    await finishGeneration(context.env.DB, usageId, {
      status: 'succeeded', articleId, promptTokens: raw.usage.promptTokens, completionTokens: raw.usage.completionTokens,
    });
    return context.json({ ...article, articleId, provider: provider.provider, model: provider.model, vocabHitIds: hitIds, meetThreshold: hitIds.length >= targetHits });
  } catch (error) {
    await finishGeneration(context.env.DB, usageId, { status: 'failed', errorCode: 'provider_error' });
    return context.json({ error: error instanceof Error ? error.message : '生成失败' }, 502);
  }
});

app.notFound((context) => context.json({ error: 'not found' }, 404));

export default app;
