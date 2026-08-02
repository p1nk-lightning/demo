import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { createVocabularyList } from '@/lib/db';
import { parseTXT, parseXLSX, summarizeParse, type ParseResult } from '@/lib/vocab';
import type { Difficulty } from '@/types/domain';

const DIFFICULTIES: Difficulty[] = ['CET4', 'CET6', '考研', '雅思', '托福'];

export function ImportPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('CET4');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileResult, setFileResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);

  const textResult = useMemo(() => text.trim() ? parseTXT(text) : null, [text]);
  const result = mode === 'text' ? textResult : fileResult;
  const summary = result ? summarizeParse(result) : null;

  async function parseFile(file: File) {
    setFileName(file.name);
    setFileResult(await parseXLSX(file));
    if (!name) setName(file.name.replace(/\.(xlsx?|csv)$/i, ''));
  }

  async function save() {
    if (!result?.words.length) return;
    setSaving(true);
    const list = await createVocabularyList(name, difficulty, result.words);
    navigate(`/library?list=${list.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8 lg:py-10">
      <button onClick={() => navigate('/library')} className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-ink-900"><ArrowLeft size={17} /> 返回单词表</button>
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-brand-700">Import vocabulary</p>
        <h1 className="font-display text-4xl font-medium text-ink-950">创建新的单词表</h1>
        <p className="mt-3 text-ink-500">每次导入都会独立保存，之后可以随时合并或删除。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="rounded-lg border border-ink-200 bg-white p-5 sm:p-6">
          <div className="mb-5 flex gap-1 border-b border-ink-200">
            {([['text', '粘贴文本'], ['file', '上传文件']] as const).map(([value, label]) => (
              <button key={value} onClick={() => setMode(value)} className={`relative px-4 pb-3 text-sm font-semibold ${mode === value ? 'text-brand-700' : 'text-ink-400'}`}>
                {label}{mode === value && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-600" />}
              </button>
            ))}
          </div>

          {mode === 'text' ? (
            <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-72 w-full resize-y rounded-lg border border-ink-200 bg-ink-50 p-4 font-mono text-sm leading-7 outline-none transition-colors focus:border-brand-400 focus:bg-white" placeholder={'每行一个单词，也支持逗号分隔\nanalyze\ncontext\nreconstruct'} />
          ) : (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) parseFile(file); }} />
              <button onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) parseFile(file); }} className="flex min-h-72 w-full flex-col items-center justify-center rounded-lg border border-dashed border-brand-200 bg-brand-50 px-6 text-center hover:border-brand-400">
                <UploadCloud size={31} className="text-brand-600" />
                <strong className="mt-4 text-sm">点击选择或拖入文件</strong>
                <span className="mt-2 text-xs text-ink-400">支持 .xlsx 和 .csv</span>
                {fileName && <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-ink-600"><FileSpreadsheet size={14} />{fileName}</span>}
              </button>
            </>
          )}
        </section>

        <aside className="space-y-5">
          <label className="block"><span className="field-label">单词表名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：雅思核心词汇" className="field-control" /></label>
          <label className="block"><span className="field-label">目标难度</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} className="field-control">{DIFFICULTIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="rounded-lg bg-ink-100 p-4 text-sm text-ink-500">
            <strong className="block text-ink-800">导入预览</strong>
            <div className="mt-3 space-y-2 text-xs">
              <p className="flex justify-between"><span>有效单词</span><b>{summary?.total ?? 0}</b></p>
              <p className="flex justify-between"><span>重复跳过</span><b>{summary?.duplicates ?? 0}</b></p>
              <p className="flex justify-between"><span>无效内容</span><b>{summary?.rejected ?? 0}</b></p>
            </div>
          </div>
          <button onClick={save} disabled={!result?.words.length || saving} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? '正在保存…' : `创建单词表${summary?.total ? ` · ${summary.total} 词` : ''}`}
          </button>
        </aside>
      </div>
    </div>
  );
}
