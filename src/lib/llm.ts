// 给前端的 LLM 调用封装
import type { Article, Difficulty } from '@/types/domain';
import { uid } from './utils';

const BASE = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

export async function generateArticle(
  req: { difficulty: Difficulty; sampleWords: string[]; retryHint?: string },
  signal?: AbortSignal,
): Promise<Article> {
  const res = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`生成失败 (${res.status}): ${t || res.statusText}`);
  }
  const data = (await res.json()) as Omit<Article, 'id' | 'createdAt'>;
  // 构造 Article
  const article: Article = {
    id: uid(),
    title: data.title,
    article: data.article,
    questions: data.questions,
    difficulty: data.difficulty,
    vocabHitIds: data.vocabHitIds,
    createdAt: Date.now(),
  };
  // 立即落本地存储
  const { saveArticle } = await import('./storage');
  await saveArticle(article);
  return article;
}

// 健康检查
export async function pingWorker(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/healthz`);
    return res.ok;
  } catch {
    return false;
  }
}

// 取 worker base, 便于测试
export function workerBase(): string {
  return BASE;
}
