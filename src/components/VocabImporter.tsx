import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import {
  parseTXT,
  parseXLSX,
  summarizeParse,
  type ParseResult,
} from '@/lib/vocab';
import { Badge, Button, Card, EmptyState, Steps, Tabs } from '@/components/ui';
import type { Difficulty, Word } from '@/types/domain';

type Tab = 'txt' | 'xlsx';
type Step = 'input' | 'preview';

interface Props {
  defaultDifficulty?: Difficulty;
}

export function VocabImporter({ defaultDifficulty }: Props) {
  const navigate = useNavigate();
  const importVocab = useAppStore((s) => s.importVocab);
  const toast = useAppStore((s) => s.toast);
  const difficulty = useAppStore((s) => s.difficulty);

  const [tab, setTab] = useState<Tab>('txt');
  const [txt, setTxt] = useState('');
  const [fileName, setFileName] = useState<string>('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [step, setStep] = useState<Step>('input');
  const [working, setWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // TXT：实时解析（去掉"解析预览"按钮）
  const liveTXTResult = useMemo(() => {
    if (tab !== 'txt' || !txt.trim()) return null;
    return parseTXT(txt);
  }, [tab, txt]);

  const currentResult = tab === 'txt' ? liveTXTResult : result;

  async function handleXlsx(file: File) {
    setWorking(true);
    try {
      const r = await parseXLSX(file);
      setResult(r);
      setFileName(file.name);
    } finally {
      setWorking(false);
    }
  }

  function goPreview() {
    if (!currentResult || currentResult.words.length === 0) return;
    if (tab === 'txt') setResult(liveTXTResult);
    setStep('preview');
  }

  function goBackToInput() {
    setStep('input');
  }

  async function handleConfirm() {
    if (!currentResult || currentResult.words.length === 0) return;
    try {
      await importVocab(currentResult.words, defaultDifficulty ?? difficulty);
      toast(`已保存 ${currentResult.words.length} 个词`, 'success');
      navigate('/');
    } catch (err: any) {
      toast(err?.message || '入库失败', 'error');
    }
  }

  const summary = currentResult ? summarizeParse(currentResult) : null;
  const stepIdx = step === 'input' ? 0 : 1;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-900">词表导入</h2>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-ink-500 hover:text-ink-900"
        >
          ← 返回首页
        </button>
      </div>

      <div className="mb-5">
        <Steps
          items={[
            { label: '输入', description: '粘贴或上传' },
            { label: '预览', description: '确认入库' },
          ]}
          current={stepIdx}
        />
      </div>

      {step === 'input' && (
        <>
          <div className="mb-4">
            <Tabs<Tab>
              items={[
                { label: 'TXT 粘贴', value: 'txt' },
                { label: 'Excel 上传', value: 'xlsx' },
              ]}
              value={tab}
              onChange={(v) => {
                setTab(v);
                setResult(null);
                setFileName('');
              }}
            />
          </div>

          {tab === 'txt' ? (
            <textarea
              value={txt}
              onChange={(e) => setTxt(e.target.value)}
              placeholder={
                '每行一个词，空格或逗号分隔也行\ne.g.\nanalyze\ndata\npattern\n...'
              }
              className="h-56 w-full rounded-xl border border-ink-200 bg-canvas p-3 font-mono text-sm focus:border-brand-500 focus:outline-none"
            />
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleXlsx(f);
                }}
                className="hidden"
              />
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleXlsx(f);
                }}
                className="flex h-44 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink-200 bg-canvas text-sm text-ink-500 hover:border-brand-500 hover:text-brand-600"
              >
                {working ? (
                  <span>正在解析…</span>
                ) : fileName ? (
                  <span>已选择：{fileName}</span>
                ) : (
                  <>
                    <span className="text-3xl">📂</span>
                    <span className="mt-2">点击或拖拽 .xlsx / .xls / .csv</span>
                  </>
                )}
              </div>
            </>
          )}

          {summary && summary.total > 0 && (
            <div className="mt-4 rounded-xl bg-ink-50 p-3 text-sm text-ink-700">
              已识别 <b className="text-ink-900 num">{summary.total}</b> 个词 ·
              跳过 <b className="text-ink-900 num">{summary.rejected}</b> 个无效 ·
              去重 <b className="text-ink-900 num">{summary.duplicates}</b> 个重复
            </div>
          )}

          {tab === 'txt' && txt.trim() && summary?.total === 0 && (
            <div className="mt-4">
              <EmptyState
                icon="🔍"
                title="未识别到有效单词"
                description="请确认每行一个英文单词，或用空格 / 逗号分隔。"
              />
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate('/')}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={goPreview}
              disabled={!currentResult || currentResult.words.length === 0}
              trailing="›"
            >
              下一步
            </Button>
          </div>
        </>
      )}

      {step === 'preview' && currentResult && (
        <>
          <p className="mb-3 text-sm text-ink-600">
            总计 <b className="text-ink-900 num">{currentResult.words.length}</b>{' '}
            词 · 粘贴{' '}
            <b className="text-ink-900 num">
              {currentResult.words.filter((w) => w.source === 'pasted').length}
            </b>{' '}
            · Excel{' '}
            <b className="text-ink-900 num">
              {currentResult.words.filter((w) => w.source === 'xlsx').length}
            </b>
          </p>
          <div className="max-h-96 overflow-auto rounded-xl border border-ink-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper/80 backdrop-blur text-ink-600">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">原词</th>
                  <th className="px-3 py-2 text-left">归一化</th>
                  <th className="px-3 py-2 text-left">来源</th>
                </tr>
              </thead>
              <tbody>
                {currentResult.words.map((w: Word, i) => (
                  <tr key={w.normalized} className="odd:bg-paper even:bg-ink-50">
                    <td className="px-3 py-1.5 text-ink-400 num">{i + 1}</td>
                    <td className="px-3 py-1.5 text-ink-900">{w.text}</td>
                    <td className="px-3 py-1.5 font-mono text-ink-700">
                      {w.normalized}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge
                        variant={w.source === 'pasted' ? 'warning' : 'info'}
                        size="sm"
                      >
                        {w.source}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={goBackToInput}>
              ← 返回
            </Button>
            <Button variant="primary" onClick={handleConfirm} trailing="›">
              ✓ 确认入库
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
