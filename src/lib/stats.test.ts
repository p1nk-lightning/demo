import { describe, expect, it } from 'vitest';
import { dailyReadingCounts, dayKeyChina, scoreSeries, vocabCoverageRate, windowStart } from './stats';

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0); // 2026-09-01 北京 20:00

describe('dayKeyChina', () => {
  it('uses the Beijing calendar day, rolling at 16:00 UTC', () => {
    expect(dayKeyChina(Date.UTC(2026, 8, 1, 12))).toBe('2026-09-01');
    expect(dayKeyChina(Date.UTC(2026, 8, 1, 15, 59))).toBe('2026-09-01');
    expect(dayKeyChina(Date.UTC(2026, 8, 1, 16, 0))).toBe('2026-09-02');
  });
});

describe('windowStart', () => {
  it('shorter windows start later; today is always included', () => {
    expect(windowStart(NOW, 6) - windowStart(NOW, 7)).toBe(86_400_000);
    expect(windowStart(NOW, 1)).toBe(NOW);
  });
});

describe('dailyReadingCounts', () => {
  it('counts completions per Beijing day and zero-fills empty days', () => {
    const day1 = Date.UTC(2026, 7, 26, 14); // 北京 08-26 22:00(窗口内)
    const day2 = Date.UTC(2026, 7, 30, 17); // 北京 08-31 01:00(跨日界!)
    const from = windowStart(NOW, 7);
    const counts = dailyReadingCounts([
      { completedAt: day1 },
      { completedAt: day1 },
      { completedAt: day2 },
    ], from, NOW, NOW);
    expect(counts).toHaveLength(7);
    expect(counts[counts.length - 1].day).toBe('2026-09-01');
    expect(counts.find((c) => c.day === '2026-08-26')?.count).toBe(2);
    expect(counts.find((c) => c.day === '2026-08-31')?.count).toBe(1);
    expect(counts.find((c) => c.day === '2026-08-27')?.count).toBe(0);
  });

  it('excludes records outside the window (dirty/out-of-range input)', () => {
    const from = windowStart(NOW, 7);
    const counts = dailyReadingCounts([{ completedAt: from - 1 }, { completedAt: NOW + 1 }], from, NOW, NOW);
    expect(counts.every((c) => c.count === 0)).toBe(true);
  });
});

describe('vocabCoverageRate', () => {
  const vocab = ['analyze', 'data', 'pattern', 'current', 'reveal', 'source'];

  it('unions hit ids across articles, intersects with vocab, rounds', () => {
    // 并集 = analyze,data,pattern,current,reveal,extra(6 词中 5 词命中 + 1 词库外)
    const rate = vocabCoverageRate([
      ['analyze', 'data', 'extra'],
      ['pattern', 'current', 'reveal'],
    ], vocab);
    expect(rate).toBe(Math.round((5 / 6) * 100));
  });

  it('is case-insensitive on both sides', () => {
    expect(vocabCoverageRate([['ANALYZE']], ['analyze'])).toBe(100);
  });

  it('returns 0 for empty vocab (avoid divide-by-zero)', () => {
    expect(vocabCoverageRate([['analyze']], [])).toBe(0);
  });
});

describe('scoreSeries', () => {
  const from = windowStart(NOW, 3);

  it('averages per day and null-fills missing days', () => {
    const points = scoreSeries([
      { completedAt: from, score: 4, total: 5 },
      { completedAt: from + 1000, score: 5, total: 5 },
      { completedAt: from + 86_400_000, score: 3, total: 5 },
    ], [
      { completedAt: from, correct: 8, total: 10 },
    ], from, NOW, NOW);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ day: expect.any(String), reading: 90, quiz: 80 });
    expect(points[1].reading).toBe(60);
    expect(points[1].quiz).toBeNull();
    expect(points[2]).toEqual({ day: expect.any(String), reading: null, quiz: null });
  });

  it('ignores records with total <= 0 (dirty input)', () => {
    const points = scoreSeries([{ completedAt: from, score: 4, total: 0 }], [], from, NOW, NOW);
    expect(points[0].reading).toBeNull();
  });
});
