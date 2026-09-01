import { describe, expect, it } from 'vitest';
import { countVocabHits, englishWordCount, hasCjk, minimumHits, normalizedText } from './wordstats';

describe('englishWordCount', () => {
  it('counts english words with apostrophes and hyphens', () => {
    expect(englishWordCount("It's a well-known fact.")).toBe(4);
  });
  it('returns 0 for empty or non-english text (dirty input)', () => {
    expect(englishWordCount('')).toBe(0);
    expect(englishWordCount('中文测试 123')).toBe(0);
  });
});

describe('normalizedText', () => {
  it('lowercases, strips curly quotes and collapses whitespace', () => {
    expect(normalizedText('  “Pattern”   Matching ')).toBe('pattern matching');
  });
});

describe('hasCjk', () => {
  it('detects CJK vs latin', () => {
    expect(hasCjk('分析')).toBe(true);
    expect(hasCjk('analyze')).toBe(false);
    expect(hasCjk('')).toBe(false);
  });
});

describe('countVocabHits', () => {
  it('matches whole words case-insensitively and dedupes', () => {
    const hits = countVocabHits('Analyzing data. The analysis of ANALYZE.', ['analyze', 'data', 'analyze']);
    expect(hits.sort()).toEqual(['analyze', 'data']);
  });
  it('does not match substrings inside other words', () => {
    expect(countVocabHits('The analyzers worked.', ['analyze'])).toEqual([]);
  });
  it('escapes regex metacharacters in vocab words (dirty input)', () => {
    expect(countVocabHits('Cost is 3.5 dollars.', ['3.5'])).toEqual(['3.5']);
    expect(countVocabHits('nothing here', ['(x)'])).toEqual([]);
  });
});

describe('minimumHits', () => {
  it('scales thresholds by word count', () => {
    expect(minimumHits(150)).toBe(5);
    expect(minimumHits(200)).toBe(10);
    expect(minimumHits(400)).toBe(15);
    expect(minimumHits(800)).toBe(20);
  });
});
