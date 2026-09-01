import { afterEach, describe, expect, it } from 'vitest';
import { checkRateLimit } from './rate-limit';
import type { Env } from '../types';

afterEach(() => {
  // 内存兜底状态不跨用例
  delete (globalThis as { __rlMemoryCleared?: boolean }).__rlMemoryCleared;
});

function envWithLimiter(results: boolean[]): Env & { RATE_LIMITER: { limit(o: { key: string }): Promise<{ success: boolean }> } } {
  let call = 0;
  return {
    RATE_LIMITER: {
      limit: async ({ key }) => {
        expect(key).toBeTypeOf('string');
        return { success: results[Math.min(call++, results.length - 1)] };
      },
    },
  } as Env & { RATE_LIMITER: { limit(o: { key: string }): Promise<{ success: boolean }> } };
}

describe('checkRateLimit', () => {
  it('uses the RATE_LIMITER binding when present and returns its verdict', async () => {
    const env = envWithLimiter([true, true, false]);
    await expect(checkRateLimit(env, '1.2.3.4')).resolves.toBe(true);
    await expect(checkRateLimit(env, '1.2.3.4')).resolves.toBe(true);
    await expect(checkRateLimit(env, '1.2.3.4')).resolves.toBe(false);
  });

  it('falls back to in-memory counting without binding: allows 10/min then blocks', async () => {
    const env = {} as Env;
    const ip = '9.9.9.9';
    for (let i = 0; i < 10; i += 1) {
      await expect(checkRateLimit(env, ip)).resolves.toBe(true);
    }
    await expect(checkRateLimit(env, ip)).resolves.toBe(false);
    // 不同 IP 不受影响
    await expect(checkRateLimit(env, '8.8.8.8')).resolves.toBe(true);
  });

  it('in-memory window expires after ~65s', async () => {
    vi_useFake();
    try {
      const env = {} as Env;
      const ip = '7.7.7.7';
      for (let i = 0; i < 10; i += 1) await checkRateLimit(env, ip);
      await expect(checkRateLimit(env, ip)).resolves.toBe(false);
      await vi_advance(66_000);
      await expect(checkRateLimit(env, ip)).resolves.toBe(true);
    } finally {
      vi_restore();
    }
  });
});

// 独立的 timer helpers,避免在每个用例里重复 import/useFakeTimers 组合
import { vi } from 'vitest';
function vi_useFake() { vi.useFakeTimers(); }
function vi_advance(ms: number) { return vi.advanceTimersByTimeAsync(ms); }
function vi_restore() { vi.useRealTimers(); }
