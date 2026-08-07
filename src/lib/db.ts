import Dexie, { type EntityTable } from 'dexie';
import type {
  Article,
  Difficulty,
  ModelProvider,
  UserProgress,
  VocabularyItem,
  VocabularyList,
  Word,
} from '@/types/domain';
import { getLocalOwnerId, isOwnedBy, scopedKey } from '@/lib/localScope';
import { scheduleSync } from '@/lib/syncScheduler';

interface LocalSetting {
  key: string;
  value: unknown;
}

class LexiSceneDatabase extends Dexie {
  vocabLists!: EntityTable<VocabularyList, 'id'>;
  vocabItems!: EntityTable<VocabularyItem, 'id'>;
  articles!: EntityTable<Article, 'id'>;
  articleRecords!: EntityTable<Article, 'localId'>;
  progress!: EntityTable<UserProgress, 'articleId'>;
  progressRecords!: EntityTable<UserProgress, 'id'>;
  settings!: EntityTable<LocalSetting, 'key'>;

  constructor() {
    super('lexiscene-v2');
    this.version(1).stores({
      vocabLists: 'id, updatedAt, lastUsedAt, difficulty',
      vocabItems: 'id, listId, normalized, mastered, [listId+normalized]',
      articles: 'id, createdAt, difficulty, source, publishDate',
      progress: 'articleId, completedAt',
      apiProfiles: 'id, isActive, provider, updatedAt',
      settings: 'key',
    });
    this.version(2).stores({
      vocabLists: 'id, ownerId, updatedAt, lastUsedAt, difficulty',
      vocabItems: 'id, ownerId, listId, normalized, mastered, [listId+normalized]',
      articles: 'id, ownerId, createdAt, updatedAt, difficulty, source, publishDate',
      progress: 'articleId, ownerId, completedAt',
      progressRecords: 'id, ownerId, articleId, updatedAt, [ownerId+articleId]',
      apiProfiles: 'id, ownerId, isActive, provider, updatedAt',
      settings: 'key',
    }).upgrade(async (transaction) => {
      const oldProgress = await transaction.table('progress').toArray() as Array<Record<string, unknown>>;
      if (!oldProgress.length) return;
      await transaction.table('progressRecords').bulkPut(oldProgress.map((record) => ({
        ...record,
        id: crypto.randomUUID(),
        ownerId: null,
        updatedAt: typeof record.completedAt === 'number' ? record.completedAt : Date.now(),
      })));
    });
    this.version(3).stores({
      vocabLists: 'id, ownerId, updatedAt, lastUsedAt, difficulty',
      vocabItems: 'id, ownerId, listId, normalized, mastered, [listId+normalized]',
      articles: 'id, ownerId, createdAt, updatedAt, difficulty, source, publishDate',
      articleRecords: 'localId, id, ownerId, createdAt, updatedAt, difficulty, source, publishDate',
      progress: 'articleId, ownerId, completedAt',
      progressRecords: 'id, ownerId, articleId, updatedAt, [ownerId+articleId]',
      apiProfiles: 'id, ownerId, isActive, provider, updatedAt',
      settings: 'key',
    }).upgrade(async (transaction) => {
      const records = await transaction.table('articles').toArray() as Array<Record<string, unknown>>;
      await transaction.table('articleRecords').bulkPut(records.map((record) => ({
        ...record,
        localId: `${record.ownerId ?? 'anonymous'}:${record.id}`,
      })));
    });
    this.version(4).stores({
      vocabLists: 'id, ownerId, updatedAt, lastUsedAt, difficulty',
      vocabItems: 'id, ownerId, listId, normalized, mastered, [listId+normalized]',
      articles: 'id, ownerId, createdAt, updatedAt, difficulty, source, publishDate',
      articleRecords: 'localId, id, ownerId, createdAt, updatedAt, difficulty, source, publishDate',
      progress: 'articleId, ownerId, completedAt',
      progressRecords: 'id, ownerId, articleId, updatedAt, [ownerId+articleId]',
      apiProfiles: null,
      settings: 'key',
    });
  }
}

export const db = new LexiSceneDatabase();

