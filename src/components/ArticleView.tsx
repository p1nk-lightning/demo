import { useEffect, useMemo, useRef, useState } from 'react';
import { tokenize } from '@/lib/highlight';
import { WordTooltip } from './WordTooltip';
import type { Article, Word } from '@/types/domain';

interface Props {
  article: Article;
  words: Word[];
  onPick?: (normalized: string) => void;
  highlightKnown?: boolean;
  highlightNew?: boolean;
}

export function ArticleView({ article, words, onPick, highlightKnown = true, highlightNew = true }: Props) {
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

  useEffect(() => {
    function closePinnedTooltip(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('.word-token')) return;
      setPinnedIdx(null);
      setHoverIdx(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPinnedIdx(null);
        setHoverIdx(null);
      }
    }
    document.addEventListener('pointerdown', closePinnedTooltip);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closePinnedTooltip);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <article className="article-prose">
      {tokens.map((tk, i) => {
        if (tk.kind === 'sep') return <span key={i}>{tk.text}</span>;
        const highlighted = tk.isKnown ? highlightKnown : highlightNew;
        const cls = 'word-token ' + (highlighted ? (tk.isKnown ? 'is-known' : 'is-new') : '');
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
