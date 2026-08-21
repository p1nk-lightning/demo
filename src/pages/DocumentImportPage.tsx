import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckSquare, FileImage, FileText, LoaderCircle, Square, Trash2, UploadCloud } from 'lucide-react';
import { createVocabularyList } from '@/lib/db';
import { editableWords, extractVocabularyFile, type DocumentImportProgress } from '@/lib/documentImport';
import { isPlausibleWord, normalizeWord, parseTXT, summarizeParse, type ParseResult } from '@/lib/vocab';
import type { Difficulty, Word } from '@/types/domain';

const DIFFICULTIES: Difficulty[] = ['CET4', 'CET6', '考研', '雅思', '托福'];
const FILE_ACCEPT = '.xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp';

function sourceLabel(source: Word['source']) {
  if (source === 'pdf') return 'PDF';
  if (source === 'image') return '图片 OCR';
  if (source === 'xlsx') return '表格';
  return '文本';
}

export function DocumentImportPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('CET4');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileResult, setFileResult] = useState<ParseResult | null>(null);
  const [candidates, setCandidates] = useState<Word[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<DocumentImportProgress | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const textResult = useMemo(() => text.trim() ? parseTXT(text) : null, [text]);
  const result = mode === 'text' ? textResult : fileResult;
  const summary = result ? summarizeParse(result) : null;
  const selectedWords = useMemo(
    () => candidates.filter((_, index) => selectedIndexes.has(index)),
    [candidates, selectedIndexes],
  );

  function loadCandidates(nextResult: ParseResult) {
    setCandidates(nextResult.words);
    setSelectedIndexes(new Set(nextResult.words.map((_, index) => index)));
  }

  async function parseFile(file: File) {
    setError('');
    setProgress({ stage: 'extracting', current: 0, total: 1, message: '正在准备文件...' });
    setFileName(file.name);
    setFileResult(null);
    setCandidates([]);
    try {
      const nextResult = await extractVocabularyFile(file, setProgress);
      setFileResult(nextResult);
      loadCandidates(nextResult);
      if (!name.trim()) setName(file.name.replace(/\.(xlsx?|csv|pdf|jpe?g|png|webp)$/i, ''));
      if (!nextResult.words.length) setError('未识别到可导入的英文单词，请尝试更清晰的文件或手动粘贴。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文件解析失败');
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function previewText() {
    if (!textResult) return;
    setError('');
    loadCandidates(textResult);
  }

  function toggleWord(index: number) {
    setSelectedIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function updateWord(index: number, value: string) {
    setCandidates((current) => current.map((word, wordIndex) => wordIndex === index
      ? { ...word, text: value, normalized: normalizeWord(value) }
      : word));
  }

  function removeWord(index: number) {
    setCandidates((current) => current.filter((_, wordIndex) => wordIndex !== index));
    setSelectedIndexes((current) => new Set([...current]
      .filter((selectedIndex) => selectedIndex !== index)
      .map((selectedIndex) => selectedIndex > index ? selectedIndex - 1 : selectedIndex)));
  }

  async function save() {
    const validWords = selectedWords.flatMap((original) => {
      const parsed = editableWords([original.text], original.source)[0];
      return parsed ? [{ ...parsed, source: original.source }] : [];
    });
    if (!validWords.length) {
      setError('请至少选择一个有效英文单词。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const list = await createVocabularyList(name, difficulty, validWords);
      navigate(`/library?list=${list.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存单词表失败');
    } finally {
      setSaving(false);
    }
  }

  const allSelected = candidates.length > 0 && selectedIndexes.size === candidates.length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8 lg:py-10">
      <button type="button" onClick={() => navigate('/library')} className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-ink-900"><ArrowLeft size={17} /> 返回单词表</button>
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-brand-700">Import vocabulary</p>
        <h1 className="font-display text-4xl font-medium text-ink-950">创建新的单词表</h1>
        <p className="mt-3 text-ink-500">支持粘贴文本、表格、PDF 和图片；文件只在当前浏览器中解析。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-ink-200 bg-white p-5 sm:p-6">
            <div className="mb-5 flex gap-1 border-b border-ink-200">
              {([['text', '粘贴文本'], ['file', '上传文件']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => { setMode(value); setError(''); setCandidates([]); setSelectedIndexes(new Set()); }} className={`relative px-4 pb-3 text-sm font-semibold ${mode === value ? 'text-brand-700' : 'text-ink-400'}`}>
                  {label}{mode === value && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-600" />}
                </button>
              ))}
            </div>

            {mode === 'text' ? (
              <div>
                <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-64 w-full resize-y rounded-lg border border-ink-200 bg-ink-50 p-4 font-mono text-sm leading-7 outline-none transition-colors focus:border-brand-400 focus:bg-white" placeholder={'每行一个单词，也支持空格或逗号分隔\nanalyze\ncontext\nreconstruct'} />
                <button type="button" onClick={previewText} disabled={!textResult?.words.length} className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">生成导入预览</button>
              </div>
            ) : (
              <>
                <input ref={fileRef} type="file" accept={FILE_ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseFile(file); }} />
                <button type="button" disabled={Boolean(progress)} onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file && !progress) void parseFile(file); }} className="flex min-h-64 w-full flex-col items-center justify-center rounded-lg border border-dashed border-brand-200 bg-brand-50 px-6 text-center hover:border-brand-400 disabled:cursor-wait">
                  {progress ? <LoaderCircle size={31} className="animate-spin text-brand-600" /> : <UploadCloud size={31} className="text-brand-600" />}
                  <strong className="mt-4 text-sm">{progress?.message ?? '点击选择或拖入文件'}</strong>
                  <span className="mt-2 text-xs text-ink-400">XLSX / CSV / PDF（20 MB、50 页以内）/ JPG / PNG / WebP（10 MB 以内）</span>
                  {fileName && <span className="mt-4 max-w-full truncate rounded-full bg-white px-3 py-1.5 text-xs text-ink-600">{fileName}</span>}
                </button>
              </>
            )}
            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          </section>

          {candidates.length > 0 && (
            <section className="rounded-lg border border-ink-200 bg-white p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-bold text-ink-900">确认候选词</h2><p className="mt-1 text-xs text-ink-400">已选择 {selectedWords.length} / {candidates.length} 个，可直接修改识别结果。</p></div>
                <button type="button" onClick={() => setSelectedIndexes(allSelected ? new Set() : new Set(candidates.map((_, index) => index)))} className="inline-flex h-9 items-center gap-2 rounded-full border border-ink-200 px-3 text-xs font-semibold text-ink-600 hover:border-brand-200 hover:text-brand-700">
                  {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}{allSelected ? '取消全选' : '全部选择'}
                </button>
              </div>
              <div className="max-h-[32rem] overflow-auto rounded-lg border border-ink-200">
                {candidates.map((word, index) => {
                  const valid = isPlausibleWord(normalizeWord(word.text));
                  return <div key={`${index}-${word.addedAt}`} className="grid grid-cols-[36px_minmax(0,1fr)_74px_36px] items-center gap-2 border-b border-ink-100 px-3 py-2 last:border-0">
                    <button type="button" onClick={() => toggleWord(index)} title={selectedIndexes.has(index) ? '取消选择' : '选择单词'} className="flex h-8 w-8 items-center justify-center text-brand-600">{selectedIndexes.has(index) ? <CheckSquare size={18} /> : <Square size={18} />}</button>
                    <input value={word.text} onChange={(event) => updateWord(index, event.target.value)} className={`min-w-0 rounded border px-2 py-1.5 text-sm outline-none ${valid ? 'border-transparent bg-ink-50 focus:border-brand-300' : 'border-red-300 bg-red-50 text-red-700'}`} aria-label={`候选词 ${index + 1}`} />
                    <span className="truncate text-xs text-ink-400" title={sourceLabel(word.source)}>{sourceLabel(word.source)}</span>
                    <button type="button" onClick={() => removeWord(index)} title="删除候选词" className="flex h-8 w-8 items-center justify-center text-ink-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </div>;
                })}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <label className="block"><span className="field-label">单词表名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：雅思核心词汇" className="field-control" /></label>
          <label className="block"><span className="field-label">目标难度</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} className="field-control">{DIFFICULTIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="rounded-lg bg-ink-100 p-4 text-sm text-ink-500">
            <strong className="block text-ink-800">导入预览</strong>
            <div className="mt-3 space-y-2 text-xs">
              <p className="flex justify-between"><span>识别候选</span><b>{summary?.total ?? 0}</b></p>
              <p className="flex justify-between"><span>当前选择</span><b>{selectedWords.length}</b></p>
              <p className="flex justify-between"><span>重复跳过</span><b>{summary?.duplicates ?? 0}</b></p>
              <p className="flex justify-between"><span>无效内容</span><b>{summary?.rejected ?? 0}</b></p>
            </div>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white p-4 text-xs leading-6 text-ink-500">
            <div className="flex items-center gap-2 font-semibold text-ink-700"><FileText size={15} /> PDF 文本优先</div>
            <div className="mt-1 flex items-center gap-2"><FileImage size={15} /> 扫描页和图片自动 OCR</div>
          </div>
          <button type="button" onClick={() => void save()} disabled={!selectedWords.length || saving || Boolean(progress)} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? '正在保存...' : `创建单词表${selectedWords.length ? ` · ${selectedWords.length} 词` : ''}`}
          </button>
        </aside>
      </div>
    </div>
  );
}
