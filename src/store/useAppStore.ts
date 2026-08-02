import { create } from 'zustand';
import { saveCurrentVocab } from '@/lib/storage';
import type { Article, Difficulty, UserProgress, Word } from '@/types/domain';

interface AppState {
  // 词表
  words: Word[];
  setWords: (w: Word[]) => void;
  /** 跨页入库（导入向导 → 首页）：合并 setWords + 持久化 IDB */
  importVocab: (w: Word[], d: Difficulty) => Promise<void>;
  // 难度
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  // 当前文章
  currentArticle: Article | null;
  setCurrentArticle: (a: Article | null) => void;
  // 答案进度 (长度 = 5)
  currentAnswers: (number | null)[];
  setAnswer: (idx: number, val: number | null) => void;
  resetAnswers: () => void;
  // UI
  loading: boolean;
  setLoading: (b: boolean) => void;
  toast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  toastMessage: { msg: string; kind: 'success' | 'error' | 'info' } | null;
}

export const useAppStore = create<AppState>((set) => ({
  words: [],
  setWords: (w) => set({ words: w }),

  importVocab: async (w, d) => {
    await saveCurrentVocab(w, d);
    set({ words: w, difficulty: d });
  },

  difficulty: 'CET4',
  setDifficulty: (d) => set({ difficulty: d }),

  currentArticle: null,
  setCurrentArticle: (a) => set({ currentArticle: a }),

  currentAnswers: [null, null, null, null, null],
  setAnswer: (idx, val) =>
    set((s) => {
      const next = [...s.currentAnswers];
      next[idx] = val;
      return { currentAnswers: next };
    }),
  resetAnswers: () => set({ currentAnswers: [null, null, null, null, null] }),

  loading: false,
  setLoading: (b) => set({ loading: b }),

  toastMessage: null,
  toast: (msg, kind = 'info') => {
    set({ toastMessage: { msg, kind } });
    setTimeout(() => set({ toastMessage: null }), 2400);
  },
}));

// 绑定至 UserProgress 的小工具(避免散落)
export function computeScore(answers: (number | null)[], questions: { answer: 0 | 1 | 2 | 3 }[]) {
  let score = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].answer) score++;
  }
  return score;
}

export function buildProgress(
  articleId: string,
  answers: (number | null)[],
  score: number,
): UserProgress {
  return {
    articleId,
    answers,
    score,
    completedAt: Date.now(),
  };
}
