// 请求级限流(自 index.ts 纯移动;binding 化改造归 T15/AC-009)。
import type { Env } from '../types';

const memoryRateLimits = new Map<string, { count: number; expiresAt: number }>();

export async function checkRateLimit(env: Env, ip: string) {
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
