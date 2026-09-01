import { describe, expect, it } from 'vitest';
import { isPlausibleWord, normalizeWord, parseTXT, summarizeParse } from './vocab';

describe('normalizeWord', () => {
  it('lowercases, strips quotes, trailing punctuation and phonetic slashes', () => {
    expect(normalizeWord('  Analyze. ')).toBe('analyze');
    expect(normalizeWord('"data"')).toBe('data');
    expect(normalizeWord('/ənˈæl.aɪz/')).toBe('ənˈæl.aɪz'); // 去斜杠但不切 token(首个 token 兜底只对含空白输入生效)
    expect(normalizeWord('pattern.,;:!?')).toBe('pattern');
    expect(normalizeWord('analyze    extra')).toBe('analyze');
  });
  it('returns empty string for empty input (dirty)', () => {
    expect(normalizeWord('')).toBe('');
  });
});

describe('isPlausibleWord', () => {
  it('accepts single letters, hyphens and apostrophes', () => {
    expect(isPlausibleWord('a')).toBe(true);
    expect(isPlausibleWord("well-known")).toBe(true);
    expect(isPlausibleWord("it's")).toBe(true);
  });
  it('rejects digits, CJK and overlong strings', () => {
    expect(isPlausibleWord('123')).toBe(false);
    expect(isPlausibleWord('单词')).toBe(false);
    expect(isPlausibleWord('a'.repeat(41))).toBe(false);
  });
});

describe('parseTXT', () => {
  it('splits on whitespace/commas/semicolons and dedupes with source=pasted', () => {
    const result = parseTXT('Analyze\ndata, pattern; analyze\tDATA');
    expect(result.words.map((w) => w.normalized)).toEqual(['analyze', 'data', 'pattern']);
    expect(result.duplicates).toBe(2);
    expect(result.words.every((w) => w.source === 'pasted')).toBe(true);
  });
  it('rejects non-words and keeps the original token', () => {
    const result = parseTXT('analyze 123 单词');
    expect(result.words.map((w) => w.normalized)).toEqual(['analyze']);
    expect(result.rejected).toEqual(['123', '单词']);
  });
  it('returns empty result for empty input', () => {
    const result = parseTXT('   \n  ');
    expect(result.words).toEqual([]);
    expect(result.raw).toEqual([]);
  });
  it('summarizeParse counts by source and rejections', () => {
    const summary = summarizeParse(parseTXT('analyze, data 123'));
    expect(summary).toMatchObject({ total: 2, pasteCnt: 2, xlsxCnt: 0, rejected: 1, duplicates: 0 });
  });
});
