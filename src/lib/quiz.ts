// 词汇测验纯逻辑(AC-002/003):抽词、干扰项生成、拼写给分、错词重排队。
// 数据来源:激活词库(Dexie)+ 词典释义(lookupDictMany → meaningCN)。

export interface QuizWord {
  /** 词库归一化词,即判分唯一正确答案 */
  normalized: string;
  /** 中文释义(来自内置词典;无释义的词不会进入抽词结果) */
  gloss: string;
}

export interface PickResult {
  /** 实际出题词(≤ count) */
  picked: QuizWord[];
  /** 词库中有词但查不到释义、被跳过的数量 */
  skippedNoGloss: number;
}

export interface DefinitionQuestion {
  normalized: string;
  /** 正确释义(即正确选项文案) */
  gloss: string;
  /** 4 个选项(随机分布) */
  options: string[];
  /** 正确选项下标 */
  answerIndex: number;
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 从词库抽 count 个有释义的词。无释义词不计入 picked、计入 skippedNoGloss。
 * 同一 normalized 视为同一个词(词库层已去重,这里兜底)。
 */
export function pickQuizWords(
  items: Array<{ normalized: string }>,
  glosses: Map<string, string>,
  count = 10,
  rnd: () => number = Math.random,
): PickResult {
  const seen = new Set<string>();
  const glossed: QuizWord[] = [];
  let skippedNoGloss = 0;
  for (const item of items) {
    const key = item.normalized.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const gloss = glosses.get(key);
    if (!gloss) {
      skippedNoGloss += 1;
      continue;
    }
    glossed.push({ normalized: key, gloss });
  }
  const picked = shuffle(glossed, rnd).slice(0, count);
  return { picked, skippedNoGloss };
}

/**
 * 看词选义:1 正确释义 + 3 个来自其他词的干扰释义,随机分布。
 * 干扰项不含正确释义、互相不重复;总释义不足 4 个时返回 null(调用方应给空态)。
 */
export function buildDefinitionQuestion(
  word: QuizWord,
  glosses: string[],
  rnd: () => number = Math.random,
): DefinitionQuestion | null {
  const correct = word.gloss;
  const pool = Array.from(new Set(glosses.filter((g) => g && g !== correct)));
  if (pool.length < 3) return null;
  const distractors = shuffle(pool, rnd).slice(0, 3);
  const options = shuffle([correct, ...distractors], rnd);
  return { normalized: word.normalized, gloss: correct, options, answerIndex: options.indexOf(correct) };
}

/**
 * 见义拼词判分:大小写不敏感、去首尾空格;词库归一化词是唯一正确答案。
 * 英美拼写变体与加后缀一律判错(词库里没有的拼写不算对)。
 */
export function judgeSpelling(input: string, expected: string): boolean {
  const candidate = input.trim().toLowerCase();
  if (!candidate) return false;
  return candidate === expected.trim().toLowerCase();
}

/** 把本轮答错的词排到队尾(保持原有相对顺序,一次重练)。 */
export function queueWrongForRetake<T extends { normalized: string }>(
  queue: T[],
  wrongNormalized: ReadonlySet<string>,
): T[] {
  const keep = queue.filter((item) => !wrongNormalized.has(item.normalized));
  const wrong = queue.filter((item) => wrongNormalized.has(item.normalized));
  return [...keep, ...wrong];
}
