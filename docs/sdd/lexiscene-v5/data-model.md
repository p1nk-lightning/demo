# LexiScene V5 · 数据模型(data-model.md)

> source: spec.md §5/§7,plan.md ADR-005/007
> 原则:不从现有代码反推业务真值;本文件只定义**新增**结构与**被消费**的现有结构,现有表以迁移文件为权威。

---

## 1. 新增:D1 表 `password_reset_tokens`(迁移 0008)

服务:AC-006(忘记密码)。模式完全对齐现有 `email_verification_tokens`(见迁移 0004),仅多 `attempts` 列。

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,      -- base64(sha256(`${user_id}:${code}`)),与邮箱验证码同构
  expires_at INTEGER NOT NULL,   -- created_at + 10 分钟
  created_at INTEGER NOT NULL,
  used_at INTEGER,               -- 重置成功时回填
  attempts INTEGER NOT NULL DEFAULT 0  -- 连续验证失败计数,达 5 次 token 作废
);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_prt_created ON password_reset_tokens (created_at);
```

- 写入路径:`POST /api/auth/forgot-password` —— 先 `DELETE` 该用户未用旧码,再插入新码(与 `createVerificationToken` 同款 batch)。
- 日限计数:`SELECT COUNT(*) ... WHERE user_id = ? AND created_at > ?` 覆盖 24h 窗口,≥5 → 静默不发码(响应仍是统一 200,见契约)。
- 生命周期:10 分钟过期(查询条件过滤,不依赖后台清理);用毕置 `used_at`;重置成功同 batch 删除该用户全部 sessions。

## 2. 新增:Dexie 表 `quizResults`(db version 4 → 5)

服务:AC-002/003/004/005。本地唯一新增持久化;**不进云同步 payload**(ADR-007)。

```ts
// db.ts 新增 version(5).stores({ ..., quizResults: 'id, ownerId, completedAt, mode' })
interface QuizResult {
  id: string;              // crypto.randomUUID()
  ownerId: string;         // getLocalOwnerId() —— 与其他本地表同款归属隔离
  mode: 'definition' | 'spelling';   // 看词选义 / 见义拼词
  total: number;           // 本轮题数(去重重练后唯一词数,如 10)
  correct: number;         // 首答正确数(重练答对不计入 correct,只影响本轮是否结束)
  wrongNormalized: string[]; // 首答错误的词(normalized),供看板与"错词"展示
  completedAt: number;     // 结束时间戳(看板日界用它,Asia/Shanghai)
}
```

- 写入:一轮结束时单条 `put`;断网照写(AC-004 断网判据)。
- 读取:`/stats` 按 `completedAt` 范围 `where('ownerId').equals(...)` 过滤后聚合。
- 半轮(未结束退出)**不落库**。

## 3. 被消费的现有结构(不改,列出供实现对照)

| 结构 | 位置 | 本轮用途 | 关键字段 |
|---|---|---|---|
| `users` / `sessions` | 迁移 0002 | 忘记密码定位用户、重置后吊销会话(`DELETE FROM sessions WHERE user_id = ?`) | users.id/email/password_hash;sessions.user_id/token_hash |
| `email_verification_tokens` | 迁移 0004 | **模式来源**(哈希/有效期/重发间隔),不改动 | token_hash = sha256(userId:code) |
| `generation_usage` | 迁移 0004 | 日级配额继续由它承担(ADR-001),不动 | user_id/day_key/status |
| `progressRecords`(Dexie) | db v2+ | 看板"每日阅读量/得分趋势-阅读序列" | articleId/score/completedAt |
| `articleRecords`(Dexie) | db v3+ | 看板"词汇复现率"分子(vocabHitIds 并集) | vocabHitIds: string[] |
| `vocabLists` / `vocabItems` | db v2+ | 看板分母(当前激活词库总词数)、测验抽词源 | settings 键 `activeVocabListId` 定位激活库 |
| `dictionary_entries` / `dictionary_forms` | 迁移 0005/0006 | 测验释义与干扰项来源(经 /api/dictionary/batch) | definition_zh(meaningCN)/headword |
| `content_articles` | 迁移 0005/0007 | daily 收敛(ADR-006)后唯一数据源 | status/publish_date |
| `daily_articles`(legacy) | 迁移 0001 | **只读过渡**,AC-011 完成后代码零引用、迁移文件保留 | — |

## 4. 指标口径(与 spec §5.2 一致,tech-spec 落地为可测函数)

- `每日阅读量(day)`: 当日(Asia/Shanghai,复用 worker `chinaDayKey` 同款时区逻辑——前端在 `src/lib/stats.ts` 实现同构纯函数并加单测)`progressRecords.completedAt` 落入该日历日的记录数。
- `词汇复现率(window)`: `union(articles.vocabHitIds over 窗口内已完成阅读)  ∩  当前激活词库 normalized 集合` 的词数 ÷ 激活词库总词数。交集取法防"旧词库命中残留"计入新词库。
- `得分趋势`: 阅读序列 = `progressRecords.score / 该文题目数`;测验序列 = `quizResults.correct / total`。按日聚合,双序列折线。
