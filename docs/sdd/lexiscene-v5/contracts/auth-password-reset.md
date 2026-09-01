# 契约 · 忘记密码与重置密码(AC-006 · ADR-005)

> 两个新端点,全部在 `worker/src/routes/auth.ts`(拆分后)。错误响应统一 `{ error: string }`。

## POST /api/auth/forgot-password

**请求**(zod: `ForgotPasswordRequestSchema`)
```json
{ "email": "user@example.com" }
```

**响应 — 所有有效请求一律 200(防枚举,ADR-005)**
```json
{ "ok": true }
```

**错误**(唯一两类,均不泄露邮箱注册状态)
| HTTP | 条件 | body |
|---|---|---|
| 400 | JSON 缺失/邮箱格式非法 | `{"error":"请输入有效邮箱地址"}` |
| 429 | 同 IP 1 分钟超限(Rate Limiting binding) | `{"error":"请求过于频繁，请稍后再试"}` |

**行为规约**
- 邮箱存在且通过限流:删旧未用码 → 生成 6 位码 → `sha256(userId:code)` 入库(10 分钟)→ Resend 发码 → 200。
- 邮箱**不存在**:直接返回 200(不发邮件、不查库也可返回——但为对齐日限语义,统一走"查无此邮箱即 200"分支)。
- 邮箱存在但 24h 内已达 5 次,或 60 秒内已有发码:**静默抑制**,仍返回 200。
- 邮件服务异常:记 `console.error`,仍返回 200(不把 Resend 状态回显给客户端)。
- 限流层级:IP 级走 binding(与 register/login 共用 10/min 策略);邮箱级日限走 D1(≤5/24h)。

**真实文案**(邮件正文,复用现有验证码邮件模板,主题换为"密码重置"):
> 你的 LexiScene 密码重置验证码是:123456(10 分钟内有效。若不是你本人操作,请忽略本邮件。)

## POST /api/auth/reset-password

**请求**(zod: `ResetPasswordRequestSchema`)
```json
{ "email": "user@example.com", "code": "123456", "newPassword": "at-least-8-chars" }
```

**成功响应 200**(吊销所有会话:UPDATE 密码 + 置 used_at + DELETE sessions 同一 D1 batch)
```json
{ "ok": true }
```
Set-Cookie 清除会话 cookie(`Max-Age=0`)。

**错误响应**
| HTTP | 条件 | body |
|---|---|---|
| 400 | JSON/schema 不合法 | `{"error":"请输入有效邮箱、6 位验证码和至少 8 位的新密码"}` |
| 400 | 无有效未用码(过期/不存在) | `{"error":"验证码已失效，请重新发送"}` |
| 400 | 码错误(attempts < 5):attempts+1 | `{"error":"验证码不对或已过期，请重新输入或重新发送"}` |
| 400 | attempts 达 5:该码作废(DELETE) | `{"error":"错误次数过多，请重新发送验证码"}` |
| 429 | 同 IP 1 分钟超限 | `{"error":"请求过于频繁，请稍后再试"}` |

**禁止副作用**
- 错误响应不得区分"邮箱不存在"与"验证码错误"(未注册邮箱返回同款"验证码已失效/不对"文案)。
- 新密码校验与注册一致(`min(8).max(128)`);密码哈希沿用 `hashPassword()`(PBKDF2-SHA512)。
- 重置成功后,该用户**所有** sessions 失效(含其他设备);`last_seen_at` 更新路径不必清理。
- 不挂 Turnstile(ADR-005 取舍;滥用兜底 = IP 限流 + 邮箱日限)。

**验证口径(供 AC-006)**
- 未注册邮箱与已注册邮箱的 `/forgot-password` 响应字节级一致(仅 `{"ok":true}`)。
- 重置成功后,另一浏览器持旧 cookie 调 `/api/auth/me` → 401。
