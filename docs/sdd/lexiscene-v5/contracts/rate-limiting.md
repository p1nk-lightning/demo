# 契约 · 请求级限流(Rate Limiting binding · AC-009 · ADR-001)

## 配置(wrangler.toml,替换被注释的 KV 段)

```toml
[[ratelimit.bindings]]
name = "RATE_LIMITER"
namespace_id = "1001"   # 整数即可;同 namespace 的 binding 共享计数器
```

- 要求 wrangler ≥ 4.36(项目 worker 4.119 ✓);本地 `wrangler dev` 与 `@cloudflare/vitest-plugin` 均内置模拟,无需真实资源。
- `Env` 类型:`RATE_LIMITER?: { limit(key: { key: string }): Promise<{ success: boolean }> }`(本地最小接口,不引 @cloudflare/workers-types)。

## 行为规约

- **替换对象**:现 `checkRateLimit()`(index.ts:628-645)整体重写:
  - 有 binding:`const { success } = await env.RATE_LIMITER.limit({ key: ip });return success;`
  - 无 binding(dev 兜底):保留现有内存 Map 逻辑不动。
  - **删除** KV 分支与 `RL` 字段、wrangler.toml 注释的 `[[kv_namespaces]]` 段。
- 窗口与阈值:**60 秒 / 10 次**(binding 仅支持 10s 或 60s 窗口;现行为 10/min 等价迁移)。计数按 Cloudflare 地域分片——对 ≤20 人场景视为精确。
- 适用端点(现状不变):`/api/auth/register`、`/api/auth/login`、`/api/auth/verify-email`、`/api/generate`、**新增** `/api/auth/forgot-password`、`/api/auth/reset-password`。
- **429 响应**沿用各端点现有文案(如 `{"error":"请求过于频繁，请稍后再试"}`),前端零改动。

## 明确不进 binding 的(日级配额,维持 D1)

| 配额 | 载体 | 说明 |
|---|---|---|
| 每用户生成 10 篇/天、2 次/分 | `generation_usage`(单 SQL 原子) | 现状保留(ADR-001) |
| 每邮箱重置码 ≤5 次/24h | `password_reset_tokens` COUNT | 静默抑制,见 auth-password-reset.md |
| "每 IP 每日 100 次" | 不实现 | spec BR-08 的日额度在账号化后已由 per-user 配额承担;AC-009 修订案已注明 |
