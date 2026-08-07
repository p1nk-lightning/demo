# LexiScene 开发日志

## 2026-08-06 内容库与内置词典

- 新增 `worker/migrations/0005_dictionary_and_content_library.sql`，建立 `dictionaries`、`dictionary_entries`、`content_sources`、`content_articles` 和 `user_content_views`。
- 新增 `GET /api/dictionary?word=...`。前端查询顺序为本地 LRU 缓存、Worker 内置词典、`dictionaryapi.dev` 外部兜底。
- 新增 `worker/scripts/seed-content.mjs`。脚本可重复执行，导入 ECDICT MIT 许可词条和 30 篇原创改写候选文章。
- 本地 D1 已导入 21,000 条词典记录：ECDICT 完整层 15,000 条，LexiScene 核心层 6,000 条；同一单词在两层中可能各有一条记录，这是设计行为。
- 词典导入按 ECDICT 的 `bnc` 词频排名升序选择高频词，并在重建前清理旧词典层，避免罕见词占用核心词位或重复残留。
- 本地 D1 已导入 30 篇文章：CET4、CET6、考研、雅思、托福各 6 篇，全部为 `candidate`，没有自动发布。
- 文章只保存公开 RSS 标题、摘要和链接作为事实线索，正文是面向英语学习的原创改写，不复制新闻全文。
- 新增 `0006_dictionary_forms.sql` 和 `dictionary_forms` 表；本地已导入 14,514 条词形映射，支持 `trees -> tree` 等查词回退。
- 查词失败不再写入永久本地缓存，避免词典扩展后仍被旧的“暂无释义”缓存挡住。
- 阅读页点击非单词区域或按 Esc 会关闭固定释义；单词表已支持眼睛释义、全量显示/隐藏和多选合并。
- 新增独立管理员审核页 `/#/admin/content` 和后端权限校验。使用 `ADMIN_EMAILS` 白名单限制候选文章的读取、发布、归档。
- 远程 D1 `0005`、`0006` 尚未应用：本次 Wrangler 因当前环境无法解析 `api.cloudflare.com` 失败。网络恢复后应先迁移，再执行远程种子导入。

### 内容审核与发布

候选文章确认无误后，在 D1 Console 或 Wrangler 中按需发布。建议一次只发布审核通过的文章，例如：

```sql
UPDATE content_articles
SET status = 'published', publish_date = '2026-08-07', reviewed_at = unixepoch() * 1000, published_at = unixepoch() * 1000, updated_at = unixepoch() * 1000
WHERE id = 'content-001';
```

定时轮换已实现；导入脚本仍只写入候选状态，不能把抓取或导入改成自动发布。

> 日期：2026-08-06  
> 工作目录：`E:\demo\readai\v2`  
> 阶段：账号、邮箱验证、云同步和平台内置模型基础

## 2026-08-07 AI 预审、文章池轮换与收藏

- 新增 `0007_ai_review_rotation_and_favorites.sql`，保存 AI 预审 JSON、审核时间和审核模型，并建立 `user_content_favorites`。
- DeepSeek 生成与审核分离为 `DEEPSEEK_GENERATION_API_KEY`、`DEEPSEEK_REVIEW_API_KEY`；旧 `DEEPSEEK_API_KEY` 仅作为兼容回退。
- 管理员页支持单篇或批量 AI 预审，AI 只输出建议和风险项，不会自动发布；人工确认后文章进入文章池。
- 由于旧表状态约束，文章池使用 `status = 'published' AND publish_date IS NULL` 表示，当前轮换文章带北京时间日期。
- `worker/wrangler.toml` 增加每天 23:00 UTC 的 Cron，即北京时间每天 07:00；函数仅在隔日执行轮换，每种难度选择一篇文章上线。
- 种子脚本会从来源文章的 `og:image` 抓取封面，失败时使用按主题配置的公开备用图；本地 30 篇文章已全部写入封面 URL。
- 新增收藏 API、阅读页收藏按钮和 `/#/favorites` 收藏页；收藏归属于当前登录账号。
- 普通用户导航隐藏审核入口，后端仍保留管理员白名单鉴权和直接路由保护。

## 2026-08-07 长文文章池与阅读页

- 阅读页改为内容优先布局：标题、难度、主题、来源、词数、日期和收藏集中在文章头部；阅读控制器单独成行；正文使用居中的宽版阅读面；阅读题移到正文下方。
- 新增 `标记生词`、`标记熟词`、字号调整和来源链接控件；继续使用 CET4、CET6、考研、雅思、托福，不引入 A1/A2/B1 等等级。
- 新增 `worker/scripts/generate-content-pool.mjs`，批量使用 DeepSeek 将公开新闻素材改写为原创英语学习文章，并保存来源元数据和主题封面。
- 本地 D1 已从旧候选内容替换并扩充到 100 篇候选文章；词数范围 404 至 970，五档难度各 20 篇。文章状态全部仍为 `candidate`，等待 AI 预审和人工发布。
- 当前网络环境能稳定访问的公开素材是 NPR RSS，因此本批次实际来源为 NPR 的不同频道；BBC、The Guardian、Scientific American、The Conversation、VOA、AP、National Geographic 和 YouTube 已加入来源目录，后续网络可用时可继续补充来源多样性。
- DeepSeek 长文请求必须关闭思考输出：`thinking: { type: 'disabled' }`。脚本支持失败重试，并在整批完成后写入本地 D1，避免半批数据。
- 本次导入只发生在本地 D1，未声称远程 D1 已同步。远程导入需单独执行并使用 `--remote`。

