import { get, set, del, keys } from 'idb-keyval';
import type {
  Article,
  Difficulty,
  UserProgress,
  VocabularyList,
  Word,
} from '@/types/domain';

// 存储键约定完全对齐 Prd.md §5
// - vocab:current                 → 当前激活词表 (Word[], 仅存归一化数组, 节省空间)
// - vocab:list:{id}               → 历史词表快照
// - article:{id}                  → 已生成的阅读文章
// - progress:{articleId}          → 答题记录
// - settings:difficulty           → 上次选择的难度 (localStorage)
const KEY_CURRENT_VOCAB = 'vocab:current';
const KEY_VOCAB_LIST = (id: string) => `vocab:list:${id}`;
const KEY_ARTICLE = (id: string) => `article:${id}`;
const KEY_PROGRESS = (articleId: string) => `progress:${articleId}`;
const LS_DIFFICULTY = 'settings:difficulty';

// ---- 词表 ----

export async function saveCurrentVocab(words: Word[], difficulty: Difficulty) {
  const list: VocabularyList = {
    id: crypto.randomUUID(),
    difficulty,
    words,
    createdAt: Date.now(),
  };
  await set(KEY_VOCAB_LIST(list.id), list);
  await set(KEY_CURRENT_VOCAB, words); // 仅存 Words 用于快速启动
  return list;
}

export async function getCurrentVocab(): Promise<Word[] | undefined> {
  return (await get<Word[]>(KEY_CURRENT_VOCAB)) ?? undefined;
}

export async function listAllVocabs(): Promise<VocabularyList[]> {
  const allKeys = (await keys()) as string[];
  const idbKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith('vocab:list:'));
  const lists: VocabularyList[] = [];
  for (const k of idbKeys) {
    const v = await get<VocabularyList>(k);
    if (v) lists.push(v);
  }
  return lists.sort((a, b) => b.createdAt - a.createdAt);
}

export async function clearCurrentVocab() {
  await del(KEY_CURRENT_VOCAB);
}

// ---- 文章 ----

export async function saveArticle(article: Article) {
  await set(KEY_ARTICLE(article.id), article);
}

export async function getArticle(id: string): Promise<Article | undefined> {
  return (await get<Article>(KEY_ARTICLE(id))) ?? undefined;
}

export async function listAllArticles(): Promise<Article[]> {
  const allKeys = (await keys()) as string[];
  const idbKeys = allKeys.filter(
    (k) => typeof k === 'string' && (k as string).startsWith('article:'),
  );
  const arts: Article[] = [];
  for (const k of idbKeys) {
    const v = await get<Article>(k);
    if (v) arts.push(v);
  }
  return arts.sort((a, b) => b.createdAt - a.createdAt);
}

// ---- 进度 ----

export async function saveProgress(progress: UserProgress) {
  await set(KEY_PROGRESS(progress.articleId), progress);
}

export async function getProgress(articleId: string): Promise<UserProgress | undefined> {
  return (await get<UserProgress>(KEY_PROGRESS(articleId))) ?? undefined;
}

// ---- 设置 (localStorage) ----

export function loadDifficultySetting(): Difficulty | undefined {
  const v = localStorage.getItem(LS_DIFFICULTY);
  if (
    v === 'CET4' ||
    v === 'CET6' ||
    v === '考研' ||
    v === '雅思' ||
    v === '托福'
  ) {
    return v;
  }
  return undefined;
}

export function saveDifficultySetting(d: Difficulty) {
  localStorage.setItem(LS_DIFFICULTY, d);
}
