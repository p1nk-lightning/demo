export type Difficulty = 'CET4' | 'CET6' | '考研' | '雅思' | '托福';

export type WordSource = 'pasted' | 'xlsx' | 'reading';
export type ArticleTopic = '随机' | '科技' | '文化' | '教育' | '生活' | '商业' | '自然';

export interface Word {
  id?: string;
  text: string;
  normalized: string;
  source: WordSource;
  mastered?: boolean;
  addedAt: number;
  updatedAt?: number;
}

export interface VocabularyList {
  id: string;
  name: string;
  difficulty: Difficulty;
  wordCount: number;
  masteredCount: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  schemaVersion: 2;
}

export interface VocabularyItem extends Word {
  id: string;
  listId: string;
  mastered: boolean;
  updatedAt: number;
}

export interface Question {
  question: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
}

export interface Article {
  id: string;
  title: string;
  article: string;
  questions: Question[];
  difficulty: Difficulty;
  vocabHitIds: string[];
  createdAt: number;
  summary?: string;
  topic?: ArticleTopic;
  wordCount?: number;
  estimatedMinutes?: number;
  source?: 'generated' | 'daily';
  coverUrl?: string;
  publishDate?: string;
}

export interface UserProgress {
  articleId: string;
  answers: (number | null)[];
  score: number;
  completedAt: number;
}

export type ApiProvider = 'deepseek' | 'moonshot' | 'openai-compatible';

export interface ApiProfile {
  id: string;
  provider: ApiProvider;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  isActive: 0 | 1;
  createdAt: number;
  updatedAt: number;
}

export interface GenerateRequest {
  difficulty: Difficulty;
  sampleWords: string[];
  wordCount?: number;
  topic?: ArticleTopic;
  questionCount?: 3 | 5;
  retryHint?: string;
}

export interface DictEntry {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  meaningCN: string;
  fetchedAt: number;
}
