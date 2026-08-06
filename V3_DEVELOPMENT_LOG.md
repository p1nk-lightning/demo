# LexiScene 开发日志

> 日期：2026-08-06  
> 工作目录：`E:\demo\readai\v2`  
> 阶段：账号、邮箱验证、云同步和平台内置模型基础

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
- 前端还没有使用 D1 每日文章接口，内容池、抓取、审核和三个月轮换均未完成。
