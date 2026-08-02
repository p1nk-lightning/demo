import { get, set, del } from 'idb-keyval';
import type {
  Article,
  Difficulty,
  UserProgress,
  VocabularyList,
  Word,
} from '@/types/domain';
import {
  createVocabularyList,
  db,
  listVocabularyLists,
} from '@/lib/db';

// 存储键约定完全对齐 Prd.md §5
// - vocab:current                 → 当前激活词表 (Word[], 仅存归一化数组, 节省空间)
// - vocab:list:{id}               → 历史词表快照
// - article:{id}                  → 已生成的阅读文章
// - progress:{articleId}          → 答题记录
// - settings:difficulty           → 上次选择的难度 (localStorage)
const KEY_CURRENT_VOCAB = 'vocab:current';
const LS_DIFFICULTY = 'settings:difficulty';

// ---- 词表 ----

export async function saveCurrentVocab(words: Word[], difficulty: Difficulty) {
  const list = await createVocabularyList('导入单词表', difficulty, words);
  await set(KEY_CURRENT_VOCAB, words); // 仅存 Words 用于快速启动
  return list;
}

export async function getCurrentVocab(): Promise<Word[] | undefined> {
  return (await get<Word[]>(KEY_CURRENT_VOCAB)) ?? undefined;
}

export async function listAllVocabs(): Promise<VocabularyList[]> {
  return listVocabularyLists();
}

export async function clearCurrentVocab() {
  await del(KEY_CURRENT_VOCAB);
}

// ---- 文章 ----

export async function saveArticle(article: Article) {
  await db.articles.put(article);
}

export async function getArticle(id: string): Promise<Article | undefined> {
  return (await db.articles.get(id)) ?? undefined;
}

export async function listAllArticles(): Promise<Article[]> {
  return db.articles.orderBy('createdAt').reverse().toArray();
}

// ---- 进度 ----

export async function saveProgress(progress: UserProgress) {
  await db.progress.put(progress);
}

export async function getProgress(articleId: string): Promise<UserProgress | undefined> {
  return (await db.progress.get(articleId)) ?? undefined;
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
