import { useMemo, useRef, useState } from 'react';
import { tokenize } from '@/lib/highlight';
import { WordTooltip } from './WordTooltip';
import type { Article, Word } from '@/types/domain';

interface Props {
  article: Article;
  words: Word[];
  onPick?: (normalized: string) => void;
}

export function ArticleView({ article, words, onPick }: Props) {
  const vocabSet = useMemo(() => {
    const s = new Set<string>();
    for (const w of words) s.add(w.normalized);
    return s;
  }, [words]);

  const tokens = useMemo(() => tokenize(article.article, vocabSet), [article.article, vocabSet]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  const activeIdx = pinnedIdx ?? hoverIdx;

  // 单词 span refs（用于碰撞检测）
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);

  return (
    <article className="article-prose">
      {tokens.map((tk, i) => {
        if (tk.kind === 'sep') return <span key={i}>{tk.text}</span>;
        const cls = 'word-token ' + (tk.isKnown ? 'is-known' : 'is-new');
        const isActive = activeIdx === i;
        return (
          <span
            key={i}
            ref={(el) => {
              wordRefs.current[i] = el;
            }}
            className={cls}
            data-word-idx={i}
            style={{ position: 'relative', display: 'inline-block' }}
            aria-describedby={isActive ? `tooltip-${tk.normalized}` : undefined}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
            onClick={() => {
              setPinnedIdx(i);
              onPick?.(tk.normalized);
            }}
          >
            {tk.text}
            {isActive && (
              <WordTooltip
                word={tk.text}
                normalized={tk.normalized}
                isKnown={tk.isKnown}
                anchorRef={{
                  current: wordRefs.current[i] ?? null,
                }}
              />
            )}
          </span>
        );
      })}
    </article>
  );
}
