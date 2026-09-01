export function chinaDayKey(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

export function chinaDayNumber(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function isRotationDay(dayKey: string) {
  return chinaDayNumber(dayKey) % 2 === 0;
}
