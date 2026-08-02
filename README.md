# Readai / 词遇读 · v1.0

> 基于用户自有词库的英语阅读巩固训练工具。
> "无账号 · 无云端 · 数据本地化 · 一键 AI 生成阅读题"

**当前版本**：v1.0（已锁定）— 详见 `Prd.md`
**最后更新**：2026-08-02
**状态**：✅ v1.0 MVP 功能全部落地 ✅ PR #1 UI 优化完成 ✅ 视觉对齐 LingVo.club 风格

---

## 一、项目定位

中国英语学习者（CET-4 / 6 / 考研 / 雅思 / 托福）的**自用工具**，核心差异：

- **基于自己的词表**：导入你背过的词 → AI 生成一篇 280-340 词的文章 → 阅读 → 答题 → 评分
- **数据本地化**：全部存在浏览器 IndexedDB，**无服务器账号、无云端同步**
- **隐私优先**：登录态 = 不存在
- **冷启动即可用**：浏览器一开就跑，不依赖用户填写

---

## 二、技术栈

| 层 | 选型 | 用途 |
|---|---|---|
| 前端框架 | **Vite 5 + React 18 + TypeScript 5** | SPA |
| 路由 | `react-router-dom` v6（HashRouter） | 静态托管友好 |
| 状态 | **Zustand** | 极简全局 store（无 Redux） |
| 数据校验 | **Zod** | 前后端共用 schema（两端各一份） |
| 本地存储 | `idb-keyval`（IndexedDB）+ `localStorage`（LRU 词典） | 无后端数据库 |
| Excel 解析 | `xlsx` (SheetJS) | 词表导入支持 .xlsx / .xls / .csv |
| 样式 | **Tailwind CSS v3** + 自定义 indigo 主题 | 原子化 + 视觉基线对齐 LingVo.club |
| 后端 BFF | **Cloudflare Workers** 单文件 + `wrangler` | 隐藏 LLM Key、限流、Zod 二次校验 |
| LLM | **DeepSeek** (主) + **Moonshot v1-8k** (备) | OpenAI 兼容协议；429/5xx 自动降级 |
| 词典 | `api.dictionaryapi.dev` | 免费无 Key 词典 API |

---

## 三、快速开始

### 3.1 环境要求

- **Node.js ≥ 18.19**（推荐 v20 LTS / v22+）
- npm 10+（或 pnpm / yarn）
- Chrome / Edge / Firefox 现代浏览器
- **可选**：Cloudflare 账号（部署 Worker 时需要）

### 3.2 首次克隆与安装

```bash
git clone <repo-url> readai-v1
cd readai-v1
npm install
```

前端依赖会装到根 `node_modules/`；Worker 依赖在子目录：

```bash
cd worker
npm install
cd ..
```

### 3.3 配置环境变量（可选，要跑 AI 生成才需要）

```bash
# 前端环境变量
cp .env.example .env

# Worker 环境变量（含真实 API Key，**不要提交**）
cp worker/.dev.vars.example worker/.dev.vars
# 然后编辑 worker/.dev.vars，填入：
#   DEEPSEEK_API_KEY=sk-xxxxxxxx
#   MOONSHOT_API_KEY=sk-xxxxxxxx
```

> 没有 API Key 也能跑——只是"开始生成"按钮会失败，前端 UI 仍然可用。

### 3.4 启动开发环境

**两个终端**（或双击 `启动开发环境.bat` 一键开两个窗口）：

**终端 A：Worker 后端**
```bash
npm run worker:dev
# → 监听 http://localhost:8787
# → 健康检查 http://localhost:8787/healthz
```

**终端 B：Vite 前端**
```bash
npm run dev
# → 监听 http://localhost:5173
```

浏览器打开 **http://localhost:5173** ✅

### 3.5 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动前端开发服务（HMR） |
| `npm run worker:dev` | 启动 Cloudflare Workers 本地模拟 |
| `npm run typecheck` | `tsc --noEmit`，0 错才算通过 |
| `npm run build` | `tsc -b && vite build` 出生产产物到 `dist/` |
| `npm run preview` | 本地预览生产产物（端口 4173） |
| `npm run worker:deploy` | 部署 Worker 到 Cloudflare（需先登录 `wrangler login`） |

### 3.6 仅看 UI（不接 LLM）

如果只想要纯前端体验：

```bash
npm run dev
# → 打开 http://localhost:5173
# 首页 / 词表 / 历史 / 设置 全可用
# 点"开始生成"会卡 10-30 秒后报错（因为 Worker 没起）
```

