import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock3, Star } from 'lucide-react';
import { listFavoriteArticles } from '@/lib/content';
import { saveArticle } from '@/lib/storage';
import { formatDateTime } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui';
import { useAuthStore } from '@/store/useAuthStore';
import type { Article } from '@/types/domain';

export function FavoritesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    void listFavoriteArticles().then(setItems).catch((cause) => {
      setError(cause instanceof Error ? cause.message : '无法读取收藏');
    }).finally(() => setLoading(false));
  }, [user?.id]);

  async function openArticle(article: Article) {
    await saveArticle(article);
    navigate(`/reading/${article.id}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-brand-700">Saved reading</p>
        <h1 className="font-display text-4xl font-medium text-ink-950">我的收藏</h1>
        <p className="mt-3 text-ink-500">把想再次阅读的文章留在这里。</p>
      </div>
      {loading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div> : error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : !items.length ? (
        <section className="rounded-lg border border-brand-100 bg-brand-50 px-6 py-16 text-center">
          <Star className="mx-auto text-brand-500" size={34} />
          <h2 className="mt-5 text-xl font-bold">还没有收藏文章</h2>
          <p className="mt-2 text-sm text-ink-500">阅读文章时点击星标即可收藏。</p>
          <button type="button" onClick={() => navigate('/')} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">去读文章<ArrowRight size={17} /></button>
        </section>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((article) => (
            <article key={article.id} className="group overflow-hidden rounded-lg border border-ink-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover">
              <div className="relative h-40 overflow-hidden bg-brand-50">
                {article.coverUrl ? <img src={article.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" /> : <div className="grid h-full place-items-center"><BookOpen size={34} className="text-brand-400" /></div>}
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-brand-700 backdrop-blur">{article.difficulty}</span>
              </div>
              <div className="p-5">
                <div className="mb-3 flex items-center gap-3 text-xs text-ink-400"><span className="inline-flex items-center gap-1"><Clock3 size={13} />{article.estimatedMinutes ?? 3} 分钟</span><span>{formatDateTime(article.createdAt)}</span></div>
                <h2 className="line-clamp-2 min-h-12 text-lg font-bold leading-6 text-ink-900">{article.title}</h2>
                <button type="button" onClick={() => void openArticle(article)} className="mt-5 flex w-full items-center justify-between border-t border-ink-100 pt-4 text-sm font-semibold text-brand-700">开始阅读<ArrowRight size={17} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
