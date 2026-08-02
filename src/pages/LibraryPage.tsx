import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronRight,
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
  setWordMastery,
} from '@/lib/db';
import type { VocabularyItem, VocabularyList } from '@/types/domain';

export function LibraryPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<VocabularyList[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  async function refreshLists(preferredId?: string) {
    const next = await listVocabularyLists();
    setLists(next);
    const target = preferredId || selectedId || next[0]?.id || '';
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
        <button onClick={() => navigate('/library/import')} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus size={17} /> 新建单词表
        </button>
      </div>

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
                <button
                  key={list.id}
                  onClick={() => setSelectedId(list.id)}
                  className={`w-full rounded-lg border p-4 text-left transition-all ${active ? 'border-brand-200 bg-brand-50' : 'border-ink-200 bg-white hover:border-brand-200'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong className="line-clamp-1 text-sm text-ink-900">{list.name}</strong>
                    <ChevronRight size={16} className={active ? 'text-brand-600' : 'text-ink-300'} />
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-ink-400">
                    <span>{list.wordCount} 词</span><span>·</span><span>{list.difficulty}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${list.wordCount ? (list.masteredCount / list.wordCount) * 100 : 0}%` }} />
                  </div>
                </button>
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
                <div className="flex gap-2">
                  <button onClick={handleRename} title="重命名" className="icon-button"><Pencil size={17} /></button>
                  <button onClick={handleDelete} title="删除" className="icon-button text-red-500 hover:border-red-200 hover:bg-red-50"><Trash2 size={17} /></button>
                </div>
              </div>

              <label className="relative mb-4 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索这个单词表" className="field-control pl-10" />
              </label>

              <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
                <div className="grid grid-cols-[1fr_auto] border-b border-ink-200 bg-ink-50 px-4 py-3 text-xs font-semibold text-ink-400">
                  <span>单词</span><span>掌握状态</span>
                </div>
                <div className="max-h-[520px] divide-y divide-ink-100 overflow-auto">
                  {visibleItems.map((item) => (
                    <div key={item.id} className="grid min-h-14 grid-cols-[1fr_auto] items-center px-4 hover:bg-ink-50">
                      <div><strong className="font-medium text-ink-900">{item.text}</strong><span className="ml-3 text-xs text-ink-400">{item.source}</span></div>
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
    </div>
  );
}