---

## 四、目录结构

```
E:\demo\readai\v1\
├── README.md                   ← 本文件
├── Prd.md                      ← v1.0 锁定的产品需求文档（31KB）
├── package.json                ← 前端依赖与脚本
├── vite.config.ts / tailwind.config.js / tsconfig*.json
├── index.html                  ← Vite 入口
├── 启动开发环境.bat             ← Windows 一键开两个终端
│
├── src/                        ← React 前端源码（约 22 个 TS/TSX 文件）
│   ├── main.tsx                ← ReactDOM 根
│   ├── App.tsx                 ← HashRouter + 4 路由
│   ├── index.css               ← Tailwind + .word-token / .article-prose
│   ├── types/domain.ts         ← 领域模型（与 Prd.md §5 一致）
│   ├── lib/                    ← 7 个工具模块
│   │   ├── schemas.ts          ← Zod schema（前端用）
│   │   ├── vocab.ts            ← TXT / xlsx 解析 + 归一化
│   │   ├── highlight.ts        ← 文章分词 + 词表命中标记
│   │   ├── storage.ts          ← idb-keyval 封装
│   │   ├── llm.ts              ← fetch /api/generate 封装
│   │   ├── dict.ts             ← 词典查询 + LRU 500
│   │   └── utils.ts            ← uid / debounce / sample / formatDateTime
│   ├── store/useAppStore.ts    ← Zustand 全局 store
│   ├── components/             ← 业务组件 + ui/ 原子件
│   │   ├── VocabImporter.tsx   ← 词表导入向导（2 步）
│   │   ├── DifficultyPicker.tsx← 5 档难度
│   │   ├── ArticleView.tsx     ← 文章渲染（单词 span + tooltip）
│   │   ├── WordTooltip.tsx     ← 词典气泡（120ms 防抖 + 碰撞检测）
│   │   ├── QuestionCard.tsx    ← 单题答题卡
│   │   └── ui/                 ← 9 个原子组件
│   │       ├── Button.tsx      ← 4 variant × 3 size + loading + trailing
│   │       ├── Card.tsx        ← 3 variant + hoverable
│   │       ├── Badge.tsx       ← 6 variant × 2 size
│   │       ├── EmptyState.tsx  ← icon + title + desc + action
│   │       ├── Skeleton.tsx    ← 行 / 卡骨架
│   │       ├── Spinner.tsx     ← 3 size
│   │       ├── Steps.tsx       ← 药丸形步骤指示
│   │       ├── Tabs.tsx        ← 下划线指示器
│   │       ├── Toast.tsx       ← 全局消息
│   │       └── index.ts        ← barrel export
│   └── pages/                  ← 4 个路由级页面
│       ├── HomePage.tsx        ← 首页 Dashboard（4 张任务卡）
│       ├── ReadingPage.tsx     ← 阅读 + 做题 + 评分
│       ├── HistoryPage.tsx     ← 历史记录列表
│       └── VocabPage.tsx       ← 词表导入页
│
└── worker/                     ← Cloudflare Workers BFF（独立子项目）
    ├── package.json            ← wrangler + workers-types
    ├── tsconfig.json
    ├── wrangler.toml           ← KV namespace 绑定（限流用）
    ├── .dev.vars.example       ← DEEPSEEK_API_KEY / MOONSHOT_API_KEY 样例
    └── src/index.ts            ← 单文件 BFF（约 270 行）
                                 ← 路由 + LLM + Zod + 重试 + 限流
```

代码体量：前端约 22 个 TS/TSX 文件，Worker 单文件 270 行；**单文件最大约 280 行**（ReadingPage.tsx），无巨型文件。

---

## 五、已完成功能（v1.0 MVP · 7 项核心 + 10 条业务规则）

| # | 功能 | 位置 |
|---|---|---|
| 1 | **词表导入**（TXT 粘贴 + xlsx 上传 + 2 步向导） | `pages/VocabPage.tsx` + `components/VocabImporter.tsx` + `lib/vocab.ts` |
| 2 | **难度选择**（5 档：CET-4 / CET-6 / 考研 / 雅思 / 托福） | `components/DifficultyPicker.tsx` |
| 3 | **AI 生成阅读题**（词抽样 + LLM + 命中数校验 + 重试 + 降级） | `lib/llm.ts` + `worker/src/index.ts` |
| 4 | **沉浸阅读视图**（单词高亮 + 词典 tooltip + 字号可调） | `components/ArticleView.tsx` + `WordTooltip.tsx` + `lib/highlight.ts` |
| 5 | **答题评分**（5 道必答 + 强制完整 + 评分展示） | `components/QuestionCard.tsx` + `pages/ReadingPage.tsx` |
| 6 | **历史记录**（按时间倒序 + 得分颜色编码） | `pages/HistoryPage.tsx` |
| 7 | **数据本地化**（IndexedDB 词表/文章/进度 + localStorage 词典 LRU） | `lib/storage.ts` + `lib/dict.ts` |

