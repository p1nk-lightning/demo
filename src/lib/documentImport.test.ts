import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractVocabularyFile } from './documentImport';

// tesseract 内部的异步错误在 jsdom 下不可控,mock 掉以确定性测试我们的包装逻辑
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => {
    throw new Error('Error attempting to read image.');
  }),
}));

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => consoleError.mockClear());

function makeFile(name: string, sizeBytes: number, type = ''): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

describe('extractVocabularyFile 错误路径(AC-016,V4 欠账)', () => {
  it('rejects oversized PDF with actionable copy before any parsing', async () => {
    const file = makeFile('big.pdf', 21 * 1024 * 1024, 'application/pdf');
    await expect(extractVocabularyFile(file)).rejects.toThrow('PDF 不能超过 20 MB');
  });

  it('rejects unsupported format with supported-list copy', async () => {
    const file = makeFile('notes.docx', 1000);
    await expect(extractVocabularyFile(file)).rejects.toThrow('仅支持 XLSX、CSV、PDF、JPG、PNG 和 WebP 文件');
  });

  it('rejects corrupted PDF with unified copy instead of raw pdfjs error', async () => {
    // 真 File 但内容是垃圾字节 → pdfjs 抛原始错误 → 应被转换为统一中文提示
    const bytes = new Uint8Array(2048);
    bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34], 0); // %PDF-1.4 头后跟垃圾
    const file = new File([bytes], 'broken.pdf', { type: 'application/pdf' });
    await expect(extractVocabularyFile(file)).rejects.toThrow('文件已损坏或无法读取 — 请确认 PDF 有效后重试');
  });

  it('rejects corrupted image with unified copy instead of raw tesseract error', async () => {
    const bytes = new Uint8Array(512);
    const file = new File([bytes], 'blank.jpg', { type: 'image/jpeg' });
    await expect(extractVocabularyFile(file)).rejects.toThrow('图片无法识别 — 请确认图片清晰且包含英文文本后重试');
  });
});
