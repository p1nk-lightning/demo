// 学习看板聚合纯函数(AC-005)。口径与 data-model.md §4 一致:
// - 日界 = 北京时间(Asia/Shanghai),与 Worker 的 chinaDayKey 同构
// - 词汇复现率 = 窗口内阅读文章 vocabHitIds 并集 ∩ 当前激活词库 ÷ 词库总词数
// - 得分趋势 = 阅读得分% 与测验正确率% 双序列,按日聚合

const DAY_MS = 86_400_000;

/** 北京日历日键(与 worker lib/time.chinaDayKey 同口径)。 */
export function dayKeyChina(ts: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ts);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** 窗口起点(含当天,共 days 个自然日,最后一天是今天)。 */
export function windowStart(now: number, days: number): number {
  return now - (days - 1) * DAY_MS;
}

export interface DayCount {
  day: string;
  count: number;
}

/** 每日阅读量:窗口内每个北京日历日的完成篇数(升序,缺数据日补 0)。 */
export function dailyReadingCounts(
  progress: Array<{ completedAt: number }>,
  fromMs: number,
  toMs: number,
  now = Date.now(),
): DayCount[] {
  const buckets = new Map<string, number>();
  for (let ts = fromMs; ts <= toMs; ts += DAY_MS) {
    buckets.set(dayKeyChina(ts), 0);
  }
  for (const record of progress) {
    if (record.completedAt < fromMs || record.completedAt > toMs) continue;
    const key = dayKeyChina(record.completedAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
}

/**
 * 词汇复现率(%):窗口内读过文章的 vocabHitIds 并集 ∩ 词库 normalized 集合 ÷ 词库总词数。
 * 词库为空时返回 0(避免除零)。
 */
export function vocabCoverageRate(
  vocabHitIdLists: string[][],
  vocabNormalized: string[],
): number {
  if (vocabNormalized.length === 0) return 0;
  const vocabSet = new Set(vocabNormalized.map((word) => word.toLowerCase()));
  const union = new Set<string>();
  for (const list of vocabHitIdLists) {
    for (const word of list) {
      const key = word.toLowerCase();
      if (vocabSet.has(key)) union.add(key);
    }
  }
  return Math.round((union.size / vocabNormalized.length) * 100);
}

export interface ScorePoint {
  day: string;
  /** 阅读得分%(当日均分,无数据为 null) */
  reading: number | null;
  /** 测验正确率%(当日均分,无数据为 null) */
  quiz: number | null;
}

/** 得分趋势:阅读(score/total)与测验(correct/total)按北京日聚合的双序列。 */
export function scoreSeries(
  readings: Array<{ completedAt: number; score: number; total: number }>,
  quizzes: Array<{ completedAt: number; correct: number; total: number }>,
  fromMs: number,
  toMs: number,
  now = Date.now(),
): ScorePoint[] {
  const readingBuckets = new Map<string, number[]>();
  const quizBuckets = new Map<string, number[]>();
  for (const record of readings) {
    if (record.completedAt < fromMs || record.completedAt > toMs || record.total <= 0) continue;
    const key = dayKeyChina(record.completedAt);
    if (!readingBuckets.has(key)) readingBuckets.set(key, []);
    readingBuckets.get(key)!.push(Math.round((record.score / record.total) * 100));
  }
  for (const record of quizzes) {
    if (record.completedAt < fromMs || record.completedAt > toMs || record.total <= 0) continue;
    const key = dayKeyChina(record.completedAt);
    if (!quizBuckets.has(key)) quizBuckets.set(key, []);
    quizBuckets.get(key)!.push(Math.round((record.correct / record.total) * 100));
  }
  const points: ScorePoint[] = [];
  for (let ts = fromMs; ts <= toMs; ts += DAY_MS) {
    const key = dayKeyChina(ts);
    const readingsOfDay = readingBuckets.get(key);
    const quizzesOfDay = quizBuckets.get(key);
    points.push({
      day: key,
      reading: readingsOfDay && readingsOfDay.length
        ? Math.round(readingsOfDay.reduce((a, b) => a + b, 0) / readingsOfDay.length)
        : null,
      quiz: quizzesOfDay && quizzesOfDay.length
        ? Math.round(quizzesOfDay.reduce((a, b) => a + b, 0) / quizzesOfDay.length)
        : null,
    });
  }
  return points;
}
