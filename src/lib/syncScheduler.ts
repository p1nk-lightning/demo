type SyncHandler = (ownerId: string) => void;

let syncHandler: SyncHandler | null = null;
const timers = new Map<string, number>();

export function registerSyncHandler(handler: SyncHandler | null) {
  syncHandler = handler;
}

export function scheduleSync(ownerId: string | null | undefined) {
  if (!ownerId || !syncHandler) return;
  const previous = timers.get(ownerId);
  if (previous) window.clearTimeout(previous);
  const timer = window.setTimeout(() => {
    timers.delete(ownerId);
    syncHandler?.(ownerId);
  }, 350);
  timers.set(ownerId, timer);
}