### 业务规则映射（PRD §4，10 条已落地）

| 规则 | 描述 | 实现位置 |
|---|---|---|
| BR-01 | 词表归一化（小写、去标点、去音标） | `lib/vocab.ts#normalizeWord` |
| BR-02 | 去重 + 来源标注 (`pasted` / `xlsx`) | `lib/vocab.ts#parseTXT/#parseXLSX` |
| BR-03 | 难度与词表解耦（独立选择） | `store/useAppStore.ts#difficulty` |
| BR-04 | 文章词频 ≥ 15（含重试） | `worker/src/index.ts#generateWithRetry` |
| BR-05 | LLM 输出 JSON 严格性 | `worker/src/index.ts` 的 `response_format: json_object` + Zod |
| BR-06 | 答题强制完整（不可提交未答完的卷） | `pages/ReadingPage.tsx#allAnswered` |
| BR-07 | 翻译缓存（LRU 500） | `lib/dict.ts` |
| BR-08 | API 速率限制（10/min, 100/day） | `worker/src/index.ts#checkRateLimit` (KV) + 前端 3s 防抖 |
| BR-09 | 隐私（无账号、无云端） | 全部 IndexedDB + localStorage |
| BR-10 | 错误兜底（前端 toast / Worker 兜底返回最后一次结果） | `lib/llm.ts` + Worker `firstSuccess` |

---

## 六、已完成的优化（PR #1）

1. **UI 原子库抽取** — 把 5+ 文件里重复的卡片 / 按钮 / chip / 步骤指示器统一到 `components/ui/`，新增 9 个原子组件
2. **修复高亮 bug** — 阅读页的 `is-new`（蓝色虚线）原来几乎永不触发；改为基于 `tk.isKnown` 判定，蓝色虚线现在真实标识"非词表词"
3. **tooltip 防抖 + 碰撞检测** — 加 120ms hover 防抖，避免快速划词触发 N 次请求；简单碰撞检测避免气泡溢出视口
4. **首页空状态 / 加载骨架** — 词表为空时显示空状态卡 + "立即导入"CTA；生成中显示 4 张灰卡骨架
5. **sessionStorage 反模式收尾** — `vocab:pending` 跨页通信改为 Zustand action `importVocab(words, difficulty)`
6. **字号持久化** — 阅读页 A-/A+ 字号写入 `localStorage` (`settings:fontSize`)，刷新仍保留
7. **视觉基线对齐 LingVo.club** — 主色改为 indigo 紫蓝 (`#4f46e5`)、pill 按钮加 `›` 箭头、淡蓝紫渐变 hero 区、卡片 hoverable 上浮

---

## 七、待优化（路线图 · 已知问题）

### 7.1 LLM 质量（PR #2 · 短期）

- `DIFFICULTY_PROMPT` 5 个难度共用一句话，重写为结构化（每档 80-150 字词汇范围 / 句法 / 话题）
- 拆 `generateOnce` 为两步：先生成文章、再生成题目，避免题目与正文脱节
- `countVocabHits` 用 split + Set 二次校验，处理复数 / 动名词
- Zod `ArticlePayloadSchema` 加强（article 280-2000 字、options distinct、answer 索引合法）
- 兜底：未达 15 词不再静默返回，改为前端 422 toast 提示"重试或换难度"

### 7.2 工程化（PR #3 · 中期）

- **测试**：零测试 → 装 vitest，先补 5 个核心单测（vocab 解析 / highlight 分词 / computeScore / countVocabHits / dict-LRU）
- **CI**：零 CI → `.github/workflows/ci.yml` 跑 `typecheck + lint + test + build`
- **性能**：xlsx 700KB 全量打入首屏 → `React.lazy` 拆 VocabImporter；`vite.config.ts` manualChunks
- **可观测性**：加 `react-error-boundary` 包 App；Worker 错误日志走 `wrangler tail`
- **Lint/Format**：零 ESLint → `eslint + prettier + lint-staged + husky`
- **CORS**：Worker 暂未加 CORS 头，部署到非 `localhost` 域名前端跨域会挂
- **Worker KV**：`wrangler.toml` 的 `REPLACE_WITH_REAL_KV_NAMESPACE_ID` 是占位符，首次 deploy 必炸

