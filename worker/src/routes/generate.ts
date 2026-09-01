// AI 文章生成路由(自 index.ts 纯移动)。
import { Hono } from 'hono';
import { ArticlePayloadSchema, GenerateRequestSchema } from '../schemas';
import type { Env } from '../types';
import { countVocabHits, minimumHits } from '../lib/wordstats';
import { validateGeneratedArticle } from '../lib/validation';
import { DIFFICULTY_PROMPT, callProvider, finishGeneration, getBuiltinProvider, reserveGeneration } from '../lib/llm';
import type { BuiltinProvider } from '../lib/llm';
import { checkRateLimit } from '../lib/rate-limit';
import { getClientIp, getSessionUser } from '../lib/session';

const app = new Hono<{ Bindings: Env }>();

app.post('/api/generate', async (context) => {
  if (!(await checkRateLimit(context.env, getClientIp(context.req.raw)))) {
    return context.json({ error: '请求过于频繁，请稍后再试' }, 429);
  }
  if (!context.env.DB) return context.json({ error: '用户服务尚未配置' }, 503);
  const user = await getSessionUser(context.env.DB, context.req.raw);
  if (!user) return context.json({ error: '请先登录后再生成文章' }, 401);
  if (user.email_verified_at === null) return context.json({ error: '请先验证邮箱后再生成文章' }, 403);
  const parsed = GenerateRequestSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '生成参数不正确', detail: parsed.error.format() }, 400);
  const input = parsed.data;
  let provider: BuiltinProvider;
  try {
    provider = getBuiltinProvider(context.env, input.provider);
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : '模型服务暂不可用' }, 503);
  }
  const usageId = await reserveGeneration(context.env.DB, user.id, provider);
  if (!usageId) return context.json({ error: '今日生成额度已用完，或请求过于频繁，请稍后再试' }, 429);
  const targetHits = Math.min(minimumHits(input.wordCount), input.sampleWords.length);
  const systemPrompt = [
    'You create original English reading comprehension for Chinese learners. Return valid JSON only.',
    DIFFICULTY_PROMPT[input.difficulty],
    `Write approximately ${input.wordCount} English words about ${input.topic === '随机' ? 'a suitable engaging topic' : input.topic}.`,
    'Use multiple coherent paragraphs. Prefer general educational explanations or fictional situations and avoid unsupported statistics, quotations, or breaking-news claims.',
    `Create exactly ${input.questionCount} multiple-choice questions. Every question and all four options must be English only.`,
    'For each question also provide an accurate Chinese translation of the stem and all options.',
    'For evidence, copy one short exact English quote from the article that supports the answer.',
    'Return {title, article, questions:[{question,options:[4 strings],answer:0|1|2|3,questionZh,optionsZh:[4 strings],evidence}], difficulty}.',
  ].join('\n');
  const userPrompt = `Naturally include at least ${targetHits} of these words: ${input.sampleWords.join(', ')}.`;
  try {
    const initial = await callProvider({ ...provider, systemPrompt, userPrompt });
    let article = ArticlePayloadSchema.parse(initial.value);
    let quality = validateGeneratedArticle(article, input, targetHits);
    let promptTokens = initial.usage.promptTokens;
    let completionTokens = initial.usage.completionTokens;
    let repaired = false;

    if (quality.issues.length) {
      const repair = await callProvider({
        ...provider,
        systemPrompt: [
          'Repair an English reading-comprehension JSON payload. Return valid JSON only.',
          'Keep valid content unchanged. Questions and options must remain English; Chinese is allowed only in questionZh and optionsZh.',
          'Every evidence value must be an exact quote from the article. Return the complete corrected payload using the original schema.',
        ].join('\n'),
        userPrompt: JSON.stringify({ issues: quality.issues, target: { wordCount: input.wordCount, targetHits }, payload: article }),
      });
      article = ArticlePayloadSchema.parse(repair.value);
      quality = validateGeneratedArticle(article, input, targetHits);
      promptTokens = (promptTokens ?? 0) + (repair.usage.promptTokens ?? 0) || null;
      completionTokens = (completionTokens ?? 0) + (repair.usage.completionTokens ?? 0) || null;
      repaired = true;
    }

    if (quality.issues.length) throw new Error(`生成结果未通过质量检查：${quality.issues.slice(0, 4).join(', ')}`);
    const hitIds = countVocabHits(article.article, input.sampleWords);
    const articleId = crypto.randomUUID();
    await finishGeneration(context.env.DB, usageId, {
      status: 'succeeded', articleId, promptTokens, completionTokens,
    });
    return context.json({ ...article, articleId, provider: provider.provider, model: provider.model, vocabHitIds: hitIds, meetThreshold: hitIds.length >= targetHits, quality: { repaired, wordCount: quality.wordCount, targetWordHits: quality.hitCount } });
  } catch (error) {
    await finishGeneration(context.env.DB, usageId, { status: 'failed', errorCode: 'provider_error' });
    return context.json({ error: error instanceof Error ? error.message : '生成失败' }, 502);
  }
});

export default app;
