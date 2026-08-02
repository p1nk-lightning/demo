// 标签 / 状态徽章
import type { ReactNode } from 'react';

type Variant = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
type Size = 'sm' | 'md';

interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
}

const variantMap: Record<Variant, string> = {
  default: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-accent-50 text-accent-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-info-50 text-info-600',
};

const sizeMap: Record<Size, string> = {
  sm: 'text-[11px] px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={
        'chip-base ' + variantMap[variant] + ' ' + sizeMap[size] + ' ' + className
      }
    >
      {children}
    </span>
  );
}
