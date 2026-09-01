// 内容池路由:管理员审核/AI 预审/轮换、收藏、每日文章(自 index.ts 纯移动,注释掉死路由块一并移除)。
import { Hono } from 'hono';
import { AiReviewCoreSchema, AiReviewSchema, ContentReviewSchema, DifficultySchema, PublicArticleRepairSchema, PublicReviewArticleSchema } from '../schemas';
import type { AiReviewCore, Difficulty } from '../schemas';
import type { Env } from '../types';
import { chinaDayKey } from '../lib/time';
import { englishWordCount } from '../lib/wordstats';
import { validatePublicArticle } from '../lib/validation';
import { callProvider, getReviewProvider } from '../lib/llm';
import { getSessionUser, isAdmin } from '../lib/session';
import { contentItem, isPassingAiReview, parseJson, rotateContentPool } from '../lib/content-store';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/admin/content', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  if (!isAdmin(context.env, user)) return context.json({ error: '没有内容审核权限' }, 403);
  const status = context.req.query('status') || 'candidate';
  if (!['candidate', 'approved', 'published', 'archived'].includes(status)) return context.json({ error: '状态参数不正确' }, 400);
  const select = 'SELECT id, title, summary, content, difficulty, topic, word_count, estimated_minutes, questions_json, source_title, source_url, license_note, status, publish_date, cover_url, created_at, updated_at, reviewed_at, published_at, ai_review_json, ai_reviewed_at, ai_review_model FROM content_articles';
  const result = status === 'approved'
    ? await context.env.DB.prepare(`${select} WHERE status = 'published' AND publish_date IS NULL ORDER BY difficulty, created_at, id`).all()
    : status === 'published'
      ? await context.env.DB.prepare(`${select} WHERE status = 'published' AND publish_date IS NOT NULL ORDER BY difficulty, created_at, id`).all()
      : await context.env.DB.prepare(`${select} WHERE status = ? ORDER BY difficulty, created_at, id`).bind(status).all();
  return context.json({ items: result.results.map((row) => ({
    id: row.id, title: row.title, summary: row.summary, content: row.content, difficulty: row.difficulty,
    topic: row.topic, wordCount: row.word_count, estimatedMinutes: row.estimated_minutes,
    questions: parseJson(row.questions_json, []), sourceTitle: row.source_title, sourceUrl: row.source_url,
    licenseNote: row.license_note, coverUrl: row.cover_url ?? undefined, status: status === 'approved' ? 'approved' : row.status, publishDate: row.publish_date ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at, reviewedAt: row.reviewed_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    aiReview: parseJson(row.ai_review_json, undefined), aiReviewedAt: row.ai_reviewed_at ?? undefined, aiReviewModel: row.ai_review_model ?? undefined,
  })) });
});

app.post('/api/admin/content/:id/review', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  if (!isAdmin(context.env, user)) return context.json({ error: '没有内容审核权限' }, 403);
  const parsed = ContentReviewSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '审核参数不正确' }, 400);
  const now = Date.now();
  const { action, publishDate } = parsed.data;
  let result: D1Result<unknown>;
  if (action === 'publish') {
    const article = await context.env.DB.prepare('SELECT difficulty, status, publish_date FROM content_articles WHERE id = ?').bind(context.req.param('id')).first<{ difficulty: Difficulty; status: string; publish_date: string | null }>();
    if (!article) return context.json({ error: '文章不存在' }, 404);
    if (article.status !== 'published' || article.publish_date !== null) return context.json({ error: '只有文章池中的文章可以发布' }, 409);
    const targetDate = publishDate || chinaDayKey();
    const updates = await context.env.DB.batch([
      context.env.DB.prepare('UPDATE content_articles SET publish_date = NULL, updated_at = ? WHERE status = ? AND difficulty = ? AND publish_date = ? AND id != ?')
        .bind(now, 'published', article.difficulty, targetDate, context.req.param('id')),
      context.env.DB.prepare('UPDATE content_articles SET status = ?, publish_date = ?, reviewed_at = ?, published_at = ?, updated_at = ? WHERE id = ?')
        .bind('published', targetDate, now, now, now, context.req.param('id')),
    ]);
    result = updates[1];
  } else if (action === 'approve') {
    const article = await context.env.DB.prepare('SELECT status, ai_review_json FROM content_articles WHERE id = ?').bind(context.req.param('id')).first<{ status: string; ai_review_json: string | null }>();
    if (!article) return context.json({ error: '文章不存在' }, 404);
    if (article.status !== 'candidate') return context.json({ error: '只有候选文章可以加入文章池' }, 409);
    if (!isPassingAiReview(article.ai_review_json)) return context.json({ error: '请先完成并通过 AI 审核，再加入文章池' }, 409);
    result = await context.env.DB.prepare("UPDATE content_articles SET status = 'published', publish_date = NULL, reviewed_at = ?, published_at = NULL, updated_at = ? WHERE id = ?")
      .bind(now, now, context.req.param('id')).run();
  } else {
    result = await context.env.DB.prepare('UPDATE content_articles SET status = ?, publish_date = NULL, reviewed_at = ?, published_at = NULL, updated_at = ? WHERE id = ?')
      .bind(action, now, now, context.req.param('id')).run();
  }
  if (!result.meta.changes) return context.json({ error: '文章不存在' }, 404);
  return context.json({ ok: true, id: context.req.param('id'), status: action === 'publish' ? 'published' : action });
});

