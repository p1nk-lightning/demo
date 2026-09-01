// 会话/密码/邮箱/人机验证(自 index.ts 纯移动,逻辑零变化)。
import type { Env, AuthUser } from '../types';

export const SESSION_COOKIE_NAME = 'lexiscene_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
// Cloudflare Workers Web Crypto currently rejects PBKDF2 counts above 100,000.
const PASSWORD_ITERATIONS = 100_000;

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(value: string) {
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

export async function hashPassword(password: string) {
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

export { sameBytes };

export async function verifyPassword(password: string, storedHash: string) {
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

export function clearSessionCookie(request: Request) {
  return sessionCookie(request, '', 0);
}

export function setSessionCookie(request: Request, token: string) {
  return sessionCookie(request, token, SESSION_TTL_MS / 1000);
}

export function publicUser(env: Env, user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified_at !== null,
    createdAt: user.created_at,
    isAdmin: isAdmin(env, user),
  };
}

export async function createSession(database: D1Database, userId: string) {
  const now = Date.now();
  const token = randomToken();
  await database.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), userId, await sha256(token), now + SESSION_TTL_MS, now, now).run();
  return token;
}

export async function getSessionUser(database: D1Database, request: Request) {
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

export async function deleteCurrentSession(database: D1Database, request: Request) {
  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (token) await database.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
}

export function isAdmin(env: Env, user: AuthUser) {
  const emails = (env.ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return emails.includes(user.email.toLowerCase());
}

function randomVerificationCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

export async function createVerificationToken(database: D1Database, userId: string) {
  const now = Date.now();
  const code = randomVerificationCode();
  await database.batch([
    database.prepare('DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL').bind(userId),
    database.prepare('INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, await sha256(`${userId}:${code}`), now + 10 * 60 * 1000, now),
  ]);
  return code;
}

export async function sendVerificationEmail(env: Env, email: string, code: string) {
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

export async function verifyTurnstile(env: Env, token: string, ip: string) {
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

export function getClientIp(request: Request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}
