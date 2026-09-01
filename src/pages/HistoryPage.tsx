import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckSquare, Clock3, Square, Trash2, X } from 'lucide-react';
import { deleteReadingRecords, getProgress, listAllArticles } from '@/lib/storage';
import { formatDateTime } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui';
import type { Article, UserProgress } from '@/types/domain';

interface HistoryItem {
  article: Article;
  progress: UserProgress | null;
}

const LONG_PRESS_MS = 650;

export function HistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const ignoreNextClick = useRef(false);

  async function load() {
    setLoading(true);
    const articles = await listAllArticles();
    setItems(await Promise.all(articles.map(async (article) => ({ article, progress: (await getProgress(article.id)) ?? null }))));
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => () => { if (longPressTimer.current != null) window.clearTimeout(longPressTimer.current); }, []);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openItem(id: string) {
    if (ignoreNextClick.current) {
      ignoreNextClick.current = false;
      return;
    }
    if (selectionMode) {
      toggleSelected(id);
      return;
    }
    navigate(`/reading/${id}`);
  }

  function cancelLongPress() {
    if (longPressTimer.current != null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  function startLongPress(id: string) {
    cancelLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      ignoreNextClick.current = true;
      setPendingDeleteIds([id]);
    }, LONG_PRESS_MS);
  }

  function requestDelete(ids: string[]) {
    cancelLongPress();
    setPendingDeleteIds(Array.from(new Set(ids)));
  }

  async function confirmDelete() {
    if (!pendingDeleteIds.length) return;
    setDeleting(true);
    try {
      await deleteReadingRecords(pendingDeleteIds);
      setSelectedIds((current) => {
        const next = new Set(current);
        pendingDeleteIds.forEach((id) => next.delete(id));
        return next;
      });
      setPendingDeleteIds([]);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-brand-700">Reading history</p>
          <h1 className="font-display text-4xl font-medium text-ink-950">阅读记录</h1>
          <p className="mt-3 text-ink-500">回到读过的文章，查看完成情况和答题结果。</p>
        </div>
        {!loading && items.length > 0 && !selectionMode && <button type="button" onClick={() => setSelectionMode(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:border-brand-200 hover:text-brand-700"><CheckSquare size={16} /> 管理记录</button>}
      </div>

      {selectionMode && <div className="mb-5 flex flex-wrap items-center gap-3 border-y border-ink-200 bg-white px-4 py-3"><span className="text-sm font-semibold text-ink-700">已选择 {selectedIds.size} 篇</span><button type="button" disabled={!selectedIds.size} onClick={() => requestDelete(Array.from(selectedIds))} className="inline-flex h-9 items-center gap-2 rounded-full bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={15} /> 删除所选</button><button type="button" onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-500 hover:bg-ink-100"><X size={15} /> 退出管理</button></div>}

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        <section className="rounded-lg border border-brand-100 bg-brand-50 px-6 py-16 text-center">
          <BookOpen className="mx-auto text-brand-500" size={34} />
          <h2 className="mt-5 text-xl font-bold">还没有阅读记录</h2>
          <p className="mt-2 text-sm text-ink-500">从今日推荐开始，完成你的第一篇阅读。</p>
          <button onClick={() => navigate('/')} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">去阅读 <ArrowRight size={17} /></button>
        </section>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ article, progress }) => {
            const selected = selectedIds.has(article.id);
            return <article key={article.id} role="button" tabIndex={0} aria-label={`打开文章：${article.title}`} onClick={() => openItem(article.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openItem(article.id); } }} onContextMenu={(event) => { event.preventDefault(); requestDelete([article.id]); }} onPointerDown={() => startLongPress(article.id)} onPointerUp={cancelLongPress} onPointerLeave={cancelLongPress} onPointerCancel={cancelLongPress} className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-white shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-brand-300 ${selected ? 'border-brand-400 ring-2 ring-brand-100' : 'border-ink-200'}`}>
              {selectionMode && <div className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-brand-700 shadow-sm">{selected ? <CheckSquare size={17} /> : <Square size={17} />}</div>}
              <div className="relative h-40 overflow-hidden bg-brand-50">
                {article.coverUrl ? (
                  <img src={article.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                ) : (
                  <div className="grid h-full place-items-center"><BookOpen size={34} className="text-brand-400" /></div>
                )}
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-brand-700 backdrop-blur">{article.difficulty}</span>
              </div>
              <div className="p-5">
                <div className="mb-3 flex items-center gap-3 text-xs text-ink-400">
                  <span className="inline-flex items-center gap-1"><Clock3 size={13} />{article.estimatedMinutes ?? 3} 分钟</span>
                  <span>{article.source === 'daily' ? '每日推荐' : '专属生成'}</span>
                </div>
                <h2 className="line-clamp-2 min-h-12 text-lg font-bold leading-6 text-ink-900">{article.title}</h2>
                <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
                  <span className={`text-xs font-semibold ${progress ? 'text-emerald-600' : 'text-ink-400'}`}>
                    {progress ? `得分 ${progress.score}/${article.questions.length}` : formatDateTime(article.createdAt)}
                  </span>
                  <ArrowRight size={17} className="text-ink-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </div>
              </div>
            </article>;
          })}
        </div>
      )}
      {pendingDeleteIds.length > 0 && <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 px-5" role="presentation" onMouseDown={() => !deleting && setPendingDeleteIds([])}><section role="dialog" aria-modal="true" aria-labelledby="history-delete-title" className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600"><Trash2 size={19} /></div><div><h2 id="history-delete-title" className="text-lg font-bold text-ink-950">删除阅读记录？</h2><p className="mt-2 text-sm leading-6 text-ink-500">将删除 {pendingDeleteIds.length} 篇文章的本地阅读记录、答题结果，并同步到当前账号。此操作不可撤销。</p></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={deleting} onClick={() => setPendingDeleteIds([])} className="inline-flex h-10 items-center rounded-full border border-ink-200 px-4 text-sm font-semibold text-ink-600">取消</button><button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="inline-flex h-10 items-center gap-2 rounded-full bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"><Trash2 size={15} />{deleting ? '正在删除...' : '确认删除'}</button></div></section></div>}
    </div>
  );
}
