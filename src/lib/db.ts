import Dexie, { type EntityTable } from 'dexie';
import type {
  ApiProfile,
  Article,
  Difficulty,
  UserProgress,
  VocabularyItem,
  VocabularyList,
  Word,
} from '@/types/domain';

interface LocalSetting {
  key: string;
  value: unknown;
}

class LexiSceneDatabase extends Dexie {
  vocabLists!: EntityTable<VocabularyList, 'id'>;
  vocabItems!: EntityTable<VocabularyItem, 'id'>;
  articles!: EntityTable<Article, 'id'>;
  progress!: EntityTable<UserProgress, 'articleId'>;
  apiProfiles!: EntityTable<ApiProfile, 'id'>;
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
    name: name.trim() || `未命名单词表 ${new Date(now).toLocaleDateString()}`,
    difficulty,
    wordCount: uniqueWords.length,
    masteredCount: 0,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    schemaVersion: 2,
  };
  const items: VocabularyItem[] = uniqueWords.map((word, index) => ({
    ...word,
    id: crypto.randomUUID(),
    listId,
    mastered: Boolean(word.mastered),
    addedAt: word.addedAt || now + index,
    updatedAt: now,
  }));

  await db.transaction('rw', db.vocabLists, db.vocabItems, async () => {
    await db.vocabLists.add(list);
    await db.vocabItems.bulkAdd(items);
  });
  await db.settings.put({ key: 'activeVocabListId', value: listId });
  return list;
}

export function listVocabularyLists() {
  return db.vocabLists.orderBy('updatedAt').reverse().toArray();
}

export function getVocabularyList(id: string) {
  return db.vocabLists.get(id);
}

export function getVocabularyItems(listId: string) {
  return db.vocabItems.where('listId').equals(listId).sortBy('addedAt');
}

export async function renameVocabularyList(id: string, name: string) {
  await db.vocabLists.update(id, { name: name.trim(), updatedAt: Date.now() });
}

export async function deleteVocabularyList(id: string) {
  await db.transaction('rw', db.vocabLists, db.vocabItems, async () => {
    await db.vocabItems.where('listId').equals(id).delete();
    await db.vocabLists.delete(id);
  });
}

export async function setWordMastery(id: string, mastered: boolean) {
  const item = await db.vocabItems.get(id);
  if (!item) return;
  await db.vocabItems.update(id, { mastered, updatedAt: Date.now() });
  const masteredCount = await db.vocabItems
    .where('listId')
    .equals(item.listId)
    .filter((word) => word.mastered)
    .count();
  await db.vocabLists.update(item.listId, {
    masteredCount,
    updatedAt: Date.now(),
  });
}

export async function getActiveVocabularyListId() {
  const setting = await db.settings.get('activeVocabListId');
  return typeof setting?.value === 'string' ? setting.value : undefined;
}

export async function setActiveVocabularyListId(id: string) {
  await db.settings.put({ key: 'activeVocabListId', value: id });
  await db.vocabLists.update(id, { lastUsedAt: Date.now() });
}

export function getActiveApiProfile() {
  return db.apiProfiles.where('isActive').equals(1).first();
}

export async function saveApiProfile(
  profile: Omit<ApiProfile, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>,
) {
  const now = Date.now();
  const existing = await getActiveApiProfile();
  const record: ApiProfile = {
    ...profile,
    id: existing?.id ?? crypto.randomUUID(),
    isActive: 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.transaction('rw', db.apiProfiles, async () => {
    await db.apiProfiles.toCollection().modify({ isActive: 0 });
    await db.apiProfiles.put(record);
  });
  return record;
}

export function removeApiProfile(id: string) {
  return db.apiProfiles.delete(id);
}
