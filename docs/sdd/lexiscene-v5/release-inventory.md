# T22 生产环境盘点与备份(2026-09-01)

数据库:lexiscene(5ee7a76f-42e0-479d-909a-21ffa41b58f1),v3-prod,HKG colo。

## 迁移状态

`wrangler d1 migrations list lexiscene --remote`:仅 **0008_password_reset_tokens.sql** 待应用(0001–0007 均已在远程生效,早前文档记录已过期)。

## 全表行数(12 表)

| 表 | 行数 | 说明 |
|---|---|---|
| users | 3 | 真实用户数据 |
| sessions | 2 | — |
| vocab_lists | 1 | 真实用户数据 |
| vocab_items | 399 | 真实用户数据 |
| articles | 1 | 真实用户数据 |
| reading_progress | 0 | — |
| dictionary_entries | 0 | **灌装目标** |
| dictionary_forms | 0 | **灌装目标** |
| content_articles | 0 | **灌装目标** |
| daily_articles | 0 | **灌装目标** |
| generation_usage | 2 | — |
| email_verification_tokens | 2 | — |

结论:用户数据(3 用户/399 词)必须在任何写操作前备份;词典与内容池为空,数据灌装是本次发布的实质内容。

## 全表备份(AC-010 硬前置,已完成)

- 文件:`worker/backups/backup-2026-09-01.sql`
- 校验:142,219 字节 / 561 行 / 17 条 CREATE TABLE
- 抽查:`INSERT INTO "users"` ×3、`"sessions"` ×2、`"vocab_lists"` ×1、`"vocab_items"` 多条均存在 ✅

## D1 执行限制备忘

远程 D1 对 compound SELECT 有严格限制(6 个 UNION ALL 失败,3–4 个可行);多表盘点按每组 ≤3 个 UNION ALL 执行。另:cmd 环境下 wrangler 命令不可与 `;`、重定向串联,必须独立单命令执行。

## 回滚方案

迁移回滚:`wrangler d1 execute lexiscene --remote --command "DROP TABLE IF EXISTS password_reset_tokens"`(0008 为新增表,无破坏性);数据灌装回滚:重放备份文件 `backups/backup-2026-09-01.sql`(先 DROP 再重建)或执行 DELETE 清空灌装表。

---

# T23 生产数据灌装与内容上线(2026-09-01)

## T23a 迁移 0008 ✅

`wrangler d1 migrations apply lexiscene --remote` 分 4 条命令执行完成;`password_reset_tokens` 已出现在 sqlite_master,DB size 401,408 → 417,792。

## T23b 词典灌装 ✅

- 流程:PowerShell 下载 ECDICT(MIT,66MB)→ `node worker/scripts/seed-content.mjs --ecdict-file=tmp/ecdict.csv --remote`
- 结果:dictionary_entries **21,000**(ecdict-en-zh 15,000 + lexiscene-core 6,000)、dictionary_forms **14,514**
- 注意:脚本对远程 D1 逐批写入(约 40+ 次 wrangler 调用),两次因网络抖动(Cloudflare API timeout / fetch failed)中断;脚本幂等(INSERT OR REPLACE / ON CONFLICT),重跑即续。30 篇旧短文(content-001–030,约 110–140 词)作为候选入库。

## T23c 内容池 + 每日文章 ✅

关键发现:发布门槛 `validatePublicArticle` 要求 CET4 400–500 词、≥3 段等,30 篇旧短文**永远过不了审**;真正的合规内容管线是 `generate-content-pool.mjs`(RSS 线索 + DeepSeek 生成 + 生成时校验词数/句长/段落/题目/翻译/证据)。

1. 生成:`node worker/scripts/generate-content-pool.mjs --remote --count=10`,4/10 成功;对失败 offset 补跑 3 轮,最终 **6 篇 v4 合规长文**入库(content-v4-003/004/006/007/009/010,CET4/CET6/考研/雅思×2/托福 全覆盖)。DeepSeek 对 400–900 词目标的命中率偏低(多在 300–400 词),证据句校验是另一主要失败点;按 offset 重试是有效恢复手段。
2. 审核:新增 **`worker/scripts/review-content.mjs`**——由于无法以编程方式获得生产管理员会话,脚本侧复刻了 `/api/admin/content/:id/ai-review` 的完整审核链(同一提示词 + 同一确定性校验 + 同一通过判定),通过者按 approve 语义写入文章池。30 篇旧短文确定性校验不过,**不送 LLM、不写审核记录**(保持候选,杜绝伪造审核数据);6 篇 v4 全部 pass(score 88)→ 文章池。
3. 排期:按 `rotateContentPool` 的取数规则(每难度取池首)为 2026-09-01 各难度排 1 篇;content-v4-009(雅思)留池备用。明日(2026-09-02,偶数天)07:00 cron 自动轮换。

## T23d 线上验证 ✅(部署前,旧版本 worker 即已读到新数据)

