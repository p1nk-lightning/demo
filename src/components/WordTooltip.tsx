// 单词气泡：120ms 防抖 + 简单碰撞检测（左/右/上/下四向）
import { useEffect, useRef, useState } from 'react';
import { lookupDict } from '@/lib/dict';
import { Badge } from './ui/Badge';
import type { DictEntry } from '@/types/domain';

interface Props {
  word: string;
  normalized: string;
  isKnown: boolean;
  /** 父容器的 anchored span DOM（用于碰撞检测） */
  anchorRef?: React.RefObject<HTMLSpanElement | null>;
}

const DEBOUNCE_MS = 120;

function useTooltipPosition(anchor: React.RefObject<HTMLSpanElement | null>) {
  const [pos, setPos] = useState<{
    placement: 'bottom' | 'top' | 'right' | 'left';
  }>({ placement: 'bottom' });

  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const onMeas = () => {
      const r = el.getBoundingClientRect();
      const W = window.innerWidth;
      const H = window.innerHeight;
      // 256px 宽 + 估算高度，简化判断
      const TW = 256;
      const TH = 96;
      const fitsBottom = r.bottom + TH + 8 < H;
      const fitsTop = r.top - TH - 8 > 0;
      const fitsRight = r.right + TW + 8 < W;
      const fitsLeft = r.left - TW - 8 > 0;
      if (!fitsBottom && fitsTop) setPos({ placement: 'top' });
      else if (!fitsRight && fitsLeft) setPos({ placement: 'left' });
      else if (!fitsLeft && fitsRight) setPos({ placement: 'right' });
      else setPos({ placement: 'bottom' });
    };
    onMeas();
    window.addEventListener('resize', onMeas);
    window.addEventListener('scroll', onMeas, true);
    return () => {
      window.removeEventListener('resize', onMeas);
      window.removeEventListener('scroll', onMeas, true);
    };
  }, [anchor]);

  return pos;
}

export function WordTooltip({ word, normalized, isKnown, anchorRef }: Props) {
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const fallbackAnchor = useRef<HTMLSpanElement | null>(null);
  const anchor = anchorRef ?? fallbackAnchor;
  const { placement } = useTooltipPosition(anchor);

  useEffect(() => {
    let aborted = false;
    const ctl = new AbortController();
    setLoading(true);
    const t = window.setTimeout(() => {
      (async () => {
        try {
          const e = await lookupDict(normalized, ctl.signal);
          if (!aborted) {
            setEntry(e);
            setLoading(false);
          }
        } catch {
          if (!aborted) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      aborted = true;
      ctl.abort();
      window.clearTimeout(t);
    };
  }, [normalized]);

  const placementClasses =
    placement === 'bottom'
      ? 'left-0 top-full mt-1.5'
      : placement === 'top'
      ? 'left-0 bottom-full mb-1.5'
      : placement === 'left'
      ? 'right-full top-0 mr-1.5'
      : 'left-full top-0 ml-1.5';

  return (
    <span
      ref={tooltipRef}
      role="tooltip"
      id={`tooltip-${normalized}`}
      className={
        'pointer-events-none absolute z-50 inline-block w-64 rounded-xl border border-ink-200 bg-paper p-3 text-left text-sm shadow-soft ' +
        placementClasses
      }
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className="text-base font-semibold text-ink-900"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          {word}
        </span>
        <Badge variant={isKnown ? 'success' : 'brand'} size="sm">
          {isKnown ? '✓ 已掌握' : '✦ 新词'}
        </Badge>
      </div>
      {entry?.phonetic && (
        <div className="text-xs text-ink-500">{entry.phonetic}</div>
      )}
      {entry && (
        <div className="mt-1 text-ink-700">
          {entry.partOfSpeech && (
            <i className="mr-1 text-ink-400">{entry.partOfSpeech}.</i>
          )}
          {entry.meaningCN}
        </div>
      )}
      {!entry && loading && (
        <div className="mt-1 text-xs text-ink-400">查询中…</div>
      )}
    </span>
  );
}
