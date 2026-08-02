import type { Question } from '@/types/domain';

interface Props {
  question: Question;
  index: number;          // 0..4
  total: number;
  selected: number | null;
  onSelect: (v: number) => void;
  onPrev: () => void;
  onNext: () => void;
  revealed?: { answer: number; correct: boolean };
}

export function QuestionCard(props: Props) {
  const { question, index, total, selected, onSelect, onPrev, onNext, revealed } = props;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm text-slate-500">
        📝 题目 {index + 1} / {total}
      </div>
      <div className="mb-3 text-base text-slate-900">{question.question}</div>
      <div className="space-y-2">
        {question.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = revealed?.answer === i;
          const isUserWrong = revealed && isSelected && !revealed.correct;
          return (
            <label
              key={i}
              className={
                'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ' +
                (revealed
                  ? isCorrect
                    ? 'border-emerald-500 bg-emerald-50'
                    : isUserWrong
                    ? 'border-red-400 bg-red-50'
                    : 'border-slate-200'
                  : isSelected
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-slate-200 hover:border-slate-300')
              }
            >
              <input
                type="radio"
                name={`q-${index}`}
                className="mt-0.5"
                checked={isSelected}
                onChange={() => onSelect(i)}
                disabled={!!revealed}
              />
              <span>
                <span className="mr-1 font-medium text-slate-500">
                  {String.fromCharCode(65 + i)}.
                </span>
                {opt}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={onPrev}
          disabled={index === 0}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
        >
          ← 上一题
        </button>
        <div className="text-xs text-slate-500">
          ✓ 进度 {Array.from({ length: total }, (_, i) => (selected != null ? '●' : '○')).join(' ')}
        </div>
        <button
          onClick={onNext}
          disabled={index === total - 1}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
        >
          下一题 →
        </button>
      </div>
    </div>
  );
}
