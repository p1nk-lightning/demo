export function englishWordCount(value: string) {
  return value.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)?.length ?? 0;
}

export function normalizedText(value: string) {
  return value.toLowerCase().replace(/[“”‘’]/g, '').replace(/\s+/g, ' ').trim();
}

export function hasCjk(value: string) {
  return /[\u3400-\u9fff]/u.test(value);
}

export function countVocabHits(article: string, words: string[]) {
  const hits = new Set<string>();
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(article)) hits.add(word);
  }
  return [...hits];
}

export function minimumHits(wordCount: number) {
  if (wordCount < 200) return 5;
  if (wordCount < 400) return 10;
  if (wordCount < 800) return 15;
  return 20;
}
