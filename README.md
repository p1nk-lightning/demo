# 词境阅读 · LexiScene

## 当前版本新增内容

- 内置 ECDICT 英汉词典数据：完整层 15,000 条，LexiScene 核心层 6,000 条；两个词典层合计 21,000 条记录。
- 内置 14,514 条常见词形映射，`trees`、`leaves` 等变形会自动回退到原形查词。
- 查词顺序：本地缓存 -> Worker D1 内置词典（含词形） -> 外部词典兜底。
- 首批 100 篇英语学习文章已生成，按 CET4、CET6、考研、雅思、托福各 20 篇保存为候选内容；每篇实际 400 至 1000 词（当前本地库为 404 至 970 词）。
- 文章生成脚本会读取公开 RSS 的标题、摘要和链接作为事实线索，由 DeepSeek 重新创作英文学习文章，不复制来源全文；当前网络环境本批次实际使用了可访问的 NPR 公开 RSS，其他来源已登记到来源目录，后续抓取可用时再补充。
- 新闻只作为事实素材，文章正文为原创改写；候选内容审核后才发布。
- 管理员可先用 DeepSeek AI 预审文章，再人工确认加入文章池；普通用户界面不显示审核入口。
- 文章池由 Cloudflare Cron 每天北京时间 07:00 检查，每两天按难度轮换一次；每篇文章带一张来源页 Open Graph 封面或主题备用封面。
- 阅读页支持收藏，收藏文章可在 `/#/favorites` 查看。

批量生成候选文章（只写入本地 D1）：

```powershell
cd E:\demo\readai\v2\worker
npm run seed:content-pool
```

脚本支持 `--count`、`--offset`、`--concurrency`、`--remote` 和 `--replace-candidates`；首次替换候选内容时才使用 `--replace-candidates`，不要删除已审核或已发布文章。长文生成需要在 `worker/.dev.vars` 中配置 `DEEPSEEK_GENERATION_API_KEY`，并保留 `thinking: { type: 'disabled' }`。

## 初始化内容库

```powershell
cd E:\demo\readai\v2
New-Item -ItemType Directory -Force tmp
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv" -OutFile "tmp\ecdict.csv"
cd worker
npx wrangler d1 migrations apply lexiscene --local
cd ..
node worker\scripts\seed-content.mjs --ecdict-file=tmp\ecdict.csv
```

部署前对远程 D1 执行同样的迁移和导入，但把 Wrangler 命令及种子脚本切换为 `--remote`。不要提交 `tmp`、真实环境变量、`.dev.vars`、`.env` 或 `.wrangler`。

文章审核页是 `/#/admin/content`。在 Worker 的 `.dev.vars` 或 Cloudflare 环境变量中设置 `ADMIN_EMAILS=你的登录邮箱` 后，只有该邮箱能够读取候选文章并发布或归档。

> **当前说明：** 账号、邮箱验证码、平台内置模型和 D1 用户同步已经加入。下面保留的是 V2 历史基线，不能再作为当前配置说明。
>
> 当前开发请阅读 `V3_DEVELOPMENT_HANDOFF.md`、`V3_DEVELOPMENT_LOG.md` 和 `V3_AUTH_SETUP.md`。

## 当前开发版摘要

- 邮箱注册、登录、6 位验证码和 60 秒重发限制
- Turnstile + Resend
- DeepSeek、千问、豆包平台内置模型
- Dexie 本地优先和 D1 账号同步
- 当前 D1：`lexiscene`，不是 `lexiscene-v2` 或 `lexiscene-v3`
- 本地地址：Web `http://127.0.0.1:5173`，Worker `http://127.0.0.1:8787`

---

## V2 历史基线（已过期）

> 让背过的词，在语境里真正留下来。
> Read words in context. Make them stay.

词境是一款本地优先的英语阅读训练工具。用户可以把历史导入保留为多个单词表，使用自己的 AI API 生成专属文章，也可以按 CET-4、CET-6、考研、雅思和托福难度阅读每日推荐。

## 当前开发状态

V2 MVP 基线已完成：

- 全新的白色、浅灰、浅蓝视觉系统
- 桌面顶部导航和手机底部导航
- 每日分级推荐文章
- 多单词表导入、搜索、重命名、删除和掌握状态
- 自定义文章长度（100–1000 词快捷选项）和主题
- DeepSeek、Moonshot、OpenAI 兼容 API 配置
- 用户 API Key 仅保存在当前浏览器
- Dexie + IndexedDB 本地数据层
- Cloudflare Worker + Hono 接口层
- Cloudflare D1 每日文章迁移文件

账号、云同步、支付和社区不在当前 MVP 范围内。

## 技术栈

- 前端：React 18、TypeScript、Vite、Tailwind CSS、Zustand
- 本地数据库：Dexie + IndexedDB
- 后端：Cloudflare Workers + Hono
- 云端内容数据库：Cloudflare D1
- 数据校验：Zod
- 文件导入：read-excel-file（`.xlsx`）+ 原生 CSV 解析
- 图标：Lucide React

## 本地启动

```powershell
cd E:\demo\readai\v2
npm install
npm run dev
```

浏览器打开：<http://127.0.0.1:5173>

需要测试 AI 生成和 API 连接时，再启动 Worker：

```powershell
cd E:\demo\readai\v2
npm run worker:dev
```

Worker 默认地址：<http://localhost:8787>

## 常用命令

```powershell
npm run typecheck
npm run build
npm run preview
npm run worker:dev
```

## D1 数据库

每日推荐在未绑定 D1 时使用前端内置示例数据。创建正式数据库：

```powershell
cd E:\demo\readai\v2\worker
npx wrangler d1 create lexiscene-v2
```

把返回的 `database_id` 填入 `worker/wrangler.toml` 中注释的 `d1_databases` 配置，然后执行：

```powershell
npx wrangler d1 migrations apply lexiscene-v2 --local
npx wrangler d1 migrations apply lexiscene-v2 --remote
```

初始迁移文件：`worker/migrations/0001_daily_articles.sql`。

## 数据边界

保存在本机：单词表、掌握状态、用户 API 配置、专属文章、阅读进度和设置。

保存在 D1：系统每日推荐文章及其题目、难度、主题和发布时间。

所有 V2 本地记录使用稳定 ID、时间戳和数据版本，为后续账号与云同步预留迁移空间。
