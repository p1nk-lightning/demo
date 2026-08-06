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
import { getLocalOwnerId, isOwnedBy, scopedKey } from '@/lib/localScope';
import { scheduleSync } from '@/lib/syncScheduler';

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
  await set(scopedKey(KEY_CURRENT_VOCAB), words); // 仅存 Words 用于快速启动
  return list;
}

export async function getCurrentVocab(): Promise<Word[] | undefined> {
  const scoped = await get<Word[]>(scopedKey(KEY_CURRENT_VOCAB));
  if (scoped) return scoped;
  if (getLocalOwnerId() === null) return (await get<Word[]>(KEY_CURRENT_VOCAB)) ?? undefined;
  return undefined;
}

export async function listAllVocabs(): Promise<VocabularyList[]> {
  return listVocabularyLists();
}

export async function clearCurrentVocab() {
  await del(scopedKey(KEY_CURRENT_VOCAB));
}

// ---- 文章 ----

export async function saveArticle(article: Article) {
  const updatedAt = Date.now();
  await db.articleRecords.put({
    ...article,
    ownerId: getLocalOwnerId(),
    localId: `${getLocalOwnerId() ?? 'anonymous'}:${article.id}`,
    updatedAt,
  });
  scheduleSync(getLocalOwnerId());
}

export async function getArticle(id: string): Promise<Article | undefined> {
  const articles = await db.articleRecords.where('id').equals(id).toArray();
  return articles.find((article) => isOwnedBy(article) && !article.deletedAt);
}

export async function listAllArticles(): Promise<Article[]> {
  return db.articleRecords.toArray().then((articles) => articles
    .filter((article) => isOwnedBy(article) && !article.deletedAt)
    .sort((left, right) => right.createdAt - left.createdAt));
}

// ---- 进度 ----

export async function saveProgress(progress: UserProgress) {
  const existing = await getProgress(progress.articleId);
  const updatedAt = Date.now();
  await db.progressRecords.put({
    ...progress,
    id: existing?.id ?? progress.id,
    ownerId: getLocalOwnerId(),
    updatedAt,
  });
  scheduleSync(getLocalOwnerId());
}

export async function getProgress(articleId: string): Promise<UserProgress | undefined> {
  const records = await db.progressRecords.where('articleId').equals(articleId).toArray();
  return records
    .filter((record) => isOwnedBy(record) && !record.deletedAt)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
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
