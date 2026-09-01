import { describe, expect, it } from 'vitest';
import { tokenize } from './highlight';

describe('tokenize', () => {
  it('marks vocabulary words as known and others as unknown', () => {
    const tokens = tokenize('Marine scientists analyze data.', new Set(['analyze', 'data']));
    const words = tokens.filter((t) => t.kind === 'word');
    expect(words.map((w) => (w.kind === 'word' ? w.normalized : ''))).toEqual(['marine', 'scientists', 'analyze', 'data']);
    expect(words.filter((w) => w.kind === 'word' && w.isKnown).map((w) => (w.kind === 'word' ? w.normalized : ''))).toEqual(['analyze', 'data']);
  });

  it('splits trailing punctuation into separators', () => {
    const tokens = tokenize('pattern,', new Set(['pattern']));
    expect(tokens[0]).toMatchObject({ kind: 'word', text: 'pattern', isKnown: true });
    expect(tokens[1]).toMatchObject({ kind: 'sep', text: ',' });
  });

  it('splits hyphenated words into separate tokens with trailing hyphen as separator', () => {
    const tokens = tokenize('well-known', new Set());
    expect(tokens[0]).toMatchObject({ kind: 'word', normalized: 'well' });
    expect(tokens[1]).toMatchObject({ kind: 'sep', text: '-' });
    expect(tokens[2]).toMatchObject({ kind: 'word', normalized: 'known' });
  });

  it('keeps quotes and spaces as separators', () => {
    const tokens = tokenize('He said "analyze" now.', new Set(['analyze']));
    expect(tokens.some((t) => t.kind === 'sep' && t.text.includes('"'))).toBe(true);
    const wordTexts = tokens.filter((t) => t.kind === 'word').map((t) => (t.kind === 'word' ? t.text : ''));
    expect(wordTexts).toEqual(['He', 'said', 'analyze', 'now']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('', new Set())).toEqual([]);
  });
});