### 7.3 高级功能（PR #4+ · 长期）

- **暗色模式**（Tailwind `class` 模式 + toggle + localStorage）
- **生词本**（hover 词 → ⭐ 收藏 → 自动统计已掌握 / 似曾相识 / 生词）
- **复习曲线**（艾宾浩斯 1/3/7/14/30 天 push 复习）
- **AI 生成 streaming**（Worker 改 SSE，前端边渲染边填充）
- **移动端深度适配**（PRD V3.2 列入）
- **i18n**（目前单语中文，可考虑加英文 UI）

### 7.4 死代码 / 反模式

- `vocab:list:{id}` 写入但从未被读取（V2 复习模块预备接口）
- `tsconfig.tsbuildinfo / vite.config.js / vite.config.d.ts` 之前漏在 .gitignore（已在 .gitignore 里补）
- `idb-keyval` 的 `keys()` 是 N+1 读盘，50 篇历史 = 100 次 IO

### 7.5 不建议做

- ❌ Redux / RTK Query（Zustand 够用）
- ❌ react-window（当前文章 token 量不到虚拟列表阈值）
- ❌ 拆 monorepo（npm workspaces 思路已隔离）
- ❌ moment / dayjs（无日期处理需求）

---

## 八、关键文件引用（快速跳转）

| 关注点 | 文件 |
|---|---|
| 数据契约 | `src/types/domain.ts` |
| Zod 校验 | `src/lib/schemas.ts` + `worker/src/index.ts`（**两端各一份，待统一**） |
| LLM 调用 | `src/lib/llm.ts` + `worker/src/index.ts` |
| 词表解析 | `src/lib/vocab.ts` |
| 文章分词 | `src/lib/highlight.ts` |
| 词典 + LRU | `src/lib/dict.ts` |
| 持久化 | `src/lib/storage.ts` |
| 全局状态 | `src/store/useAppStore.ts` |
| 首页 | `src/pages/HomePage.tsx` |
| 阅读页 | `src/pages/ReadingPage.tsx` + `src/components/ArticleView.tsx` |
| 词表页 | `src/components/VocabImporter.tsx` |
| 历史页 | `src/pages/HistoryPage.tsx` |
| UI 原子库 | `src/components/ui/` |
| 视觉基线 | `tailwind.config.js` + `src/index.css` |
| PRD | `Prd.md` |

---

## 九、部署

### 前端

任意静态托管：

```bash
npm run build
# → dist/ 目录即生产产物
```

把 `dist/` 上传到 Cloudflare Pages / Vercel / Netlify / Nginx 都行。环境变量：

- `VITE_WORKER_URL` —— Worker 部署后的 URL（如 `https://readai-bff.你的子域名.workers.dev`）

### Worker

```bash
cd worker
# 首次：创建 KV namespace
wrangler kv:namespace create RL
# 把返回的 id 填到 wrangler.toml 的 REPLACE_WITH_REAL_KV_NAMESPACE_ID
# 然后：
wrangler secret put DEEPSEEK_API_KEY   # 交互式填入
wrangler secret put MOONSHOT_API_KEY
wrangler deploy
```

> 注意：未填 KV id / 未配 secret 时 deploy 会失败。

---

## 十、贡献者

自用项目（v1）。如果未来公开，欢迎 PR —— 但 v1 不接受破坏性改动；新功能请基于 PR #2+ 路线图。

---

## 十一、变更日志

| 日期 | 版本 | 变更 |
|---|---|---|
| 2025-07-30 | v1.0 PRD 锁定 | `Prd.md` |
| 2025-07-30 | v1.0 MVP 实现 | 7 项核心功能 + 10 条业务规则全部落地 |
| 2026-08-01 | v1.0 PR #1 | UI 原子库抽取 + 阅读页 bug 修复 + 视觉基线对齐 LingVo.club |
| 2026-08-02 | v1.0.1 | README + .gitignore 完善；准备 GitHub 首发 |

---

## 十二、License

MIT（如未来公开发布则改为 CC BY-NC / MIT；自用仓库默认 MIT）。