# 词境阅读 V2 开发交接文档

> 用途：下次开发时优先阅读此文件，快速恢复上下文。
> 最后更新：2026-08-02
> 项目目录：`E:\demo\readai\v2`

## 1. 产品定义

- 中文名：**词境阅读**
- 简称：**词境**
- 英文名：**LexiScene**
- 中文口号：**让背过的词，在语境里真正留下来。**
- 英文口号：**Read words in context. Make them stay.**

V2 MVP 核心流程：

```text
导入单词 → 创建多个单词表 → 选择难度/长度/主题
→ 使用用户自己的 API 生成文章 → 阅读/查词/答题
→ 标记单词掌握状态 → 保存阅读记录
```

另有系统每日推荐，按以下难度区分：

```text
CET-4 / CET-6 / 考研 / 雅思 / 托福
```

## 2. 已确定的 MVP 边界

当前版本采用**无账号、本地优先**架构。

本地保存：

- 单词表与单词掌握状态
- 用户 API 配置
- 个性化生成文章
- 阅读记录与答题进度
- 用户设置

云端 D1 保存：

- 系统每日推荐文章
- 推荐题目、难度、主题和发布时间

暂不开发：

- 登录注册与多设备同步
- 会员、支付和社区
- 管理后台
- AI 对话教师
- 原生手机 App
- 暗色模式

## 3. 当前技术栈

### 前端

- React 18 + TypeScript + Vite
- Tailwind CSS
- React Router（HashRouter）
- Zustand
- Dexie + IndexedDB
- Zod
- Lucide React
- `read-excel-file`：读取 `.xlsx`
- 原生文本解析：读取 `.csv` 和粘贴文本

### 后端

- Cloudflare Workers
- Hono
- Cloudflare KV：限流
- Cloudflare D1：每日推荐文章
- DeepSeek / Moonshot / OpenAI 兼容 API

## 4. 已实现功能

### UI 和导航

- 全新白色、浅灰、浅蓝视觉系统
- 参考 Boobook 的留白、编辑感标题和胶囊按钮交互
- 桌面顶部导航
- 手机底部导航
- 页面淡入和按钮箭头位移动效
- 首页、单词表、导入、API 设置、阅读记录均已重新设计
- 每日推荐使用真实图片资源；图片目前来自 Unsplash 外链

### 首页

- 每日推荐难度切换
- 每个难度一篇内置示例文章
- 选择单词表、文章长度和主题
- 快捷长度：`100 / 300 / 500 / 700 / 1000`
- 主题：随机、科技、文化、教育、生活、商业、自然
- 无单词表时跳转导入页面

### 多单词表

- 每次导入创建独立单词表，不覆盖历史记录
- 支持 TXT 粘贴、`.xlsx`、`.csv`
- 自动归一化和去重
- 单词表名称与目标难度
- 搜索、重命名、删除
- 标记“已掌握 / 未掌握”
- 单词表掌握进度条

### 用户 API

- 支持 DeepSeek、Moonshot、OpenAI 兼容接口
- 一个启用中的 API 配置
- 支持 Base URL、模型、API Key
- 支持连接测试
- API Key 仅保存在浏览器 IndexedDB
- 生成时通过 `X-Provider-Key` 临时发送给 Worker
- Worker 不将 Key 写入 D1

### 文章生成

- 文章长度：100–1500 词
- 100–399 词生成 3 道题
- 400–1500 词生成 5 道题
- 单词命中目标随文章长度变化：5 / 10 / 15 / 20
- 用户未配置 API 时可以使用 Worker 系统密钥

### 数据库

Dexie 数据库名：`lexiscene-v2`

本地表：

```text
vocabLists
vocabItems
articles
progress
apiProfiles
settings
```

D1 迁移文件：

```text
worker/migrations/0001_daily_articles.sql
```

## 5. 主要路由

```text
/#/                    今日阅读首页
/#/library             多单词表管理
/#/library/import      创建单词表
/#/reading/:articleId  阅读与答题
/#/history             阅读记录
/#/settings/api        API 设置
```

旧路由 `/#/vocab` 会自动跳转到 `/#/library`。

## 6. 关键文件

