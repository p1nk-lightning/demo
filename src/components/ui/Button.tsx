// UI 原子按钮：LingVo.club 风格（pill 圆角 + 含箭头 slot）
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  /** LingVo 风格：在 children 后追加 `>` 箭头图标 */
  trailing?: ReactNode;
}

const sizeMap: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

const variantMap: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 border border-transparent',
  secondary:
    'bg-paper text-ink-900 hover:bg-ink-50 border border-ink-200',
  ghost:
    'bg-transparent text-ink-700 hover:bg-ink-100 border border-transparent',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 border border-transparent',
};

export function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  trailing,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={
        'btn-base ' +
        sizeMap[size] + ' ' +
        variantMap[variant] + ' ' +
        (fullWidth ? 'w-full' : '') +
        ' ' +
        className
      }
    >
      {loading && (
        <span
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      )}
      {children}
      {trailing && <span aria-hidden>{trailing}</span>}
    </button>
  );
}