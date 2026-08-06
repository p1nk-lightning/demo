// 词表解析: TXT 粘贴 + Excel .xlsx 上传
// BR-01 归一化: 小写、去前后空白、去前后标点
// BR-02 去重: 同一归一化词仅保留一次, 来源标注

import { readSheet } from 'read-excel-file/browser';
import type { Word } from '@/types/domain';

export function normalizeWord(raw: string): string {
  if (!raw) return '';
  let s = String(raw).trim();
  // 去常见引号/括号
  s = s.replace(/^["'`(\[\{]+|["'`)\]\}]+$/g, '');
  // 去音标 e.g. /ənˈæl.aɪz/ -> 保留段
  if (s.startsWith('/') && s.endsWith('/')) s = s.slice(1, -1);
  // 去尾部标点
  s = s.replace(/[\s.,;:!?…，。；：！？]+$/g, '');
  // 小写
  s = s.toLowerCase();
  // 仍有空白则取第一个 token
  if (/\s/.test(s)) s = s.split(/\s+/)[0];
  return s;
}

// 判断是否一个"像单词"的字符串
const WORD_RE = /^[a-z][a-z'\-]*[a-z]$|^[a-z]$/;
export function isPlausibleWord(s: string): boolean {
  return WORD_RE.test(s) && s.length <= 40;
}

export interface ParseResult {
  words: Word[];
  raw: string[]; // 归一化前的原词
  rejected: string[]; // 被识别为非单词的输入
  duplicates: number; // 被去重掉的输入数
}

/** TXT 解析: 支持换行/空格/逗号/制表符 */
export function parseTXT(input: string): ParseResult {
  const tokens = input
    .split(/[\s,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const map = new Map<string, Word>();
  const rejected: string[] = [];
  let duplicates = 0;

  for (const t of tokens) {
    const n = normalizeWord(t);
    if (!n) {
      rejected.push(t);
      continue;
    }
    if (!isPlausibleWord(n)) {
      rejected.push(t);
      continue;
    }
    if (map.has(n)) {
      duplicates++;
      continue;
    }
    map.set(n, {
      text: t.trim().replace(/[\.,;:!?…，。；：！？]+$/g, ''),
      normalized: n,
      source: 'pasted',
      addedAt: Date.now() + map.size, // 保证有序
    });
  }

  return {
    words: Array.from(map.values()),
    raw: tokens,
    rejected,
    duplicates,
  };
}

/** Excel 解析: 取第一个 sheet 的第一列非空值 */
export async function parseXLSX(file: File): Promise<ParseResult> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const parsed = parseTXT(await file.text());
    return {
      ...parsed,
      words: parsed.words.map((word) => ({ ...word, source: 'xlsx' as const })),
    };
  }

  const rows = await readSheet(file);

  const map = new Map<string, Word>();
  const raw: string[] = [];
  const rejected: string[] = [];
  let duplicates = 0;
  let startedHeader = false;

  for (const row of rows) {
    for (const cell of row) {
      if (cell == null) continue;
      const s = String(cell ?? '').trim();
      if (!s) continue;

      // 跳过表头: 第一行若 cell 中含有常见中文表头, 视为表头
      if (!startedHeader) {
        if (/[一-龥]/.test(s) && /词|单|word|vocab|list/i.test(s)) continue;
        startedHeader = true;
      }

      const n = normalizeWord(s);
      raw.push(s);
      if (!n || !isPlausibleWord(n)) {
        rejected.push(s);
        continue;
      }
      if (map.has(n)) {
        duplicates++;
        continue;
      }
      map.set(n, {
        text: s.replace(/[\.,;:!?…，。；：！？]+$/g, ''),
        normalized: n,
        source: 'xlsx',
        addedAt: Date.now() + map.size,
      });
    }
  }
  // 兜底: 万一表头全跳了导致第一个词丢了, 退回到纯文本解析
  if (map.size === 0 && raw.length > 0) {
    const fb = parseTXT(raw.join('\n'));
    return {
      ...fb,
      words: fb.words.map((word) => ({ ...word, source: 'xlsx' as const })),
    };
  }

  return { words: Array.from(map.values()), raw, rejected, duplicates };
}

export function summarizeParse(r: ParseResult) {
  const pasteCnt = r.words.filter((w) => w.source === 'pasted').length;
  const xlsxCnt = r.words.filter((w) => w.source === 'xlsx').length;
  return {
    total: r.words.length,
    pasteCnt,
    xlsxCnt,
    rejected: r.rejected.length,
    duplicates: r.duplicates,
  };
}
