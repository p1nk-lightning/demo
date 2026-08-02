// 下划线指示器风格的 Tabs
import type { ReactNode } from 'react';

interface TabItem<T extends string> {
  label: ReactNode;
  value: T;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className = '',
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={'flex border-b border-ink-200 ' + className}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.value)}
            className={
              'relative -mb-px px-4 py-2 text-sm font-medium transition-colors ' +
              (active
                ? 'text-brand-600'
                : 'text-ink-500 hover:text-ink-900')
            }
          >
            {it.label}
            <span
              className={
                'absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-colors ' +
                (active ? 'bg-brand-600' : 'bg-transparent')
              }
            />
          </button>
        );
      })}
    </div>
  );
}
