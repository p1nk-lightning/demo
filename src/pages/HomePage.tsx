import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Clock3,
  LibraryBig,
  Sparkles,
} from 'lucide-react';
import { DAILY_ARTICLES } from '@/lib/dailyArticles';
import {
  getVocabularyItems,
  getSelectedModelProvider,
  listVocabularyLists,
  setSelectedModelProvider,
  setActiveVocabularyListId,
} from '@/lib/db';
import { saveArticle } from '@/lib/storage';
import { generateArticle } from '@/lib/llm';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import type {
  ArticleTopic,
  Difficulty,
  ModelProvider,
  VocabularyList,
} from '@/types/domain';

const LEVELS: { value: Difficulty; label: string }[] = [
  { value: 'CET4', label: 'CET-4' },
  { value: 'CET6', label: 'CET-6' },
  { value: '考研', label: '考研' },
  { value: '雅思', label: '雅思' },
  { value: '托福', label: '托福' },
];
const LENGTHS = [100, 300, 500, 700, 1000];
const TOPICS: ArticleTopic[] = ['随机', '科技', '文化', '教育', '生活', '商业', '自然'];

export function HomePage() {
  const navigate = useNavigate();
  const toast = useAppStore((state) => state.toast);
  const setCurrentArticle = useAppStore((state) => state.setCurrentArticle);
  const setWords = useAppStore((state) => state.setWords);
  const resetAnswers = useAppStore((state) => state.resetAnswers);
  const user = useAuthStore((state) => state.user);
  const [level, setLevel] = useState<Difficulty>('CET4');
  const [lists, setLists] = useState<VocabularyList[]>([]);
  const [listId, setListId] = useState('');
  const [wordCount, setWordCount] = useState(300);
  const [topic, setTopic] = useState<ArticleTopic>('随机');
  const [generating, setGenerating] = useState(false);
  const [provider, setProvider] = useState<ModelProvider>('deepseek');

  useEffect(() => {
    listVocabularyLists().then((items) => {
      setLists(items);
      if (items[0]) setListId(items[0].id);
    });
  }, [user?.id]);

  useEffect(() => {
    void getSelectedModelProvider().then(setProvider);
  }, [user?.id]);

  const daily = useMemo(
    () => DAILY_ARTICLES.find((article) => article.difficulty === level)!,
    [level],
  );

  async function openDaily() {
    await saveArticle(daily);
    setCurrentArticle(daily);
    resetAnswers();
    navigate(`/reading/${daily.id}`);
  }

  async function handleGenerate() {
    if (!user) {
      toast('请先登录后再生成文章', 'error');
      navigate('/login');
      return;
    }
    if (!user.emailVerified) {
      toast('请先验证邮箱后再生成文章', 'error');
      navigate('/verify-email');
      return;
    }
    if (!listId) {
      toast('请先创建一个单词表', 'error');
      navigate('/library/import');
      return;
    }
    const items = await getVocabularyItems(listId);
    if (!items.length) {
      toast('这个单词表还是空的', 'error');
      return;
    }
    setGenerating(true);
    setWords(items);
    setActiveVocabularyListId(listId);
    resetAnswers();
    try {
      const sampleWords = items
        .filter((word) => !word.mastered)
        .slice(0, 50)
        .map((word) => word.normalized);
      const questionCount = wordCount < 400 ? 3 : 5;
      const article = await generateArticle({
        provider,
        difficulty: level,
        sampleWords: sampleWords.length ? sampleWords : items.slice(0, 50).map((word) => word.normalized),
        wordCount,
        topic,
        questionCount,
      });
      setCurrentArticle(article);
      navigate(`/reading/${article.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : '生成失败，请检查 API 设置', 'error');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <section className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <p className="mb-3 text-sm font-semibold text-brand-700">今日阅读计划</p>
          <h1 className="max-w-3xl font-display text-4xl font-medium leading-[1.08] text-ink-950 sm:text-5xl">
            在真实语境里，<br className="hidden sm:block" />让单词真正留下来。
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-ink-500">
            每天读一篇适合你的英文文章，或用自己的单词表生成专属内容。
          </p>
        </div>
        <button
          onClick={() => navigate('/library/import')}
          className="group inline-flex h-12 items-center justify-center gap-3 self-start rounded-full border border-ink-900 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-900 hover:text-white lg:self-auto"
        >
          导入新单词表
          <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
        </button>
      </section>

      <section aria-labelledby="daily-title" className="mb-12">
        <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 id="daily-title" className="text-xl font-bold text-ink-900">每日推荐</h2>
            <p className="mt-1 text-sm text-ink-500">每天按你的目标难度更新一篇</p>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-ink-100 p-1">
            {LEVELS.map((item) => (
              <button
                key={item.value}
                onClick={() => setLevel(item.value)}
                className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
                  level === item.value
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-ink-500 hover:text-ink-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <article className="grid overflow-hidden rounded-lg border border-ink-200 bg-white shadow-card lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative h-48 overflow-hidden sm:h-64 lg:h-auto lg:min-h-[390px]">
            <img
              src={daily.coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-[1.025]"
            />
            <span className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-brand-700 backdrop-blur">
              今日 · {level}
            </span>
          </div>
          <div className="flex flex-col justify-between p-6 sm:p-8 lg:p-10">
            <div>
              <div className="mb-5 flex items-center gap-4 text-xs font-medium text-ink-400">
                <span className="inline-flex items-center gap-1.5"><Clock3 size={14} />{daily.estimatedMinutes} 分钟</span>
                <span>{daily.wordCount} 词</span>
                <span>{daily.topic}</span>
              </div>
              <h3 className="font-display text-3xl font-medium leading-tight text-ink-950">
                {daily.title}
              </h3>
              <p className="mt-4 leading-7 text-ink-500">{daily.summary}</p>
            </div>
            <button
              onClick={openDaily}
              className="group mt-8 inline-flex h-12 items-center justify-between rounded-full bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              开始今日阅读
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-white text-brand-700 shadow-sm">
                <Sparkles size={20} />
              </div>
              <h2 className="text-xl font-bold">用我的单词生成文章</h2>
              <p className="mt-1 text-sm text-ink-500">选择单词表、长度和主题，创建专属阅读。</p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="field-label">单词表</span>
              <select value={listId} onChange={(event) => setListId(event.target.value)} className="field-control">
                <option value="">选择一个单词表</option>
                {lists.map((list) => <option key={list.id} value={list.id}>{list.name} · {list.wordCount} 词</option>)}
              </select>
            </label>
            <div>
              <span className="field-label">文章长度</span>
              <div className="flex flex-wrap gap-2">
                {LENGTHS.map((length) => (
                  <button
                    key={length}
                    onClick={() => setWordCount(length)}
                    className={`h-9 rounded-full px-3 text-sm font-semibold ${wordCount === length ? 'bg-brand-600 text-white' : 'bg-white text-ink-500 hover:text-brand-700'}`}
                  >
                    {length}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="field-label">文章主题</span>
              <select value={topic} onChange={(event) => setTopic(event.target.value as ArticleTopic)} className="field-control">
                {TOPICS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">生成模型</span>
              <select
                value={provider}
                onChange={(event) => {
                  const value = event.target.value as ModelProvider;
                  setProvider(value);
                  void setSelectedModelProvider(value);
                }}
                className="field-control"
              >
                <option value="deepseek">DeepSeek</option>
                <option value="qwen">千问</option>
                <option value="doubao">豆包</option>
              </select>
            </label>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="group mt-6 inline-flex h-12 min-w-40 items-center justify-center gap-3 rounded-full bg-ink-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? '正在生成…' : '生成专属文章'}
            {!generating && <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <button onClick={() => navigate('/library')} className="group flex items-center justify-between rounded-lg border border-ink-200 bg-white p-6 text-left transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover">
            <span className="flex items-center gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-ink-100 text-ink-700"><LibraryBig size={21} /></span>
              <span><strong className="block">我的单词表</strong><span className="mt-1 block text-sm text-ink-400">{lists.length} 个单词表</span></span>
            </span>
            <ArrowRight size={18} className="text-ink-300 transition-transform group-hover:translate-x-1 group-hover:text-brand-600" />
          </button>
          <button onClick={() => navigate('/history')} className="group flex items-center justify-between rounded-lg border border-ink-200 bg-white p-6 text-left transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover">
            <span className="flex items-center gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-ink-100 text-ink-700"><BookOpen size={21} /></span>
              <span><strong className="block">阅读记录</strong><span className="mt-1 block text-sm text-ink-400">回顾文章与答题结果</span></span>
            </span>
            <ArrowRight size={18} className="text-ink-300 transition-transform group-hover:translate-x-1 group-hover:text-brand-600" />
          </button>
        </div>
      </section>
    </div>
  );
}
