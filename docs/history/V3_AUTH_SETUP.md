# LexiScene 账号与邮箱验证配置

## 内容库与词典配置补充

账号配置之外，当前版本新增内置词典和文章内容库。首次配置或换环境时，在 Worker 目录执行：

```powershell
npx wrangler d1 migrations apply lexiscene --local
```

准备 `tmp\ecdict.csv` 后，从项目根目录执行：

```powershell
node worker\scripts\seed-content.mjs --ecdict-file=tmp\ecdict.csv
```

远程环境先应用迁移，再执行 `--remote` 导入。脚本使用稳定 ID 和幂等写入，可以重复执行；不要提交 ECDICT 下载文件、`.env`、`.dev.vars` 或 `.wrangler`。

内容导入后默认为 `candidate`。审核通过后才设置 `content_articles.status = 'published'` 和 `publish_date`，这样 `/api/daily` 才会返回文章。

> 最后更新：2026-08-06

当前 Web 应用使用 Cloudflare Worker 管理账号、Cookie 会话、邮箱验证码和 D1 数据同步。

## 已实现

- 邮箱和密码注册、登录、退出
- PBKDF2-SHA-512 密码哈希，浏览器不保存密码和会话令牌
- Resend 发送 6 位数字验证码，10 分钟有效
- 前端和后端双重限制：验证码邮件 60 秒内只能请求一次
- Cloudflare Turnstile 注册防滥用
- 登录后按用户隔离 IndexedDB 数据并同步到 D1
- 离线保存，网络恢复后自动补传

## 本地配置

前端使用根目录 `.env.local`：

```env
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_TURNSTILE_SITE_KEY=你的_Turnstile_Site_Key
```

Worker 使用 `worker/.dev.vars`。需要配置的变量名如下，密钥值不要写入文档或提交 Git：

```env
TURNSTILE_SECRET_KEY=
RESEND_API_KEY=
EMAIL_FROM=
FRONTEND_ORIGIN=http://127.0.0.1:5173
ADMIN_EMAILS=your_admin_email@example.com

DEEPSEEK_GENERATION_API_KEY=
DEEPSEEK_REVIEW_API_KEY=
# 旧配置兼容项；新环境请使用上面两把 Key
DEEPSEEK_API_KEY=
DASHSCOPE_API_KEY=
ARK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
QWEN_MODEL=qwen-plus
DOUBAO_MODEL=
```

`ADMIN_EMAILS` 使用逗号分隔管理员邮箱。该邮箱登录后可以访问 `/#/admin/content` 审核候选文章；后端会再次校验，普通用户即使知道链接也无法读取或发布文章。

DeepSeek 使用两把独立 Key：`DEEPSEEK_GENERATION_API_KEY` 只用于用户生成文章，`DEEPSEEK_REVIEW_API_KEY` 只用于管理员触发 AI 预审。两把 Key 都只放在 Worker 的 `.dev.vars` 或 Cloudflare Worker Secret 中，不能放在前端环境变量。

启动命令：

```powershell
cd E:\demo\readai\v2
npm run worker:dev
npm run dev
```

访问地址：

- 前端：`http://127.0.0.1:5173`
- Worker：`http://127.0.0.1:8787`
- 健康检查：`http://127.0.0.1:8787/healthz`

## D1 配置

当前云端数据库：

```text
database_name: lexiscene
database_id: 5ee7a76f-42e0-479d-909a-21ffa41b58f1
```

检查迁移状态：

```powershell
cd E:\demo\readai\v2\worker
npx wrangler d1 migrations list lexiscene --remote
```

应用新迁移：

```powershell
npx wrangler d1 migrations apply lexiscene --remote
```

不要把数据库名写成 `lexiscene-v3`。不要修改已经应用到云端的旧迁移；新增表或字段时继续创建 `0005_*.sql`、`0006_*.sql`。

`0004_generation_and_verification.sql` 包含 SQLite `ALTER TABLE ... ADD COLUMN`，不能在 D1 Console 中整份手动重复执行。Wrangler 会依据迁移历史避免重复执行。

## 生产部署注意事项

- Vercel 必须配置正式的 `VITE_API_BASE_URL` 和 Turnstile Site Key。
- Cloudflare Worker 必须配置模型、Resend、Turnstile 密钥和正式 `FRONTEND_ORIGIN`。
- HTTPS Worker 会使用 `Secure; SameSite=None` Cookie，以支持分域前端。
- 部分浏览器会限制第三方 Cookie。正式上线更推荐把 Worker 绑定到产品自有域名的 API 子域名，或让 Vercel 同域代理 `/api`。
- 当前没有配置 Cloudflare KV，生产环境限流仍是单 Worker 实例内存回退；公开发布前应绑定 KV 或实现 D1 限流。
- 尚未实现忘记密码和修改密码功能。