export async function createVocabularyList(
  name: string,
  difficulty: Difficulty,
  words: Word[],
): Promise<VocabularyList> {
  const now = Date.now();
  const listId = crypto.randomUUID();
  const uniqueWords = Array.from(
    new Map(words.map((word) => [word.normalized, word])).values(),
  );
  const list: VocabularyList = {
    id: listId,
    ownerId: getLocalOwnerId(),
    name: name.trim() || `未命名单词表 ${new Date(now).toLocaleDateString()}`,
    difficulty,
    wordCount: uniqueWords.length,
    masteredCount: uniqueWords.filter((word) => Boolean(word.mastered)).length,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    schemaVersion: 2,
  };
  const items: VocabularyItem[] = uniqueWords.map((word, index) => ({
    ...word,
    id: crypto.randomUUID(),
    ownerId: getLocalOwnerId(),
    listId,
    mastered: Boolean(word.mastered),
    addedAt: word.addedAt || now + index,
    updatedAt: now,
  }));

  await db.transaction('rw', db.vocabLists, db.vocabItems, async () => {
    await db.vocabLists.add(list);
    await db.vocabItems.bulkAdd(items);
  });
  await db.settings.put({ key: scopedKey('activeVocabListId'), value: listId });
  scheduleSync(getLocalOwnerId());
  return list;
}

export function listVocabularyLists() {
  return db.vocabLists.toArray().then((lists) => lists
    .filter((list) => isOwnedBy(list) && !list.deletedAt)
    .sort((left, right) => right.updatedAt - left.updatedAt));
}

export function getVocabularyList(id: string) {
  return db.vocabLists.get(id).then((list) => list && isOwnedBy(list) && !list.deletedAt ? list : undefined);
}

export function getVocabularyItems(listId: string) {
  return db.vocabItems.where('listId').equals(listId).toArray().then((items) => items
    .filter((item) => isOwnedBy(item) && !item.deletedAt)
    .sort((left, right) => left.addedAt - right.addedAt));
}

export async function renameVocabularyList(id: string, name: string) {
  const list = await getVocabularyList(id);
  if (!list) return;
  await db.vocabLists.update(id, { name: name.trim(), updatedAt: Date.now() });
  scheduleSync(getLocalOwnerId());
}

export async function deleteVocabularyList(id: string) {
  const list = await getVocabularyList(id);
  if (!list) return;
  const deletedAt = Date.now();
  await db.transaction('rw', db.vocabLists, db.vocabItems, async () => {
    const items = await db.vocabItems.where('listId').equals(id).toArray();
    await Promise.all(items.filter((item) => isOwnedBy(item)).map((item) =>
      db.vocabItems.update(item.id, { deletedAt, updatedAt: deletedAt }),
    ));
    await db.vocabLists.update(id, { deletedAt, updatedAt: deletedAt });
  });
  scheduleSync(getLocalOwnerId());
}

export async function mergeVocabularyLists(
  listIds: string[],
  name: string,
  difficulty: Difficulty,
): Promise<VocabularyList | undefined> {
  const ids = Array.from(new Set(listIds));
  if (ids.length < 2) return undefined;
  const lists = (await Promise.all(ids.map((id) => getVocabularyList(id)))).filter((list): list is VocabularyList => Boolean(list));
  if (lists.length < 2) return undefined;
  const itemGroups = await Promise.all(lists.map((list) => getVocabularyItems(list.id)));
  const merged = new Map<string, Word>();
  for (const items of itemGroups) {
    for (const item of items) {
      const current = merged.get(item.normalized);
      if (!current || (!current.mastered && item.mastered)) {
        merged.set(item.normalized, {
          text: item.text,
          normalized: item.normalized,
          source: item.source,
          mastered: item.mastered,
          addedAt: item.addedAt,
          updatedAt: item.updatedAt,
        });
      }
    }
  }
  return createVocabularyList(name, difficulty, Array.from(merged.values()));
}

export async function setWordMastery(id: string, mastered: boolean) {
  const item = await db.vocabItems.get(id);
  if (!item || !isOwnedBy(item) || item.deletedAt) return;
  const updatedAt = Date.now();
  await db.vocabItems.update(id, { mastered, updatedAt });
  const masteredCount = await db.vocabItems
    .where('listId')
    .equals(item.listId)
    .filter((word) => isOwnedBy(word) && !word.deletedAt && word.mastered)
    .count();
  await db.vocabLists.update(item.listId, {
    masteredCount,
    updatedAt,
  });
  scheduleSync(getLocalOwnerId());
}

export async function getActiveVocabularyListId() {
  const setting = await db.settings.get(scopedKey('activeVocabListId'));
  return typeof setting?.value === 'string' ? setting.value : undefined;
}

export async function setActiveVocabularyListId(id: string) {
  await db.settings.put({ key: scopedKey('activeVocabListId'), value: id });
  const list = await getVocabularyList(id);
  if (!list) return;
  const updatedAt = Date.now();
  await db.vocabLists.update(id, { lastUsedAt: updatedAt, updatedAt });
  scheduleSync(getLocalOwnerId());
}

export async function getSelectedModelProvider(): Promise<ModelProvider> {
  const setting = await db.settings.get(scopedKey('selectedModelProvider'));
  return setting?.value === 'qwen' || setting?.value === 'doubao' || setting?.value === 'deepseek'
    ? setting.value
    : 'deepseek';
}

