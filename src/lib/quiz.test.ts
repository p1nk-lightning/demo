import { describe, expect, it } from 'vitest';
import { buildDefinitionQuestion, judgeSpelling, pickQuizWords, queueWrongForRetake } from './quiz';

// 确定性随机源(顺序返回),让 shuffle 结果可断言
function seqRandom(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length] ?? 0.5;
}

const GLOSSES = new Map([
  ['analyze', 'v. 分析；分解'],
  ['data', 'n. 数据'],
  ['pattern', 'n. 模式；图案'],
  ['current', 'n. 洋流；电流'],
  ['reveal', 'v. 揭示'],
  ['noGloss', ''],
]);

describe('pickQuizWords', () => {
  const items = [
    { normalized: 'analyze' },
    { normalized: 'data' },
    { normalized: 'pattern' },
    { normalized: 'current' },
    { normalized: 'reveal' },
    { normalized: 'noGloss' },
  ];

  it('picks only glossed words, counts skipped ones', () => {
    const { picked, skippedNoGloss } = pickQuizWords(items, GLOSSES, 10, () => 0.5);
    expect(picked).toHaveLength(5);
    expect(skippedNoGloss).toBe(1);
    expect(picked.map((w) => w.normalized)).not.toContain('nogloss');
  });

  it('caps picked at count and dedupes by normalized', () => {
    const dup = [...items, { normalized: 'analyze' }, { normalized: 'ANALYZE' }];
    const { picked } = pickQuizWords(dup, GLOSSES, 3, () => 0.1);
    expect(picked).toHaveLength(3);
    const names = picked.map((w) => w.normalized);
    expect(new Set(names).size).toBe(3);
  });

  it('returns empty picked when nothing is glossed (dirty input)', () => {
    const { picked, skippedNoGloss } = pickQuizWords([{ normalized: 'x' }, { normalized: 'y' }], new Map(), 10);
    expect(picked).toHaveLength(0);
    expect(skippedNoGloss).toBe(2);
  });
});

describe('buildDefinitionQuestion', () => {
  const allGlosses = [...GLOSSES.values()].filter(Boolean);

  it('builds 4 options containing the correct gloss exactly once', () => {
    const q = buildDefinitionQuestion({ normalized: 'analyze', gloss: 'v. 分析；分解' }, allGlosses, () => 0.3);
    expect(q).not.toBeNull();
    expect(q!.options).toHaveLength(4);
    expect(q!.options.filter((o) => o === 'v. 分析；分解')).toHaveLength(1);
    expect(q!.options[q!.answerIndex]).toBe('v. 分析；分解');
    expect(q!.normalized).toBe('analyze');
  });

  it('returns null when fewer than 3 distractor glosses exist', () => {
    const q = buildDefinitionQuestion({ normalized: 'analyze', gloss: 'v. 分析' }, ['v. 分析', 'n. 数据'], () => 0.5);
    expect(q).toBeNull();
  });

  it('never leaks the correct gloss into distractors', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const q = buildDefinitionQuestion({ normalized: 'data', gloss: 'n. 数据' }, allGlosses, () => seed / 40);
      expect(q!.options.filter((o) => o === 'n. 数据')).toHaveLength(1);
    }
  });
});

describe('judgeSpelling', () => {
  const word = 'pattern';

  it('accepts case-insensitive and trimmed input', () => {
    expect(judgeSpelling('Pattern', word)).toBe(true);
    expect(judgeSpelling('  PATTERN  ', word)).toBe(true);
  });
  it('rejects suffixed, wrong and empty input', () => {
    expect(judgeSpelling('patterns', word)).toBe(false);
    expect(judgeSpelling('patter', word)).toBe(false);
    expect(judgeSpelling('   ', word)).toBe(false);
  });
  it('does not auto-accept spelling variants not in the vocab', () => {
    expect(judgeSpelling('analyse', 'analyze')).toBe(false);
  });
});

describe('queueWrongForRetake', () => {
  const queue = [{ normalized: 'a' }, { normalized: 'b' }, { normalized: 'c' }];

  it('moves wrong words to the tail preserving relative order', () => {
    const out = queueWrongForRetake(queue, new Set(['a', 'c']));
    expect(out.map((q) => q.normalized)).toEqual(['b', 'a', 'c']);
  });
  it('returns the same order when nothing is wrong', () => {
    expect(queueWrongForRetake(queue, new Set()).map((q) => q.normalized)).toEqual(['a', 'b', 'c']);
  });
  it('handles all-wrong and empty queues', () => {
    expect(queueWrongForRetake(queue, new Set(['a', 'b', 'c'])).map((q) => q.normalized)).toEqual(['a', 'b', 'c']);
    expect(queueWrongForRetake([], new Set(['a']))).toEqual([]);
  });
});