```text
src/App.tsx                         路由与按需加载
src/components/layout/AppShell.tsx 应用导航和响应式外壳
src/index.css                       全局视觉规则
tailwind.config.js                  颜色、字体、阴影和动画

src/pages/HomePage.tsx              首页与文章生成入口
src/pages/LibraryPage.tsx           多单词表管理
src/pages/ImportPage.tsx            单词导入
src/pages/ApiSettingsPage.tsx       用户 API 设置
src/pages/ReadingPage.tsx           阅读与答题
src/pages/HistoryPage.tsx           阅读记录

src/lib/db.ts                       Dexie 数据库与数据操作
src/lib/dailyArticles.ts            每日推荐后备数据
src/lib/apiProfiles.ts              API 连接测试
src/lib/llm.ts                      前端生成请求
src/lib/vocab.ts                    TXT/XLSX/CSV 解析
src/types/domain.ts                 V2 领域类型

worker/src/index.ts                 Hono Worker 路由
worker/migrations/0001_daily_articles.sql
worker/wrangler.toml                Worker、KV、D1 配置说明
```

## 7. Worker 接口

```text
GET  /healthz
GET  /api/daily?difficulty=CET4&date=YYYY-MM-DD
POST /api/test-provider
POST /api/generate
```

`/api/daily` 未绑定 D1 时返回空数组，前端继续使用本地推荐数据。

## 8. 本地启动

前端：

```powershell
cd E:\demo\readai\v2
npm run dev
```

访问：`http://127.0.0.1:5173`

Worker：

```powershell
cd E:\demo\readai\v2
npm run worker:dev
```

Worker 默认地址：`http://localhost:8787`

验证命令：

```powershell
npm run typecheck
npm run build
cd worker
npm run typecheck
```

## 9. 当前验证结果

- 前端 TypeScript：通过
- Worker TypeScript：通过
- Vite 生产构建：通过，无构建警告
- 首页初始 JS：约 282 KB，gzip 约 94 KB
- 导入页面独立 chunk：约 72 KB
- 桌面布局：已截图验证
- 手机布局：已验证，无横向溢出
- Worker 生产依赖：`npm audit --omit=dev` 为 0 漏洞
- 前端已移除存在高危且无修复版本的 SheetJS

浏览器自动填写导入表单时被浏览器安全策略中止，因此目前没有完整自动化 E2E 测试。

## 10. Git 状态

当前开发分支：

```text
codex/v2-mvp-foundation
```

提交：

```text
74dc413 feat: build LexiScene v2 MVP foundation
7e5fe5a fix: replace vulnerable spreadsheet parser
```

该分支目前**尚未推送到 GitHub**。

## 11. 已知问题与技术债

1. D1 只建立了迁移文件，尚未创建和绑定正式数据库。
2. 每日推荐目前来自 `src/lib/dailyArticles.ts`，尚未从 Worker 拉取。
3. 尚未实现 Cloudflare Cron 每日自动生成推荐文章。
4. 用户 API Key 是本地明文存储；无账号 MVP 可接受，但公共电脑需警告。
5. Worker 当前生成只调用一次，尚未恢复 V1 的多次 JSON/词汇命中重试。
6. 推荐图片依赖 Unsplash 外链，正式部署前应下载到自有存储或 R2。
7. V1 的部分旧组件仍保留但已不再进入主要路由，例如 `VocabImporter.tsx`、`VocabPage.tsx`。
8. `idb-keyval` 仍用于少量 V1 兼容设置，后续可完全迁入 Dexie。
9. React Router 有两个中危公告；当前只使用固定内部路由且无 SSR，风险有限，升级 Router 7 需要单独测试。
10. 暂无 Vitest、组件测试和 Playwright E2E 测试。

## 12. 推荐的下一阶段顺序

### P0：让 MVP 真正可用

1. 创建并绑定 Cloudflare D1。
2. 前端每日推荐改为优先请求 `/api/daily`，失败时使用本地后备数据。
3. 为 Worker 恢复 JSON 校验、词汇命中和最多 3 次重试。
4. 完成单词导入、API 设置、生成、阅读、答题的 E2E 测试。
5. 增加本地数据导出和导入。

### P1：内容运营能力

1. Cloudflare Cron 每日按五个难度生成文章。
2. 推荐文章质量审核或发布状态。
3. 把推荐图片迁移到 R2。

### P2：未来账号准备

1. 为所有本地数据保留稳定 ID、`createdAt`、`updatedAt`、`schemaVersion`。
2. 设计本地数据上传和冲突合并规则。
3. 暂不在 V2 MVP 中直接实现账号。

## 13. 下次会话建议提示词

```text
请先阅读 E:\demo\readai\v2\V2_DEVELOPMENT_HANDOFF.md，
然后检查 codex/v2-mvp-foundation 分支和当前工作区状态。
不要重新设计已完成的基础架构，优先从“推荐的下一阶段 P0”继续。
```
