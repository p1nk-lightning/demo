# LexiScene V5 · 技术方案(plan.md · 方案部分)

> source: spec.md(已批准,2026-09-01)
> **无设计稿说明**:用户裁决跳过外部设计稿,接口契约与 UI 行为以 spec §5 页面状态描述为基准;UI 实现时若与 spec §5 有出入,需回来复核对应契约。
> 排期部分(tasks/批次/worktree)在 HARD-GATE 1 通过后追加到本文件下半部。

---

## Phase -1 Gates(新增依赖/抽象的书面辩护)

| 引入项 | Simplicity(能更少部件吗) | Anti-Abstraction(≥2 个当下用例?) | Integration-First(最薄切片) | 裁决 |
|---|---|---|---|---|
| recharts(图表) | 备选"手写 SVG":双序列折线+日期轴手写约 200+ 行且要自己处理缩放/空数据,比引一个声明式库部件更多 | ✓ 看板 3 张图(柱状/双序列折线/复现率曲线)同库复用 | 先出"每日阅读量"单图接真数据,再加另两张 | **采纳** |
| react-error-boundary(异常边界) | 备选"手写 20 行类组件":可行,但 reset 语义(路由切换清除错误态)要自己维护;库仅 3KB | ✓ 全局边界 + 路由级边界(9 个路由)两处用例 | 先包全局,再包路由 | **采纳** |
| @cloudflare/vitest-plugin(Worker 绑定测试) | 备选"纯 app.request()+mock env":路由逻辑用它,但 D1 原子性/会话吊销 mock 测不出真语义;plugin 跑真 miniflare 零 mock | ✓ 配额原子性(reserveGeneration)、忘记密码会话吊销、同步 upsert 三组用例 | 先用 app.request() 测纯路由,再补 D1 集成测试 | **采纳(与 app.request 分工并存)** |
| fake-indexeddb(Dexie 测试) | jsdom/happy-dom 均无 IndexedDB(jsdom #1748 八年未决),没有更简替代 | ✓ quizResults 写读、Dexie v4→v5 迁移、软删除过滤 | 先跑通单表读写,再测迁移 | **采纳** |
| shared/contracts.ts(双端类型单源) | 备选"codegen/多包 workspace":过度;一个文件 + 两个 tsconfig include 是最少部件 | ✓ 前端 domain 类型 + worker zod 校验两处消费 | 先迁 Question/Word,再迁 sync payload | **采纳** |
| Playwright(E2E 冒烟) | 组件级浏览器测试(@playwright/experimental-ct-react)更重,不做 | ✓ AC-017 冒烟 + AC-012 拆分行为基线 | 一条链路一条 spec 文件 | **采纳** |
| zod v4 升级 | 本轮加固不应夹带 schema 库大版本迁移(zod 3.23→4.5 有 API 破坏点) | 单源用 v3 的 z.infer 已满足 | — | **否决(下轮单独做)** |
| KV 限流(spec 原设想) | 见 ADR-001:KV 最终一致 + 同 key 1 写/秒,做计数器是错的部件 | — | — | **否决,换 Rate Limiting binding** |

---

## 目标架构(改造后)

```
[浏览器]
   │  (生产: Vercel /api/* → Worker 同域代理;开发: 127.0.0.1:5173 → 127.0.0.1:8787)
[React SPA + HashRouter]
   ├ pages/(9 现有 + QuizPage/StatsPage/ForgotPasswordPage/ResetPasswordPage)
   ├ lib/(vocab/highlight/dict/llm/db/sync + 新 quiz.ts/stats.ts)
   ├ store/(zustand × 2)
   └ types/domain.ts ——重导自→ shared/contracts.ts(单一来源)
[Cloudflare Worker]  src/ 拆分:
   ├ index.ts           挂载与导出(≤300 行)
   ├ schemas.ts         zod 请求/响应 schema(自 shared/contracts 派生扩展)
   ├ lib/wordstats.ts   纯函数: 词数/命中/句长统计        ← 单测
   ├ lib/validation.ts  纯函数: 生成文章/公开文章质量校验  ← 单测
   ├ lib/time.ts        纯函数: 北京日期键/轮换日判断      ← 单测
   ├ lib/rate-limit.ts  限流(Rate Limiting binding + 内存兜底) ← 单测
   ├ routes/auth.ts     注册/登录/登出/me/验证邮箱/忘记密码/重置密码
   ├ routes/sync.ts     snapshot/push
   ├ routes/dictionary.ts / routes/content.ts / routes/daily.ts / routes/generate.ts
[Cloudflare 托管]  D1(lexiscene) + Rate Limiting binding + Cron + Resend + Turnstile
```

为什么这么搭:不换平台、不加服务——所有改动都在现有 Vite+React+Worker 三件套内;唯一新增的"服务"是 Cloudflare 原生 binding(零账号、零账单)。

---

## 复用清单(功能 → 轮子 → 为什么 → 成本)

| 功能 | 选型 | 链接 | 判据数据(2026-09-01 实测) | 月成本 |
|---|---|---|---|---|
| 看板图表 | **recharts ^3.10.1** | github.com/recharts/recharts | MIT;27.5k star;当日仍有提交;npm 周下载 5730 万(visx/xychart 52 万、chart.js 1290 万但 canvas 指令式不适配 React 声明式风格,echarts 1MB 级过重) | $0 |
| 异常边界 | **react-error-boundary ^6.1.4** | github.com/bvaughn/react-error-boundary | MIT;7.9k star;周下载 1580 万;peer react ^18‖^19;项目是 ESM 无 v5 兼容问题 | $0 |
| FE 单测 | **vitest ^4.1 + @testing-library/react ^16.3.3 (+ dom ^10) + jest-dom ^7 + fake-indexeddb ^6.2.5** | vitest.dev;github.com/dumbmatter/fakeIndexedDB | 全 MIT;vitest 周下载 9990 万;RTL peer react ^18‖^19;fake-indexeddb 周下载 570 万、Apache-2.0、2026-05 仍提交、Dexie 4 兼容零已知 issue(jsdom 无 IndexedDB,#1748 八年 open) | $0 |
| Worker 绑定测试 | **@cloudflare/vitest-plugin ^1.1.2**(vitest ^4.1) | developers.cloudflare.com/workers/testing/vitest-integration/ | 官方现行方案(取代 vitest-pool-workers 0.x);真 workerd+Miniflare,per-test 存储隔离,D1/KV 绑定直测 | $0 |
| E2E 冒烟 | **@playwright/test ^1.62** | github.com/microsoft/playwright | Apache-2.0;95k star;与 vitest 无耦合,共存是标准做法 | $0 |
| 请求级限流 | **Cloudflare Rate Limiting binding**(原生) | developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ | 2025-09-19 GA,官方原话"recommended for all production workloads";零费用;wrangler ≥4.36(项目 4.119 ✓) | $0 |
| 邮件/人机验证/托管 | **Resend(已有)/ Turnstile(已有)/ Vercel+Workers(已有)** | resend.com/pricing | Resend 免费 3000 封/月、100 封/天;Turnstile 免费无限次 | $0 |

**自研边界**:只有三样自研——测验出题/判分逻辑(核心差异化,现成轮子给不了"你的词表+内置词典出题")、看板聚合口径、质量校验测试。其余全部现成。

---

## 技术选型矩阵(结论备查)

| 决策点 | 候选 | 契合 | 维护/熟悉 | 运维 | 成本 | 结论 |
|---|---|---|---|---|---|---|
| 限流计数器 | Rate Limiting binding / KV / D1 自建 / Durable Objects | binding ✓(10/60s 窗口正合 10 次/分) | 原生 API 一行调用 | 零 | 零 | **binding**;日级配额继续用 D1(generation_usage 已是此模式);KV 最终一致(60s+)+ 同 key 1 写/秒,直接否决 |
| 图表 | recharts / visx / chart.js / echarts | recharts 声明式贴 React | 5730 万周下载最活跃 | 无 | 无 | recharts |
| 类型单源 | 共享 zod 文件 / codegen / workspace 多包 | 共享文件最薄 | zod v3 z.infer(2.75 亿周下载,无替代必要) | 零 CI 步骤 | 无 | shared/contracts.ts;zod v4 升级出轮 |
| Dexie 测试 | fake-indexeddb / Playwright ct / 不测 | 唯一可行的是前两者组合 | fake-indexeddb 社区事实标准 | 无 | 无 | fake-indexeddb;迁移路径留 Playwright 兜底 |
| Worker 测试 | vitest-plugin / 纯 app.request / miniflare 裸用 | 互补而非互斥 | 官方文档+codemod 齐全 | 无 | 无 | app.request 测路由逻辑;plugin 测绑定语义 |

---

## ADR(架构决策记录)

### ADR-001 · 限流弃 KV,改用 Cloudflare Rate Limiting binding(含 spec AC-009 修订)
- 状态: 提议(随 Gate 1 确认) · 日期: 2026-09-01 · 关联: AC-009
- 背景: spec AC-009 预设"启用 KV binding 做限流"。调研证实 Cloudflare KV 是最终一致存储(变更传播 60 秒以上,同 key 写上限 1 次/秒),现代码的 get→put 读改写在多副本下必漏计——这正是"限流形同虚设"的根因,启用 KV 修不好它。
- 决策: 用官方 **Rate Limiting binding**(GA,免费):`env.RATE_LIMITER.limit({key: ip})`,窗口 60 秒,阈值维持 10 次/分;wrangler.toml 增加 `[[ratelimit.bindings]]`;删除 KV 路径与 `RL` 注释配置;无 binding 时(本地 dev/测试)保留现有内存 Map 兜底。日级配额不进 binding(binding 只支持 10s/60s 窗口):生成配额维持 D1 `generation_usage` 现状,重置码每邮箱每日 ≤5 次用 D1 计数。
- 候选与权衡: binding(强一致@单地域、零成本、一行 API / 选中)vs KV(最终一致、必漏计 / 否决)vs D1 自建计数(每请求多一次 D1 写,免费额度 10 万写/天可承受但纯浪费 / 不选)vs Durable Objects(强一致但要新付费档与 SQL 之外的心智 / 杀鸡用牛刀)。
- 后果: 正向——限流真正生效、代码变少、零新增账单。代价——计数按 Cloudflare 地域分片(不是全局精确值),对 ≤20 人场景无影响。回视条件——若未来需要跨地域精确全局限流或小时级窗口,再评估 D1/DO。

### ADR-002 · Worker 拆分两阶段:先纯函数后路由,测试卡在中间
- 状态: 提议 · 日期: 2026-09-01 · 关联: AC-001, AC-012
- 背景: index.ts 1330 行且**零导出**,直接写单测无从 import;但整体路由拆分又必须有测试护栏(spec 明令"先测试后拆")。
- 决策: 阶段 A 只做**纯移动**:把无副作用函数抽到 `worker/src/lib/`(wordstats / validation / time / rate-limit)与 `schemas.ts`,index.ts re-import,行为零变化(判据:typecheck+build 过)。阶段 B 在单测(AC-001)与 E2E 冒烟(AC-017)就位后,按路由域拆 `routes/`,入口 ≤300 行(AC-012)。
- 后果: 正向——测试与拆分互不阻塞、每步可独立 review。代价——阶段 A 是一次"无用户可见价值的移动",但它是 AC-001 的物理前提。回视条件——无。
- 附注: AC-001 验收包含"Worker 校验逻辑测试",其前置是阶段 A——任务编排时阶段 A 排在测试之前、路由拆分之前。

### ADR-003 · 双端类型单源:`shared/contracts.ts`(zod v3),不升 zod v4
- 状态: 提议 · 日期: 2026-09-01 · 关联: AC-013
- 背景: domain.ts 与 worker 内联 schema 双拷贝漂移(spec A4)。zod v4 已稳定(4.5.4)但迁移有 API 破坏点(message→error 等),本轮是加固轮,不宜夹带。
- 决策: 新建仓库根 `shared/contracts.ts`,收编跨边界契约:Difficulty/WordSource/Topic/ModelProvider/Question/Word/VocabularyList/VocabularyItem/SyncPayload(sync 四表)/GenerateRequest/GenerateResponse/DictItem,全部 zod schema + `z.infer` 导出类型。worker 以相对路径 import;前端经 Vite alias `@shared/contracts` + tsconfig paths import,`types/domain.ts` 改为 re-export + 前端本地扩展(localId/isFavorite 等 UI 字段保留在 domain.ts)。内容库管理 API(contentItem/admin)类型留在 worker 本地——它们不跨端。
- 候选: 共享文件(选中,零 CI/零新包)/ zod v4+codegen(引入构建步)/ workspace 多包(过度)。
- 后果: 正向——契约改一处双端同步,tsc 兜底。代价——两份 tsconfig/vite 配置要加 include(一次性);zod 停在 v3(已列下轮)。回视条件——FE/worker 出现第三消费方或开始 monorepo 化时,重评 workspace。

### ADR-004 · 测试栈分工:vitest(node+jsdom)+ fake-indexeddb + @cloudflare/vitest-plugin + Playwright
- 状态: 提议 · 日期: 2026-09-01 · 关联: AC-001, AC-016, AC-017
- 决策: 根包(FE):vitest ^4.1,node 环境测纯函数(vocab/highlight/schemas/quiz/stats),jsdom 环境测组件 + `fake-indexeddb/auto` setup 测 Dexie(每用例 `Dexie.delete` 隔离);worker 包:vitest ^4.1 + `app.request()` 测路由逻辑 + @cloudflare/vitest-plugin 测 D1 绑定语义(配额原子性/会话吊销/同步 upsert;注意官方 known-issue:响应体必须消费完整,否则隔离回滚不稳)。E2E:`@playwright/test` 独立 `e2e/` 目录,glob 与 vitest 互斥(`*.test.*` vs `*.spec.ts`)。
- 后果: 正向——一个 runner 生态覆盖四层,零服务新增。代价——worker 的 vitest-plugin 版本线与 wrangler/miniflare 联动(锁 ^4.1/^1.1.x);Playwright 要下浏览器二进制(一次性)。回视条件——plugin 与 vitest 大版本脱节时锁版本不动。

### ADR-005 · 忘记密码:复用验证码模式,新表 password_reset_tokens,重置吊销全部会话
- 状态: 提议 · 日期: 2026-09-01 · 关联: AC-006
- 决策: D1 迁移 `0008_password_reset_tokens`(结构见 data-model.md)。流程照抄 email_verification_tokens 模式:6 位码、`sha256(userId:code)` 哈希存储、10 分钟有效、60 秒内不重复发码、每邮箱每日 ≤5 次(D1 COUNT)。防枚举:无论邮箱是否存在,**有效请求一律 200 + 统一文案**(60 秒/日限的抑制也是静默的,不返回差异化信息——详见 contracts/auth-password-reset.md 的取舍说明)。重置成功 = 更新密码 + 删除该用户全部 sessions + 清 cookie,同一 batch 原子完成。不挂 Turnstile(防枚举靠统一文案 + 限流,朋友规模足够)。
- 后果: 正向——用户自助,零人工 reset。代价——静默抑制意味着狂点用户收不到"刚发过"的明确提示(换来的是不泄露注册状态);IP 级 429 兜底滥用。回视条件——若出现邮件轰炸滥用,再给 forgot 端点挂 Turnstile。

### ADR-006 · daily 双路径收敛与统一 onError(含顺序硬约束)
- 状态: 提议 · 日期: 2026-09-01 · 关联: AC-004(spec 健壮性线), AC-011
- 决策: ① index.ts 增加 `app.onError` → `console.error(路由+堆栈)` + 统一 JSON `{error:'服务器开小差了,稍后再试'}` 500(替代裸文本 500)。② daily 的 legacy `daily_articles` 回退分支,**仅在远程 D1 迁移与数据核验完成后删除**(顺序:AC-010 迁移 → 验证 3 天 → AC-011 删);删除后新表查不到数据显式返回空列表并 `console.error` 标记,不再静默换表。
- 后果: 代价——收敛动作横跨发布前后两个时点,任务编排必须体现依赖;正向——线上行为可预期、服务端有日志可查。

### ADR-007 · 看板数据全部本地聚合,不上云同步测验记录
- 状态: 提议 · 日期: 2026-09-01 · 关联: AC-004(测验记录), AC-005
- 决策: 测验结果只写本地 Dexie(`quizResults`,v5 迁移);看板三指标全部在本地聚合(progressRecords/articleRecords/quizResults)。**不改 SyncPayloadSchema**(不扩云同步)——Phase -1:多设备看板一致性是"以后可能用到",本轮砍;表结构已带 ownerId,将来扩同步只加 schema 字段,不返工。
- 后果: 正向——零契约变更、零 worker 改动、离线全可用。代价——换设备看板看不到测验历史(阅读进度仍同步)。回视条件——用户真提出跨设备看板需求时,加 sync 字段即可。

---

## 四维自检结论

| 维度 | 结论 | 理由 |
|---|---|---|
| 上线门槛 | **过** | 全托管(Vercel 前端 + Workers 后端),无服务器/证书/进程。发布 = "在线升级":盘点 → 全表备份 → 迁移核对 → 数据灌装(词典+内容池,这是本次发布的实质主体)→ 版本级部署(可回滚)→ 合并 main,已写成 AC-010 runbook。 |
| 成本曲线 | **过** | 零用户 $0/月(Workers Free 10 万请求/天、D1 免费 500 万行读/天、Turnstile 免费、Resend 免费 100 封/天)。≤20 朋友日活仍 $0 基础设施;唯一变量是 LLM 生成费(20 人 × 10 篇/天 × ~4k token ≈ 80 万 token/天 ≈ ¥1/M 计价下 **~¥25/月**)。跳变项已点名:LLM API 费与 Resend 日限(超 100 封/天才需 $20/mo Pro,20 人规模不会)。 |
| 体验与性能 | **过** | 测验/看板数据全本地,秒开零往返(词典释义批量一次 /api/dictionary/batch);生成是已有异步流程带 loading;ErrorBoundary 保证坏页不拖垮全局。 |
| 稳定性 | **过** | LLM 已有三路 provider 适配层(换供应商不动业务代码);配额扣减在 D1 单 SQL 原子完成(reserveGeneration 现状保留);限流换成强一致 binding;失败路径(生成 502/词典 fallback/同步 5s 重试)现有兜底保留。 |
| 一个人维护(加试) | **过** | 服务数量零新增:Rate Limiting binding 是 Cloudflare 原生,图表/测试库是 dev 依赖不是服务。没有新账号、新账单、新控制台。 |

---

## 生产现状盘点(2026-09-01 实测,只读探测;用户确认项目已上线 lexiscene.online)

| 探测 | 结果 | 推断 |
|---|---|---|
| `www.lexiscene.online` | 正常返回 SPA,标题"词境阅读 · LexiScene" | 前端在线(登录门内使用) |
| `workers.dev/healthz` | `{ok:true, version:2}` | Worker 在线;版本号从未随代际升过,**不能**以此判断部署的是哪一代代码 |
| `workers.dev/api/daily?difficulty=CET4` | `{items:[], source:"d1"}` | 走到了 legacy `daily_articles` 分支且今日 0 条——**朋友现在打开就是"今日文章为空"**;新内容池要么表未建、要么没有已发布文章 |
| `workers.dev/api/dictionary?word=analyze` | `{items:[], source:"builtin"}` | 词典查询未抛错(表结构在)但 'analyze' 无词条——**远程词典表是空壳,21000 条数据从未灌入远程** |

**结论:发布线的性质从"首次上线"改为"给在线系统补数据 + 升级代码"**。生产此刻真实可用但内容空腹。发布 runbook(AC-010)相应扩为:

1. **盘点**(只读):`wrangler d1 migrations list lexiscene --remote` + 逐表 `SELECT COUNT(*)`(users/sessions/dictionary_entries/content_articles/daily_articles),摸清远程迁移与数据底数
2. **备份**(硬条件):`wrangler d1 export lexiscene --remote --output backup-<date>.sql`(全表,不止候选)
3. **迁移核对**:补齐远程缺失迁移(0005-0007 是否已应用以盘点结果为准,不按文档假设)
4. **数据灌装**(本发布的关键新增):词典数据导入远程(本地已有 21000 条,复用 V3 的导入脚本/产物)+ 内容池远程重建(V4 log 既有命令 `seed:content-pool --remote`,远程候选数以盘点为准——大概率为 0,"全量替换"实际无破坏)
5. 部署 Worker(先 `wrangler versions upload` 灰度验证 `/healthz` 与 `/api/daily`,再切流量)→ 合并 main
6. **回滚预案**:Worker `wrangler rollback`(版本级);前端 Vercel 即时回滚;D1 迁移不可自动回滚 → 靠第 2 步备份兜底

---

## 对已批准 spec 的修订项(Gate 1 随方案一并确认)

1. **AC-009 的"怎么"从 KV 改为 Rate Limiting binding**(ADR-001):验收行为不变——"同一 IP 1 分钟内第 11 次请求受保护端点 → 429";删除"第 101 次日请求受限"子句(日级配额维持 D1 per-user 现状,spec BR-08 的"每 IP 每日 100 次"在现行代码中已由 per-user 生成配额承担)。批准后我把 spec 对应两行改掉并留痕。
2. **AC-010 扩写为"在线升级 + 数据灌装"runbook**(见上):新增盘点与回滚两个硬步骤;"远程重建文章池"大概率无破坏(远程候选预计为 0,以盘点为准),备份条件保留升级为全表导出。
3. AC-016 的验证依赖 AC-017 的 E2E 顺序,无冲突;AC-001 的 Worker 测试前置 = ADR-002 阶段 A,任务编排已体现。

---

## 平台能力探底(2026-09-01 实测,批 1 后按执行现实修正)

| 探测项 | 结果 | 结论 |
|---|---|---|
| git 仓库 / 工作区 | `git rev-parse --git-dir` 通过;工作区干净 | worktree 可用 |
| 原生 worktree 隔离入口 | 无平台一键隔离参数;git 原生 worktree 可用 | 批 1 实际建 4 棵树,正常 |
| 并发子 agent | **实测并发上限 2**(派 4 个,后 2 个报 concurrency limit);且子 agent 存在配额中断风险(T1 于 10 分钟后因 quota 失败) | **降级:主对话按批次串行执行,每批内部顺序完成任务;批次/判据/gate 不变** |
| 后台长任务 | 可用(run_in_background) | — |

**降级说明(明示)**:原计划每批多线并行子 agent;因并发上限 2 + 子 agent 配额中断,自批 1 收尾起改为**主对话串行执行**——同一份 tasks.md、判据与批间 gate 一条不减,代价是总时长约为并行计划的 2–3 倍。批 1 的 T2 仍由子 agent 成功完成,T1 由主对话接手完成(其部分产物经验证后收编)。

---

## 批次编排(批间是 gate:上一批全绿合入主干,才开下一批)

| 批次 | 任务 | 并行度 | 合并顺序(为什么) |
|---|---|---|---|
| 批 1 | T1 / T2 / T3 / T4 | 4 线 | T1(定 schemas 与 lib 位置)→ T2(依赖供后续)→ T4 → T3(独立可随时) |
| 批 2 | T5 / T6 / T7 / T8 | 4 线 | T7(契约单源先合,全库受益)→ T5 → T8 → T6 |
| 批 3 | T9 / T10 / T11 / T12 | 4 线 | T9(路由文件是批 4 三条线的地基)→ T10 → T11 → T12 |
| 批 4 | T13 / T14 / T15 / T16 / T17 / T18 | 6 线 | T15(限流签名)→ T13 → T14 → T16 → T17 → T18 |
| 批 5 | T19 / T20 + T21(串行收尾) | 2 线 + 1 | T20(版本号先定)→ T19 → T21 本地全量冒烟 |
| 批 6 | T22 → T23 → T24 | 串行 | 发布 runbook(需用户 Cloudflare 授权参与) |

**关键路径**(最长串行链,决定最快完工):`T1 → T5 → T9 → T13 → T19 → T21 → T22 → T23 → T24`。想提速只能拆短关键路径上的任务;FE 线(T2→T8→T10→T16→T19)与之等长,两条大动脉并行互不阻塞。

---

## 批次 1 · 并行执行清单(4 线)

线 A  ../lexiscene-v5-t1  分支 v5/t1-worker-pure
      文件: worker/src/lib/wordstats.ts, worker/src/lib/time.ts, worker/src/lib/validation.ts, worker/src/schemas.ts, worker/src/index.ts
      任务: T1 纯函数提取(纯移动)
      判据: worker `npx tsc --noEmit` 0 + 根 `npm run typecheck` 0 + index.ts diff 无逻辑改动
      合并: 第 1 位(定 schemas/lib 布局,批 2 测试 import 它)

线 B  ../lexiscene-v5-t2  分支 v5/t2-fe-testbed
      文件: package.json, package-lock.json, vitest.config.ts, src/test/setup.ts, playwright.config.ts, e2e/.gitkeep, .gitignore
      任务: T2 前端测试与依赖地基
      判据: `npx vitest --run --passWithNoTests` 0;`npx playwright install chromium` + `npx playwright --version` 有输出
      合并: 第 2 位

线 C  ../lexiscene-v5-t3  分支 v5/t3-docs-archive
      文件: docs/history/(新建), 根目录 7 份过程文档(移动), vite.config.js, vite.config.d.ts, tmp/
      任务: T3 文档归档与死文件清理
      判据: 根目录仅剩活跃文件;typecheck+build 仍 0
      合并: 第 3 位(独立,任意空档合入)

线 D  ../lexiscene-v5-t4  分支 v5/t4-worker-testbed
      文件: worker/package.json, worker/package-lock.json, worker/vitest.config.ts
      任务: T4 Worker 测试配置
      判据: `cd worker && npx vitest --run --passWithNoTests` 0
      合并: 第 4 位

批 1 gate: 四线判据全绿且全部合回主干,才开批 2。

## 批次 2 · 并行执行清单(4 线)

线 A  ../lexiscene-v5-t7  分支 v5/t7-shared-contracts
      文件: shared/contracts.ts, worker/src/schemas.ts, src/types/domain.ts, tsconfig.json, vite.config.ts, worker/tsconfig.json
      任务: T7 双端契约单源
      判据: 双端 tsc 0;字段级定义全库唯一
      合并: 第 1 位(类型源先定)

线 B  ../lexiscene-v5-t5  分支 v5/t5-worker-lib-tests
      文件: worker/src/lib/wordstats.test.ts, worker/src/lib/time.test.ts, worker/src/lib/validation.test.ts
      任务: T5 Worker 纯函数单测
      判据: `cd worker && npx vitest --run` 全绿(含脏输入用例)
      合并: 第 2 位

线 C  ../lexiscene-v5-t8  分支 v5/t8-dexie-v5
      文件: src/lib/db.ts, src/lib/db.test.ts
      任务: T8 Dexie v5 + 测验存取
      判据: vitest 全绿(含 v4→v5 迁移用例);apiProfiles 零活引用
      合并: 第 3 位

线 D  ../lexiscene-v5-t6  分支 v5/t6-fe-lib-tests
      文件: src/lib/vocab.test.ts, src/lib/highlight.test.ts, src/lib/schemas.test.ts, src/lib/utils.test.ts, src/lib/sync.test.ts
      任务: T6 前端现有模块单测
      判据: `npx vitest --run` 全绿(含 sync 乱序竞态)
      合并: 第 4 位

批 2 gate: 四线全绿合入,才开批 3。

## 批次 3 · 并行执行清单(4 线)

线 A  ../lexiscene-v5-t9  分支 v5/t9-worker-split
      文件: worker/src/routes/auth.ts, routes/sync.ts, routes/dictionary.ts, routes/content.ts, routes/generate.ts, worker/src/lib/session.ts, worker/src/types.ts, worker/src/index.ts
      任务: T9 路由拆分 + onError + 删注释路由块
      判据: index.ts ≤300 行;T5 测试拆分前后同绿;`npx wrangler deploy --dry-run` 0
      合并: 第 1 位(批 4 三条 Worker 线的地基)

线 B  ../lexiscene-v5-t10  分支 v5/t10-quiz
      文件: src/lib/quiz.ts, src/lib/quiz.test.ts, src/pages/QuizPage.tsx
      任务: T10 词汇测验竖切
      判据: quiz.test.ts 四组用例全绿
      合并: 第 2 位

线 C  ../lexiscene-v5-t11  分支 v5/t11-stats
      文件: src/lib/stats.ts, src/lib/stats.test.ts, src/pages/StatsPage.tsx
      任务: T11 学习看板竖切
      判据: stats.test.ts 三指标口径断言全绿
      合并: 第 3 位

线 D  ../lexiscene-v5-t12  分支 v5/t12-forgot-fe
      文件: src/lib/auth.ts, src/pages/ForgotPasswordPage.tsx, src/pages/ResetPasswordPage.tsx
      任务: T12 忘记密码前端
      判据: typecheck 0;倒计时/错误态有断言或登记进 e2e
      合并: 第 4 位

批 3 gate: 四线全绿合入,才开批 4。

## 批次 4 · 并行执行清单(6 线)

线 A  ../lexiscene-v5-t15  分支 v5/t15-ratelimit
      文件: worker/src/lib/rate-limit.ts, worker/src/lib/rate-limit.test.ts, worker/src/types.ts, worker/wrangler.toml
      任务: T15 限流切 Rate Limiting binding
      判据: rate-limit.test.ts 两路径断言;wrangler.toml 无 kv_namespaces
      合并: 第 1 位(限流签名先定)

线 B  ../lexiscene-v5-t13  分支 v5/t13-forgot-be
      文件: worker/migrations/0008_password_reset_tokens.sql, worker/src/routes/auth.ts, worker/src/routes/auth.test.ts
      任务: T13 忘记密码后端
      判据: worker vitest 全绿;未注册/已注册 forgot 响应字节级一致
      合并: 第 2 位

线 C  ../lexiscene-v5-t14  分支 v5/t14-daily
      文件: worker/src/routes/content.ts
      任务: T14 daily 双路径收敛
      判据: grep daily_articles 零匹配(迁移除外);vitest 全绿
      合并: 第 3 位

线 D  ../lexiscene-v5-t16  分支 v5/t16-routes-eb
      文件: src/App.tsx, src/main.tsx, src/components/AppErrorFallback.tsx, src/components/AppErrorFallback.test.tsx
      任务: T16 路由注册 + ErrorBoundary
      判据: 兜底测试全绿;四路由注册
      合并: 第 4 位

线 E  ../lexiscene-v5-t17  分支 v5/t17-empty-states
      文件: src/pages/HomePage.tsx, src/pages/LibraryPage.tsx, src/pages/HistoryPage.tsx, src/pages/FavoritesPage.tsx, src/pages/ReadingPage.tsx
      任务: T17 空态/加载态统一 + 首页新卡
      判据: eslint-disable 零匹配;EmptyState ≥4 页引用
      合并: 第 5 位

线 F  ../lexiscene-v5-t18  分支 v5/t18-import-errors
      文件: src/lib/documentImport.ts, src/lib/documentImport.test.ts, src/pages/DocumentImportPage.tsx, src/pages/ImportPage.tsx
      任务: T18 导入错误路径补验
      判据: 四类边界用例全绿;evidence-import-errors.md 四条文案
      合并: 第 6 位

批 4 gate: 六线全绿合入,才开批 5。

## 批次 5 · 执行清单(2 线并行 + 1 串行)

线 A  ../lexiscene-v5-t20  分支 v5/t20-version-readme
      文件: README.md, package.json, worker/src/index.ts, worker/src/version.test.ts
      任务: T20 版本统一 + README 重写
      判据: "词遇读"零匹配;version.test.ts 断言两端一致;README 命令可照跑
      合并: 第 1 位

线 B  ../lexiscene-v5-t19  分支 v5/t19-e2e
      文件: e2e/smoke.spec.ts, e2e/fixtures/
      任务: T19 E2E 冒烟主链路
      判据: `npx playwright test` 连续 3 次全绿
      合并: 第 2 位

串行 T21(主仓): 本地集成冒烟——typecheck/build/双端 vitest/playwright 六条命令退出码全 0。

批 5 gate: T21 全绿,才进批 6 发布。

## 批次 6 · 发布(主仓串行,用户参与)

T22 盘点+全表备份 → T23 迁移核对+词典灌装+内容池重建 → T24 版本级部署+线上冒烟+合并 main。每步判据见 tasks.md;**T23 必须在 T22 备份之后、T24 部署之前**,顺序不可压缩(迁移不可自动回滚)。

---

## 执行流程(每批固定六步)与护栏

1. **建树**: 按清单 `git worktree add ../lexiscene-v5-tN -b v5/tN-...`;2. **派活**: 一线一个子 agent,只给该线文件集合/任务/判据,越界改动一律拒绝;3. **验收**: 跑该线判据,红不修绿不合;4. **合并**: 按合并顺序合回主干,每合一条重跑该线判据;5. **收树**: 合完删 worktree 与分支;6. **过 gate**: 整批合完跑批级集成判据,绿了开下一批。

护栏四条(破一条就停):文件集合有交集的线绝不并行;合并前必须跑绿该线判据;合并冲突停下问用户,不自作主张;主干只进已验收的提交,批间 gate 不可压缩。
