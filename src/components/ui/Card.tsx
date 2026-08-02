// 卡片容器：elevated（默认）/ outlined / ghost
import type { HTMLAttributes, ReactNode } from 'react';

type Variant = 'elevated' | 'outlined' | 'ghost';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: Variant;
  hoverable?: boolean;
  as?: 'div' | 'section' | 'article' | 'aside';
}

const variantMap: Record<Variant, string> = {
  elevated: 'bg-paper shadow-card border border-transparent',
  outlined: 'bg-paper border border-ink-200',
  ghost: 'bg-transparent border border-transparent',
};

export function Card({
  children,
  className = '',
  variant = 'elevated',
  hoverable = false,
  as: As = 'div',
  ...rest
}: CardProps) {
  return (
    <As
      {...rest}
      className={
        'card-base p-5 transition-shadow duration-200 ' +
        variantMap[variant] + ' ' +
        (hoverable ? 'hover:shadow-card-hover cursor-pointer' : '') +
        ' ' +
        className
      }
    >
      {children}
    </As>
  );
}