app.post('/api/admin/content/:id/ai-review', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  if (!isAdmin(context.env, user)) return context.json({ error: '没有内容审核权限' }, 403);
  const row = await context.env.DB.prepare('SELECT id, title, summary, content, difficulty, topic, questions_json, source_title, source_url FROM content_articles WHERE id = ?').bind(context.req.param('id')).first<Record<string, unknown>>();
  if (!row) return context.json({ error: '文章不存在' }, 404);
  try {
    const provider = getReviewProvider(context.env);
    const difficulty = DifficultySchema.parse(row.difficulty);
    let article = PublicReviewArticleSchema.parse({
      title: row.title,
      summary: row.summary,
      content: row.content,
      questions: parseJson(row.questions_json, []),
    });
    let repairCount = 0;
    let deterministic = validatePublicArticle(article, difficulty);
    let reviewCore: AiReviewCore | null = null;

    while (true) {
      const raw = await callProvider({
        ...provider,
        systemPrompt: [
          'You are a strict editorial reviewer for an English-learning platform. Return valid JSON only and never publish content.',
          'Evaluate English quality, stated exam-level fit, question-answer consistency, exact evidence, factual overclaims, source attribution, and copyright/originality risk.',
          'A passing article must have answerable English questions, four English options per question, accurate Chinese translations, and an exact supporting quote copied from the article for every answer.',
          'Do not claim that you visited the source URL. Put claims that need source verification in factualChecks.',
        ].join('\n'),
        userPrompt: JSON.stringify({
          task: 'Return a recommendation for a human editor.',
          deterministicIssues: deterministic.issues,
          article: { ...article, difficulty, topic: row.topic, sourceTitle: row.source_title, sourceUrl: row.source_url },
          output: {
            verdict: 'pass | needs_revision | reject', score: 'integer 0-100', summary: 'string', strengths: ['string'], issues: ['string'], factualChecks: ['string'],
            scores: { englishQuality: '0-100', levelFit: '0-100', questionQuality: '0-100', factualReliability: '0-100', originality: '0-100' },
            questionChecks: [{ index: '1-based integer', answerSupported: 'boolean', evidenceFound: 'boolean', issue: 'string, empty when none' }],
            copyrightRisk: { level: 'low | medium | high', reason: 'string' },
          },
        }),
      });
      reviewCore = AiReviewCoreSchema.parse(raw.value);
      const questionChecksPass = reviewCore.questionChecks.length === article.questions.length
        && reviewCore.questionChecks.every((check) => check.answerSupported && check.evidenceFound);
      const passed = deterministic.issues.length === 0
        && reviewCore.verdict === 'pass'
        && reviewCore.score >= 80
        && reviewCore.copyrightRisk.level !== 'high'
        && questionChecksPass;
      if (passed || repairCount >= 2 || reviewCore.verdict === 'reject' || reviewCore.copyrightRisk.level === 'high') break;

      const repair = await callProvider({
        ...provider,
        systemPrompt: [
          'Repair a candidate English reading article for a human editor. Return valid JSON only.',
          'Questions and all four options must be English. Put Chinese only in questionZh and optionsZh. Every evidence value must be a short exact quote from content.',
          'Preserve the title and content when the listed problems concern only questions or translations. Never add facts not supported by the supplied source lead.',
          'Return {title,summary,content,questions:[{question,options:[4 strings],answer:0|1|2|3,questionZh,optionsZh:[4 strings],evidence}]}.',
        ].join('\n'),
        userPrompt: JSON.stringify({
          difficulty,
          source: { title: row.source_title, url: row.source_url },
          deterministicIssues: deterministic.issues,
          reviewIssues: reviewCore.issues,
          factualChecks: reviewCore.factualChecks,
          payload: article,
        }),
      });
      article = PublicArticleRepairSchema.parse(repair.value);
      repairCount += 1;
      deterministic = validatePublicArticle(article, difficulty);
    }

    if (!reviewCore) throw new Error('AI 审核没有返回结果');
    const hardFailure = deterministic.issues.length > 0
      || reviewCore.copyrightRisk.level === 'high'
      || reviewCore.questionChecks.length !== article.questions.length
      || reviewCore.questionChecks.some((check) => !check.answerSupported || !check.evidenceFound);
    const review = AiReviewSchema.parse({
      ...reviewCore,
      verdict: hardFailure && reviewCore.verdict === 'pass' ? 'needs_revision' : reviewCore.verdict,
      score: hardFailure ? Math.min(reviewCore.score, 69) : reviewCore.score,
      repairCount,
      deterministicIssues: deterministic.issues,
    });
    const reviewedAt = Date.now();
    const finalWordCount = englishWordCount(article.content);
    await context.env.DB.prepare('UPDATE content_articles SET title = ?, summary = ?, content = ?, questions_json = ?, word_count = ?, estimated_minutes = ?, ai_review_json = ?, ai_reviewed_at = ?, ai_review_model = ?, updated_at = ? WHERE id = ?')
      .bind(article.title, article.summary, article.content, JSON.stringify(article.questions), finalWordCount, Math.max(3, Math.ceil(finalWordCount / 150)), JSON.stringify(review), reviewedAt, provider.model, reviewedAt, context.req.param('id')).run();
    return context.json({ ok: true, review, reviewedAt, model: provider.model });
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : 'AI 审核失败' }, 502);
  }
});

