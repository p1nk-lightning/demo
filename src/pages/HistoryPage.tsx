import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock3 } from 'lucide-react';
import { getProgress, listAllArticles } from '@/lib/storage';
import { formatDateTime } from '@/lib/utils';
import type { Article, UserProgress } from '@/types/domain';

interface HistoryItem {
  article: Article;
  progress: UserProgress | null;
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAllArticles().then(async (articles) => {
      setItems(await Promise.all(articles.map(async (article) => ({ article, progress: (await getProgress(article.id)) ?? null }))));
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-brand-700">Reading history</p>
        <h1 className="font-display text-4xl font-medium text-ink-950">阅读记录</h1>
        <p className="mt-3 text-ink-500">回到读过的文章，查看完成情况和答题结果。</p>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400">正在读取本地记录…</p>
      ) : items.length === 0 ? (
        <section className="rounded-lg border border-brand-100 bg-brand-50 px-6 py-16 text-center">
          <BookOpen className="mx-auto text-brand-500" size={34} />
          <h2 className="mt-5 text-xl font-bold">还没有阅读记录</h2>
          <p className="mt-2 text-sm text-ink-500">从今日推荐开始，完成你的第一篇阅读。</p>
          <button onClick={() => navigate('/')} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">去阅读 <ArrowRight size={17} /></button>
        </section>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ article, progress }) => (
            <article key={article.id} className="group overflow-hidden rounded-lg border border-ink-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover">
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
                  <button onClick={() => navigate(`/reading/${article.id}`)} title="查看文章" className="icon-button border-transparent bg-transparent"><ArrowRight size={17} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
