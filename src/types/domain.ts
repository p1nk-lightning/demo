export type Difficulty = 'CET4' | 'CET6' | '考研' | '雅思' | '托福';

export type WordSource = 'pasted' | 'xlsx' | 'reading';
export type ArticleTopic = '随机' | '科技' | '文化' | '教育' | '生活' | '商业' | '自然';
export type ModelProvider = 'deepseek' | 'qwen' | 'doubao';

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
  ownerId?: string | null;
  name: string;
  difficulty: Difficulty;
  wordCount: number;
  masteredCount: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  schemaVersion: 2;
  deletedAt?: number;
}

export interface VocabularyItem extends Word {
  id: string;
  ownerId?: string | null;
  listId: string;
  mastered: boolean;
  updatedAt: number;
  deletedAt?: number;
}

export interface Question {
  question: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
}

export interface Article {
  id: string;
  /** IndexedDB-only key; the stable cloud identity remains id. */
  localId?: string;
  ownerId?: string | null;
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
  provider?: ModelProvider;
  model?: string;
  coverUrl?: string;
  publishDate?: string;
  updatedAt?: number;
  deletedAt?: number;
}

export interface UserProgress {
  id: string;
  ownerId?: string | null;
  articleId: string;
  answers: (number | null)[];
  score: number;
  completedAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface GenerateRequest {
  provider: ModelProvider;
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
