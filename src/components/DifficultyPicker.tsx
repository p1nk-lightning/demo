// 难度选择器：LingVo 风格（A1 / A2 / B1 / B2 等方形 chip + 紫色边框选中态）
import type { Difficulty } from '@/types/domain';

const ITEMS: { value: Difficulty; label: string; code: string }[] = [
  { value: 'CET4', label: '四级', code: 'CET-4' },
  { value: 'CET6', label: '六级', code: 'CET-6' },
  { value: '考研', label: '考研', code: '考研' },
  { value: '雅思', label: '雅思', code: 'IELTS' },
  { value: '托福', label: '托福', code: 'TOEFL' },
];

export function DifficultyPicker(props: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ITEMS.map((it) => {
        const active = props.value === it.value;
        return (
          <button
            key={it.value}
            onClick={() => props.onChange(it.value)}
            aria-pressed={active}
            className={
              'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ' +
              (active
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-ink-200 bg-paper text-ink-600 hover:border-brand-300 hover:text-brand-600')
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}