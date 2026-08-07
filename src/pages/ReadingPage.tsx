import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Minus, Plus, Star, Trash2 } from 'lucide-react';
import { ArticleView } from '@/components/ArticleView';
import { QuestionCard } from '@/components/QuestionCard';
import { useAppStore, buildProgress, computeScore } from '@/store/useAppStore';
import { deleteReadingRecords, getArticle, getProgress, saveProgress } from '@/lib/storage';
import { Badge, Button, Card } from '@/components/ui';
import { setArticleFavorite } from '@/lib/content';
import { useAuthStore } from '@/store/useAuthStore';
import type { Article, UserProgress } from '@/types/domain';

const FONT_KEY = 'settings:fontSize';
const FONT_DEFAULT = 17;
const FONT_MIN = 14;
const FONT_MAX = 22;

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange} className="inline-flex h-8 items-center gap-2 text-xs font-semibold text-ink-600">
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-ink-900' : 'bg-ink-200'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} /></span>
      {label}
    </button>
  );
}

export function ReadingPage() {
  const navigate = useNavigate();
  const { articleId } = useParams();
  const words = useAppStore((s) => s.words);
  const setCurrentArticle = useAppStore((s) => s.setCurrentArticle);
  const answers = useAppStore((s) => s.currentAnswers);
  const setAnswer = useAppStore((s) => s.setAnswer);
  const resetAnswers = useAppStore((s) => s.resetAnswers);
  const toast = useAppStore((s) => s.toast);
  const user = useAuthStore((s) => s.user);
  const [article, setArticle] = useState<Article | null>(null);
  const [activeQ, setActiveQ] = useState(0);
  const [submitted, setSubmitted] = useState<UserProgress | null>(null);
  const [fontSize, setFontSize] = useState(() => {
    const value = Number(localStorage.getItem(FONT_KEY));
    return Number.isFinite(value) && value >= FONT_MIN && value <= FONT_MAX ? value : FONT_DEFAULT;
  });
  const [showKnown, setShowKnown] = useState(true);
  const [showNew, setShowNew] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState(false);

  useEffect(() => {
    if (!articleId) return;
    void (async () => {
      const loaded = await getArticle(articleId);
      if (!loaded) {
        toast('找不到这篇文章', 'error');
        navigate('/');
        return;
      }
      setArticle(loaded);
      setFavorite(Boolean(loaded.isFavorite));
      setCurrentArticle(loaded);
      resetAnswers();
      const progress = await getProgress(loaded.id);
      if (progress) setSubmitted(progress);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const score = useMemo(() => article ? computeScore(answers, article.questions) : 0, [answers, article]);
  const allAnswered = Boolean(article && article.questions.every((_, index) => answers[index] != null));
  const wordCount = article?.wordCount ?? article?.article.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const readMinutes = article?.estimatedMinutes ?? Math.max(1, Math.ceil(wordCount / 150));
  const displayDate = article?.publishDate || (article ? new Date(article.createdAt).toLocaleDateString('zh-CN') : '');

  function changeFontSize(delta: number) {
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta));
    setFontSize(next);
    localStorage.setItem(FONT_KEY, String(next));
  }

  async function toggleFavorite() {
    if (!user) {
      toast('请先登录后再收藏文章', 'info');
      navigate('/login');
      return;
    }
    if (!article?.contentId) {
      toast('本地示例文章暂不支持云端收藏', 'info');
      return;
    }
    const next = !favorite;
    setFavoriteSaving(true);
    try {
      await setArticleFavorite(article.contentId, next);
      setFavorite(next);
      toast(next ? '已加入收藏' : '已取消收藏', 'success');
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '收藏操作失败', 'error');
    } finally {
      setFavoriteSaving(false);
    }
  }

  async function deleteRecord() {
    if (!article) return;
    setDeletingRecord(true);
    try {
      await deleteReadingRecords([article.id]);
      toast('阅读记录已删除', 'success');
      navigate('/history');
    } finally {
      setDeletingRecord(false);
    }
  }

  async function handleSubmit() {
    if (!article || !allAnswered) return;
    setSubmitting(true);
    try {
      const progress = buildProgress(article.id, answers.slice(0, article.questions.length), score);
      await saveProgress(progress);
      setSubmitted(progress);
      if (score === article.questions.length) toast(`满分 ${score}/${article.questions.length}`, 'success');
    } finally {
      setSubmitting(false);
    }
  }

  if (!article) return <div className="mx-auto max-w-4xl px-6 py-12 text-center text-ink-500">加载文章中...</div>;

  return (
    <main className="mx-auto max-w-6xl px-5 py-7 lg:px-8 lg:py-10">
      <button onClick={() => navigate('/')} title="返回首页" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-ink-900"><ArrowLeft size={17} />返回首页</button>
      <header className="max-w-5xl border-b border-ink-200 pb-6">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="brand">{article.difficulty}</Badge>{article.topic && <Badge>{article.topic}</Badge>}{article.sourceTitle && <Badge>{article.sourceTitle}</Badge>}<span className="text-xs text-ink-400">{wordCount} 词</span><span className="text-xs text-ink-400">约 {readMinutes} 分钟</span><span className="text-xs text-ink-400">{displayDate}</span><button type="button" onClick={() => void toggleFavorite()} disabled={favoriteSaving} title={favorite ? '取消收藏' : '收藏文章'} aria-label={favorite ? '取消收藏' : '收藏文章'} className={`icon-button h-8 w-8 ${favorite ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-ink-200 bg-white text-ink-500 hover:border-amber-300 hover:text-amber-600'}`}><Star size={16} fill={favorite ? 'currentColor' : 'none'} /></button><button type="button" onClick={() => setDeleteDialogOpen(true)} title="删除阅读记录" aria-label="删除阅读记录" className="icon-button h-8 w-8 border-ink-200 bg-white text-ink-400 hover:border-red-200 hover:text-red-600"><Trash2 size={16} /></button></div>
        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink-950 sm:text-4xl">{article.title}</h1>
        {article.summary && <p className="mt-3 max-w-4xl text-base leading-7 text-ink-600">{article.summary}</p>}
      </header>

      <section aria-label="阅读工具" className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-ink-200 py-4">
        <Toggle checked={showNew} label="标记生词" onChange={() => setShowNew((value) => !value)} />
        <Toggle checked={showKnown} label="标记熟词" onChange={() => setShowKnown((value) => !value)} />
        <span className="hidden h-5 w-px bg-ink-200 sm:block" />
        <button onClick={() => changeFontSize(-1)} title="缩小字号" className="icon-button h-8 w-8"><Minus size={15} /></button><span className="num text-xs text-ink-500">{fontSize}px</span><button onClick={() => changeFontSize(1)} title="放大字号" className="icon-button h-8 w-8"><Plus size={15} /></button>
        {article.sourceUrl && <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900">查看来源 <ExternalLink size={14} /></a>}
      </section>

      <article className="mt-6 border border-ink-200 bg-white px-6 py-7 shadow-card sm:px-10 sm:py-10">
        <ArticleView article={article} words={words} highlightKnown={showKnown} highlightNew={showNew} />
      </article>

      <section className="mx-auto mt-8 max-w-3xl">
        {!submitted ? <><QuestionCard question={article.questions[activeQ]} index={activeQ} total={article.questions.length} selected={answers[activeQ]} onSelect={(value) => setAnswer(activeQ, value)} onPrev={() => setActiveQ((index) => Math.max(0, index - 1))} onNext={() => setActiveQ((index) => Math.min(article.questions.length - 1, index + 1))} />
          <div className="mt-4 flex flex-col gap-3 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-ink-500">已答 <span className="num font-semibold text-ink-900">{answers.filter((answer) => answer != null).length}</span> / {article.questions.length}</p><Button variant="primary" onClick={handleSubmit} disabled={!allAnswered} loading={submitting}>提交答卷</Button></div></> : <ResultPanel submitted={submitted} article={article} onRetake={() => { resetAnswers(); setSubmitted(null); setActiveQ(0); }} />}
      </section>
      <p className="mt-6 text-center text-xs text-ink-400">点击正文中的任意单词查看释义。绿色表示已掌握词，蓝色表示生词。</p>
      <style>{`.article-prose { font-size: ${fontSize}px; }`}</style>
      {deleteDialogOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 px-5" role="presentation" onMouseDown={() => !deletingRecord && setDeleteDialogOpen(false)}><section role="dialog" aria-modal="true" aria-labelledby="reading-delete-title" className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600"><Trash2 size={19} /></div><div><h2 id="reading-delete-title" className="text-lg font-bold text-ink-950">删除这条阅读记录？</h2><p className="mt-2 text-sm leading-6 text-ink-500">文章、答题结果和本地记录会从当前账号中删除，并在同步时更新云端。</p></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={deletingRecord} onClick={() => setDeleteDialogOpen(false)} className="inline-flex h-10 items-center rounded-full border border-ink-200 px-4 text-sm font-semibold text-ink-600">取消</button><button type="button" disabled={deletingRecord} onClick={() => void deleteRecord()} className="inline-flex h-10 items-center gap-2 rounded-full bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"><Trash2 size={15} />{deletingRecord ? '正在删除...' : '确认删除'}</button></div></section></div>}
    </main>
  );
}

function ResultPanel({ submitted, article, onRetake }: { submitted: UserProgress; article: Article; onRetake: () => void }) {
  const fullScore = submitted.score === article.questions.length;
  return <div className="space-y-4"><Card variant="outlined" className={fullScore ? 'border-accent-500 bg-accent-50 p-5' : 'border-warning-500 bg-warning-50 p-5'}><div className={`text-2xl font-bold num ${fullScore ? 'text-accent-700' : 'text-warning-700'}`}>评分 {submitted.score} / {article.questions.length}</div><div className="mt-3 flex gap-2"><Button variant="secondary" size="sm" onClick={onRetake}>再做一次</Button><Link to="/"><Button variant="secondary" size="sm">返回首页</Button></Link></div></Card>{article.questions.map((question, index) => { const chosen = submitted.answers[index]; const correct = chosen === question.answer; return <Card key={question.question} variant="outlined" className={`p-3 text-sm ${correct ? 'border-accent-200 bg-accent-50/40' : 'border-danger-200 bg-danger-50/40'}`}><div className="font-medium text-ink-700">Q{index + 1} {correct ? '正确' : '正确答案'}: {String.fromCharCode(65 + question.answer)}</div><div className="mt-1 text-ink-600">{question.question}</div></Card>; })}</div>;
}
