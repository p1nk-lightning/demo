# LexiScene V4 开发日志

## 2026-08-11

### 本次完成

1. 建立 `V4_DEVELOPMENT_PLAN.md`，记录产品决策、数据契约、实现顺序、验收标准和本版本不做的事项。
2. 扩展词汇导入：
   - 支持 XLSX、XLS、CSV、PDF、JPG、PNG、WebP。
   - 文本型 PDF 先使用 `pdfjs-dist` 提取文字。
   - 扫描型 PDF 页面和图片使用 `tesseract.js` 英文 OCR。
   - PDF 限制 20 MB、50 页；图片限制 10 MB。
   - 原文件只在浏览器内处理，不上传 Worker 或 D1。
   - 保存前展示候选单词，支持全选、取消、编辑和删除。
   - 识别结果标记来源为 `pdf` 或 `image`，沿用现有同步数据结构。
3. 统一新生成文章的题目格式：
   - 题干和四个选项固定为英文。
   - `questionZh`、`optionsZh` 预生成中文翻译，页面按题目或全部切换显示。
   - `evidence` 保存正文中的精确证据句，用于质量校验。
   - 答题结果页也支持显示/隐藏中文翻译。
4. 加强用户私有文章快速生成：
   - 强制文章难度、题目数量、英文正文、段落、词数、目标词命中、题目去重和证据存在性校验。
   - 失败时最多进行一次局部修复；仍失败则不计入成功额度。
   - 模型请求增加 60 秒超时。
5. 加强公共文章池：
   - 批量生成脚本不再要求中文题目。
   - 生成前校验不同难度的词数、平均句长、段落、英文标题/正文、英文选项、中文翻译、选项去重和证据句。
   - 管理端 AI 预审保存总分、五项分项分数、逐题答案/证据检查、事实核查、版权风险、自动返修次数和程序校验问题。
   - AI 可对可修问题最多自动返修两次，仍保留人工确认发布。
   - Worker 禁止未通过 AI 审核的候选文章直接进入文章池，也禁止从候选状态直接发布。
6. 新增 `worker/scripts/upgrade-content-questions.mjs`：只重生成 D1 中现有文章的题目、翻译和证据，不改文章正文和标题。
7. 本地离线五篇示例文章已改为英文题干和选项，并补充了翻译及证据。

### 验证结果

- 前端 `tsc -b`：通过。
- 前端 `vite build`：通过。
- Worker `tsc --noEmit`：通过。
- `generate-content-pool.mjs`：语法检查通过。
- `upgrade-content-questions.mjs`：语法检查通过。
- `git diff --check`：通过。
- 浏览器文本导入：重复词和无效内容统计正确，候选词可编辑、多选。
- 浏览器图片 OCR：识别 `analyze`、`context`、`reconstruct`、`evidence` 成功。
- 浏览器 PDF 文本提取：识别上述 4 个单词成功。
- 390px 移动端：未发现横向溢出。

### 尚未执行的生产操作

本次没有自动修改云端 D1、没有消耗 DeepSeek 额度、没有部署 Worker，也没有提交或推送 Git。原因是这些操作会产生外部副作用，需要在确认内容和密钥配置后由开发者手动执行。

升级云端已有文章题目的推荐命令：

```powershell
cd E:\demo\readai\v2\worker
npm run upgrade:questions:remote -- --status=candidate --limit=200
```

确认候选文章全部完成题目升级后，再在管理员页面逐篇点击 AI 预审；通过后点击“加入文章池”，然后选择日期发布。批量生成新文章使用：

```powershell
cd E:\demo\readai\v2\worker
npm run seed:content-pool -- --remote --count=100 --replace-candidates
```

`--replace-candidates` 只替换候选状态，不会删除已经进入文章池、已发布或已归档的文章。生产执行前请确认 `worker/.dev.vars` 或 Worker Secret 中配置了 `DEEPSEEK_GENERATION_API_KEY`，并且不要把 `.dev.vars`、`.env`、临时文件和构建产物提交到 Git。

### 已知取舍

- OCR 只加载英文语言包，复杂排版、手写体和低清图片可能需要用户在候选词预览中修正。
- AI 事实核查是风险提示，不等同于人工查证；来源链接和 AI 报告仍需管理员查看。
- 文章封面继续使用来源主题的公共图片 URL，未把图片文件写入 D1 或 Worker。
- `pdfjs-dist` 和 `tesseract.js` 会增加按需加载资源体积，但没有进入首页首屏包。
- npm 安全审计仍报告依赖树存在漏洞；本次未执行自动升级，避免引入无关版本变更。

## 下一次开发建议

1. 在测试环境先跑 `upgrade:questions`，抽样检查不同难度的题目和证据，再执行 `--remote`。
2. 逐批运行内容 AI 预审，不要一次性把未经人工抽查的文章全部发布。
3. 将内容生成和题目升级命令纳入受控的 Cloudflare Cron/CI 流程，并保留失败批次日志。
4. 为 PDF/OCR 增加真实教材样本测试，以及对超限文件、空白图片和损坏 PDF 的错误测试。
