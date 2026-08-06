let currentOwnerId: string | null = null;

export function getLocalOwnerId() {
  return currentOwnerId;
}

export function setLocalOwnerId(ownerId: string | null) {
  currentOwnerId = ownerId;
}

export function isOwnedBy(value: { ownerId?: string | null }, ownerId = currentOwnerId) {
  return (value.ownerId ?? null) === ownerId;
}

export function scopedKey(key: string, ownerId = currentOwnerId) {
  return `${key}:${ownerId ?? 'anonymous'}`;
}