## 本轮完成

### 账号和邮箱验证

- 新增邮箱密码注册、登录和退出接口。
- 密码使用 PBKDF2-SHA-512、独立随机盐和 210000 次迭代保存。
- 会话令牌只保存在 HttpOnly Cookie，D1 仅保存 SHA-256 哈希。
- 注册接入 Cloudflare Turnstile。
- 接入 Resend 邮件，改为 6 位数字验证码，验证码 10 分钟有效且只能使用一次。
- 验证码邮件前端和 Worker 均限制 60 秒重发间隔。
- 修复验证页读取旧缓存后、未输入验证码就显示验证成功的问题。

### 用户数据与云同步

- 单词表、单词、文章和阅读进度增加稳定 ID、`ownerId`、`createdAt`、`updatedAt` 和删除标记。
- 新增 D1 同步表和 `/api/sync/snapshot`、`/api/sync/push`。
- 登录后读取账号云端数据，再按更新时间合并本机数据。
- 支持匿名旧数据一次性绑定到当前账号。
- 本地写入后自动同步，离线时保存在 IndexedDB，网络恢复后补传。
- A/B 账号的本地数据通过 `ownerId` 和复合本地文章键隔离。

### 平台模型

- 删除用户自带 API Key 设置入口。
- 改为 DeepSeek、千问、豆包三种平台模型选择。
- 服务端保存平台 Key，浏览器不接触模型密钥。
- 已验证账号每天最多成功生成 10 篇文章，并限制短时间并发请求。
- 记录模型、Token 使用量和生成状态。

## 本次代码审查修复

1. 统一 API 地址：登录、同步和生成统一读取 `VITE_API_BASE_URL`，保留 `VITE_WORKER_URL` 作为旧配置兼容。
2. 修复生产 Cookie：HTTPS 下使用 `Secure; SameSite=None`，本地 HTTP 保持 `SameSite=Lax`。
3. 修复同步重试：网络恢复、429 和 5xx 会自动重试；401 会刷新登录状态；400/403 不再无限请求。
4. 删除“合并本机数据”完成后的重复同步调用。
5. 修复 TXT/XLSX 导入顺序：`Map` 序号从错误的 `Object.keys(map).length` 改为 `map.size`。
6. 修复 Excel 解析兜底记录被错误标成 `pasted` 的问题。
7. 生成任务只把 15 分钟内的 `pending` 计入每日额度，Worker 中断不会永久占用额度。
8. `/api/daily` 默认日期改为北京时间，避免凌晨 0-8 点读取前一天内容。
9. 示例配置统一到 `127.0.0.1:5173` 和 `127.0.0.1:8787`。
10. 更新过时 README 和账号配置文档，纠正数据库名和迁移命令。

## 数据库状态

```text
database_name: lexiscene
database_id: 5ee7a76f-42e0-479d-909a-21ffa41b58f1
```

迁移文件：

```text
0001_daily_articles.sql
0002_auth.sql
0003_user_sync.sql
0004_generation_and_verification.sql
```

根据本轮之前的迁移检查，远程 D1 已有邮箱验证和生成额度相关表；本轮没有增加或修改数据库结构，因此不需要执行新迁移。

## 验证结果

- 前端 `tsc --noEmit`：通过
- Worker `tsc --noEmit`：通过
- Vite 生产构建：通过
- `git diff --check`：通过
- 本地 D1 生成额度查询语法：通过
- Worker 健康检查：`{"ok":true,"product":"LexiScene","version":2}`
- CORS：`http://127.0.0.1:5173` 获得正确允许来源和凭证响应头

## 当前配置状态

- Turnstile、Resend、发件人和本地前端来源已配置在忽略提交的本地变量文件中。
- 当前本地 Worker 未配置 DeepSeek、千问、豆包 Key，所以文章生成暂时返回 503。
- `.env.local`、`worker/.dev.vars` 均被 `.gitignore` 忽略，没有把密钥写入文档。

## 审查后仍保留的风险

- Cloudflare KV 尚未绑定，注册和验证码通用限流在生产多实例下不够稳定。
- Vercel 与 workers.dev 属于不同站点，某些浏览器可能阻止第三方 Cookie；正式上线优先使用自有 API 子域名或同域代理。
- 没有忘记密码、修改密码和邮箱变更流程。
- 没有 Vitest 或 Playwright 自动化测试，账号切换和同步冲突目前主要依赖人工验证。
- `0004` 包含不可重复执行的 `ALTER TABLE`，必须由 Wrangler 迁移历史管理，不能在 D1 Console 整份重跑。
- 前端已优先使用 D1 每日文章接口；AI 预审、人工入池、封面抓取和隔日轮换已实现。三个月不重复仍需要后续增加更严格的轮换历史保留策略。
