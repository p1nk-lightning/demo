// 与 Prd.md §5 数据契约一一对应

export type Difficulty = 'CET4' | 'CET6' | '考研' | '雅思' | '托福';

export interface Word {
  text: string;
  normalized: string;
  source: 'pasted' | 'xlsx';
  addedAt: number;
}

export interface VocabularyList {
  id: string;
  difficulty: Difficulty;
  words: Word[];
  createdAt: number;
}

export interface Question {
  question: string; // 中文题干
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
}

export interface Article {
  id: string;
  title: string;
  article: string;
  questions: Question[];
  difficulty: Difficulty;
  vocabHitIds: string[]; // 实际出现在文中、归一化后的词（与词表的 normalized 字段匹配）
  createdAt: number;
}

export interface UserProgress {
  articleId: string;
  answers: (number | null)[];
  score: number;
  completedAt: number;
}

// 工具：Worker 入参/出参
export interface GenerateRequest {
  difficulty: Difficulty;
  // 从词表里随机抽样至多 50 个词给 LLM 提示,降低 token 与"必含"开销
  sampleWords: string[];
  retryHint?: string; // 内部使用：重试时追加的提示
}

export interface DictEntry {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  meaningCN: string;
  fetchedAt: number;
}
