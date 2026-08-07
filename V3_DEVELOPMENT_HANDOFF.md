# LexiScene 下一次开发交接

## 本轮新增：内置词典与首批内容

已完成：

- `0005_dictionary_and_content_library.sql` 和 `0006_dictionary_forms.sql` 已在本地 D1 应用。
- `worker/scripts/seed-content.mjs` 已在本地导入词典和文章。
- 本地数据检查结果：`dictionary_entries = 21000`、`dictionary_forms = 14514`，`content_articles = 30`。
- 内置词典完整层 15,000 条、核心层 6,000 条；词形表支持 `trees -> tree` 等常见变形。
- 已实现单词表释义展开、全量显示/隐藏、词表多选合并，以及阅读页点击空白或按 Esc 关闭释义。
- 已新增管理员审核页 `/#/admin/content`。在 Worker 配置中设置 `ADMIN_EMAILS` 后，白名单邮箱可审核、发布、归档文章。
- 30 篇文章按五个难度各 6 篇，状态均为 `candidate`。
- 词典来源为 [ECDICT](https://github.com/skywind3000/ECDICT)，使用 MIT License；文章来源仅作事实线索，正文为原创改写。

远程 D1 状态：`0005`、`0006` 尚未应用。执行时使用：

```powershell
cd E:\demo\readai\v2\worker
npx wrangler d1 migrations apply lexiscene --remote
cd ..
node worker\scripts\seed-content.mjs --remote --skip-dictionary
node worker\scripts\seed-content.mjs --remote --ecdict-file=tmp\ecdict.csv
```

如果本机没有 `npx`，使用项目已安装的 Wrangler JS 入口，或先恢复 Node/npm PATH。远程导入前必须确认 Cloudflare API DNS 和登录状态正常。

查看数据：

```powershell
cd E:\demo\readai\v2\worker
npx wrangler d1 execute lexiscene --local --command "SELECT difficulty, status, COUNT(*) AS count FROM content_articles GROUP BY difficulty, status;"
npx wrangler d1 execute lexiscene --remote --command "SELECT COUNT(*) AS count FROM dictionary_entries;"
```

注意：文章默认只查询 `status = 'published'` 且 `publish_date` 等于请求日期的记录。审核完成后再发布，不要直接把所有候选文章公开。

> 下次开发首先阅读本文件。  
> 最后更新：2026-08-06  
> 当前工作目录：`E:\demo\readai\v2`

## 2026-08-07 本轮交接补充

- 应用新迁移 `0007_ai_review_rotation_and_favorites.sql`；本地 D1 已应用，远程 D1 仍需应用 `0005`、`0006`、`0007`。
- 配置 `DEEPSEEK_GENERATION_API_KEY` 和 `DEEPSEEK_REVIEW_API_KEY`，分别供生成文章和 AI 预审使用；不要把 Key 放到 Vite 前端变量。
- AI 审核接口为 `POST /api/admin/content/:id/ai-review`；人工确认入池使用原审核接口的 `action = approve`。
- 文章池逻辑使用 `published + publish_date IS NULL`，Cron 每日北京时间 07:00 检查，隔日为每个难度轮换一篇。
- 收藏接口为 `GET /api/favorites` 和 `POST /api/content/:id/favorite`；用户页面为 `/#/favorites`。
- 重新导入封面或内容时执行 `node worker\\scripts\\seed-content.mjs --skip-dictionary`；不需要再次下载词典。

## 2026-08-07 长文内容池补充

- 新增 `worker/scripts/generate-content-pool.mjs`，用于批量生成 400 至 1000 词的英文学习文章；目标词数按批次确定性变化，避免所有文章长度相同。
- 本地 D1 已生成 100 篇 `candidate` 文章，实际验收为 `COUNT = 100`、`MIN(word_count) = 404`、`MAX(word_count) = 970`；CET4、CET6、考研、雅思、托福各 20 篇。
- 这些文章尚未自动发布。管理员应先在 `/#/admin/content` 使用 AI 预审，再逐篇人工确认；确认后才进入可轮换的文章池。
- 生成器保留 NPR、BBC News、The Guardian、Scientific American、The Conversation、VOA Learning English、VOA News、AP News、National Geographic 和 YouTube 等来源配置。来源 RSS 只提供公开标题、摘要和链接，正文由模型原创改写；由于本次开发环境的网络可达性，本批次实际使用的是 NPR 公开 RSS，其余来源登记后待后续抓取任务补充。
- 长文调用 DeepSeek 时必须使用 `thinking: { type: 'disabled' }`，否则推理输出可能消耗完额度并返回空正文。脚本会对 JSON 格式、词数下限和超时自动重试，整批完成后才写入 D1。
- 100 篇当前只写入本地 D1；远程 D1 尚未接收这批数据。远程迁移、远程内容导入和部署前仍需确认 Cloudflare API 网络正常，再使用生成器的 `--remote` 参数。

## 1. 版本管理决定

不要再通过复制完整的 `v1`、`v2`、`v3` 文件夹长期管理版本。

推荐方案：

```text
保留一个项目目录
main：稳定版本
codex/v3：下一阶段开发分支
v2.0.0、v3.0.0：发布标签
```

旧文件夹可以暂时保留作备份，确认 Git 历史和远程仓库完整后再清理。D1 云端数据库与本机文件夹名无关，连接目标由 `worker/wrangler.toml` 的 `database_id` 决定。

## 2. 当前架构

```text
React/Vite Web
  ├─ Dexie + IndexedDB：本地优先数据
  ├─ Cookie 会话：登录状态
  └─ Cloudflare Worker API
       ├─ D1：账号、会话、同步数据、文章池、生成额度
       ├─ Resend：邮箱验证码
       ├─ Turnstile：注册防滥用
       └─ DeepSeek / 千问 / 豆包：文章生成
```

这套架构适合先发布 Web，未来 App 可以复用 Worker API 和 D1。App 端需要单独实现安全令牌存储，不能依赖浏览器 Cookie 和 IndexedDB。

## 3. 关键配置

```text
D1 name: lexiscene
D1 id: 5ee7a76f-42e0-479d-909a-21ffa41b58f1
Web dev: http://127.0.0.1:5173
Worker dev: http://127.0.0.1:8787
```

敏感配置只允许出现在：

```text
.env.local
worker/.dev.vars
Cloudflare/Vercel 环境变量后台
```

不要读取、输出或提交真实密钥。

## 4. 数据同步规则

- 本地先写 IndexedDB，再后台同步 D1。
- 数据使用稳定 ID 和 `updatedAt`，时间较新的记录覆盖旧记录。
- 删除使用 `deletedAt` 墓碑，不直接丢失同步语义。
- 本地数据按 `ownerId` 隔离。
- 文章 IndexedDB 主键是 `ownerId:id`，云端身份仍是稳定 `id`。
- 登录后先拉远程快照、合并本地，再推送合并结果。
- 匿名旧数据只有用户点击“合并本机数据”后才绑定账号。

## 5. 主要接口

```text
GET  /healthz
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/verify-email
POST /api/auth/resend-verification
GET  /api/sync/snapshot
POST /api/sync/push
GET  /api/daily
POST /api/generate
```

## 6. 下一阶段优先级

### P0：公开部署前

1. 配置至少一家模型 Key，完整测试文章生成和每天 10 篇额度。
2. 绑定 Cloudflare KV 或改用 D1 实现分布式限流。
3. 决定正式域名方案：优先 `app.example.com` + `api.example.com`，减少第三方 Cookie 问题。
4. 部署 Worker，再部署 Vercel，并设置正式 `FRONTEND_ORIGIN`、`VITE_API_BASE_URL`、Turnstile 正式 Key。
5. 增加注册、验证码、账号切换、离线补传的 Playwright E2E。
6. 增加忘记密码功能。

### P1：每日文章池

1. 设计文章来源白名单、版权策略和抓取频率。
2. 新增候选、审核、发布状态，不要抓取后直接公开。
3. 按五个难度建立文章池。
4. Cloudflare Cron 已实现每两天北京时间 07:00 轮换；后续可增加补池告警。
5. 记录用户看过的每日文章，保证约三个月内不重复。
6. 前端已优先请求 `/api/daily`，本地静态文章只作为离线后备。

### P2：商业化

1. 在 D1 增加钱包、流水和订单表，余额变更必须服务端事务处理。
2. 免费额度和虚拟币额度分开记账。
3. 支付回调必须验签并支持幂等。
4. 增加消费记录、退款和异常补单后台。

## 7. 已知问题

- 模型 Key 尚未配置，生成接口会返回 503。
- 生产 Worker 和 Vercel 尚未部署。
- KV 尚未绑定，通用限流是内存回退。
- 每日文章仍来自前端静态数据。
- 没有密码找回。
- 没有自动化测试。
- README 中不再使用旧“用户自带 API Key”方案；历史 V2 文档仅供追溯。
- `package.json` 和 `/healthz` 当前仍报告版本 2，正式确定下一个发布版本时统一更新版本号和 Git 标签。

## 8. 迁移规则

已经应用的 `0001` 至 `0004` 不要修改或重命名。

以后新增结构：

```text
worker/migrations/0005_feature_name.sql
worker/migrations/0006_feature_name.sql
```

先本地应用并测试，再执行远程迁移。不要删除或重建现有 `lexiscene` 数据库。

## 9. 启动与检查

```powershell
cd E:\demo\readai\v2
npm run worker:dev
npm run dev

npm run typecheck
npm run build
cd worker
npm run typecheck
```

## 10. 下次开发提示词

```text
请先阅读 E:\demo\readai\v2\V3_DEVELOPMENT_HANDOFF.md、
V3_DEVELOPMENT_LOG.md 和 V3_AUTH_SETUP.md。
检查 Git 状态，不要覆盖现有未提交修改，不要修改已经应用的 D1 迁移。
优先从交接文档 P0 继续。
```
