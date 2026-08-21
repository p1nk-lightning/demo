import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

export interface Env {
  DEEPSEEK_GENERATION_API_KEY?: string;
  DEEPSEEK_REVIEW_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_DEV_PROXY_URL?: string;
  DEEPSEEK_DEV_PROXY_TOKEN?: string;
  DASHSCOPE_API_KEY?: string;
  ARK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  QWEN_MODEL?: string;
  DOUBAO_MODEL?: string;
  ADMIN_EMAILS?: string;
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
  questionZh: z.string().min(1).optional(),
  optionsZh: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  evidence: z.string().min(1).optional(),
});
const GeneratedQuestionSchema = QuestionSchema.extend({
  options: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]),
  questionZh: z.string().min(1),
  optionsZh: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]),
  evidence: z.string().min(1),
});
const ArticlePayloadSchema = z.object({
  title: z.string().min(1),
  article: z.string().min(80),
  questions: z.array(GeneratedQuestionSchema).min(3).max(5),
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
  source: z.enum(['pasted', 'xlsx', 'pdf', 'image', 'reading']),
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
const DictionaryBatchSchema = z.object({
  words: z.array(z.string().trim().min(1).max(80)).min(1).max(500),
});
const ContentReviewSchema = z.object({
  action: z.enum(['approve', 'publish', 'archive', 'candidate']),
  publishDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const AiReviewCoreSchema = z.object({
  verdict: z.enum(['pass', 'needs_revision', 'reject']),
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(2000),
  strengths: z.array(z.string().min(1).max(500)).max(8),
  issues: z.array(z.string().min(1).max(500)).max(8),
  factualChecks: z.array(z.string().min(1).max(500)).max(8),
  scores: z.object({
    englishQuality: z.number().int().min(0).max(100),
    levelFit: z.number().int().min(0).max(100),
    questionQuality: z.number().int().min(0).max(100),
    factualReliability: z.number().int().min(0).max(100),
    originality: z.number().int().min(0).max(100),
  }),
  questionChecks: z.array(z.object({
    index: z.number().int().min(1).max(10),
    answerSupported: z.boolean(),
    evidenceFound: z.boolean(),
    issue: z.string().max(500),
  })).max(10),
  copyrightRisk: z.object({
    level: z.enum(['low', 'medium', 'high']),
    reason: z.string().min(1).max(1000),
  }),
});
const AiReviewSchema = AiReviewCoreSchema.extend({
  repairCount: z.number().int().min(0).max(2),
  deterministicIssues: z.array(z.string().min(1).max(500)).max(30),
});
const PublicArticleRepairSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(2000),
  content: z.string().min(80).max(100000),
  questions: z.array(GeneratedQuestionSchema).min(3).max(5),
});
const PublicReviewArticleSchema = PublicArticleRepairSchema.extend({
  questions: z.array(QuestionSchema).min(3).max(5),
});

const DIFFICULTY_PROMPT: Record<Difficulty, string> = {
  CET4: 'CET-4 practice level: mostly high-frequency college vocabulary, direct argument, concrete context, and short readable sentences.',
  CET6: 'CET-6 practice level: moderate news, science, or social topics, controlled abstraction, comparison, and readable varied sentences.',
  考研: 'Chinese postgraduate entrance-exam practice level: academic argument, thesis and evidence, discourse markers, inference, and carefully controlled embedded clauses.',
  雅思: 'IELTS Academic reading practice level: neutral formal tone, information-rich paragraphs, precise references, cohesion, and factual detail.',
  托福: 'TOEFL academic reading practice level: university-style explanation, academic topic, cause-and-effect, examples, rhetorical purpose, and answerable inference.',
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
// Cloudflare Workers Web Crypto currently rejects PBKDF2 counts above 100,000.
const PASSWORD_ITERATIONS = 100_000;

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

function publicUser(env: Env, user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified_at !== null,
    createdAt: user.created_at,
    isAdmin: isAdmin(env, user),
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

async function callProvider(options: {
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

type ModelProvider = z.infer<typeof ModelProviderSchema>;

interface BuiltinProvider {
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  key: string;
  proxyToken?: string;
  proxyPurpose?: 'generation' | 'review';
}

function getBuiltinProvider(env: Env, provider: ModelProvider): BuiltinProvider {
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

function getReviewProvider(env: Env): BuiltinProvider {
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
  if (!response.ok) {
    const providerMessage = (await response.text()).slice(0, 1000);
    console.error('Resend rejected a verification email', {
      status: response.status,
      providerMessage,
    });
    throw new Error('验证邮件发送失败');
  }
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

type GeneratedArticlePayload = z.infer<typeof ArticlePayloadSchema>;

function englishWordCount(value: string) {
  return value.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)?.length ?? 0;
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/[“”‘’]/g, '').replace(/\s+/g, ' ').trim();
}

function hasCjk(value: string) {
  return /[\u3400-\u9fff]/u.test(value);
}

function validateGeneratedArticle(article: GeneratedArticlePayload, input: z.infer<typeof GenerateRequestSchema>, targetHits: number) {
  const issues: string[] = [];
  const words = englishWordCount(article.article);
  const minimumWords = Math.max(80, Math.floor(input.wordCount * 0.8));
  const maximumWords = Math.ceil(input.wordCount * 1.2);
  if (words < minimumWords || words > maximumWords) issues.push(`article_word_count:${words}:${minimumWords}-${maximumWords}`);
  if (article.difficulty !== input.difficulty) issues.push(`difficulty_mismatch:${article.difficulty}:${input.difficulty}`);
  if (article.questions.length !== input.questionCount) issues.push(`question_count:${article.questions.length}:${input.questionCount}`);
  if (hasCjk(article.title)) issues.push('title_must_be_english');
  if (hasCjk(article.article)) issues.push('article_must_be_english');
  if (input.wordCount >= 250 && article.article.split(/\n\s*\n/).filter(Boolean).length < 2) issues.push('article_needs_multiple_paragraphs');

  const hitCount = countVocabHits(article.article, input.sampleWords).length;
  if (hitCount < targetHits) issues.push(`target_word_hits:${hitCount}:${targetHits}`);
  const questionKeys = new Set<string>();

  article.questions.forEach((question, index) => {
    const prefix = `question_${index + 1}`;
    if (hasCjk(question.question)) issues.push(`${prefix}_must_be_english`);
    if (!hasCjk(question.questionZh)) issues.push(`${prefix}_missing_chinese_translation`);
    if (question.options.some((option) => hasCjk(option))) issues.push(`${prefix}_options_must_be_english`);
    if (question.optionsZh.some((option) => !hasCjk(option))) issues.push(`${prefix}_option_translations_missing`);
    if (new Set(question.options.map(normalizedText)).size !== 4) issues.push(`${prefix}_duplicate_options`);
    const questionKey = normalizedText(question.question);
    if (questionKeys.has(questionKey)) issues.push(`${prefix}_duplicate_question`);
    questionKeys.add(questionKey);
    if (!normalizedText(article.article).includes(normalizedText(question.evidence))) issues.push(`${prefix}_evidence_not_found`);
  });

  return { issues, wordCount: words, hitCount };
}

const PUBLIC_DIFFICULTY_LIMITS: Record<Difficulty, { minWords: number; maxWords: number; minSentenceWords: number; maxSentenceWords: number }> = {
  CET4: { minWords: 400, maxWords: 500, minSentenceWords: 10, maxSentenceWords: 20 },
  CET6: { minWords: 500, maxWords: 620, minSentenceWords: 13, maxSentenceWords: 25 },
  考研: { minWords: 600, maxWords: 720, minSentenceWords: 15, maxSentenceWords: 30 },
  雅思: { minWords: 700, maxWords: 850, minSentenceWords: 14, maxSentenceWords: 30 },
  托福: { minWords: 750, maxWords: 900, minSentenceWords: 16, maxSentenceWords: 32 },
};

function validatePublicArticle(article: z.infer<typeof PublicReviewArticleSchema>, difficulty: Difficulty) {
  const issues: string[] = [];
  const limits = PUBLIC_DIFFICULTY_LIMITS[difficulty];
  const words = englishWordCount(article.content);
  const sentenceCount = Math.max(1, article.content.match(/[.!?]+(?:\s|$)/g)?.length ?? 0);
  const averageSentenceWords = words / sentenceCount;
  if (words < limits.minWords || words > limits.maxWords) issues.push(`正文词数为 ${words}，${difficulty} 应为 ${limits.minWords}-${limits.maxWords} 词`);
  if (averageSentenceWords < limits.minSentenceWords || averageSentenceWords > limits.maxSentenceWords) issues.push(`平均句长为 ${averageSentenceWords.toFixed(1)}，建议范围 ${limits.minSentenceWords}-${limits.maxSentenceWords}`);
  if (hasCjk(article.title)) issues.push('英文标题中含有中文字符');
  if (hasCjk(article.content)) issues.push('英文正文中含有中文字符');
  if (article.content.split(/\n\s*\n/).filter(Boolean).length < 3) issues.push('正文少于三个段落');
  const questionKeys = new Set<string>();
  article.questions.forEach((question, index) => {
    const label = `第 ${index + 1} 题`;
    if (hasCjk(question.question)) issues.push(`${label}题干不是纯英文`);
    if (question.options.some((option) => !option.trim() || hasCjk(option))) issues.push(`${label}存在空选项或中文选项`);
    if (!hasCjk(question.questionZh ?? '') || !question.optionsZh || question.optionsZh.some((option) => !hasCjk(option))) issues.push(`${label}缺少中文翻译`);
    if (new Set(question.options.map(normalizedText)).size !== 4) issues.push(`${label}存在重复选项`);
    const key = normalizedText(question.question);
    if (questionKeys.has(key)) issues.push(`${label}与其他题目重复`);
    questionKeys.add(key);
    if (!question.evidence || !normalizedText(article.content).includes(normalizedText(question.evidence))) issues.push(`${label}证据句无法在正文中找到`);
  });
  return { issues, wordCount: words, averageSentenceWords };
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

function normalizeDictionaryWord(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z'-]/g, '').slice(0, 80);
}

function isAdmin(env: Env, user: AuthUser) {
  const emails = (env.ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return emails.includes(user.email.toLowerCase());
}

function isPassingAiReview(value: unknown) {
  const parsed = AiReviewSchema.safeParse(parseJson(value, null));
  if (!parsed.success) return false;
  const review = parsed.data;
  return review.verdict === 'pass'
    && review.score >= 80
    && review.deterministicIssues.length === 0
    && review.copyrightRisk.level !== 'high'
    && review.questionChecks.length > 0
    && review.questionChecks.every((check) => check.answerSupported && check.evidenceFound);
}

function dictionaryItem(row: Record<string, unknown>) {
  return {
    dictionaryId: row.dictionary_id,
    dictionaryName: row.dictionary_name,
    word: row.headword,
    phonetic: row.phonetic ?? undefined,
    partOfSpeech: row.part_of_speech ?? undefined,
    definitionEN: row.definition_en ?? undefined,
    meaningCN: row.definition_zh ?? undefined,
    exampleEN: row.example_en ?? undefined,
    difficulty: row.difficulty ?? undefined,
    frequencyRank: row.frequency_rank ?? undefined,
  };
}

function contentItem(row: Record<string, unknown>, isFavorite = false) {
  return {
    id: row.id,
    contentId: row.id,
    title: row.title,
    summary: row.summary,
    article: row.content,
    content: row.content,
    difficulty: row.difficulty,
    topic: row.topic,
    questions: parseJson(row.questions_json, []),
    vocabHitIds: [],
    wordCount: row.word_count,
    estimatedMinutes: row.estimated_minutes,
    source: 'daily',
    coverUrl: row.cover_url ?? undefined,
    publishDate: row.publish_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    isFavorite,
    aiReview: parseJson(row.ai_review_json, undefined),
  };
}

const ROTATION_DIFFICULTIES: Difficulty[] = ['CET4', 'CET6', '考研', '雅思', '托福'];

function chinaDayNumber(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function isRotationDay(dayKey: string) {
  return chinaDayNumber(dayKey) % 2 === 0;
}

async function rotateContentPool(database: D1Database, dayKey = chinaDayKey()) {
  if (!isRotationDay(dayKey)) return { rotated: false, count: 0, dayKey };
  const now = Date.now();
  let count = 0;
  for (const difficulty of ROTATION_DIFFICULTIES) {
    const next = await database.prepare(
      "SELECT id FROM content_articles WHERE status = 'published' AND publish_date IS NULL AND difficulty = ? ORDER BY COALESCE(published_at, 0), created_at, id LIMIT 1",
    ).bind(difficulty).first<{ id: string }>();
    if (!next) continue;
    await database.batch([
      database.prepare("UPDATE content_articles SET publish_date = NULL, updated_at = ? WHERE status = 'published' AND publish_date IS NOT NULL AND difficulty = ?").bind(now, difficulty),
      database.prepare("UPDATE content_articles SET status = 'published', publish_date = ?, published_at = ?, updated_at = ? WHERE id = ?").bind(dayKey, now, now, next.id),
    ]);
    count += 1;
  }
  return { rotated: count > 0, count, dayKey };
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
  return context.json({ user: publicUser(context.env, user), verificationEmailSent }, 201);
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
  return context.json({ user: publicUser(context.env, user) });
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
  return context.json({ user: publicUser(context.env, user) });
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

app.get('/api/dictionary', async (context) => {
  const word = normalizeDictionaryWord(context.req.query('word') || '');
  if (!word) return context.json({ items: [] });
  if (!context.env.DB) return context.json({ items: [], source: 'fallback' });
  try {
    const exact = await context.env.DB.prepare(
      'SELECT d.id AS dictionary_id, d.name AS dictionary_name, e.headword, e.phonetic, e.part_of_speech, e.definition_en, e.definition_zh, e.example_en, e.difficulty, e.frequency_rank FROM dictionary_entries e JOIN dictionaries d ON d.id = e.dictionary_id WHERE e.normalized = ? ORDER BY d.priority ASC LIMIT 8',
    ).bind(word).all();
    let rows = exact.results;
    if (!rows.length) {
      const matched = await context.env.DB.prepare(
        'SELECT d.id AS dictionary_id, d.name AS dictionary_name, e.headword, e.phonetic, e.part_of_speech, e.definition_en, e.definition_zh, e.example_en, e.difficulty, e.frequency_rank FROM dictionary_forms f JOIN dictionary_entries e ON e.dictionary_id = f.dictionary_id AND e.normalized = f.lemma_normalized JOIN dictionaries d ON d.id = e.dictionary_id WHERE f.normalized = ? ORDER BY d.priority ASC, e.frequency_rank ASC LIMIT 8',
      ).bind(word).all();
      rows = matched.results;
    }
    return context.json({
      items: rows.map((row) => dictionaryItem(row as Record<string, unknown>)),
      source: 'builtin',
    });
  } catch {
    return context.json({ items: [], source: 'fallback' });
  }
});

app.post('/api/dictionary/batch', async (context) => {
  if (!context.env.DB) return context.json({ items: [], source: 'fallback' });
  const parsed = DictionaryBatchSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '批量查词参数不正确' }, 400);
  const words = Array.from(new Set(parsed.data.words.map(normalizeDictionaryWord).filter(Boolean)));
  if (!words.length) return context.json({ items: [], source: 'builtin' });
  try {
    const placeholders = words.map(() => '?').join(',');
    const exact = await context.env.DB.prepare(
      `SELECT e.normalized AS lookup_word, d.id AS dictionary_id, d.name AS dictionary_name, e.headword, e.phonetic, e.part_of_speech, e.definition_en, e.definition_zh, e.example_en, e.difficulty, e.frequency_rank FROM dictionary_entries e JOIN dictionaries d ON d.id = e.dictionary_id WHERE e.normalized IN (${placeholders}) ORDER BY d.priority ASC, e.frequency_rank ASC`,
    ).bind(...words).all();
    const exactByWord = new Map<string, Record<string, unknown>>();
    for (const row of exact.results) {
      const key = String(row.lookup_word);
      if (!exactByWord.has(key)) exactByWord.set(key, row as Record<string, unknown>);
    }
    const missing = words.filter((word) => !exactByWord.has(word));
    const formByWord = new Map<string, Record<string, unknown>>();
    if (missing.length) {
      const formPlaceholders = missing.map(() => '?').join(',');
      const forms = await context.env.DB.prepare(
        `SELECT f.normalized AS lookup_word, d.id AS dictionary_id, d.name AS dictionary_name, e.headword, e.phonetic, e.part_of_speech, e.definition_en, e.definition_zh, e.example_en, e.difficulty, e.frequency_rank FROM dictionary_forms f JOIN dictionary_entries e ON e.dictionary_id = f.dictionary_id AND e.normalized = f.lemma_normalized JOIN dictionaries d ON d.id = e.dictionary_id WHERE f.normalized IN (${formPlaceholders}) ORDER BY d.priority ASC, e.frequency_rank ASC`,
      ).bind(...missing).all();
      for (const row of forms.results) {
        const key = String(row.lookup_word);
        if (!formByWord.has(key)) formByWord.set(key, row as Record<string, unknown>);
      }
    }
    return context.json({
      items: words.map((word) => ({ query: word, entry: dictionaryItem(exactByWord.get(word) ?? formByWord.get(word) ?? {}) })).filter((item) => item.entry.word),
      source: 'builtin',
    });
  } catch {
    return context.json({ items: [], source: 'fallback' });
  }
});

app.get('/api/admin/content', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  if (!isAdmin(context.env, user)) return context.json({ error: '没有内容审核权限' }, 403);
  const status = context.req.query('status') || 'candidate';
  if (!['candidate', 'approved', 'published', 'archived'].includes(status)) return context.json({ error: '状态参数不正确' }, 400);
  const select = 'SELECT id, title, summary, content, difficulty, topic, word_count, estimated_minutes, questions_json, source_title, source_url, license_note, status, publish_date, cover_url, created_at, updated_at, reviewed_at, published_at, ai_review_json, ai_reviewed_at, ai_review_model FROM content_articles';
  const result = status === 'approved'
    ? await context.env.DB.prepare(`${select} WHERE status = 'published' AND publish_date IS NULL ORDER BY difficulty, created_at, id`).all()
    : status === 'published'
      ? await context.env.DB.prepare(`${select} WHERE status = 'published' AND publish_date IS NOT NULL ORDER BY difficulty, created_at, id`).all()
      : await context.env.DB.prepare(`${select} WHERE status = ? ORDER BY difficulty, created_at, id`).bind(status).all();
  return context.json({ items: result.results.map((row) => ({
    id: row.id, title: row.title, summary: row.summary, content: row.content, difficulty: row.difficulty,
    topic: row.topic, wordCount: row.word_count, estimatedMinutes: row.estimated_minutes,
    questions: parseJson(row.questions_json, []), sourceTitle: row.source_title, sourceUrl: row.source_url,
    licenseNote: row.license_note, coverUrl: row.cover_url ?? undefined, status: status === 'approved' ? 'approved' : row.status, publishDate: row.publish_date ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at, reviewedAt: row.reviewed_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    aiReview: parseJson(row.ai_review_json, undefined), aiReviewedAt: row.ai_reviewed_at ?? undefined, aiReviewModel: row.ai_review_model ?? undefined,
  })) });
});

app.post('/api/admin/content/:id/review', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  if (!isAdmin(context.env, user)) return context.json({ error: '没有内容审核权限' }, 403);
  const parsed = ContentReviewSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '审核参数不正确' }, 400);
  const now = Date.now();
  const { action, publishDate } = parsed.data;
  let result: D1Result<unknown>;
  if (action === 'publish') {
    const article = await context.env.DB.prepare('SELECT difficulty, status, publish_date FROM content_articles WHERE id = ?').bind(context.req.param('id')).first<{ difficulty: Difficulty; status: string; publish_date: string | null }>();
    if (!article) return context.json({ error: '文章不存在' }, 404);
    if (article.status !== 'published' || article.publish_date !== null) return context.json({ error: '只有文章池中的文章可以发布' }, 409);
    const targetDate = publishDate || chinaDayKey();
    const updates = await context.env.DB.batch([
      context.env.DB.prepare('UPDATE content_articles SET publish_date = NULL, updated_at = ? WHERE status = ? AND difficulty = ? AND publish_date = ? AND id != ?')
        .bind(now, 'published', article.difficulty, targetDate, context.req.param('id')),
      context.env.DB.prepare('UPDATE content_articles SET status = ?, publish_date = ?, reviewed_at = ?, published_at = ?, updated_at = ? WHERE id = ?')
        .bind('published', targetDate, now, now, now, context.req.param('id')),
    ]);
    result = updates[1];
  } else if (action === 'approve') {
    const article = await context.env.DB.prepare('SELECT status, ai_review_json FROM content_articles WHERE id = ?').bind(context.req.param('id')).first<{ status: string; ai_review_json: string | null }>();
    if (!article) return context.json({ error: '文章不存在' }, 404);
    if (article.status !== 'candidate') return context.json({ error: '只有候选文章可以加入文章池' }, 409);
    if (!isPassingAiReview(article.ai_review_json)) return context.json({ error: '请先完成并通过 AI 审核，再加入文章池' }, 409);
    result = await context.env.DB.prepare("UPDATE content_articles SET status = 'published', publish_date = NULL, reviewed_at = ?, published_at = NULL, updated_at = ? WHERE id = ?")
      .bind(now, now, context.req.param('id')).run();
  } else {
    result = await context.env.DB.prepare('UPDATE content_articles SET status = ?, publish_date = NULL, reviewed_at = ?, published_at = NULL, updated_at = ? WHERE id = ?')
      .bind(action, now, now, context.req.param('id')).run();
  }
  if (!result.meta.changes) return context.json({ error: '文章不存在' }, 404);
  return context.json({ ok: true, id: context.req.param('id'), status: action === 'publish' ? 'published' : action });
});

app.post('/api/admin/content/:id/ai-review', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  if (!isAdmin(context.env, user)) return context.json({ error: '没有内容审核权限' }, 403);
  const row = await context.env.DB.prepare('SELECT id, title, summary, content, difficulty, topic, questions_json, source_title, source_url FROM content_articles WHERE id = ?').bind(context.req.param('id')).first<Record<string, unknown>>();
  if (!row) return context.json({ error: '文章不存在' }, 404);
  try {
    const provider = getReviewProvider(context.env);
    const difficulty = DifficultySchema.parse(row.difficulty);
    let article = PublicReviewArticleSchema.parse({
      title: row.title,
      summary: row.summary,
      content: row.content,
      questions: parseJson(row.questions_json, []),
    });
    let repairCount = 0;
    let deterministic = validatePublicArticle(article, difficulty);
    let reviewCore: z.infer<typeof AiReviewCoreSchema> | null = null;

    while (true) {
      const raw = await callProvider({
        ...provider,
        systemPrompt: [
          'You are a strict editorial reviewer for an English-learning platform. Return valid JSON only and never publish content.',
          'Evaluate English quality, stated exam-level fit, question-answer consistency, exact evidence, factual overclaims, source attribution, and copyright/originality risk.',
          'A passing article must have answerable English questions, four English options per question, accurate Chinese translations, and an exact supporting quote copied from the article for every answer.',
          'Do not claim that you visited the source URL. Put claims that need source verification in factualChecks.',
        ].join('\n'),
        userPrompt: JSON.stringify({
          task: 'Return a recommendation for a human editor.',
          deterministicIssues: deterministic.issues,
          article: { ...article, difficulty, topic: row.topic, sourceTitle: row.source_title, sourceUrl: row.source_url },
          output: {
            verdict: 'pass | needs_revision | reject', score: 'integer 0-100', summary: 'string', strengths: ['string'], issues: ['string'], factualChecks: ['string'],
            scores: { englishQuality: '0-100', levelFit: '0-100', questionQuality: '0-100', factualReliability: '0-100', originality: '0-100' },
            questionChecks: [{ index: '1-based integer', answerSupported: 'boolean', evidenceFound: 'boolean', issue: 'string, empty when none' }],
            copyrightRisk: { level: 'low | medium | high', reason: 'string' },
          },
        }),
      });
      reviewCore = AiReviewCoreSchema.parse(raw.value);
      const questionChecksPass = reviewCore.questionChecks.length === article.questions.length
        && reviewCore.questionChecks.every((check) => check.answerSupported && check.evidenceFound);
      const passed = deterministic.issues.length === 0
        && reviewCore.verdict === 'pass'
        && reviewCore.score >= 80
        && reviewCore.copyrightRisk.level !== 'high'
        && questionChecksPass;
      if (passed || repairCount >= 2 || reviewCore.verdict === 'reject' || reviewCore.copyrightRisk.level === 'high') break;

      const repair = await callProvider({
        ...provider,
        systemPrompt: [
          'Repair a candidate English reading article for a human editor. Return valid JSON only.',
          'Questions and all four options must be English. Put Chinese only in questionZh and optionsZh. Every evidence value must be a short exact quote from content.',
          'Preserve the title and content when the listed problems concern only questions or translations. Never add facts not supported by the supplied source lead.',
          'Return {title,summary,content,questions:[{question,options:[4 strings],answer:0|1|2|3,questionZh,optionsZh:[4 strings],evidence}]}.',
        ].join('\n'),
        userPrompt: JSON.stringify({
          difficulty,
          source: { title: row.source_title, url: row.source_url },
          deterministicIssues: deterministic.issues,
          reviewIssues: reviewCore.issues,
          factualChecks: reviewCore.factualChecks,
          payload: article,
        }),
      });
      article = PublicArticleRepairSchema.parse(repair.value);
      repairCount += 1;
      deterministic = validatePublicArticle(article, difficulty);
    }

    if (!reviewCore) throw new Error('AI 审核没有返回结果');
    const hardFailure = deterministic.issues.length > 0
      || reviewCore.copyrightRisk.level === 'high'
      || reviewCore.questionChecks.length !== article.questions.length
      || reviewCore.questionChecks.some((check) => !check.answerSupported || !check.evidenceFound);
    const review = AiReviewSchema.parse({
      ...reviewCore,
      verdict: hardFailure && reviewCore.verdict === 'pass' ? 'needs_revision' : reviewCore.verdict,
      score: hardFailure ? Math.min(reviewCore.score, 69) : reviewCore.score,
      repairCount,
      deterministicIssues: deterministic.issues,
    });
    const reviewedAt = Date.now();
    const finalWordCount = englishWordCount(article.content);
    await context.env.DB.prepare('UPDATE content_articles SET title = ?, summary = ?, content = ?, questions_json = ?, word_count = ?, estimated_minutes = ?, ai_review_json = ?, ai_reviewed_at = ?, ai_review_model = ?, updated_at = ? WHERE id = ?')
      .bind(article.title, article.summary, article.content, JSON.stringify(article.questions), finalWordCount, Math.max(3, Math.ceil(finalWordCount / 150)), JSON.stringify(review), reviewedAt, provider.model, reviewedAt, context.req.param('id')).run();
    return context.json({ ok: true, review, reviewedAt, model: provider.model });
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : 'AI 审核失败' }, 502);
  }
});

app.post('/api/admin/content/rotate', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  if (!isAdmin(context.env, user)) return context.json({ error: '没有内容审核权限' }, 403);
  return context.json(await rotateContentPool(context.env.DB));
});

