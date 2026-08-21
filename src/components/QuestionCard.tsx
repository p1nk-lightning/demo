import { ChevronLeft, ChevronRight, Languages } from 'lucide-react';
import type { Question } from '@/types/domain';

interface Props {
  question: Question;
  index: number;
  total: number;
  selected: number | null;
  onSelect: (value: number) => void;
  onPrev: () => void;
  onNext: () => void;
  translated?: boolean;
  onToggleTranslation?: () => void;
  revealed?: { answer: number; correct: boolean };
}

export function QuestionCard({
  question,
  index,
  total,
  selected,
  onSelect,
  onPrev,
  onNext,
  translated = false,
  onToggleTranslation,
  revealed,
}: Props) {
  const hasTranslation = Boolean(question.questionZh && question.optionsZh?.length === 4);

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between text-xs font-semibold text-ink-400">
        <span>阅读理解</span>
        <span className="flex items-center gap-3">
          {hasTranslation && onToggleTranslation && (
            <button
              type="button"
              onClick={onToggleTranslation}
              title={translated ? '隐藏中文翻译' : '显示中文翻译'}
              aria-label={translated ? '隐藏中文翻译' : '显示中文翻译'}
              aria-pressed={translated}
              className={`icon-button h-8 w-8 ${translated ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-500'}`}
            >
              <Languages size={16} />
            </button>
          )}
          <span className="num">{index + 1} / {total}</span>
        </span>
      </div>
      <h2 className="text-base font-semibold leading-7 text-ink-900">{question.question}</h2>
      {translated && question.questionZh && <p className="mt-1 text-sm leading-6 text-ink-500">{question.questionZh}</p>}
      <div className="mt-5 space-y-2">
        {question.options.map((option, optionIndex) => {
          const isSelected = selected === optionIndex;
          const isCorrect = revealed?.answer === optionIndex;
          const isUserWrong = Boolean(revealed && isSelected && !revealed.correct);
          const stateClass = revealed
            ? isCorrect
              ? 'border-emerald-300 bg-emerald-50'
              : isUserWrong
                ? 'border-red-300 bg-red-50'
                : 'border-ink-200'
            : isSelected
              ? 'border-brand-400 bg-brand-50'
              : 'border-ink-200 hover:border-brand-200 hover:bg-ink-50';

          return (
            <label key={optionIndex} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${stateClass}`}>
              <input type="radio" name={`q-${index}`} className="sr-only" checked={isSelected} onChange={() => onSelect(optionIndex)} disabled={Boolean(revealed)} />
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${isSelected ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'}`}>
                {String.fromCharCode(65 + optionIndex)}
              </span>
              <span className="min-w-0 pt-0.5 leading-5 text-ink-700">
                <span className="block">{option}</span>
                {translated && question.optionsZh?.[optionIndex] && <span className="mt-1 block text-xs leading-5 text-ink-400">{question.optionsZh[optionIndex]}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
        <button onClick={onPrev} disabled={index === 0} title="上一题" className="icon-button border-transparent bg-transparent disabled:opacity-30"><ChevronLeft size={18} /></button>
        <div className="flex gap-1.5" aria-label={`第 ${index + 1} 题，共 ${total} 题`}>
          {Array.from({ length: total }, (_, dot) => <span key={dot} className={`h-1.5 rounded-full transition-all ${dot === index ? 'w-5 bg-brand-600' : 'w-1.5 bg-ink-200'}`} />)}
        </div>
        <button onClick={onNext} disabled={index === total - 1} title="下一题" className="icon-button border-transparent bg-transparent disabled:opacity-30"><ChevronRight size={18} /></button>
      </div>
    </section>
  );
}
