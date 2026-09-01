// 词汇测验页(AC-002/003/004):看词选义 + 见义拼词,答错当轮队尾重练一次。
// 计分口径(见 data-model.md):total = 首答词数,correct = 首答正确数,重练答对不计。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Trophy } from 'lucide-react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  getActiveVocabularyListId,
  getVocabularyItems,
  saveQuizResult,
} from '@/lib/db';
import { lookupDictMany } from '@/lib/dict';
import {
  buildDefinitionQuestion,
  judgeSpelling,
  pickQuizWords,
  type DefinitionQuestion,
  type QuizWord,
} from '@/lib/quiz';

type Mode = 'definition' | 'spelling';
type Phase = 'loading' | 'error' | 'empty' | 'ready' | 'playing' | 'summary';

const ROUND_SIZE = 10;

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [mode, setMode] = useState<Mode>('definition');
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<QuizWord[]>([]);
  const [queue, setQueue] = useState<QuizWord[]>([]);
  const [questions, setQuestions] = useState<Record<string, DefinitionQuestion | null>>({});
  const [cursor, setCursor] = useState(0);
  const [firstWrong, setFirstWrong] = useState<string[]>([]);
  const [answerState, setAnswerState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [spellingInput, setSpellingInput] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setPhase('loading');
      try {
        const activeId = await getActiveVocabularyListId();
        const items = activeId ? await getVocabularyItems(activeId) : [];
        const glossMap = await lookupDictMany(items.map((item) => item.normalized));
        const glosses = new Map<string, string>();
        for (const [word, entry] of glossMap) {
          if (entry.meaningCN) glosses.set(word, entry.meaningCN);
        }
        const { picked: words, skippedNoGloss } = pickQuizWords(items, glosses, ROUND_SIZE);
        if (!alive) return;
        if (words.length < 4) {
          setNotice(items.length === 0
            ? '词库还是空的 — 导入你背过的词，第一篇文章会用它们写出来。'
            : '词库里的词还不够一轮 — 至少导入 10 个词再开始。');
          setPhase('empty');
          return;
        }
        setPicked(words);
        setQueue(words);
        setNotice(skippedNoGloss > 0 ? `已用 ${words.length} 个词出题 — ${skippedNoGloss} 个词暂无释义，已跳过。` : null);
        setPhase('ready');
      } catch {
        if (alive) setPhase('error');
      }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const allGlosses = useMemo(() => picked.map((word) => word.gloss), [picked]);
  const firstPassCount = picked.length;
  const currentWord = queue[cursor];
  const currentQuestion = currentWord ? questions[currentWord.normalized] ?? null : null;
  const inRetake = cursor >= firstPassCount;

  const startRound = useCallback((selectedMode: Mode) => {
    setMode(selectedMode);
    setQueue(picked);
    setCursor(0);
    setFirstWrong([]);
    setAnswerState('idle');
    setChosenIndex(null);
    setSpellingInput('');
    setQuestions(Object.fromEntries(picked.map((word) => [
      word.normalized,
      selectedMode === 'definition' ? buildDefinitionQuestion(word, allGlosses) : null,
    ])));
    setPhase('playing');
  }, [picked, allGlosses]);

  function settleAnswer(correct: boolean, word: QuizWord) {
    setAnswerState(correct ? 'correct' : 'wrong');
    if (cursor < firstPassCount && !correct) {
      setFirstWrong((prev) => [...prev, word.normalized]);
      // 答错的词追加到队尾重练一次(重练段答错不再追加)
      setQueue((prev) => [...prev, word]);
      if (mode === 'definition') {
        setQuestions((prev) => ({ ...prev, [word.normalized]: buildDefinitionQuestion(word, allGlosses) }));
      }
    }
  }

  function next() {
    setAnswerState('idle');
    setChosenIndex(null);
    setSpellingInput('');
    if (cursor + 1 >= queue.length) {
      const total = firstPassCount;
      const wrong = firstWrong;
      const correct = total - wrong.length;
      void saveQuizResult({
        id: crypto.randomUUID(),
        mode,
        total,
        correct,
        wrongNormalized: wrong,
        completedAt: Date.now(),
      });
      setPhase('summary');
      return;
    }
    setCursor((value) => value + 1);
  }

  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <EmptyState
        icon="📡"
        title="词典服务暂时不可用，稍后再试。"
        description="你的词库数据都在本机，不会丢失。"
        action={<Button onClick={() => setReloadKey((k) => k + 1)}>重试</Button>}
      />
    );
  }

  if (phase === 'empty') {
    return (
      <EmptyState
        icon="📚"
        title="词库里的词还不够一轮 — 至少导入 10 个词再开始。"
        description={notice ?? undefined}
        action={<Link to="/library/import"><Button>去导入</Button></Link>}
      />
    );
  }

  if (phase === 'ready') {
    return (
      <div className="mx-auto max-w-xl py-8">
        <h1 className="text-xl font-bold text-ink-900">词汇测验</h1>
        {notice && <p className="mt-2 text-sm text-ink-500">{notice}</p>}
        <p className="mt-1 text-sm text-ink-500">每轮 {picked.length} 词 · 答错的词本轮还会再回来一次。</p>
        <div className="mt-6 flex flex-col gap-3">
          <Button fullWidth onClick={() => startRound('definition')}>看词选义 — 选出正确的中文释义</Button>
          <Button fullWidth variant="secondary" onClick={() => startRound('spelling')}>见义拼词 — 看中文拼出单词</Button>
        </div>
      </div>
    );
  }

  if (phase === 'summary') {
    const total = firstPassCount;
    const wrong = firstWrong;
    const accuracy = total > 0 ? Math.round(((total - wrong.length) / total) * 100) : 0;
    return (
      <div className="mx-auto max-w-xl py-8 text-center">
        <Trophy className="mx-auto text-amber-500" size={40} />
        <h1 className="mt-3 text-2xl font-bold text-ink-900">{accuracy}%</h1>
        <p className="mt-1 text-sm text-ink-500">
          首答正确 {total - wrong.length} / {total} 词
          {wrong.length > 0 ? ` · 错词 ${wrong.length} 个：${wrong.join('、')}` : ' · 全对，漂亮！'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => setPhase('ready')} trailing={<RotateCcw size={16} />}>再来一轮</Button>
          <Link to="/stats"><Button variant="secondary">看学习看板</Button></Link>
        </div>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="mx-auto max-w-xl py-6">
      <div className="flex items-center justify-between text-sm text-ink-500">
        <span>进度 {Math.min(cursor + 1, queue.length)} / {queue.length}</span>
        {inRetake && <span className="text-amber-600">重练 · 这个词会再回来找你一次</span>}
      </div>

      {mode === 'definition' && currentQuestion && (
        <div className="mt-4 rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-2xl font-bold text-ink-900">{currentQuestion.normalized}</p>
          <div className="mt-4 flex flex-col gap-2">
            {currentQuestion.options.map((option, index) => {
              const isAnswer = index === currentQuestion.answerIndex;
              const chosen = chosenIndex === index;
              const tone = answerState === 'idle'
                ? 'border-ink-200 hover:border-brand-400'
                : isAnswer
                  ? 'border-emerald-500 bg-emerald-50'
                  : chosen
                    ? 'border-red-400 bg-red-50'
                    : 'border-ink-100 opacity-60';
              return (
                <button
                  key={option}
                  type="button"
                  disabled={answerState !== 'idle'}
                  onClick={() => {
                    setChosenIndex(index);
                    settleAnswer(isAnswer, currentWord);
                  }}
                  className={`rounded-lg border px-4 py-3 text-left text-sm transition ${tone}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {answerState === 'wrong' && (
            <p className="mt-3 text-sm text-red-600">差一点 — 正确答案：{currentQuestion.gloss}</p>
          )}
          {answerState === 'correct' && (
            <p className="mt-3 text-sm text-emerald-600">✓ 正确</p>
          )}
        </div>
      )}

      {mode === 'spelling' && (
        <div className="mt-4 rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xl font-semibold text-ink-900">{currentWord.gloss}</p>
          <p className="mt-1 text-sm text-ink-400">首字母 {currentWord.normalized[0]?.toUpperCase()} · {currentWord.normalized.length} 个字母</p>
          <div className="mt-4 flex gap-2">
            <input
              value={spellingInput}
              onChange={(event) => setSpellingInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') settleAnswer(judgeSpelling(spellingInput, currentWord.normalized), currentWord); }}
              disabled={answerState !== 'idle'}
              placeholder="输入英文单词"
              className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
            <Button onClick={() => settleAnswer(judgeSpelling(spellingInput, currentWord.normalized), currentWord)} disabled={answerState !== 'idle'}>提交</Button>
          </div>
          {answerState === 'wrong' && (
            <p className="mt-3 text-sm text-red-600">差一点 — 正确拼写是 {currentWord.normalized}。这个词会再回来找你一次。</p>
          )}
          {answerState === 'correct' && (
            <p className="mt-3 text-sm text-emerald-600">✓ 正确</p>
          )}
        </div>
      )}

      {answerState !== 'idle' && (
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={next}>
            {cursor + 1 >= queue.length ? '完成' : '下一题'}
          </Button>
        </div>
      )}
    </div>
  );
}
