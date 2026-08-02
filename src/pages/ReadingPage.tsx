import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArticleView } from '@/components/ArticleView';
import { QuestionCard } from '@/components/QuestionCard';
import { useAppStore, buildProgress, computeScore } from '@/store/useAppStore';
import { getArticle, getProgress, saveProgress } from '@/lib/storage';
import { Badge, Button, Card } from '@/components/ui';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import type { Article, UserProgress } from '@/types/domain';

const FONT_KEY = 'settings:fontSize';
const FONT_DEFAULT = 17;
const FONT_MIN = 14;
const FONT_MAX = 22;

export function ReadingPage() {
  const navigate = useNavigate();
  const { articleId } = useParams();
  const words = useAppStore((s) => s.words);
  const setCurrentArticle = useAppStore((s) => s.setCurrentArticle);
  const answers = useAppStore((s) => s.currentAnswers);
  const setAnswer = useAppStore((s) => s.setAnswer);
  const resetAnswers = useAppStore((s) => s.resetAnswers);
  const toast = useAppStore((s) => s.toast);

  const [article, setArticle] = useState<Article | null>(null);
  const [activeQ, setActiveQ] = useState(0);
  const [submitted, setSubmitted] = useState<UserProgress | null>(null);
  const [fontSize, setFontSize] = useState<number>(() => {
    const v = Number(localStorage.getItem(FONT_KEY));
    return Number.isFinite(v) && v >= FONT_MIN && v <= FONT_MAX ? v : FONT_DEFAULT;
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!articleId) return;
    (async () => {
      const a = await getArticle(articleId);
      if (!a) {
        toast('找不到该文章', 'error');
        navigate('/');
        return;
      }
      setArticle(a);
      setCurrentArticle(a);
      resetAnswers();
      const p = await getProgress(a.id);
      if (p) setSubmitted(p);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const score = useMemo(() => {
    if (!article) return 0;
    return computeScore(answers, article.questions);
  }, [answers, article]);

  const allAnswered = article
    ? article.questions.every((_, index) => answers[index] != null)
    : false;

  function changeFontSize(delta: number) {
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta));
    setFontSize(next);
    try {
      localStorage.setItem(FONT_KEY, String(next));
    } catch {}
  }

  if (!article) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12 text-center text-ink-500">
        加载文章中…
      </div>
    );
  }

  async function handleSubmit() {
    if (!article) return;
    if (!allAnswered) {
      toast('请回答完所有题目再提交', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const submittedAnswers = answers.slice(0, article.questions.length);
      const s = computeScore(submittedAnswers, article.questions);
      const p = buildProgress(article.id, submittedAnswers, s);
      await saveProgress(p);
      setSubmitted(p);
      if (s === article.questions.length) {
        toast(`满分 ${article.questions.length}/${article.questions.length}`, 'success');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8 lg:py-8">
      <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <button
          onClick={() => navigate('/')}
          title="返回首页"
          className="icon-button"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 text-center text-sm text-ink-700">
          <Badge variant="brand">{article.difficulty}</Badge>
          <span className="ml-2 truncate text-ink-900">{article.title}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => changeFontSize(-1)}
            className="icon-button h-8 w-8"
            aria-label="缩小字号"
          >
            <Minus size={15} />
          </button>
          <span className="num text-xs text-ink-500">{fontSize}px</span>
          <button
            onClick={() => changeFontSize(1)}
            className="icon-button h-8 w-8"
            aria-label="放大字号"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <Card className="p-6">
          <ArticleView article={article} words={words} />
        </Card>

        <div className="space-y-4">
          {!submitted ? (
            <>
              <QuestionCard
                question={article.questions[activeQ]}
                index={activeQ}
                total={article.questions.length}
                selected={answers[activeQ]}
                onSelect={(v) => setAnswer(activeQ, v)}
                onPrev={() => setActiveQ((i) => Math.max(0, i - 1))}
                onNext={() =>
                  setActiveQ((i) => Math.min(article.questions.length - 1, i + 1))
                }
              />
              <Card variant="outlined" className="p-4 text-sm">
                <div className="mb-2 text-ink-500">
                  ✓ 已答{' '}
                  <span className="num text-ink-900">
                    {answers.filter((a) => a != null).length}
                  </span>{' '}
                  /{' '}
                  <span className="num text-ink-900">
                    {article.questions.length}
                  </span>
                </div>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleSubmit}
                  disabled={!allAnswered}
                  loading={submitting}
                  trailing="›"
                >
                  ✓ 提交答卷
                </Button>
              </Card>
              <p className="px-2 text-xs leading-5 text-ink-400">点击阅读区任意单词查看释义；绿色为已掌握，蓝色为生词。</p>
            </>
          ) : (
            <ResultPanel
              submitted={submitted}
              article={article}
              onRetake={() => {
                resetAnswers();
                setSubmitted(null);
                setActiveQ(0);
              }}
            />
          )}
        </div>
      </div>

      <style>{`.article-prose { font-size: ${fontSize}px; }`}</style>
    </div>
  );
}

function ResultPanel({
  submitted,
  article,
  onRetake,
}: {
  submitted: UserProgress;
  article: Article;
  onRetake: () => void;
}) {
  const fullScore = submitted.score === article.questions.length;
  return (
    <div className="space-y-4">
      <Card
        variant="outlined"
        className={
          'p-5 ' +
          (fullScore
            ? 'border-accent-500 bg-accent-50'
            : 'border-warning-500 bg-warning-50')
        }
      >
        <div
          className={
            'text-2xl font-bold num ' +
            (fullScore ? 'text-accent-700' : 'text-warning-700')
          }
        >
          ✓ 评分 {submitted.score} / {article.questions.length}
        </div>
        <div className="mt-1 text-sm text-ink-700">
          词表词复现 <span className="num">{article.vocabHitIds.length}</span> 个
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={onRetake}>
            再做一次
          </Button>
          <Link to="/">
            <Button variant="secondary" size="sm">
              ← 返回首页
            </Button>
          </Link>
        </div>
      </Card>
      <div className="space-y-2">
        {article.questions.map((q, i) => {
          const user = submitted.answers[i];
          const correct = user === q.answer;
          return (
            <Card
              key={i}
              variant="outlined"
              className={
                'p-3 text-sm ' +
                (correct
                  ? 'border-accent-200 bg-accent-50/40'
                  : 'border-danger-200 bg-danger-50/40')
              }
            >
              <div className="mb-1 font-medium text-ink-700">
                Q{i + 1} {correct ? '✓' : '✗'} · 正确{' '}
                {String.fromCharCode(65 + q.answer)}
                {user != null && (
                  <span className="ml-2 text-xs text-ink-500">
                    你选 {String.fromCharCode(65 + user)}
                  </span>
                )}
              </div>
              <div className="text-ink-600">{q.question}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
