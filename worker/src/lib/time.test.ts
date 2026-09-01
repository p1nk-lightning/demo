import { describe, expect, it } from 'vitest';
import { chinaDayKey, chinaDayNumber, isRotationDay } from './time';

// 北京 = UTC+8,无夏令时。用已知 UTC 时刻锚定日界行为。
describe('chinaDayKey', () => {
  it('maps UTC afternoon to the same Beijing calendar day', () => {
    // 2026-01-15T10:00:00Z = 北京 18:00 同日
    expect(chinaDayKey(Date.UTC(2026, 0, 15, 10, 0, 0))).toBe('2026-01-15');
  });
  it('rolls into the next Beijing day when UTC crosses 16:00 (day boundary)', () => {
    // 2026-01-15T16:30:00Z = 北京 2026-01-16 00:30
    expect(chinaDayKey(Date.UTC(2026, 0, 15, 16, 30, 0))).toBe('2026-01-16');
  });
  it('handles month and year rollover', () => {
    // 2025-12-31T16:00:00Z = 北京 2026-01-01 00:00
    expect(chinaDayKey(Date.UTC(2025, 11, 31, 16, 0, 0))).toBe('2026-01-01');
  });
});

describe('chinaDayNumber / isRotationDay', () => {
  it('produces stable day numbers', () => {
    expect(chinaDayNumber('2026-01-01')).toBe(chinaDayNumber('2026-01-01'));
    expect(chinaDayNumber('2026-01-02') - chinaDayNumber('2026-01-01')).toBe(1);
  });
  it('classifies rotation days by even/odd day number', () => {
    const even = chinaDayNumber('2026-01-01');
    expect(isRotationDay('2026-01-01')).toBe(even % 2 === 0);
    expect(isRotationDay('2026-01-02')).toBe(!isRotationDay('2026-01-01'));
  });
  it('rejects malformed day keys as invalid dates (dirty input)', () => {
    expect(Number.isNaN(chinaDayNumber('not-a-date'))).toBe(true);
  });
});
