// 空状态：图标 + 标题 + 描述 + CTA
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={
        'flex flex-col items-center justify-center text-center py-10 px-4 ' +
        className
      }
    >
      <div className="text-5xl mb-3" aria-hidden>
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && (
        <p className="text-sm text-ink-500 mt-1 max-w-md">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