export async function setSelectedModelProvider(provider: ModelProvider) {
  await db.settings.put({ key: scopedKey('selectedModelProvider'), value: provider });
}

function articleLocalId(id: string, ownerId = getLocalOwnerId()) {
  return `${ownerId ?? 'anonymous'}:${id}`;
}

export async function mergeRemoteSyncData(data: LocalSyncData, ownerId: string) {
  let changed = false;
  const current = await getLocalSyncData(ownerId);
  const currentLists = new Map(current.vocabLists.map((record) => [record.id, record]));
  const currentItems = new Map(current.vocabItems.map((record) => [record.id, record]));
  const currentArticles = new Map(current.articles.map((record) => [record.id, record]));
  const currentProgress = new Map(current.progress.map((record) => [record.articleId, record]));

  await db.transaction('rw', db.vocabLists, db.vocabItems, db.articleRecords, db.progressRecords, async () => {
    for (const record of data.vocabLists) {
      if (!currentLists.has(record.id) || record.updatedAt > currentLists.get(record.id)!.updatedAt) {
        await db.vocabLists.put({ ...record, ownerId });
        changed = true;
      }
    }
    for (const record of data.vocabItems) {
      if (!currentItems.has(record.id) || record.updatedAt > currentItems.get(record.id)!.updatedAt) {
        await db.vocabItems.put({ ...record, ownerId });
        changed = true;
      }
    }
    for (const record of data.articles) {
      const local = currentArticles.get(record.id);
      if (!local || (record.updatedAt ?? record.createdAt) > (local.updatedAt ?? local.createdAt)) {
        await db.articleRecords.put({ ...record, ownerId, localId: articleLocalId(record.id, ownerId) });
        changed = true;
      }
    }
    for (const record of data.progress) {
      if (!currentProgress.has(record.articleId) || record.updatedAt > currentProgress.get(record.articleId)!.updatedAt) {
        await db.progressRecords.put({ ...record, ownerId });
        changed = true;
      }
    }
  });
  return changed;
}

export async function countLegacyLocalData() {
  const [lists, items, articles, progress] = await Promise.all([
    db.vocabLists.toArray(),
    db.vocabItems.toArray(),
    db.articleRecords.toArray(),
    db.progressRecords.toArray(),
  ]);
  return [
    ...lists.filter((record) => isOwnedBy(record, null) && !record.deletedAt),
    ...items.filter((record) => isOwnedBy(record, null) && !record.deletedAt),
    ...articles.filter((record) => isOwnedBy(record, null) && !record.deletedAt),
    ...progress.filter((record) => isOwnedBy(record, null) && !record.deletedAt),
  ].length;
}

export async function claimLegacyLocalData(ownerId: string) {
  const [lists, items, articles, progress] = await Promise.all([
    db.vocabLists.toArray(),
    db.vocabItems.toArray(),
    db.articleRecords.toArray(),
    db.progressRecords.toArray(),
  ]);
  await db.transaction('rw', db.vocabLists, db.vocabItems, db.articleRecords, db.progressRecords, async () => {
    await db.vocabLists.bulkPut(lists.filter((record) => isOwnedBy(record, null)).map((record) => ({ ...record, ownerId })));
    await db.vocabItems.bulkPut(items.filter((record) => isOwnedBy(record, null)).map((record) => ({ ...record, ownerId })));
    const legacyArticles = articles.filter((record) => isOwnedBy(record, null));
    await db.articleRecords.bulkDelete(legacyArticles.map((record) => record.localId).filter((id): id is string => Boolean(id)));
    await db.articleRecords.bulkPut(legacyArticles.map((record) => ({ ...record, ownerId, localId: articleLocalId(record.id, ownerId) })));
    await db.progressRecords.bulkPut(progress.filter((record) => isOwnedBy(record, null)).map((record) => ({ ...record, ownerId })));
  });
}

export interface LocalSyncData {
  vocabLists: VocabularyList[];
  vocabItems: VocabularyItem[];
  articles: Article[];
  progress: UserProgress[];
}

export async function getLocalSyncData(ownerId = getLocalOwnerId()): Promise<LocalSyncData> {
  const [vocabLists, vocabItems, articles, progress] = await Promise.all([
    db.vocabLists.toArray(),
    db.vocabItems.toArray(),
    db.articleRecords.toArray(),
    db.progressRecords.toArray(),
  ]);
  return {
    vocabLists: vocabLists.filter((record) => isOwnedBy(record, ownerId)),
    vocabItems: vocabItems.filter((record) => isOwnedBy(record, ownerId)),
    articles: articles.filter((record) => isOwnedBy(record, ownerId)).map(({ localId: _localId, ...record }) => record),
    progress: progress.filter((record) => isOwnedBy(record, ownerId)),
  };
}
