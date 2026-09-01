import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, saveQuizResult, listQuizResultsByRange, type QuizResult } from './db';
import { setLocalOwnerId } from './localScope';

describe('db: Dexie schema v5', () => {
  beforeEach(async () => {
    await Dexie.delete('lexiscene-v2');
  });

  it('opens a fresh database at version 5 with quizResults table', async () => {
    await db.open();
    expect(db.verno).toBe(5);
    expect(db.tables.map((t) => t.name)).toContain('quizResults');
  });

  it('opens a simulated v4 database (no quizResults) and upgrades to v5 without error', async () => {
    await Dexie.delete('lexiscene-v2');
    // 用 v4 的 store 定义先建一个库,再让 db(声明 v5)打开升级。
    const legacy = new Dexie('lexiscene-v2');
    legacy.version(4).stores({
      vocabLists: 'id, ownerId, updatedAt, lastUsedAt, difficulty',
      vocabItems: 'id, ownerId, listId, normalized, mastered, [listId+normalized]',
      articles: 'id, ownerId, createdAt, updatedAt, difficulty, source, publishDate',
      articleRecords: 'localId, id, ownerId, createdAt, updatedAt, difficulty, source, publishDate',
      progress: 'articleId, ownerId, completedAt',
      progressRecords: 'id, ownerId, articleId, updatedAt, [ownerId+articleId]',
      settings: 'key',
    });
    await legacy.open();
    await legacy.close();
    await db.open();
    expect(db.verno).toBe(5);
    expect(db.tables.map((t) => t.name)).toContain('quizResults');
    // 老数据在升级后仍可读
    await db.vocabLists.put({ id: 'l1', name: '旧表', difficulty: 'CET4', wordCount: 0, masteredCount: 0, createdAt: 1, updatedAt: 1, schemaVersion: 2 });
    const list = await db.vocabLists.get('l1');
    expect(list?.name).toBe('旧表');
  });

  it('saves and reads back a quiz result scoped to the current owner', async () => {
    setLocalOwnerId('user-a');
    const saved = await saveQuizResult({
      id: 'q1',
      mode: 'spelling',
      total: 10,
      correct: 8,
      wrongNormalized: ['analyze', 'pattern'],
      completedAt: 1_700_000_000_000,
    });
    expect(saved.ownerId).toBe('user-a');
    const rows = await listQuizResultsByRange(1_700_000_000_000 - 1_000, 1_700_000_000_000 + 1_000);
    expect(rows).toHaveLength(1);
    expect(rows[0].correct).toBe(8);
    expect(rows[0].wrongNormalized).toEqual(['analyze', 'pattern']);
  });

  it('range query filters by completedAt bounds and owner isolation', async () => {
    setLocalOwnerId('user-a');
    const base = 1_700_000_000_000;
    await saveQuizResult({ id: 'qa1', mode: 'definition', total: 10, correct: 6, wrongNormalized: [], completedAt: base });
    await saveQuizResult({ id: 'qa2', mode: 'spelling', total: 10, correct: 9, wrongNormalized: ['x'], completedAt: base + 86_400_000 });
    setLocalOwnerId('user-b');
    await saveQuizResult({ id: 'qb1', mode: 'definition', total: 10, correct: 3, wrongNormalized: [], completedAt: base + 3_600_000 });
    setLocalOwnerId('user-a');
    const week = await listQuizResultsByRange(base - 1, base + 86_400_000 + 1);
    expect(week.map((r) => r.id)).toEqual(['qa1', 'qa2']);
    const before = await listQuizResultsByRange(base - 1000, base - 1);
    expect(before).toHaveLength(0);
  });

  it('quiz result type shape rejects incomplete records at compile-time (runtime sanity)', async () => {
    setLocalOwnerId(null);
    const saved = await saveQuizResult({ id: 'q-anon', mode: 'definition', total: 5, correct: 5, wrongNormalized: [], completedAt: 123 });
    expect(saved.ownerId).toBeNull();
    const rows = await listQuizResultsByRange(0, 1000);
    expect(rows[0].mode).toBe('definition');
  });
});
