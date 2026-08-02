// 词典查询 + localStorage LRU 500
// BR-07: 同一单词的翻译查询结果本地缓存

import type { DictEntry } from '@/types/domain';

const LS_DICT_PREFIX = 'dict:';
const LRU_MAX = 500;

function lsKey(word: string) {
  return LS_DICT_PREFIX + word.toLowerCase();
}

function loadLru(): string[] {
  try {
    const raw = localStorage.getItem('dict:lru');
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveLru(arr: string[]) {
  try {
    localStorage.setItem('dict:lru', JSON.stringify(arr.slice(-LRU_MAX)));
  } catch {}
}

function touchKey(word: string) {
  const list = loadLru().filter((w) => w !== word);
  list.push(word);
  // 超出 LRU_MAX 则淘汰最早
  while (list.length > LRU_MAX) {
    const drop = list.shift();
    if (drop) {
      try {
        localStorage.removeItem(LS_DICT_PREFIX + drop);
      } catch {}
    }
  }
  saveLru(list);
}

/** 在客户端已经拿到 LRU 命中时使用 */
export function getCachedDict(word: string): DictEntry | undefined {
  try {
    const raw = localStorage.getItem(lsKey(word));
    if (!raw) return undefined;
    const e = JSON.parse(raw) as DictEntry;
    touchKey(word);
    return e;
  } catch {
    return undefined;
  }
}

export function setCachedDict(e: DictEntry) {
  try {
    localStorage.setItem(lsKey(e.word), JSON.stringify(e));
    touchKey(e.word);
  } catch {}
}

// 请求免费词典 API
async function fetchFromApi(word: string, signal?: AbortSignal): Promise<DictEntry | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data: any = await res.json();
    const first = Array.isArray(data) ? data[0] : data;
    if (!first) return null;
    const phonetic = first.phonetic ?? first.phonetics?.find?.((p: any) => p?.text)?.text;
    let pos = '';
    let meaningCN = '';
    const meanings: any[] = first.meanings ?? [];
    for (const m of meanings) {
      if (!pos && m.partOfSpeech) pos = m.partOfSpeech;
      const defs: any[] = m.definitions ?? [];
      for (const d of defs) {
        if (d.definition && !meaningCN) {
          meaningCN = String(d.definition).slice(0, 120);
          break;
        }
      }
      if (meaningCN) break;
    }
    if (!meaningCN) return null;
    return {
      word,
      phonetic,
      partOfSpeech: pos,
      meaningCN,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/** 查询词典: LRU 优先, 未命中走网络 */
export async function lookupDict(word: string, signal?: AbortSignal): Promise<DictEntry> {
  const cached = getCachedDict(word);
  if (cached) return cached;
  const e = await fetchFromApi(word, signal);
  if (e) {
    setCachedDict(e);
    return e;
  }
  // 失败兜底: 给一条基础占位, 仍写入 LRU 避免反复请求
  const fallback: DictEntry = {
    word,
    meaningCN: '（暂无释义，可稍后再试）',
    fetchedAt: Date.now(),
  };
  setCachedDict(fallback);
  return fallback;
}