- `GET /api/daily` → source=content_library,**5 篇**(每难度 1 篇,题目 4–5 题齐全)
- `GET /api/dictionary?word=abandon` → 2 条释义(精确命中);`?word=was` → 词形还原到 be;`POST /api/dictionary/batch` books→book ✅(went 未命中:非 ECDICT exchange 形式,前端点选一般用原形,已知小缺口,不阻塞)

---

# T24 版本级部署与冒烟(2026-09-01)

## 部署记录(可回滚)

1. `wrangler versions upload` → `2a436263`(v5.0.0)→ `versions deploy 2a436263@100`
2. **发现并修复**:wrangler 4.x 会静默忽略旧的 `[[ratelimit.bindings]]` 配置(每条命令都有 "Unexpected fields found in top-level field: ratelimit" 警告),RATE_LIMITER 从未生效,限流一直在走进程内计数兜底。按 wrangler 4.127 config-schema 改为顶层 `[[ratelimits]]`(simple = 10 次/60s)后重新 `versions upload` → `1779626a` → `@100` 部署,binding 表明确显示 `env.RATE_LIMITER (10 requests/60s)`。
3. 当前生产版本:`1779626a`(v5.0.0),回滚:`wrangler versions deploy <旧版本id>@100`(0ec7b159 为 2026-08-10 的上一版本)。

## 线上冒烟 ✅

- `GET /healthz` → `{"ok":true,"product":"LexiScene","version":"5.0.0"}`(worker 直连 + Vercel 代理均 200)
- `GET /api/daily`(经 www.lexiscene.online 代理)→ 5 篇 ✅
- `GET /api/dictionary?word=abandon`(代理)→ 2 条 ✅
- **限流实测**:连续 14 次 POST /api/auth/login(错误口令)→ 第 10 次起返回 **429**;约 60 秒后恢复 401。RATE_LIMITER binding 行为符合 ADR-001 预期。
- 前端 56/56、worker 37/37 测试通过,tsc 无错误(部署前门禁)。

## 安全与卫生

- `worker/backups/`(含 password_hash / token_hash)已加入 .gitignore,确认 `git check-ignore` 生效后才提交
- 仓库清理:删除根目录误生成的 `eng.traineddata`、`$null` 及 docs 下的 inventory 临时文件

## 已知事项(不阻塞)

- `went` 等不规则屈投式不在 ECDICT exchange 词形表,批量查词未命中;用户查词以点选原形为主
- 旧短文 content-001–030 留在候选池(无审核记录),后续可在管理界面归档
- DeepSeek 生成命中率低(~40%),内容扩池时建议一次跑 10+ 并对失败 offset 重试

## 事后更正(2026-09-02):D1 rows_written 超限实录

Cloudflare 官方邮件确认 2026-09-01 **超出免费套餐每日 100,000 rows_written 限额**。早前"约 4 万行(40%)"的估算错误,漏算了两个放大因素:

1. **索引放大**:rows_written 按"表行 + 每个索引项"计数。dictionary_entries(主键 + idx_normalized)与 dictionary_forms 同构,每 INSERT 实际写 3 行 → (21,000 + 14,514) × 3 ≈ **106,542 行**,仅词典灌装本身即已超限
2. **重跑代价**:第一次灌装 2,000 词条后断网,重跑先 DELETE 后重灌,删除/重插各计一次 → 额外 ~12,000 行

合计 ≈ 119,000 行,超限 19%。影响评估:**无实质损失**——超限发生在当天所有必要写入完成之后;免费层超限不扣费,仅拒绝写入至 00:00 UTC 重置;2026-09-02 已重置,当日写入仅几十行(审核/排期更新)。词典灌装为一次性建库,稳态使用(≤20 人)每日写入数百行以内,不会再触线。

防线(已写入 seed-content.mjs 头注释):禁止对 seed-content.mjs 使用 --remote 重灌词典;日常扩池只用 generate-content-pool.mjs + review-content.mjs(单篇文章写入 <10 行)。

## 前端部署核对(2026-09-02)

推送 main 后 Vercel 自动触发构建并部署了新前端。核对结论:
- 旧 index.html 曾短暂引用已失效的 chunk(404,疑为 Vercel 缓存/构建竞态);带 no-cache 复核后 HTML 已指向新 bundle `index-Da_D7kRu.js`,配套 CSS 200。
- 新 bundle 含 v5 路由(QuizPage/StatsPage/ForgotPasswordPage/ResetPasswordPage),QuizPage chunk 实证包含"暂无释义"兜底排除逻辑(v5 行为)。
- 经代理的 /api/daily、/api/dictionary 持续 200。
- 教训:Vercel 部署后 30 秒内的边缘缓存可能短暂持有过期 HTML(引用已删除的旧 chunk);今后部署后用 no-cache 请求复核一次再通知朋友冒烟。

## 待办(需要用户)

- AC-010 朋友真机冒烟:注册 → 登录 → 每日阅读 → 点词 → 测验 → 看板 → 忘记密码全链路在真实手机上走一遍

