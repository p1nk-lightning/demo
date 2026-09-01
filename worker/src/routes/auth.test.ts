// 忘记密码全流程集成测试(AC-006):真实 D1(本地 miniflare)+ Resend 出站 fetch stub。
// 每个用例使用独立 cf-connecting-ip,避免内存限流跨用例累积(10 次/分钟/IP)。
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.resend.com/emails')) {
      (globalThis as typeof globalThis & { __resendCalls?: unknown[] }).__resendCalls = [
        ...((globalThis as typeof globalThis & { __resendCalls?: unknown[] }).__resendCalls ?? []),
        { url, body: init?.body },
      ];
      return new Response(JSON.stringify({ id: 'test-email' }), { status: 200 });
    }
    if (url.startsWith('https://challenges.cloudflare.com/turnstile/')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    throw new Error(`unexpected outbound fetch in test: ${url}`);
  }) as typeof fetch);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

import { env, SELF } from 'cloudflare:test';

beforeAll(async () => {
  // 测试库建表:schema 由 vitest.config 注入 TEST_SCHEMA binding。
  // 先删注释行再按分号拆,避免注释内分号截断语句。
  const bindings = env as typeof env & { TEST_SCHEMA: string; DB: D1Database };
  const withoutComments = bindings.TEST_SCHEMA
    .split('\n')
    .filter((line: string) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = withoutComments.split(';').map((statement: string) => statement.trim()).filter(Boolean);
  for (const statement of statements) {
    await bindings.DB.prepare(statement).run();
  }
});

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

/** 每个用例独立 IP 的请求 helper(绕开跨用例限流累积) */
function fetchAs(ip: string, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('cf-connecting-ip', ip);
  return SELF.fetch(`https://example.com${path}`, { ...init, headers });
}

async function registerUser(ip: string, email: string): Promise<string> {
  const response = await fetchAs(ip, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password-123', turnstileToken: 'test-token' }),
  });
  expect(response.status).toBe(201);
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0];
}

describe('POST /api/auth/forgot-password', () => {
  afterEach(() => {
    (globalThis as typeof globalThis & { __resendCalls?: unknown[] }).__resendCalls = [];
  });

  it('returns identical body for registered and unregistered emails (anti-enumeration)', async () => {
    const ip = nextIp();
    await registerUser(ip, 'reset-me@example.com');
    const registered = await fetchAs(ip, '/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reset-me@example.com' }),
    });
    const unregistered = await fetchAs(ip, '/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody-here@example.com' }),
    });
    expect(registered.status).toBe(200);
    expect(unregistered.status).toBe(200);
    const registeredBody = await registered.json();
    const unregisteredBody = await unregistered.json();
    // 字节级一致(防枚举:响应不区分注册状态)
    expect(JSON.stringify(unregisteredBody)).toBe(JSON.stringify(registeredBody));
    expect(registeredBody).toEqual({ ok: true });
  });

  it('rejects invalid email with 400', async () => {
    const response = await fetchAs(nextIp(), '/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/reset-password', () => {
  afterEach(() => {
    (globalThis as typeof globalThis & { __resendCalls?: unknown[] }).__resendCalls = [];
  });

  async function readCodeFromResendCalls(): Promise<string> {
    const calls = (globalThis as typeof globalThis & { __resendCalls?: unknown[] }).__resendCalls ?? [];
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1] as { url: string; body?: string };
    const body = JSON.parse(last.body ?? '{}') as { subject?: string };
    const match = body.subject?.match(/^(\d{6}) /);
    expect(match).not.toBeNull();
    return match![1];
  }

  it('full flow: forgot -> code -> reset revokes all sessions and clears cookie', async () => {
    const ip = nextIp();
    const oldCookie = await registerUser(ip, 'reset-flow@example.com');

    const forgot = await fetchAs(ip, '/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reset-flow@example.com' }),
    });
    expect(forgot.status).toBe(200);
    const code = await readCodeFromResendCalls();

    const reset = await fetchAs(ip, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reset-flow@example.com', code, newPassword: 'brand-new-pass-9' }),
    });
    expect(reset.status).toBe(200);
    expect(await reset.json()).toEqual({ ok: true });
    // 响应带清 cookie 头
    expect(reset.headers.get('Set-Cookie') ?? '').toContain('Max-Age=0');

    // 旧会话被吊销
    const me = await fetchAs(ip, '/api/auth/me', { headers: { Cookie: oldCookie } });
    expect(me.status).toBe(401);

    // 新密码可登录、旧密码失效
    const login = await fetchAs(ip, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reset-flow@example.com', password: 'brand-new-pass-9' }),
    });
    expect(login.status).toBe(200);
    const oldLogin = await fetchAs(ip, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reset-flow@example.com', password: 'old-password-1' }),
    });
    expect(oldLogin.status).toBe(401);
  });

  it('unregistered email gets the same invalid-code copy as registered (no enumeration)', async () => {
    const ip = nextIp();
    await registerUser(ip, 'reset-copy@example.com');
    const ghost = await fetchAs(ip, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@example.com', code: '123456', newPassword: 'whatever-123' }),
    });
    const registeredWrongCode = await fetchAs(ip, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reset-copy@example.com', code: '000000', newPassword: 'whatever-123' }),
    });
    expect(ghost.status).toBe(400);
    expect(registeredWrongCode.status).toBe(400);
    expect(await ghost.json()).toEqual(await registeredWrongCode.json());
  });

  it('invalidates the code after 5 wrong attempts', async () => {
    const ip = nextIp();
    await registerUser(ip, 'attempts@example.com');
    await fetchAs(ip, '/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'attempts@example.com' }),
    });
    const code = await readCodeFromResendCalls();
    const wrong = code === '999999' ? '888888' : '999999';
    let lastResponse: Response | null = null;
    for (let i = 0; i < 5; i += 1) {
      lastResponse = await fetchAs(ip, '/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'attempts@example.com', code: wrong, newPassword: 'whatever-123' }),
      });
    }
    expect(lastResponse?.status).toBe(400);
    expect(await lastResponse!.json()).toEqual({ error: '错误次数过多，请重新发送验证码' });
    // 即使接着用正确验证码也已作废
    const correct = await fetchAs(ip, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'attempts@example.com', code, newPassword: 'whatever-123' }),
    });
    expect(correct.status).toBe(400);
  });
});
