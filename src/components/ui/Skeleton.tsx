// 骨架屏：行级 / 卡片级 / 文本级
interface SkeletonProps {
  lines?: number;
  className?: string;
}

export function Skeleton({ lines = 3, className = '' }: SkeletonProps) {
  return (
    <div className={'animate-pulse space-y-2 ' + className}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={
            'h-3 rounded bg-ink-200 ' +
            (i === lines - 1 ? 'w-2/3' : 'w-full')
          }
        />
      ))}
    </div>
  );
}

// 卡片骨架（搭配 Card 使用）
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={
        'card-base p-5 animate-pulse space-y-3 ' + className
      }
      aria-hidden
    >
      <div className="h-4 w-1/3 rounded bg-ink-200" />
      <div className="h-8 w-1/2 rounded bg-ink-200" />
      <div className="h-3 w-full rounded bg-ink-200" />
      <div className="h-3 w-5/6 rounded bg-ink-200" />
    </div>
  );
}
