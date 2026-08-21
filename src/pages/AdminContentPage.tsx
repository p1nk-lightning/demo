import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, ExternalLink, FileText, RotateCcw, Send, Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/apiClient';
import type { Difficulty } from '@/types/domain';

type ReviewStatus = 'candidate' | 'approved' | 'published' | 'archived';
type AiReview = {
  verdict: 'pass' | 'needs_revision' | 'reject';
  score: number;
  summary: string;
  strengths: string[];
  issues: string[];
  factualChecks: string[];
  scores?: { englishQuality: number; levelFit: number; questionQuality: number; factualReliability: number; originality: number };
  questionChecks?: Array<{ index: number; answerSupported: boolean; evidenceFound: boolean; issue: string }>;
  copyrightRisk?: { level: 'low' | 'medium' | 'high'; reason: string };
  repairCount?: number;
  deterministicIssues?: string[];
};
type ReviewQuestion = { question: string; options: string[]; answer: number; questionZh?: string; optionsZh?: string[]; evidence?: string };
type ReviewArticle = {
  id: string;
  title: string;
  summary: string;
  content: string;
  difficulty: Difficulty;
  topic: string;
  wordCount: number;
  estimatedMinutes: number;
  questions: ReviewQuestion[];
  sourceTitle: string;
  sourceUrl: string;
  licenseNote: string;
  status: ReviewStatus;
  publishDate?: string;
  coverUrl?: string;
  aiReview?: AiReview;
  aiReviewedAt?: number;
  aiReviewModel?: string;
};

