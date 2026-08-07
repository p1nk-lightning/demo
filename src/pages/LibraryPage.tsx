import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  GitMerge,
  LibraryBig,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  deleteVocabularyList,
  getVocabularyItems,
  listVocabularyLists,
  renameVocabularyList,
  mergeVocabularyLists,
  setWordMastery,
} from '@/lib/db';
import { lookupDictMany } from '@/lib/dict';
import type { Difficulty, DictEntry, VocabularyItem, VocabularyList } from '@/types/domain';

const DIFFICULTIES: Difficulty[] = ['CET4', 'CET6', '考研', '雅思', '托福'];

export function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lists, setLists] = useState<VocabularyList[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [meanings, setMeanings] = useState<Record<string, DictEntry>>({});
  const [meaningLoading, setMeaningLoading] = useState<Set<string>>(new Set());
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeName, setMergeName] = useState('');
  const [mergeDifficulty, setMergeDifficulty] = useState<Difficulty>('CET4');
  const [mergeSaving, setMergeSaving] = useState(false);

  async function refreshLists(preferredId?: string) {
    const next = await listVocabularyLists();
    setLists(next);
    const requestedId = searchParams.get('list') || '';
    const target = preferredId || (next.some((list) => list.id === requestedId) ? requestedId : '') || selectedId || next[0]?.id || '';
    setSelectedId(target);
    setLoading(false);
  }

  useEffect(() => {
    refreshLists();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setItems([]);
      return;
    }
    getVocabularyItems(selectedId).then(setItems);
  }, [selectedId]);

  const selected = lists.find((list) => list.id === selectedId);
  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => item.normalized.includes(keyword));
  }, [items, query]);

  async function handleRename() {
    if (!selected) return;
    const name = window.prompt('新的单词表名称', selected.name)?.trim();
    if (!name || name === selected.name) return;
    await renameVocabularyList(selected.id, name);
    await refreshLists(selected.id);
  }

  async function handleDelete() {
    if (!selected || !window.confirm(`确定删除“${selected.name}”吗？此操作不可撤销。`)) return;
    await deleteVocabularyList(selected.id);
    setSelectedId('');
    await refreshLists();
  }

  async function toggleMastery(item: VocabularyItem) {
    await setWordMastery(item.id, !item.mastered);
    setItems((current) => current.map((word) => word.id === item.id ? { ...word, mastered: !word.mastered } : word));
    await refreshLists(selectedId);
  }

  function selectList(id: string) {
    setSelectedId(id);
    setSearchParams({ list: id }, { replace: true });
    setRevealedIds(new Set());
  }

  async function loadMeanings(targetItems: VocabularyItem[]) {
    const pending = targetItems.filter((item) => !meanings[item.id]);
    if (!pending.length) return;
    setMeaningLoading((current) => new Set([...current, ...pending.map((item) => item.id)]));
    const entries = await lookupDictMany(pending.map((item) => item.normalized));
    setMeanings((current) => {
      const next = { ...current };
      for (const item of pending) {
        const entry = entries.get(item.normalized);
        if (entry) next[item.id] = { ...entry, queriedWord: item.normalized };
      }
      return next;
    });
    setMeaningLoading((current) => {
      const next = new Set(current);
      pending.forEach((item) => next.delete(item.id));
      return next;
    });
  }

  async function toggleMeaning(item: VocabularyItem) {
    if (revealedIds.has(item.id)) {
      setRevealedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      return;
    }
    setRevealedIds((current) => new Set(current).add(item.id));
    await loadMeanings([item]);
  }

  async function toggleAllMeanings() {
    if (revealedIds.size === items.length && items.length > 0) {
      setRevealedIds(new Set());
      return;
    }
    setRevealedIds(new Set(items.map((item) => item.id)));
    await loadMeanings(items);
  }

  function toggleMergeSelection(id: string) {
    setMergeSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleMerge() {
    if (mergeSelection.size < 2 || !mergeName.trim()) return;
    setMergeSaving(true);
    const merged = await mergeVocabularyLists(Array.from(mergeSelection), mergeName, mergeDifficulty);
    setMergeSaving(false);
    if (!merged) return;
    setMergeDialogOpen(false);
    setMergeMode(false);
    setMergeSelection(new Set());
    await refreshLists(merged.id);
    navigate(`/library?list=${merged.id}`);
  }

  if (loading) {
    return <div className="mx-auto max-w-7xl px-5 py-10 text-sm text-ink-400 lg:px-8">正在读取本地单词表…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-sm font-semibold text-brand-700">Vocabulary library</p>
          <h1 className="font-display text-4xl font-medium text-ink-950">我的单词表</h1>
          <p className="mt-3 text-ink-500">每次导入都保留为独立单词表，旧记录不会被覆盖。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setMergeMode((current) => !current); setMergeSelection(new Set()); }} className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold ${mergeMode ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:border-brand-200'}`}>
            <GitMerge size={17} /> {mergeMode ? '退出合并' : '合并词表'}
          </button>
          <button onClick={() => navigate('/library/import')} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus size={17} /> 新建单词表
          </button>
        </div>
      </div>

      {mergeMode && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <span>已选择 {mergeSelection.size} 个单词表</span>
          <button type="button" disabled={mergeSelection.size < 2} onClick={() => { setMergeName(''); setMergeDifficulty('CET4'); setMergeDialogOpen(true); }} className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
            <GitMerge size={15} /> 创建合并词表
          </button>
        </div>
      )}

      {lists.length === 0 ? (
        <section className="rounded-lg border border-brand-100 bg-brand-50 px-6 py-16 text-center">
          <LibraryBig className="mx-auto text-brand-500" size={34} />
          <h2 className="mt-5 text-xl font-bold">从第一个单词表开始</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-500">粘贴文本或上传 Excel，词境会自动清理、去重并保存导入历史。</p>
          <button onClick={() => navigate('/library/import')} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-ink-950 px-5 text-sm font-semibold text-white hover:bg-brand-700">
            导入单词 <ChevronRight size={17} />
          </button>
        </section>
      ) : (
        <div className="grid gap-7 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-2">
            {lists.map((list) => {
              const active = list.id === selectedId;
              return (
                <div
                  key={list.id}
                  className={`w-full rounded-lg border p-4 text-left transition-all ${active ? 'border-brand-200 bg-brand-50' : 'border-ink-200 bg-white hover:border-brand-200'}`}
                >
                  <button type="button" onClick={() => mergeMode ? toggleMergeSelection(list.id) : selectList(list.id)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <strong className="line-clamp-1 text-sm text-ink-900">{list.name}</strong>
                      {mergeMode ? (
                        <input aria-label={`选择${list.name}`} type="checkbox" checked={mergeSelection.has(list.id)} onChange={() => toggleMergeSelection(list.id)} onClick={(event) => event.stopPropagation()} className="mt-0.5 h-4 w-4 accent-brand-600" />
                      ) : <ChevronRight size={16} className={active ? 'text-brand-600' : 'text-ink-300'} />}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-ink-400">
                      <span>{list.wordCount} 词</span><span>·</span><span>{list.difficulty}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${list.wordCount ? (list.masteredCount / list.wordCount) * 100 : 0}%` }} />
                    </div>
                  </button>
                </div>
              );
            })}
          </aside>

          {selected && (
            <section>
              <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold">{selected.name}</h2>
                    <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-500">{selected.difficulty}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-400">已掌握 {selected.masteredCount} / {selected.wordCount}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => void toggleAllMeanings()} title={revealedIds.size === items.length && items.length > 0 ? '隐藏全部释义' : '显示全部释义'} className="inline-flex h-9 items-center gap-2 rounded-full border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-600 hover:border-brand-200 hover:text-brand-700">
                    {revealedIds.size === items.length && items.length > 0 ? <EyeOff size={15} /> : <Eye size={15} />}
                    {revealedIds.size === items.length && items.length > 0 ? '隐藏释义' : '显示释义'}
                  </button>
                  <button onClick={handleRename} title="重命名" className="icon-button"><Pencil size={17} /></button>
                  <button onClick={handleDelete} title="删除" className="icon-button text-red-500 hover:border-red-200 hover:bg-red-50"><Trash2 size={17} /></button>
                </div>
              </div>

              <label className="relative mb-4 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索这个单词表" className="field-control pl-10" />
              </label>

              <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
                <div className="grid grid-cols-[1fr_auto_auto] border-b border-ink-200 bg-ink-50 px-4 py-3 text-xs font-semibold text-ink-400">
                  <span>单词</span><span>释义</span><span>掌握状态</span>
                </div>
                <div className="max-h-[520px] divide-y divide-ink-100 overflow-auto">
                  {visibleItems.map((item) => (
                    <div key={item.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2 hover:bg-ink-50">
                      <div className="min-w-0">
                        <div><strong className="font-medium text-ink-900">{item.text}</strong><span className="ml-3 text-xs text-ink-400">{item.source}</span></div>
                        {revealedIds.has(item.id) && (
                          <div className="mt-1 text-xs leading-5 text-ink-500">
                            {meaningLoading.has(item.id) ? '正在查询释义...' : meanings[item.id] ? (
                              <>
                                {meanings[item.id].word !== item.normalized && <span className="mr-2 text-brand-700">原形 {meanings[item.id].word}</span>}
                                {meanings[item.id].partOfSpeech && <i className="mr-1 text-ink-400">{meanings[item.id].partOfSpeech}.</i>}
                                {meanings[item.id].meaningCN}
                              </>
                            ) : '暂时没有找到释义'}
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => void toggleMeaning(item)} title={revealedIds.has(item.id) ? '隐藏释义' : '显示释义'} aria-label={revealedIds.has(item.id) ? '隐藏释义' : '显示释义'} className="icon-button h-8 w-8">
                        {revealedIds.has(item.id) ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button onClick={() => toggleMastery(item)} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${item.mastered ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-500 hover:bg-brand-50 hover:text-brand-700'}`}>
                        {item.mastered && <Check size={14} />}{item.mastered ? '已掌握' : '未掌握'}
                      </button>
                    </div>
                  ))}
                  {!visibleItems.length && <p className="p-8 text-center text-sm text-ink-400">没有找到匹配的单词</p>}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {mergeDialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 px-5" role="presentation" onMouseDown={() => setMergeDialogOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="merge-vocab-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-6 shadow-soft">
            <h2 id="merge-vocab-title" className="text-xl font-bold text-ink-950">创建合并词表</h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">原来的词表会保留，重复单词只保留一份。</p>
            <label className="mt-5 block"><span className="field-label">新词表名称</span><input autoFocus value={mergeName} onChange={(event) => setMergeName(event.target.value)} className="field-control" placeholder="例如：我的核心词汇" /></label>
            <label className="mt-4 block"><span className="field-label">目标难度</span><select value={mergeDifficulty} onChange={(event) => setMergeDifficulty(event.target.value as Difficulty)} className="field-control">{DIFFICULTIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setMergeDialogOpen(false)} className="inline-flex h-10 items-center rounded-full border border-ink-200 px-4 text-sm font-semibold text-ink-600">取消</button><button type="button" disabled={!mergeName.trim() || mergeSaving} onClick={() => void handleMerge()} className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"><GitMerge size={15} />{mergeSaving ? '正在合并...' : '确认合并'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
