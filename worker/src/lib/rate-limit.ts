// 请求级限流(AC-009,ADR-001):
// 生产走 Cloudflare Rate Limiting binding(强一致、按 60 秒窗口);
// 本地 dev / 测试无 binding 时回退到进程内计数(单 isolate,语义等价 10 次/分钟)。
// 日级配额不在此处:生成配额由 D1 generation_usage 承担,重置码由 password_reset_tokens 计数。
import type { Env } from '../types';

const memoryRateLimits = new Map<string, { count: number; expiresAt: number }>();

export async function checkRateLimit(env: Env, ip: string) {
  const limiter = (env as Env & { RATE_LIMITER?: { limit(key: { key: string }): Promise<{ success: boolean }> } }).RATE_LIMITER;
  if (limiter) {
    const { success } = await limiter.limit({ key: ip });
    return success;
  }
  const key = `minute:${ip}:${Math.floor(Date.now() / 60000)}`;
  const now = Date.now();
  const current = memoryRateLimits.get(key);
  const count = current && current.expiresAt > now ? current.count + 1 : 1;
  memoryRateLimits.set(key, { count, expiresAt: now + 65_000 });
  if (memoryRateLimits.size > 500) {
    for (const [storedKey, value] of memoryRateLimits) if (value.expiresAt <= now) memoryRateLimits.delete(storedKey);
  }
  return count <= 10;
}
