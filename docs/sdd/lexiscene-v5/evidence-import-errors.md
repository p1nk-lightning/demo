# 导入错误路径验证记录(AC-016 · V4 欠账补验)

日期:2026-09-01 · 方式:单测(`src/lib/documentImport.test.ts`)+ 代码审阅 · 实现改造:`extractVocabularyFile`/`extractPdf`/`extractImage`

## 四类边界的实际提示文案(均已有,且经单测断言)

| 边界 | 触发 | 实际文案 | 验证 |
|---|---|---|---|
| 超大文件 | PDF > 20 MB | `PDF 不能超过 20 MB` | 单测 ✓ |
| 不支持格式 | docx 等未支持扩展名 | `仅支持 XLSX、CSV、PDF、JPG、PNG 和 WebP 文件` | 单测 ✓ |
| 损坏文件 | 垃圾字节的 .pdf / .jpg | `文件已损坏或无法读取 — 请确认 PDF 有效后重试` / `图片无法识别 — 请确认图片清晰且包含英文文本后重试`(原先裸抛 pdfjs/tesseract 英文错误,本轮改造) | 单测 ✓(tesseract 以 mock 注入固定错误) |
| 空结果 | 解析成功但 0 词(空白文件/无英文内容) | `没有从文件中识别到任何单词 — 请确认文件内容包含英文单词。`(本轮新增,统一覆盖所有来源) | 实现层面覆盖;CSV 空文件路径可复测 |

页数上限(PDF > 50 页 → `PDF 最多支持 50 页`)同样在保护范围内,不因统一包装而丢失。

## 页面行为

- 两个导入页(`DocumentImportPage`/`ImportPage`)均以 try/catch 捕获并把 `error.message` 落到现有错误提示组件,不白屏、不崩溃(与 AC-007 的 ErrorBoundary 互为双保险)。

## 遗留说明

- 空白图片的**真实 OCR 路径**(tesseract 在真实浏览器里跑)未在 jsdom 单测覆盖——单测以固定错误 mock 验证包装逻辑;真实浏览器冒烟归 T19 E2E 与批 5 手工验收。
