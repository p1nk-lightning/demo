// 步骤指示器：药丸形进度（lingvo.club 风）
interface StepItem {
  label: string;
  description?: string;
}

interface StepsProps {
  items: StepItem[];
  current: number; // 0-based
  className?: string;
}

export function Steps({ items, current, className = '' }: StepsProps) {
  return (
    <ol
      className={'flex items-center gap-2 ' + className}
      aria-label="步骤进度"
    >
      {items.map((it, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={i} className="flex items-center gap-2 flex-1 last:flex-none">
            <div
              className={
                'flex items-center gap-2 rounded-full px-3 py-1 transition-colors ' +
                (active
                  ? 'bg-brand-600 text-white'
                  : done
                  ? 'bg-accent-500 text-white'
                  : 'bg-ink-100 text-ink-500')
              }
            >
              <span
                className={
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ' +
                  (active || done ? 'bg-white/20' : 'bg-ink-200')
                }
              >
                {done ? '✓' : i + 1}
              </span>
              <span className="text-xs font-medium">{it.label}</span>
            </div>
            {i < items.length - 1 && (
              <div
                className={
                  'h-px flex-1 ' +
                  (done ? 'bg-accent-500' : 'bg-ink-200')
                }
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
