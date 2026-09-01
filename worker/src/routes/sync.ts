// 云同步路由:snapshot / push(自 index.ts 纯移动)。
import { Hono } from 'hono';
import { SyncPayloadSchema } from '../schemas';
import type { Env } from '../types';
import { getSessionUser } from '../lib/session';
import { batchStatements, parseJson } from '../lib/content-store';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/sync/snapshot', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '未登录' }, 401);
  const [lists, items, articles, progress] = await Promise.all([
    context.env.DB.prepare('SELECT * FROM vocab_lists WHERE user_id = ?').bind(user.id).all(),
    context.env.DB.prepare('SELECT * FROM vocab_items WHERE user_id = ?').bind(user.id).all(),
    context.env.DB.prepare('SELECT * FROM articles WHERE user_id = ?').bind(user.id).all(),
    context.env.DB.prepare('SELECT * FROM reading_progress WHERE user_id = ?').bind(user.id).all(),
  ]);
  return context.json({
    vocabLists: lists.results.map((row) => ({
      id: row.id, name: row.name, difficulty: row.difficulty, wordCount: row.word_count,
      masteredCount: row.mastered_count, createdAt: row.created_at, updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at ?? undefined, schemaVersion: row.schema_version, deletedAt: row.deleted_at ?? undefined,
    })),
    vocabItems: items.results.map((row) => ({
      id: row.id, listId: row.list_id, text: row.text, normalized: row.normalized, source: row.source,
      mastered: Boolean(row.mastered), addedAt: row.added_at, updatedAt: row.updated_at, deletedAt: row.deleted_at ?? undefined,
    })),
    articles: articles.results.map((row) => ({
      id: row.id, title: row.title, article: row.article, questions: parseJson(row.questions_json, []),
      difficulty: row.difficulty, vocabHitIds: parseJson(row.vocab_hit_ids_json, []), createdAt: row.created_at,
      updatedAt: row.updated_at, summary: row.summary ?? undefined, topic: row.topic ?? undefined,
      wordCount: row.word_count ?? undefined, estimatedMinutes: row.estimated_minutes ?? undefined,
      source: row.source ?? undefined, coverUrl: row.cover_url ?? undefined, publishDate: row.publish_date ?? undefined,
      provider: row.provider ?? undefined, model: row.model ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
    })),
    progress: progress.results.map((row) => ({
      id: row.id, articleId: row.article_id, answers: parseJson(row.answers_json, []),
      score: row.score, completedAt: row.completed_at, updatedAt: row.updated_at, deletedAt: row.deleted_at ?? undefined,
    })),
  });
});

app.post('/api/sync/push', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '未登录' }, 401);
  const parsed = SyncPayloadSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '同步数据格式不正确' }, 400);
  const { vocabLists, vocabItems, articles, progress } = parsed.data;
  const statements: D1PreparedStatement[] = [];
  for (const record of vocabLists) statements.push(context.env.DB.prepare(
    'INSERT INTO vocab_lists (user_id,id,name,difficulty,word_count,mastered_count,created_at,updated_at,last_used_at,schema_version,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,difficulty=excluded.difficulty,word_count=excluded.word_count,mastered_count=excluded.mastered_count,created_at=excluded.created_at,updated_at=excluded.updated_at,last_used_at=excluded.last_used_at,schema_version=excluded.schema_version,deleted_at=excluded.deleted_at WHERE excluded.updated_at >= vocab_lists.updated_at',
  ).bind(user.id, record.id, record.name, record.difficulty, record.wordCount, record.masteredCount, record.createdAt, record.updatedAt, record.lastUsedAt ?? null, record.schemaVersion, record.deletedAt ?? null));
  for (const record of vocabItems) statements.push(context.env.DB.prepare(
    'INSERT INTO vocab_items (user_id,id,list_id,text,normalized,source,mastered,added_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET list_id=excluded.list_id,text=excluded.text,normalized=excluded.normalized,source=excluded.source,mastered=excluded.mastered,added_at=excluded.added_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at WHERE excluded.updated_at >= vocab_items.updated_at',
  ).bind(user.id, record.id, record.listId, record.text, record.normalized, record.source, record.mastered ? 1 : 0, record.addedAt, record.updatedAt, record.deletedAt ?? null));
  for (const record of articles) statements.push(context.env.DB.prepare(
    'INSERT INTO articles (user_id,id,title,article,questions_json,difficulty,vocab_hit_ids_json,created_at,updated_at,summary,topic,word_count,estimated_minutes,source,cover_url,publish_date,provider,model,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET title=excluded.title,article=excluded.article,questions_json=excluded.questions_json,difficulty=excluded.difficulty,vocab_hit_ids_json=excluded.vocab_hit_ids_json,created_at=excluded.created_at,updated_at=excluded.updated_at,summary=excluded.summary,topic=excluded.topic,word_count=excluded.word_count,estimated_minutes=excluded.estimated_minutes,source=excluded.source,cover_url=excluded.cover_url,publish_date=excluded.publish_date,provider=excluded.provider,model=excluded.model,deleted_at=excluded.deleted_at WHERE excluded.updated_at >= articles.updated_at',
  ).bind(user.id, record.id, record.title, record.article, JSON.stringify(record.questions), record.difficulty, JSON.stringify(record.vocabHitIds), record.createdAt, record.updatedAt ?? record.createdAt, record.summary ?? null, record.topic ?? null, record.wordCount ?? null, record.estimatedMinutes ?? null, record.source ?? null, record.coverUrl ?? null, record.publishDate ?? null, record.provider ?? null, record.model ?? null, record.deletedAt ?? null));
  for (const record of progress) statements.push(context.env.DB.prepare(
    'INSERT INTO reading_progress (user_id,article_id,id,answers_json,score,completed_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,article_id) DO UPDATE SET id=excluded.id,answers_json=excluded.answers_json,score=excluded.score,completed_at=excluded.completed_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at WHERE excluded.updated_at >= reading_progress.updated_at',
  ).bind(user.id, record.articleId, record.id, JSON.stringify(record.answers), record.score, record.completedAt, record.updatedAt, record.deletedAt ?? null));
  await batchStatements(context.env.DB, statements);
  return context.json({ ok: true, count: statements.length });
});

export default app;
