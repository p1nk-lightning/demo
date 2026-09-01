// 学习看板(AC-005):每日阅读量 / 词汇复现率 / 得分趋势,数据全部来自本地 Dexie。
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Button, CardSkeleton, EmptyState } from '@/components/ui';
import {
  getActiveVocabularyListId,
  getVocabularyItems,
  db,
  listQuizResultsByRange,
} from '@/lib/db';
import {
  dailyReadingCounts,
  scoreSeries,
  vocabCoverageRate,
  windowStart,
} from '@/lib/stats';

type Phase = 'loading' | 'empty' | 'ready';
type RangeDays = 7 | 30;

export default function StatsPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [range, setRange] = useState<RangeDays>(7);
  const [readingCounts, setReadingCounts] = useState<{ day: string; count: number }[]>([]);
  const [points, setPoints] = useState<{ day: string; reading: number | null; quiz: number | null }[]>([]);
  const [coverage, setCoverage] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (days: RangeDays) => {
    setPhase('loading');
    try {
      const now = Date.now();
      const from = windowStart(now, days);
      const [progressRecords, articleRecords, quizzes, activeId] = await Promise.all([
        db.progressRecords.toArray(),
        db.articleRecords.toArray(),
        listQuizResultsByRange(from, now),
        getActiveVocabularyListId(),
      ]);
      const vocabItems = activeId ? await getVocabularyItems(activeId) : [];

      setReadingCounts(dailyReadingCounts(progressRecords, from, now, now));
      setPoints(scoreSeries(
        progressRecords.map((record) => {
          const article = articleRecords.find((a) => a.id === record.articleId);
          return { completedAt: record.completedAt, score: record.score, total: article?.questions.length ?? 5 };
        }),
        quizzes.map((q) => ({ completedAt: q.completedAt, correct: q.correct, total: q.total })),
        from, now, now,
      ));
      // 只统计窗口内完成阅读的文章
      const hitIdLists = articleRecords
        .filter((a) => {
          const record = progressRecords.find((p) => p.articleId === a.id);
          return record && record.completedAt >= from && record.completedAt <= now;
        })
        .map((a) => a.vocabHitIds);
      setCoverage(vocabCoverageRate(hitIdLists, vocabItems.map((item) => item.normalized)));
      setPhase('ready');
    } catch {
      setPhase('ready'); // 数据读取失败按空数据处理,不白屏
      setReadingCounts([]);
      setPoints([]);
      setCoverage(0);
    }
  }, []);

  useEffect(() => { void load(range); }, [range, reloadKey, load]);

  if (phase === 'loading') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-6">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const hasAnyData = readingCounts.some((c) => c.count > 0) || points.some((p) => p.reading !== null || p.quiz !== null);
  if (phase === 'ready' && !hasAnyData) {
    return (
      <EmptyState
        icon="📈"
        title="还没有阅读记录 — 读完第一篇，这里会出现你的第一条曲线。"
        description="每日阅读量、词汇复现率、得分趋势都会在这里积累。"
        action={<Link to="/"><Button>开始阅读</Button></Link>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-900">学习看板</h1>
        <div className="flex rounded-lg border border-ink-200 p-0.5 text-sm">
          {([7, 30] as RangeDays[]).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRange(days)}
              className={`rounded-md px-3 py-1 ${range === days ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
            >
              近 {days} 天
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-700">每日阅读量</h2>
          <span className="text-xs text-ink-400">完成篇数 · 北京时间</span>
        </div>
        <div className="mt-2 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={readingCounts}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={24} />
              <Tooltip formatter={(value) => [`${value} 篇`, '阅读']} />
              <Bar dataKey="count" name="阅读" fill="var(--color-brand-600, #4f46e5)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-700">词汇复现率</h2>
          <span className="text-xs text-ink-400">窗口内读过的文章中，词库词的覆盖比例</span>
        </div>
        <p className="mt-2 text-3xl font-bold text-brand-600">{coverage}%</p>
        <p className="text-xs text-ink-400">词库里的词有多少真的在文章里出现过</p>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-700">得分趋势</h2>
          <span className="text-xs text-ink-400">阅读得分% 与 测验正确率%（当日均分）</span>
        </div>
        <div className="mt-2 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={11} />
              <YAxis domain={[0, 100]} fontSize={11} width={28} unit="%" />
              <Tooltip />
              <Line type="monotone" dataKey="reading" name="阅读得分%" stroke="#4f46e5" dot={false} connectNulls />
              <Line type="monotone" dataKey="quiz" name="测验正确率%" stroke="#f59e0b" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
