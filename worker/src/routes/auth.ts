// 认证路由:注册/登录/登出/me/验证邮箱/重发验证(自 index.ts 纯移动)。
import { Hono } from 'hono';
import { LoginRequestSchema, RegisterRequestSchema, VerifyEmailRequestSchema } from '../schemas';
import { z } from 'zod';
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

const ForgotPasswordRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

const ResetPasswordRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(128),
});

const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_MAX_PER_EMAIL_PER_DAY = 5;
const RESET_MAX_ATTEMPTS = 5;

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

// —— 忘记密码(AC-006,契约见 docs/sdd/lexiscene-v5/contracts/auth-password-reset.md) ——

async function sendResetEmail(env: Env, email: string, code: string) {
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
      subject: `${code} - LexiScene 密码重置验证码`,
      html: `<p>你的 LexiScene 密码重置验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>验证码将在 10 分钟后失效。若不是你本人操作，请忽略本邮件。</p>`,
    }),
  });
  if (!response.ok) {
    const providerMessage = (await response.text()).slice(0, 1000);
    console.error('Resend rejected a password reset email', { status: response.status, providerMessage });
    throw new Error('重置邮件发送失败');
  }
}

app.post('/api/auth/forgot-password', async (context) => {
  if (!(await checkRateLimit(context.env, getClientIp(context.req.raw)))) {
    return context.json({ error: '请求过于频繁，请稍后再试' }, 429);
  }
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const parsed = ForgotPasswordRequestSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '请输入有效邮箱地址' }, 400);
  const email = parsed.data.email.toLowerCase();

  const user = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (user) {
    const now = Date.now();
    const recentCount = await context.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND created_at > ?',
    ).bind(user.id, now - 24 * 60 * 60 * 1000).first<{ n: number }>();
    const recentRate = await context.env.DB.prepare(
      'SELECT id FROM password_reset_tokens WHERE user_id = ? AND created_at > ? LIMIT 1',
    ).bind(user.id, now - 60_000).first();
    if ((recentCount?.n ?? 0) < RESET_MAX_PER_EMAIL_PER_DAY && !recentRate) {
      try {
        const code = String(Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000)).padStart(6, '0');
        await context.env.DB.batch([
          context.env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL').bind(user.id),
          context.env.DB.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(crypto.randomUUID(), user.id, await sha256(`${user.id}:${code}`), now + RESET_CODE_TTL_MS, now),
        ]);
        await sendResetEmail(context.env, email, code);
      } catch (error) {
        // 邮件失败不回显给客户端(防枚举),仅记录
        console.error('Password reset email failed', error instanceof Error ? error.message : error);
      }
    }
    // 静默抑制(60s 内重复 / 超 5 次/日)也返回同样响应
  }
  // 无论邮箱是否存在,统一 200(防枚举)
  return context.json({ ok: true });
});

app.post('/api/auth/reset-password', async (context) => {
  if (!(await checkRateLimit(context.env, getClientIp(context.req.raw)))) {
    return context.json({ error: '请求过于频繁，请稍后再试' }, 429);
  }
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const parsed = ResetPasswordRequestSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '请输入有效邮箱、6 位验证码和至少 8 位的新密码' }, 400);
  const email = parsed.data.email.toLowerCase();

  const user = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (!user) {
    // 与"验证码错误"同文案,不泄露注册状态(防枚举契约)
    return context.json({ error: '验证码不对或已过期，请重新输入或重新发送' }, 400);
  }
  const now = Date.now();
  const record = await context.env.DB.prepare(
    'SELECT id, token_hash, attempts FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
  ).bind(user.id, now).first<{ id: string; token_hash: string; attempts: number }>();
  if (!record) return context.json({ error: '验证码不对或已过期，请重新输入或重新发送' }, 400);

  const actualHash = await sha256(`${user.id}:${parsed.data.code}`);
  if (!sameBytes(base64ToBytes(actualHash), base64ToBytes(record.token_hash))) {
    const attempts = record.attempts + 1;
    if (attempts >= RESET_MAX_ATTEMPTS) {
      await context.env.DB.prepare('DELETE FROM password_reset_tokens WHERE id = ?').bind(record.id).run();
      return context.json({ error: '错误次数过多，请重新发送验证码' }, 400);
    }
    await context.env.DB.prepare('UPDATE password_reset_tokens SET attempts = ? WHERE id = ?').bind(attempts, record.id).run();
    return context.json({ error: '验证码不对或已过期，请重新输入或重新发送' }, 400);
  }

  // 原子完成:更新密码 + 作废验证码 + 吊销该账号所有会话
  await context.env.DB.batch([
    context.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(await hashPassword(parsed.data.newPassword), now, user.id),
    context.env.DB.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').bind(now, record.id),
    context.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
  ]);
  context.header('Set-Cookie', clearSessionCookie(context.req.raw));
  context.header('Cache-Control', 'no-store');
  return context.json({ ok: true });
});

export default app;
