import type { Article, Difficulty, Question } from '@/types/domain';
import { apiRequest } from './apiClient';

interface ContentApiItem {
  id: string;
  contentId?: string;
  title: string;
  summary?: string;
  article?: string;
  content?: string;
  questions?: Question[];
  questions_json?: string;
  difficulty: Difficulty;
  topic?: Article['topic'];
  vocabHitIds?: string[];
  word_count?: number;
  wordCount?: number;
  estimated_minutes?: number;
  estimatedMinutes?: number;
  cover_url?: string;
  coverUrl?: string;
  publish_date?: string;
  publishDate?: string;
  created_at?: number;
  createdAt?: number;
  updated_at?: number;
  updatedAt?: number;
  source?: Article['source'];
  isFavorite?: boolean;
}

function parseQuestions(item: ContentApiItem) {
  if (Array.isArray(item.questions)) return item.questions;
  try {
    return JSON.parse(item.questions_json ?? '[]') as Question[];
  } catch {
    return [];
  }
}

export function mapContentArticle(item: ContentApiItem): Article {
  return {
    id: item.id,
    contentId: item.contentId ?? item.id,
    title: item.title,
    article: item.article ?? item.content ?? '',
    questions: parseQuestions(item),
    difficulty: item.difficulty,
    vocabHitIds: item.vocabHitIds ?? [],
    createdAt: item.createdAt ?? item.created_at ?? Date.now(),
    updatedAt: item.updatedAt ?? item.updated_at,
    summary: item.summary,
    topic: item.topic,
    wordCount: item.wordCount ?? item.word_count,
    estimatedMinutes: item.estimatedMinutes ?? item.estimated_minutes,
    source: item.source ?? 'daily',
    coverUrl: item.coverUrl ?? item.cover_url,
    publishDate: item.publishDate ?? item.publish_date,
    isFavorite: item.isFavorite ?? false,
  };
}

export async function getDailyArticles(difficulty?: Difficulty) {
  const query = difficulty ? `?difficulty=${encodeURIComponent(difficulty)}` : '';
  const response = await apiRequest<{ items: ContentApiItem[]; source?: string }>(`/api/daily${query}`);
  return response.items.map((item) => {
    const article = mapContentArticle(item);
    return response.source === 'content_library' ? article : { ...article, contentId: undefined };
  });
}

export async function listFavoriteArticles() {
  const response = await apiRequest<{ items: ContentApiItem[] }>('/api/favorites');
  return response.items.map(mapContentArticle);
}

export async function setArticleFavorite(contentId: string, favorite: boolean) {
  return apiRequest<{ ok: true; favorite: boolean }>(`/api/content/${encodeURIComponent(contentId)}/favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorite }),
  });
}