const statuses: Array<{ value: ReviewStatus; label: string }> = [
  { value: 'candidate', label: '候选文章' },
  { value: 'approved', label: '文章池' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
];

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function reviewPassed(review?: AiReview) {
  return Boolean(review
    && review.verdict === 'pass'
    && review.score >= 80
    && (review.deterministicIssues?.length ?? 0) === 0
    && review.copyrightRisk?.level !== 'high'
    && (review.questionChecks?.length ?? 0) > 0
    && review.questionChecks?.every((check) => check.answerSupported && check.evidenceFound));
}

export function AdminContentPage() {
  const [status, setStatus] = useState<ReviewStatus>('candidate');
  const [items, setItems] = useState<ReviewArticle[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [publishDate, setPublishDate] = useState(localDate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load(statusValue = status) {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<{ items: ReviewArticle[] }>(`/api/admin/content?status=${statusValue}`);
      setItems(data.items);
      setSelectedId((current) => data.items.some((item) => item.id === current) ? current : data.items[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取审核内容');
      setItems([]);
      setSelectedId('');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [status]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId]);

  async function review(action: 'approve' | 'publish' | 'archive' | 'candidate') {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/admin/content/${encodeURIComponent(selected.id)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, publishDate: action === 'publish' ? publishDate : undefined }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '审核操作失败');
    } finally {
      setSaving(false);
    }
  }

  async function aiReview() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest<{ review: AiReview }>(`/api/admin/content/${encodeURIComponent(selected.id)}/ai-review`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 审核失败');
    } finally {
      setSaving(false);
    }
  }

  async function aiReviewAll() {
    const pending = items.filter((item) => !item.aiReview);
    if (!pending.length) return;
    setSaving(true);
    setError('');
    try {
      for (const item of pending) {
        await apiRequest<{ review: AiReview }>(`/api/admin/content/${encodeURIComponent(item.id)}/ai-review`, { method: 'POST' });
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量 AI 审核未完成');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-brand-700">Content review</p>
        <h1 className="font-display text-4xl font-medium text-ink-950">文章审核</h1>
        <p className="mt-3 text-sm leading-6 text-ink-500">检查正文、题目和来源后，再决定是否发布到每日文章池。</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b border-ink-200 pb-3">
        {statuses.map((item) => (
          <button key={item.value} type="button" onClick={() => setStatus(item.value)} className={`rounded-full px-4 py-2 text-sm font-semibold ${status === item.value ? 'bg-brand-50 text-brand-700' : 'text-ink-400 hover:bg-ink-50 hover:text-ink-700'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {status === 'candidate' && items.some((item) => !item.aiReview) && <div className="mb-5"><button type="button" disabled={saving} onClick={() => void aiReviewAll()} className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"><Sparkles size={16} />{saving ? 'AI 正在预审候选文章...' : `AI 预审全部待审文章（${items.filter((item) => !item.aiReview).length} 篇）`}</button></div>}

      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? <div className="py-12 text-sm text-ink-400">正在读取文章...</div> : (
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {items.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-lg border p-4 text-left ${selectedId === item.id ? 'border-brand-200 bg-brand-50' : 'border-ink-200 bg-white hover:border-brand-200'}`}>
                <div className="flex items-start justify-between gap-3"><strong className="line-clamp-2 text-sm text-ink-900">{item.title}</strong><FileText size={16} className="shrink-0 text-brand-600" /></div>
                <div className="mt-3 flex gap-2 text-xs text-ink-400"><span>{item.difficulty}</span><span>·</span><span>{item.topic}</span></div>
              </button>
            ))}
            {!items.length && <div className="rounded-lg border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">当前状态没有文章</div>}
          </aside>

          {selected && (
            <article className="rounded-lg border border-ink-200 bg-white p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-4 border-b border-ink-200 pb-5 sm:flex-row sm:items-start">
                <div><div className="mb-2 flex flex-wrap gap-2 text-xs font-semibold text-ink-400"><span>{selected.difficulty}</span><span>{selected.topic}</span><span>{selected.wordCount} words</span><span>{selected.estimatedMinutes} min</span></div><h2 className="text-2xl font-bold text-ink-950">{selected.title}</h2><p className="mt-2 text-sm leading-6 text-ink-500">{selected.summary}</p></div>
                {selected.status === 'candidate' && <div className="flex shrink-0 flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => void aiReview()} title="让 AI 预审文章" className="inline-flex h-9 items-center gap-2 rounded-full border border-brand-200 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50"><Sparkles size={15} /> AI 预审</button><button type="button" disabled={saving} onClick={() => void review('archive')} title="归档文章" className="icon-button text-red-600 hover:border-red-200 hover:bg-red-50"><Archive size={17} /></button><button type="button" disabled={saving || !reviewPassed(selected.aiReview)} onClick={() => void review('approve')} title={reviewPassed(selected.aiReview) ? '确认加入文章池' : 'AI 审核通过后才能加入文章池'} className="inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><Check size={15} /> 加入文章池</button></div>}
                {selected.status === 'approved' && <div className="flex shrink-0 flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => void review('publish')} title="立即发布到所选日期的网页" className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700"><Send size={15} /> 发布到网页</button><button type="button" disabled={saving} onClick={() => void review('candidate')} title="退回候选" className="icon-button"><RotateCcw size={17} /></button></div>}
                {selected.status === 'published' && <button type="button" disabled={saving} onClick={() => void review('candidate')} title="退回候选" className="icon-button"><RotateCcw size={17} /></button>}
                {selected.status === 'archived' && <button type="button" disabled={saving} onClick={() => void review('candidate')} title="恢复候选" className="icon-button"><RotateCcw size={17} /></button>}
              </div>

              {selected.status === 'candidate' && <p className="mt-5 text-sm leading-6 text-ink-500">人工确认后先进入文章池；在“文章池”标签选择文章和日期后，可以立即发布，或等待定时轮换。</p>}
              {selected.status === 'approved' && <label className="mt-5 block max-w-xs"><span className="field-label">发布到网页的日期（同难度当天的旧文章会退回文章池）</span><input type="date" value={publishDate} onChange={(event) => setPublishDate(event.target.value)} className="field-control" /></label>}
              {selected.aiReview && <section className="mt-5 rounded-lg border border-brand-100 bg-brand-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-brand-900">AI 预审结果</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected.aiReview.verdict === 'pass' ? 'bg-emerald-100 text-emerald-700' : selected.aiReview.verdict === 'reject' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{selected.aiReview.verdict} · {selected.aiReview.score}/100</span></div>
                <p className="mt-2 text-sm leading-6 text-ink-700">{selected.aiReview.summary}</p>
                {selected.aiReview.scores && <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">{[
                  ['英文质量', selected.aiReview.scores.englishQuality],
                  ['难度匹配', selected.aiReview.scores.levelFit],
                  ['题目质量', selected.aiReview.scores.questionQuality],
                  ['事实可靠', selected.aiReview.scores.factualReliability],
                  ['原创程度', selected.aiReview.scores.originality],
                ].map(([label, value]) => <div key={label} className="rounded border border-brand-100 bg-white px-2 py-2 text-center"><span className="block text-ink-400">{label}</span><strong className="mt-1 block text-sm text-ink-800">{value}</strong></div>)}</div>}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-500"><span>自动返修：{selected.aiReview.repairCount ?? 0} 次</span>{selected.aiReview.copyrightRisk && <span>版权风险：{selected.aiReview.copyrightRisk.level}</span>}</div>
                {selected.aiReview.copyrightRisk && <p className="mt-2 text-xs leading-5 text-ink-500">版权判断：{selected.aiReview.copyrightRisk.reason}</p>}
                {selected.aiReview.deterministicIssues && selected.aiReview.deterministicIssues.length > 0 && <div className="mt-3 text-sm text-red-700"><strong>程序校验未通过：</strong>{selected.aiReview.deterministicIssues.join('；')}</div>}
                {selected.aiReview.issues.length > 0 && <div className="mt-3 text-sm text-red-700"><strong>需要人工注意：</strong>{selected.aiReview.issues.join('；')}</div>}
                {selected.aiReview.questionChecks && <div className="mt-3 text-xs leading-5 text-ink-600"><strong>逐题证据：</strong>{selected.aiReview.questionChecks.map((check) => `第 ${check.index} 题 ${check.answerSupported && check.evidenceFound ? '通过' : check.issue || '未通过'}`).join('；')}</div>}
                <div className="mt-3 text-xs leading-5 text-ink-500">事实核查：{selected.aiReview.factualChecks.join('；') || 'AI 未提出额外核查项'}</div>
              </section>}
              <div className="mt-6 whitespace-pre-wrap text-[15px] leading-8 text-ink-800">{selected.content}</div>

              <section className="mt-7 border-t border-ink-200 pt-5"><h3 className="text-sm font-bold text-ink-900">阅读题</h3><div className="mt-3 space-y-4">{selected.questions.map((question, index) => <div key={`${selected.id}-${index}`} className="rounded-lg bg-ink-50 p-4"><p className="font-medium text-ink-800">{index + 1}. {question.question}</p>{question.questionZh && <p className="mt-1 text-xs text-ink-400">{question.questionZh}</p>}<ol className="mt-2 grid gap-1 text-sm text-ink-500 sm:grid-cols-2">{question.options.map((option, optionIndex) => <li key={`${option}-${optionIndex}`}>{String.fromCharCode(65 + optionIndex)}. {option}{optionIndex === question.answer && <span className="ml-2 text-emerald-700">正确答案</span>}{question.optionsZh?.[optionIndex] && <span className="block text-xs text-ink-400">{question.optionsZh[optionIndex]}</span>}</li>)}</ol>{question.evidence && <p className="mt-3 border-l-2 border-brand-200 pl-3 text-xs leading-5 text-ink-500">证据：{question.evidence}</p>}</div>)}</div></section>

              <footer className="mt-7 border-t border-ink-200 pt-4 text-xs leading-6 text-ink-400"><p>来源：{selected.sourceTitle} <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 text-brand-700 hover:underline">查看来源 <ExternalLink size={12} /></a></p><p>{selected.licenseNote}</p></footer>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
