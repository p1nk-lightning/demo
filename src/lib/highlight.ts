// 文章 → token, 每个 token 携带是否词表词、是否生词
export type Token =
  | { kind: 'word'; text: string; normalized: string; isKnown: boolean }
  | { kind: 'sep'; text: string };

const SPLIT_RE = /([\s.,;:!?"'()\[\]{}—–-]+)/;

export function tokenize(article: string, vocabSet: Set<string>): Token[] {
  const parts = article.split(SPLIT_RE);
  const out: Token[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (SPLIT_RE.test(p) && !/[A-Za-z]/.test(p)) {
      out.push({ kind: 'sep', text: p });
      continue;
    }
    // 仅把含字母的视为 word
    if (/[A-Za-z]/.test(p)) {
      // 单词可能带尾部标点 -> 拆出来
      const m = p.match(/^([A-Za-z][A-Za-z'\-]*)(.*)$/);
      if (m) {
        const core = m[1];
        const tail = m[2];
        out.push({ kind: 'word', text: core, normalized: core.toLowerCase(), isKnown: vocabSet.has(core.toLowerCase()) });
        if (tail) out.push({ kind: 'sep', text: tail });
      } else {
        out.push({ kind: 'sep', text: p });
      }
    } else {
      out.push({ kind: 'sep', text: p });
    }
  }
  return out;
}
