// 词典路由:单词查询与批量查询(自 index.ts 纯移动)。
import { Hono } from 'hono';
import { DictionaryBatchSchema } from '../schemas';
import type { Env } from '../types';
import { dictionaryItem, normalizeDictionaryWord } from '../lib/content-store';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/dictionary', async (context) => {
  const word = normalizeDictionaryWord(context.req.query('word') || '');
  if (!word) return context.json({ items: [] });
  if (!context.env.DB) return context.json({ items: [], source: 'fallback' });
  try {
    const exact = await context.env.DB.prepare(
      'SELECT d.id AS dictionary_id, d.name AS dictionary_name, e.headword, e.phonetic, e.part_of_speech, e.definition_en, e.definition_zh, e.example_en, e.difficulty, e.frequency_rank FROM dictionary_entries e JOIN dictionaries d ON d.id = e.dictionary_id WHERE e.normalized = ? ORDER BY d.priority ASC LIMIT 8',
    ).bind(word).all();
    let rows = exact.results;
    if (!rows.length) {
      const matched = await context.env.DB.prepare(
        'SELECT d.id AS dictionary_id, d.name AS dictionary_name, e.headword, e.phonetic, e.part_of_speech, e.definition_en, e.definition_zh, e.example_en, e.difficulty, e.frequency_rank FROM dictionary_forms f JOIN dictionary_entries e ON e.dictionary_id = f.dictionary_id AND e.normalized = f.lemma_normalized JOIN dictionaries d ON d.id = e.dictionary_id WHERE f.normalized = ? ORDER BY d.priority ASC, e.frequency_rank ASC LIMIT 8',
      ).bind(word).all();
      rows = matched.results;
    }
    return context.json({
      items: rows.map((row) => dictionaryItem(row as Record<string, unknown>)),
      source: 'builtin',
    });
  } catch {
    return context.json({ items: [], source: 'fallback' });
  }
});

app.post('/api/dictionary/batch', async (context) => {
  if (!context.env.DB) return context.json({ items: [], source: 'fallback' });
  const parsed = DictionaryBatchSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: '批量查词参数不正确' }, 400);
  const words = Array.from(new Set(parsed.data.words.map(normalizeDictionaryWord).filter(Boolean)));
  if (!words.length) return context.json({ items: [], source: 'builtin' });
  try {
    const placeholders = words.map(() => '?').join(',');
    const exact = await context.env.DB.prepare(
      `SELECT e.normalized AS lookup_word, d.id AS dictionary_id, d.name AS dictionary_name, e.headword, e.phonetic, e.part_of_speech, e.definition_en, e.definition_zh, e.example_en, e.difficulty, e.frequency_rank FROM dictionary_entries e JOIN dictionaries d ON d.id = e.dictionary_id WHERE e.normalized IN (${placeholders}) ORDER BY d.priority ASC, e.frequency_rank ASC`,
    ).bind(...words).all();
    const exactByWord = new Map<string, Record<string, unknown>>();
    for (const row of exact.results) {
      const key = String(row.lookup_word);
      if (!exactByWord.has(key)) exactByWord.set(key, row as Record<string, unknown>);
    }
    const missing = words.filter((word) => !exactByWord.has(word));
    const formByWord = new Map<string, Record<string, unknown>>();
    if (missing.length) {
      const formPlaceholders = missing.map(() => '?').join(',');
      const forms = await context.env.DB.prepare(
        `SELECT f.normalized AS lookup_word, d.id AS dictionary_id, d.name AS dictionary_name, e.headword, e.phonetic, e.part_of_speech, e.definition_en, e.definition_zh, e.example_en, e.difficulty, e.frequency_rank FROM dictionary_forms f JOIN dictionary_entries e ON e.dictionary_id = f.dictionary_id AND e.normalized = f.lemma_normalized JOIN dictionaries d ON d.id = e.dictionary_id WHERE f.normalized IN (${formPlaceholders}) ORDER BY d.priority ASC, e.frequency_rank ASC`,
      ).bind(...missing).all();
      for (const row of forms.results) {
        const key = String(row.lookup_word);
        if (!formByWord.has(key)) formByWord.set(key, row as Record<string, unknown>);
      }
    }
    return context.json({
      items: words.map((word) => ({ query: word, entry: dictionaryItem(exactByWord.get(word) ?? formByWord.get(word) ?? {}) })).filter((item) => item.entry.word),
      source: 'builtin',
    });
  } catch {
    return context.json({ items: [], source: 'fallback' });
  }
});

export default app;
