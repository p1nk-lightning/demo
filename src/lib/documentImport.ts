import type { ParseResult } from './vocab';
import { isPlausibleWord, normalizeWord, parseTXT, parseXLSX } from './vocab';
import type { Word, WordSource } from '@/types/domain';

const PDF_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PDF_MAX_PAGES = 50;

export interface DocumentImportProgress {
  stage: 'extracting' | 'ocr';
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (progress: DocumentImportProgress) => void;

function withSource(result: ParseResult, source: WordSource): ParseResult {
  return { ...result, words: result.words.map((word) => ({ ...word, source })) };
}

function parseExtractedVocabulary(text: string, source: 'pdf' | 'image'): ParseResult {
  const candidates: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:\d+[.)、]|[-*•])\s*/, '').trim();
    if (!line) continue;
    const tokens = line.match(/[A-Za-z][A-Za-z'-]{0,39}/g) ?? [];
    if (!tokens.length) continue;
    const firstToken = tokens[0];
    if (!firstToken) continue;
    const looksLikeEntry = /[\u3400-\u9fff\t:：]/u.test(line) || /\s{2,}/.test(line);
    if (looksLikeEntry) candidates.push(firstToken);
    else if (tokens.length <= 6) candidates.push(...tokens);
  }

  const parsed = parseTXT(candidates.join('\n'));
  return withSource(parsed, source);
}

async function createEnglishOcrWorker(onProgress?: ProgressCallback) {
  const { createWorker } = await import('tesseract.js');
  return createWorker('eng', 1, {
    logger(message) {
      if (message.status !== 'recognizing text') return;
      onProgress?.({
        stage: 'ocr',
        current: Math.round((message.progress ?? 0) * 100),
        total: 100,
        message: `正在识别文字 ${Math.round((message.progress ?? 0) * 100)}%`,
      });
    },
  });
}

async function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法转换 PDF 页面')), 'image/png');
  });
}

async function extractPdf(file: File, onProgress?: ProgressCallback): Promise<ParseResult> {
  if (file.size > PDF_MAX_BYTES) throw new Error('PDF 不能超过 20 MB');
  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const pdfDocument = await getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdfDocument.numPages > PDF_MAX_PAGES) {
    await pdfDocument.destroy();
    throw new Error('PDF 最多支持 50 页');
  }

  const chunks: string[] = [];
  let ocrWorker: Awaited<ReturnType<typeof createEnglishOcrWorker>> | null = null;
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      onProgress?.({ stage: 'extracting', current: pageNumber, total: pdfDocument.numPages, message: `正在读取第 ${pageNumber}/${pdfDocument.numPages} 页` });
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => 'str' in item ? item.str : '').join('\n').trim();
      const plausibleCount = pageText.match(/[A-Za-z][A-Za-z'-]{1,39}/g)?.length ?? 0;

      if (plausibleCount >= 3) {
        chunks.push(pageText);
      } else {
        ocrWorker ??= await createEnglishOcrWorker(onProgress);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('浏览器无法创建 OCR 画布');
        await page.render({ canvasContext: context, viewport }).promise;
        const result = await ocrWorker.recognize(await canvasBlob(canvas));
        chunks.push(result.data.text);
      }
      page.cleanup();
    }
  } finally {
    await ocrWorker?.terminate();
    await pdfDocument.destroy();
  }
  return parseExtractedVocabulary(chunks.join('\n'), 'pdf');
}

async function extractImage(file: File, onProgress?: ProgressCallback): Promise<ParseResult> {
  if (file.size > IMAGE_MAX_BYTES) throw new Error('图片不能超过 10 MB');
  const worker = await createEnglishOcrWorker(onProgress);
  try {
    const result = await worker.recognize(file);
    return parseExtractedVocabulary(result.data.text, 'image');
  } finally {
    await worker.terminate();
  }
}

export async function extractVocabularyFile(file: File, onProgress?: ProgressCallback): Promise<ParseResult> {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') return parseXLSX(file);
  if (extension === 'pdf' || file.type === 'application/pdf') return extractPdf(file, onProgress);
  if (['jpg', 'jpeg', 'png', 'webp'].includes(extension ?? '') || file.type.startsWith('image/')) return extractImage(file, onProgress);
  throw new Error('仅支持 XLSX、CSV、PDF、JPG、PNG 和 WebP 文件');
}

export function editableWords(values: string[], source: WordSource): Word[] {
  const seen = new Set<string>();
  return values.flatMap((value, index) => {
    const normalized = normalizeWord(value);
    if (!isPlausibleWord(normalized) || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ text: value.trim(), normalized, source, addedAt: Date.now() + index }];
  });
}
