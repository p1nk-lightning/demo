import { create } from 'zustand';
import { apiRequest, ApiError } from '@/lib/apiClient';
import { claimLegacyLocalData, countLegacyLocalData, getLocalSyncData, mergeRemoteSyncData, type LocalSyncData } from '@/lib/db';
import { setLocalOwnerId } from '@/lib/localScope';
import { registerSyncHandler } from '@/lib/syncScheduler';
import { useAuthStore } from '@/store/useAuthStore';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';
interface SyncState {
  status: SyncStatus;
  needsMerge: boolean;
  legacyCount: number;
  lastSyncedAt: number | null;
  dataRevision: number;
  message: string | null;
  startForUser: (userId: string) => Promise<void>;
  syncNow: (ownerId?: string) => Promise<void>;
  mergeLegacyData: () => Promise<void>;
  dismissMerge: () => void;
  reset: () => void;
}
interface Snapshot extends LocalSyncData {}

let activeUserId: string | null = null;
let runToken = 0;
const inFlightByUser = new Map<string, Promise<void>>();
const rerunUsers = new Set<string>();
const retryTimers = new Map<string, number>();

function clearRetry(ownerId: string) {
  const timer = retryTimers.get(ownerId);
  if (timer !== undefined) window.clearTimeout(timer);
  retryTimers.delete(ownerId);
}

function scheduleRetry(ownerId: string, token: number) {
  if (retryTimers.has(ownerId)) return;
  const timer = window.setTimeout(() => {
    retryTimers.delete(ownerId);
    if (token === runToken && activeUserId === ownerId) void requestSync(ownerId);
  }, 5000);
  retryTimers.set(ownerId, timer);
}

async function syncUser(ownerId: string, token: number) {
  if (token !== runToken || activeUserId !== ownerId) return;
  if (!navigator.onLine) {
    useSyncStore.setState({ status: 'offline', message: '当前离线，数据已保存在本机' });
    return;
  }
  useSyncStore.setState({ status: 'syncing', message: null });
  try {
    const snapshot = await apiRequest<Snapshot>('/api/sync/snapshot');
    if (token !== runToken || activeUserId !== ownerId) return;
    const changed = await mergeRemoteSyncData(snapshot, ownerId);
    if (changed) useSyncStore.setState((state) => ({ dataRevision: state.dataRevision + 1 }));
    const local = await getLocalSyncData(ownerId);
    await apiRequest<{ ok: true }>('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(local),
    });
    if (token !== runToken || activeUserId !== ownerId) return;
    clearRetry(ownerId);
    useSyncStore.setState({ status: 'idle', lastSyncedAt: Date.now(), message: null });
  } catch (error) {
    if (token !== runToken || activeUserId !== ownerId) return;
    const offline = !navigator.onLine || error instanceof TypeError;
    const unauthorized = error instanceof ApiError && error.status === 401;
    const retryable = !offline && (!(error instanceof ApiError) || error.status === 429 || error.status >= 500);
    useSyncStore.setState({
      status: offline ? 'offline' : 'error',
      message: offline
        ? '当前离线，恢复网络后自动同步'
        : unauthorized
          ? '登录已失效，请重新登录'
          : error instanceof ApiError
            ? error.message
            : '同步失败，将自动重试',
    });
    if (unauthorized) void useAuthStore.getState().hydrate();
    if (retryable) scheduleRetry(ownerId, token);
  }
}

function requestSync(ownerId: string) {
  const existing = inFlightByUser.get(ownerId);
  if (existing) {
    rerunUsers.add(ownerId);
    return existing;
  }
  const current = syncUser(ownerId, runToken).finally(() => {
    if (inFlightByUser.get(ownerId) === current) inFlightByUser.delete(ownerId);
    if (rerunUsers.delete(ownerId) && activeUserId === ownerId) void requestSync(ownerId);
  });
  inFlightByUser.set(ownerId, current);
  return current;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  needsMerge: false,
  legacyCount: 0,
  lastSyncedAt: null,
  dataRevision: 0,
  message: null,
  startForUser: async (userId) => {
    if (activeUserId === userId) {
      await requestSync(userId);
      return;
    }
    activeUserId = userId;
    runToken += 1;
    setLocalOwnerId(userId);
    const legacyCount = await countLegacyLocalData();
    if (activeUserId !== userId) return;
    set({ status: navigator.onLine ? 'syncing' : 'offline', legacyCount, needsMerge: legacyCount > 0, message: null });
    await requestSync(userId);
  },
  syncNow: async (ownerId = activeUserId ?? undefined) => {
    if (ownerId) await requestSync(ownerId);
  },
  mergeLegacyData: async () => {
    if (!activeUserId) return;
    await claimLegacyLocalData(activeUserId);
    set((state) => ({ needsMerge: false, legacyCount: 0, dataRevision: state.dataRevision + 1 }));
    await requestSync(activeUserId);
  },
  dismissMerge: () => set({ needsMerge: false }),
  reset: () => {
    for (const timer of retryTimers.values()) window.clearTimeout(timer);
    retryTimers.clear();
    activeUserId = null;
    runToken += 1;
    setLocalOwnerId(null);
    set({ status: 'idle', needsMerge: false, legacyCount: 0, lastSyncedAt: null, message: null, dataRevision: 0 });
  },
}));

registerSyncHandler((ownerId) => {
  if (ownerId === activeUserId) void requestSync(ownerId);
});

window.addEventListener('online', () => {
  if (activeUserId) void requestSync(activeUserId);
});
