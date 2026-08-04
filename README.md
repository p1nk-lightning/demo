# 词境阅读 · LexiScene V2

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
