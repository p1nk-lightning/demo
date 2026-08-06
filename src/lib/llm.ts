// 给前端的 LLM 调用封装
import type { Article, GenerateRequest } from '@/types/domain';
import { saveArticle } from './storage';
import { apiBaseUrl, apiRequest } from './apiClient';

export async function generateArticle(
  req: GenerateRequest,
  signal?: AbortSignal,
): Promise<Article> {
  const data = await apiRequest<Omit<Article, 'id' | 'createdAt'> & { articleId: string }>('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  // 构造 Article
  const article: Article = {
    id: data.articleId,
    title: data.title,
    article: data.article,
    questions: data.questions,
    difficulty: data.difficulty,
    vocabHitIds: data.vocabHitIds,
    createdAt: Date.now(),
    topic: req.topic,
    wordCount: req.wordCount,
    estimatedMinutes: Math.max(1, Math.ceil((req.wordCount ?? 300) / 180)),
    source: 'generated',
    provider: data.provider,
    model: data.model,
  };
  // 立即落本地存储
  await saveArticle(article);
  return article;
}

// 健康检查
export async function pingWorker(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl}/healthz`);
    return res.ok;
  } catch {
    return false;
  }
}

// 取 worker base, 便于测试
export function workerBase(): string {
  return apiBaseUrl;
}
