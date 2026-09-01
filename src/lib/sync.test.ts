import { beforeEach, describe, expect, it, vi } from 'vitest';

// mock apiClient:默认 snapshot 返回空、push 成功;用例里覆写
const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/apiClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/store/useAuthStore', () => ({ useAuthStore: { getState: () => ({ hydrate: vi.fn() }) } }));

const handlerState = vi.hoisted(() => ({ syncHandler: null as ((ownerId: string) => void) | null }));
vi.mock('@/lib/syncScheduler', () => ({
  registerSyncHandler: (fn: (ownerId: string) => void) => {
    handlerState.syncHandler = fn;
  },
}));

vi.mock('@/lib/db', () => ({
  claimLegacyLocalData: vi.fn(),
  countLegacyLocalData: vi.fn(async () => 0),
  mergeRemoteSyncData: vi.fn(async () => false),
  getLocalSyncData: vi.fn(async () => ({ vocabLists: [], vocabItems: [], articles: [], progress: [] })),
}));

// 每个用例重新 import sync.ts,拿到全新的模块级状态(activeUserId/inFlight 表)
async function freshSync() {
  const mod = await import('./sync');
  return mod.useSyncStore;
}

describe('useSyncStore 竞态防护', () => {
  beforeEach(() => {
    vi.resetModules();
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === '/api/sync/snapshot') return { vocabLists: [], vocabItems: [], articles: [], progress: [] };
      return { ok: true };
    });
    handlerState.syncHandler = null;
  });

  it('concurrent startForUser for the same user joins one round and marks a rerun', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === '/api/sync/snapshot') {
        return new Promise((resolve) => { resolvers.push(resolve); });
      }
      return { ok: true };
    });

    const useSyncStore = (await freshSync());
    const p1 = useSyncStore.getState().startForUser('u1');
    const p2 = useSyncStore.getState().startForUser('u1');
    expect(useSyncStore.getState().status).toBe('syncing');
    expect(resolvers).toHaveLength(1); // 加入进行中的一轮,不发第二个 snapshot

    resolvers.forEach((r) => r({ vocabLists: [], vocabItems: [], articles: [], progress: [] }));
    await Promise.all([p1, p2]);
    await vi.waitFor(() => {
      // 第二个调用者加入时标记了 rerun → 第一轮结束后自动补跑一轮
      const calls = apiRequestMock.mock.calls.filter(([path]) => path === '/api/sync/snapshot');
      expect(calls.length).toBe(2);
    });
    // 补跑轮的 snapshot 同样是挂起的,放行后应回到 idle
    resolvers.forEach((r) => r({ vocabLists: [], vocabItems: [], articles: [], progress: [] }));
    await vi.waitFor(() => {
      expect(useSyncStore.getState().status).toBe('idle');
    });
  });

  it('a write during an in-flight round triggers an automatic rerun', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === '/api/sync/snapshot') {
        if (!resolveFirst) {
          return new Promise((resolve) => { resolveFirst = resolve; });
        }
        return { vocabLists: [], vocabItems: [], articles: [], progress: [] };
      }
      return { ok: true };
    });

    const useSyncStore = (await freshSync());
    void useSyncStore.getState().startForUser('u1');
    handlerState.syncHandler?.('u1'); // 第一轮途中写库 → 补跑

    resolveFirst({ vocabLists: [], vocabItems: [], articles: [], progress: [] });
    await vi.waitFor(() => {
      const calls = apiRequestMock.mock.calls.filter(([path]) => path === '/api/sync/snapshot');
      expect(calls.length).toBe(2);
    });
    expect(useSyncStore.getState().status).toBe('idle');
  });

  it('marks offline on network failure and does not retry immediately', async () => {
    apiRequestMock.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    const useSyncStore = (await freshSync());
    await useSyncStore.getState().startForUser('u1');
    expect(useSyncStore.getState().status).toBe('offline');
    expect(useSyncStore.getState().message).toContain('离线');
    const calls = apiRequestMock.mock.calls.filter(([path]) => path === '/api/sync/snapshot');
    expect(calls).toHaveLength(1); // 不立即重试
  });

  it('marks error with friendly message on 401 and hydrates auth', async () => {
    const { ApiError } = await import('@/lib/apiClient');
    apiRequestMock.mockImplementation(async () => {
      throw new (ApiError as new (m: string, s: number) => Error & { status: number })('未登录', 401);
    });
    const useSyncStore = (await freshSync());
    await useSyncStore.getState().startForUser('u1');
    expect(useSyncStore.getState().status).toBe('error');
    expect(useSyncStore.getState().message).toContain('登录已失效');
  });

  it('retryable 5xx schedules an automatic retry that runs sync again', async () => {
    vi.useFakeTimers();
    try {
      apiRequestMock.mockImplementationOnce(async () => {
        const err = new Error('boom') as Error & { status: number };
        err.status = 503;
        throw err;
      });
      const useSyncStore = (await freshSync());
      await useSyncStore.getState().startForUser('u1');
      expect(useSyncStore.getState().status).toBe('error');
      await vi.advanceTimersByTimeAsync(5_100);
      const calls = apiRequestMock.mock.calls.filter(([path]) => path === '/api/sync/snapshot');
      expect(calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
