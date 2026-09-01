import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce, formatDateTime, sample, uid } from './utils';

describe('uid', () => {
  it('produces unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uid()));
    expect(ids.size).toBe(200);
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses rapid calls into one trailing invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced('a');
    vi.advanceTimersByTime(200);
    debounced('b');
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });
});

describe('formatDateTime', () => {
  it('formats as local YYYY-MM-DD HH:mm with zero padding', () => {
    const ts = new Date(2026, 8, 1, 7, 5).getTime();
    expect(formatDateTime(ts)).toBe('2026-09-01 07:05');
  });
});

describe('sample', () => {
  it('returns a copy when n covers the array', () => {
    const arr = [1, 2, 3];
    const out = sample(arr, 3);
    expect(out).toEqual([1, 2, 3]);
    expect(out).not.toBe(arr);
  });
  it('returns n distinct items when n is smaller (no duplicates)', () => {
    const arr = Array.from({ length: 50 }, (_, i) => i);
    const out = sample(arr, 5);
    expect(out).toHaveLength(5);
    expect(new Set(out).size).toBe(5);
    out.forEach((v) => expect(arr).toContain(v));
  });
});
