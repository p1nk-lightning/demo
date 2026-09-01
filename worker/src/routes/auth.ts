// 认证路由:注册/登录/登出/me/验证邮箱/重发验证(自 index.ts 纯移动)。
import { Hono } from 'hono';
import { LoginRequestSchema, RegisterRequestSchema, VerifyEmailRequestSchema } from '../schemas';
import type { AuthUser, Env } from '../types';
import {
  base64ToBytes,
  clearSessionCookie,
  createSession,
  createVerificationToken,
  deleteCurrentSession,
  getClientIp,
  getSessionUser,
  hashPassword,
  publicUser,
  sendVerificationEmail,
  sameBytes,
  setSessionCookie,
  sha256,
  verifyPassword,
  verifyTurnstile,
} from '../lib/session';
import { checkRateLimit } from '../lib/rate-limit';

const app = new Hono<{ Bindings: Env }>();

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
  context.header('Set-Cookie', setSessionCookie(context.req.raw, sessionToken));
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
  context.header('Set-Cookie', setSessionCookie(context.req.raw, sessionToken));
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

export default app;