app.post('/api/admin/content/rotate', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  if (!isAdmin(context.env, user)) return context.json({ error: '没有内容审核权限' }, 403);
  return context.json(await rotateContentPool(context.env.DB));
});

app.get('/api/favorites', async (context) => {
  if (!context.env.DB) return context.json({ items: [], source: 'fallback' });
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  const result = await context.env.DB.prepare(
    'SELECT c.id, c.title, c.summary, c.content, c.difficulty, c.topic, c.questions_json, c.word_count, c.estimated_minutes, c.source_title, c.source_url, c.cover_url, c.publish_date, c.created_at, c.updated_at, f.created_at AS favorited_at FROM user_content_favorites f JOIN content_articles c ON c.id = f.article_id WHERE f.user_id = ? ORDER BY f.created_at DESC',
  ).bind(user.id).all();
  return context.json({ items: result.results.map((row) => contentItem(row as Record<string, unknown>, true)), source: 'd1' });
});

app.post('/api/content/:id/favorite', async (context) => {
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录' }, 401);
  const articleId = context.req.param('id');
  const article = await context.env.DB.prepare('SELECT id FROM content_articles WHERE id = ?').bind(articleId).first();
  if (!article) return context.json({ error: '文章不存在' }, 404);
  const body = await context.req.json().catch(() => null) as { favorite?: unknown } | null;
  if (typeof body?.favorite !== 'boolean') return context.json({ error: '收藏参数不正确' }, 400);
  if (body.favorite) {
    await context.env.DB.prepare('INSERT OR IGNORE INTO user_content_favorites (user_id, article_id, created_at) VALUES (?, ?, ?)').bind(user.id, articleId, Date.now()).run();
  } else {
    await context.env.DB.prepare('DELETE FROM user_content_favorites WHERE user_id = ? AND article_id = ?').bind(user.id, articleId).run();
  }
  return context.json({ ok: true, favorite: body.favorite });
});

app.get('/api/daily', async (context) => {
  if (!context.env.DB) return context.json({ items: [], source: 'fallback' });
  const difficulty = context.req.query('difficulty');
  const date = context.req.query('date') || chinaDayKey();
  const sessionUser = await getSessionUser(context.env.DB, context.req.raw);
  try {
    const contentResult = await context.env.DB.prepare(
      "SELECT c.id, c.title, c.summary, c.content, c.difficulty, c.topic, c.word_count, c.estimated_minutes, c.questions_json, c.cover_url, c.publish_date, c.created_at, c.updated_at, c.source_id, c.source_title, c.source_url, f.article_id AS favorite_article_id FROM content_articles c LEFT JOIN user_content_favorites f ON f.article_id = c.id AND f.user_id = ? WHERE c.status = 'published' AND c.publish_date = ? AND (? IS NULL OR c.difficulty = ?) ORDER BY c.difficulty",
    ).bind(sessionUser?.id ?? '', date, difficulty || null, difficulty || null).all();
    if (contentResult.results.length) {
      return context.json({
        items: contentResult.results.map((row) => contentItem(row as Record<string, unknown>, Boolean(row.favorite_article_id))),
        source: 'content_library',
      });
    }
  } catch {
    // Older local databases may not have migration 0005 yet; use the legacy table below.
  }
  const query = context.env.DB.prepare(
    'SELECT * FROM daily_articles WHERE publish_date = ? AND (? IS NULL OR difficulty = ?) ORDER BY difficulty',
  ).bind(date, difficulty || null, difficulty || null);
  const result = await query.all();
  return context.json({ items: result.results, source: 'd1' });
});

export default app;
