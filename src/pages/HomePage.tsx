import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { DifficultyPicker } from '@/components/DifficultyPicker';
import { generateArticle } from '@/lib/llm';
import {
  getCurrentVocab,
  listAllArticles,
  loadDifficultySetting,
  saveDifficultySetting,
} from '@/lib/storage';
import { debounce, sample } from '@/lib/utils';
import { Badge, Button, Card, CardSkeleton, EmptyState } from '@/components/ui';
import type { Difficulty } from '@/types/domain';

export function HomePage() {
  const navigate = useNavigate();
  const words = useAppStore((s) => s.words);
  const difficulty = useAppStore((s) => s.difficulty);
  const setWords = useAppStore((s) => s.setWords);
  const setDifficulty = useAppStore((s) => s.setDifficulty);
  const setCurrentArticle = useAppStore((s) => s.setCurrentArticle);
  const resetAnswers = useAppStore((s) => s.resetAnswers);
  const setLoading = useAppStore((s) => s.setLoading);
  const loading = useAppStore((s) => s.loading);
  const toast = useAppStore((s) => s.toast);

  const [articleCount, setArticleCount] = useState(0);

  useEffect(() => {
    (async () => {
      const saved = await getCurrentVocab();
      if (saved) setWords(saved);
      const d = loadDifficultySetting();
      if (d) setDifficulty(d);
      const arts = await listAllArticles();
      setArticleCount(arts.length);
    })();
  }, [setWords, setDifficulty]);

  function handleDifficulty(d: Difficulty) {
    setDifficulty(d);
    saveDifficultySetting(d);
  }

  const handleGenerate = useRef(
    debounce(async () => {
      if (words.length === 0) {
        toast('请先导入词表', 'error');
        navigate('/vocab');
        return;
      }
      setLoading(true);
      resetAnswers();
      try {
        const sampleWords = sample(
          words.map((w) => w.normalized),
          Math.min(50, words.length),
        );
        const article = await generateArticle({ difficulty, sampleWords });
        setCurrentArticle(article);
        navigate(`/reading/${article.id}`);
      } catch (err: any) {
        toast(err?.message || '生成失败，请稍后重试', 'error');
      } finally {
        setLoading(false);
      }
    }, 3000),
  ).current;

  const emptyVocab = words.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Hero 标题区（参考 LingVo：粗黑大标题 + 一行 subtitle） */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          词遇读 <span className="text-brand-600">·</span> 通过阅读巩固你的词表
        </h1>
        <p className="mt-2 text-base text-ink-500">
          基于你已背单词的英文阅读巩固训练 ·{' '}
          <span className="num text-ink-700">{words.length}</span> 个词 ·
          难度 <span className="text-ink-700">{difficulty}</span>
        </p>
      </header>

      {/* 3 张大卡：词表 / 生成 / 历史（LingVo 文章卡风格）+ 1 张难度小卡 */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* 词表卡 */}
        <Card hoverable className="flex flex-col">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              📚
            </span>
            词表
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-4xl font-bold text-ink-900 num">
              {words.length}
            </span>
            <span className="text-sm text-ink-500">词</span>
          </div>
          <div className="mt-auto pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/vocab')}
              trailing="›"
            >
              管理
            </Button>
          </div>
        </Card>

        {/* 生成阅读卡：LingVo 风格主 CTA */}
        <Card
          hoverable
          className="flex flex-col"
          style={{
            background:
              emptyVocab
                ? undefined
                : 'linear-gradient(135deg, #eef2ff 0%, #ffffff 100%)',
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              ✨
            </span>
            生成阅读
          </div>
          <div className="mt-3 text-sm text-ink-700">
            {loading ? (
              '正在生成…'
            ) : emptyVocab ? (
              '导入词表后开始'
            ) : (
              <>
                从词表中抽 <span className="font-semibold num">50</span>{' '}
                个词生成一篇
              </>
            )}
          </div>
          <div className="mt-auto pt-4">
            <Button
              variant="primary"
              size="md"
              onClick={handleGenerate}
              loading={loading}
              trailing="›"
            >
              {loading ? '生成中' : '开始生成'}
            </Button>
          </div>
        </Card>

        {/* 历史卡 */}
        <Card hoverable className="flex flex-col">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              📊
            </span>
            历史
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-4xl font-bold text-ink-900 num">
              {articleCount}
            </span>
            <span className="text-sm text-ink-500">篇</span>
          </div>
          <div className="mt-auto pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/history')}
              trailing="›"
            >
              查看
            </Button>
          </div>
        </Card>

        {/* 难度卡 */}
        <Card className="flex flex-col">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              ⚙️
            </span>
            难度
          </div>
          <div className="mt-3 text-2xl font-bold text-ink-900">
            {difficulty}
          </div>
          <div className="mt-auto pt-4">
            <DifficultyPicker value={difficulty} onChange={handleDifficulty} />
          </div>
        </Card>
      </div>

      {/* 空状态：词表为空时醒目提示（LingVo "你将学到什么" 风格淡蓝紫渐变） */}
      {emptyVocab && (
        <div
          className="mb-6 rounded-2xl border border-brand-100 p-6"
          style={{
            background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%)',
          }}
        >
          <EmptyState
            icon="📚"
            title="还没有词表"
            description="从 TXT 粘贴或 Excel 上传你的背单词清单，立即开始训练。"
            action={
              <Button onClick={() => navigate('/vocab')} trailing="›">
                立即导入
              </Button>
            }
          />
        </div>
      )}

      {/* 信息条 */}
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-ink-200 bg-paper p-4 text-sm text-ink-600"
      >
        ⓘ 词表已就绪（<span className="num">{words.length}</span> 词） ·
        难度：<span className="font-medium text-ink-700">{difficulty}</span> ·{' '}
        {articleCount > 0
          ? `最近文章 ${new Date().toLocaleDateString()}`
          : '尚未生成文章'}
      </div>

      {/* 加载骨架：4 张灰卡 */}
      {loading && (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}
    </div>
  );
}