app.get('/api/favorites', async (context) => {
  if (!context.env.DB) return context.json({ items: [], source: 'fallback' });
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  const result = await context.env.DB.prepare(
    'SELECT c.id, c.title, c.summary, c.content, c.difficulty, c.topic, c.questions_json, c.word_count, c.estimated_minutes, c.source_title, c.source_url, c.cover_url, c.publish_date, c.created_at, c.updated_at, f.created_at AS favorited_at FROM user_content_favorites f JOIN content_articles c ON c.id = f.article_id WHERE f.user_id = ? ORDER BY f.created_at DESC',
  ).bind(user.id).all();
  return context.json({ items: result.results.map((row) => contentItem(row as Record<string, unknown>, true)), source: 'd1' });
});

app.post('/api/content/:id/favorite', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  const articleId = context.req.param('id');
  const article = await context.env.DB.prepare('SELECT id FROM content_articles WHERE id = ?').bind(articleId).first();
  if (!article) return context.json({ error: '文章不存在' }, 404);
  const body = await context.req.json().catch(() => null) as { favorite?: unknown } | null;
  if (typeof body?.favorite !== 'boolean') return context.json({ error: '收藏参数不正确' }, 400);
  if (body.favorite) {
    await context.env.DB.prepare('INSERT OR IGNORE INTO user_content_favorites (user_id, article_id, created_at) VALUES (?, ?, ?)').bind(user.id, articleId, Date.now()).run();
  } else {
    await context.env.DB.prepare('DELETE FROM user_content_favorites WHERE user_id = ? AND article_id = ?').bind(user.id, articleId).run();
  }
  return context.json({ ok: true, favorite: body.favorite });
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
  const sessionUser = await getSessionUser(context.env.DB, context.req.raw);
  try {
    const contentResult = await context.env.DB.prepare(
      "SELECT c.id, c.title, c.summary, c.content, c.difficulty, c.topic, c.word_count, c.estimated_minutes, c.questions_json, c.cover_url, c.publish_date, c.created_at, c.updated_at, c.source_id, c.source_title, c.source_url, f.article_id AS favorite_article_id FROM content_articles c LEFT JOIN user_content_favorites f ON f.article_id = c.id AND f.user_id = ? WHERE c.status = 'published' AND c.publish_date = ? AND (? IS NULL OR c.difficulty = ?) ORDER BY c.difficulty",
    ).bind(sessionUser?.id ?? '', date, difficulty || null, difficulty || null).all();
    if (contentResult.results.length) {
      return context.json({
        items: contentResult.results.map((row) => contentItem(row as Record<string, unknown>, Boolean(row.favorite_article_id))),
        source: 'content_library',
      });
    }
  } catch {
    // Older local databases may not have migration 0005 yet; use the legacy table below.
  }
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
  const targetHits = Math.min(minimumHits(input.wordCount), input.sampleWords.length);
  const systemPrompt = [
    'You create original English reading comprehension for Chinese learners. Return valid JSON only.',
    DIFFICULTY_PROMPT[input.difficulty],
    `Write approximately ${input.wordCount} English words about ${input.topic === '随机' ? 'a suitable engaging topic' : input.topic}.`,
    'Use multiple coherent paragraphs. Prefer general educational explanations or fictional situations and avoid unsupported statistics, quotations, or breaking-news claims.',
    `Create exactly ${input.questionCount} multiple-choice questions. Every question and all four options must be English only.`,
    'For each question also provide an accurate Chinese translation of the stem and all options.',
    'For evidence, copy one short exact English quote from the article that supports the answer.',
    'Return {title, article, questions:[{question,options:[4 strings],answer:0|1|2|3,questionZh,optionsZh:[4 strings],evidence}], difficulty}.',
  ].join('\n');
  const userPrompt = `Naturally include at least ${targetHits} of these words: ${input.sampleWords.join(', ')}.`;
  try {
    const initial = await callProvider({ ...provider, systemPrompt, userPrompt });
    let article = ArticlePayloadSchema.parse(initial.value);
    let quality = validateGeneratedArticle(article, input, targetHits);
    let promptTokens = initial.usage.promptTokens;
    let completionTokens = initial.usage.completionTokens;
    let repaired = false;

    if (quality.issues.length) {
      const repair = await callProvider({
        ...provider,
        systemPrompt: [
          'Repair an English reading-comprehension JSON payload. Return valid JSON only.',
          'Keep valid content unchanged. Questions and options must remain English; Chinese is allowed only in questionZh and optionsZh.',
          'Every evidence value must be an exact quote from the article. Return the complete corrected payload using the original schema.',
        ].join('\n'),
        userPrompt: JSON.stringify({ issues: quality.issues, target: { wordCount: input.wordCount, targetHits }, payload: article }),
      });
      article = ArticlePayloadSchema.parse(repair.value);
      quality = validateGeneratedArticle(article, input, targetHits);
      promptTokens = (promptTokens ?? 0) + (repair.usage.promptTokens ?? 0) || null;
      completionTokens = (completionTokens ?? 0) + (repair.usage.completionTokens ?? 0) || null;
      repaired = true;
    }

    if (quality.issues.length) throw new Error(`生成结果未通过质量检查：${quality.issues.slice(0, 4).join(', ')}`);
    const hitIds = countVocabHits(article.article, input.sampleWords);
    const articleId = crypto.randomUUID();
    await finishGeneration(context.env.DB, usageId, {
      status: 'succeeded', articleId, promptTokens, completionTokens,
    });
    return context.json({ ...article, articleId, provider: provider.provider, model: provider.model, vocabHitIds: hitIds, meetThreshold: hitIds.length >= targetHits, quality: { repaired, wordCount: quality.wordCount, targetWordHits: quality.hitCount } });
  } catch (error) {
    await finishGeneration(context.env.DB, usageId, { status: 'failed', errorCode: 'provider_error' });
    return context.json({ error: error instanceof Error ? error.message : '生成失败' }, 502);
  }
});

app.notFound((context) => context.json({ error: 'not found' }, 404));

async function scheduled(event: ScheduledController, env: Env) {
  if (!env.DB) return;
  const dayKey = chinaDayKey(event.scheduledTime);
  await rotateContentPool(env.DB, dayKey);
}

export default {
  fetch: app.fetch,
  scheduled,
};
