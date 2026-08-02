// 给前端的 LLM 调用封装
import type { Article, GenerateRequest } from '@/types/domain';
import { getActiveApiProfile } from './db';
import { saveArticle } from './storage';
import { uid } from './utils';

const BASE = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

export async function generateArticle(
  req: GenerateRequest,
  signal?: AbortSignal,
): Promise<Article> {
  const profile = await getActiveApiProfile();
  const res = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(profile?.apiKey ? { 'x-provider-key': profile.apiKey } : {}),
    },
    body: JSON.stringify({
      ...req,
      provider: profile
        ? { baseUrl: profile.baseUrl, model: profile.model }
        : undefined,
    }),
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
    topic: req.topic,
    wordCount: req.wordCount,
    estimatedMinutes: Math.max(1, Math.ceil((req.wordCount ?? 300) / 180)),
    source: 'generated',
  };
  // 立即落本地存储
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
