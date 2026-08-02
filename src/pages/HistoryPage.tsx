import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllArticles, getProgress } from '@/lib/storage';
import { formatDateTime } from '@/lib/utils';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import type { Article, UserProgress } from '@/types/domain';

interface Row {
  article: Article;
  progress: UserProgress | null;
}

export function HistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const arts = await listAllArticles();
      const withProgress: Row[] = await Promise.all(
        arts.map(async (a) => ({
          article: a,
          progress: (await getProgress(a.id)) ?? null,
        })),
      );
      setRows(withProgress);
      setLoaded(true);
    })();
  }, []);

  function scoreVariant(score: number) {
    if (score === 5) return 'success' as const;
    if (score >= 3) return 'brand' as const;
    return 'danger' as const;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">📊 历史记录</h1>
        <Link to="/" className="text-sm text-brand-600 hover:underline">
          ← 返回首页
        </Link>
      </div>

      {!loaded ? (
        <Card variant="outlined" className="text-center text-ink-500">
          加载中…
        </Card>
      ) : rows.length === 0 ? (
        <Card variant="outlined">
          <EmptyState
            icon="📝"
            title="暂无历史记录"
            description="去首页生成你的第一篇阅读吧。"
            action={
              <Link to="/">
                <Button>去生成</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <Card variant="outlined" className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-600">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">标题</th>
                <th className="px-4 py-2 text-left">难度</th>
                <th className="px-4 py-2 text-left">得分</th>
                <th className="px-4 py-2 text-left">完成时间</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.article.id}
                  className="border-t border-ink-200 hover:bg-ink-50"
                >
                  <td className="px-4 py-3 text-ink-400 num">
                    {rows.length - i}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {r.article.title}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="brand" size="sm">
                      {r.article.difficulty}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {r.progress ? (
                      <Badge variant={scoreVariant(r.progress.score)}>
                        <span className="num">
                          {r.progress.score} / 5
                        </span>
                      </Badge>
                    ) : (
                      <span className="text-ink-400">未完成</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {r.progress
                      ? formatDateTime(r.progress.completedAt)
                      : formatDateTime(r.article.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/reading/${r.article.id}`}>
                      <Button variant="ghost" size="sm" trailing="›">
                        查看
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
