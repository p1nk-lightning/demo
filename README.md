# LexiScene(词境阅读)· v5.0.0

> 让背过的词,在语境里真正留下来。
> Read words in context. Make them stay.

在真实语境中巩固用户词汇的英语阅读工具:导入你背过的词 → AI 用它们生成/挑选文章 → 划词查词典 → 做阅读题 → **词汇测验** → **学习看板**看见进步。本地优先(IndexedDB),登录后云同步。

**当前版本 5.0.0**(V5 审计加固轮:测试基建 / ErrorBoundary / 限流绑定 / 忘记密码 / 词汇测验 / 学习看板 / daily 单路径收敛 / 文档治理)。现行需求与技术方案见 [docs/sdd/lexiscene-v5/](docs/sdd/lexiscene-v5/);V1–V4 历史文档已归档至 [docs/history/](docs/history/)(其中 README 是归档索引),阅读分级标准(现行有效)在 [docs/standards/](docs/standards/)。

## 技术栈

- **前端**:Vite + React 18 + TypeScript + Tailwind + Zustand + Dexie(IndexedDB)+ recharts
- **后端**:Cloudflare Workers + Hono + D1(`lexiscene`,8 个迁移)+ 原生 Rate Limiting binding + Cron 每日文章轮换
- **服务**:Resend(邮件)/ Cloudflare Turnstile(人机验证)/ Vercel(前端托管,`/api/*` 同域代理到 Worker)
- **LLM**:DeepSeek(主)/ 千问 / 豆包(备),生成带确定性质量校验 + 一次修复重试
- **文档导入**:read-excel-file(.xlsx)+ PDF 文本提取 + Tesseract OCR(图片)

## 快速开始

```powershell
# 1. 安装依赖(根 + worker 两个包)
npm install; cd worker; npm install; cd ..

# 2. 配置环境变量
Copy-Item .env.example .env.local              # 前端:VITE_API_BASE_URL 等
Copy-Item worker\.dev.vars.example worker\.dev.vars   # Worker 密钥(DEEPSEEK_API_KEY 等)

# 3. 本地 D1 迁移
cd worker; npx wrangler d1 migrations apply lexiscene --local; cd ..

# 4. 起服务(两个终端)
npm run dev          # 前端 http://127.0.0.1:5173
npm run worker:dev   # Worker http://127.0.0.1:8787
```

一键脚本(Windows):`启动开发环境.bat`。查词典/读每日文章需要 Worker 在跑;未登录也可本地使用。

## 测试

```powershell
npm test                  # 前端单元测试(vitest + fake-indexeddb)
cd worker; npm test       # Worker 单元 + D1 集成测试(@cloudflare/vitest-plugin)
npx playwright test       # E2E 冒烟(e2e/,自动拉起双端)
```

## 部署与数据灌装

发布 runbook(盘点 → 全表备份 → 迁移 → 数据灌装 → 版本级部署)见 [docs/sdd/lexiscene-v5/plan.md](docs/sdd/lexiscene-v5/plan.md) "生产现状盘点"一节。要点:

```powershell
# Worker:确认并应用远程迁移
cd worker
npx wrangler d1 migrations list lexiscene --remote
npx wrangler d1 migrations apply lexiscene --remote
npm run worker:deploy

# 前端:Vercel 推送即部署;生产 /api/* 由 vercel.json 同域代理到 lexiscene-worker
```

### 内置词典(ECDICT,两个词典层合计 21,000 条)

```powershell
New-Item -ItemType Directory -Force tmp
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv" -OutFile "tmp\ecdict.csv"
cd worker
npx wrangler d1 migrations apply lexiscene --local   # 远程加 --remote
cd ..
node worker\scripts\seed-content.mjs --ecdict-file=tmp\ecdict.csv   # 远程同样加 --remote
```

另含 14,514 条常见词形映射(`trees`/`leaves` 等变形自动回退原形查词)。查词顺序:本地缓存 → Worker D1 内置词典(含词形)→ 外部词典兜底。

### 内容池(文章候选 → AI 预审 → 人工发布)

```powershell
cd worker
npm run seed:content-pool    # RSS 素材 + DeepSeek 改写,生成候选(只写本地 D1;加 --remote 写远程)
```

脚本支持 `--count`、`--offset`、`--concurrency`、`--remote` 和 `--replace-candidates`;**仅在首次替换候选时用 `--replace-candidates`,不要删除已审核/已发布文章**。长文生成需在 `worker/.dev.vars` 配置 `DEEPSEEK_GENERATION_API_KEY`。文章池由 Cron 每天北京时间 07:00 检查、每两天按难度轮换,每篇带来源封面。

### 管理员

内容审核页 `/#/admin/content`。在 Worker 的 `.dev.vars` 或 Cloudflare 环境变量中设置 `ADMIN_EMAILS=你的登录邮箱`,仅该邮箱可读取候选文章并发布/归档。

## 数据边界

- **本机(IndexedDB)**:单词表、掌握状态、专属文章、阅读进度、设置——本地优先,清浏览器数据即删。
- **云端(D1)**:账号与验证码、云同步的四表(词库/词条/文章/进度)、内置词典、内容池与收藏、生成配额。

**不要提交**:`tmp`、真实环境变量、`.dev.vars`、`.env`、`.wrangler`。
