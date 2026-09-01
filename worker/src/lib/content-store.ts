// 内容库/词典行的映射与文章池轮换(自 index.ts 纯移动,逻辑零变化)。
import { AiReviewSchema } from '../schemas';
import type { Difficulty } from '../schemas';
import { chinaDayKey, isRotationDay } from './time';

export function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return typeof value === 'string' ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeDictionaryWord(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z'-]/g, '').slice(0, 80);
}

export function isPassingAiReview(value: unknown) {
  const parsed = AiReviewSchema.safeParse(parseJson(value, null));
  if (!parsed.success) return false;
  const review = parsed.data;
  return review.verdict === 'pass'
    && review.score >= 80
    && review.deterministicIssues.length === 0
    && review.copyrightRisk.level !== 'high'
    && review.questionChecks.length > 0
    && review.questionChecks.every((check) => check.answerSupported && check.evidenceFound);
}

export function dictionaryItem(row: Record<string, unknown>) {
  return {
    dictionaryId: row.dictionary_id,
    dictionaryName: row.dictionary_name,
    word: row.headword,
    phonetic: row.phonetic ?? undefined,
    partOfSpeech: row.part_of_speech ?? undefined,
    definitionEN: row.definition_en ?? undefined,
    meaningCN: row.definition_zh ?? undefined,
    exampleEN: row.example_en ?? undefined,
    difficulty: row.difficulty ?? undefined,
    frequencyRank: row.frequency_rank ?? undefined,
  };
}

export function contentItem(row: Record<string, unknown>, isFavorite = false) {
  return {
    id: row.id,
    contentId: row.id,
    title: row.title,
    summary: row.summary,
    article: row.content,
    content: row.content,
    difficulty: row.difficulty,
    topic: row.topic,
    questions: parseJson(row.questions_json, []),
    vocabHitIds: [],
    wordCount: row.word_count,
    estimatedMinutes: row.estimated_minutes,
    source: 'daily',
    coverUrl: row.cover_url ?? undefined,
    publishDate: row.publish_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    isFavorite,
    aiReview: parseJson(row.ai_review_json, undefined),
  };
}

const ROTATION_DIFFICULTIES: Difficulty[] = ['CET4', 'CET6', '考研', '雅思', '托福'];

export async function rotateContentPool(database: D1Database, dayKey = chinaDayKey()) {
  if (!isRotationDay(dayKey)) return { rotated: false, count: 0, dayKey };
  const now = Date.now();
  let count = 0;
  for (const difficulty of ROTATION_DIFFICULTIES) {
    const next = await database.prepare(
      "SELECT id FROM content_articles WHERE status = 'published' AND publish_date IS NULL AND difficulty = ? ORDER BY COALESCE(published_at, 0), created_at, id LIMIT 1",
    ).bind(difficulty).first<{ id: string }>();
    if (!next) continue;
    await database.batch([
      database.prepare("UPDATE content_articles SET publish_date = NULL, updated_at = ? WHERE status = 'published' AND publish_date IS NOT NULL AND difficulty = ?").bind(now, difficulty),
      database.prepare("UPDATE content_articles SET status = 'published', publish_date = ?, published_at = ?, updated_at = ? WHERE id = ?").bind(dayKey, now, now, next.id),
    ]);
    count += 1;
  }
  return { rotated: count > 0, count, dayKey };
}

export async function batchStatements(database: D1Database, statements: D1PreparedStatement[], size = 50) {
  for (let index = 0; index < statements.length; index += size) {
    await database.batch(statements.slice(index, index + size));
  }
}
