# V5 批间自动审查记录(review-log)

按 GOAL 约定:每批完成 → gate 全量复验 → 对抗式审查(代码质量/判据真实性/AC 对照)→ 通过自动开下一批。

---

## 批 1 审查(2026-09-01)

- **gate**:双端 typecheck ✓ / FE build ✓ / 双端 vitest ✓(当时 passWithNoTests 空跑)
- **审查发现**:
  1. T1 子 agent 因配额中断,遗留 6 段重复定义 → 主对话接手补完,typecheck 抓出 3 处残留(z 命名空间/隐式 any),修复后全绿。
  2. 归档清单外发现 `V3_AUTH_SETUP.md`(文档漂移的又一例)→ 一并归档,索引注明"命令以现行 README 为准"。
  3. 平台并发上限 2 + 子 agent 配额中断 → 降级为主对话串行,已留痕 plan.md。
- **结论**:通过(降级路径下判据一条未减)。

## 批 2 审查(2026-09-01)

覆盖 commit:e077552(T7)/ 62d4678(T8)/ 527f7b5(T5)/ 9400085(T6)/ 406f12b(修复)。

- **gate**:worker tsc ✓ / worker vitest 28 ✓ / FE tsc ✓ / FE vitest 28 ✓ / FE build ✓
- **零上下文视角(会卡住实现者/后人的点)**:
  1. ~~`GenerateRequest.retryHint` 字段在 T7 重写 domain.ts 时消失~~ → 全库 grep 零引用,确认为 V2 时代死字段,移除无行为影响。**已裁决:不恢复**。
  2. **隐患消除**:worker 的 zod 此前从未被直接声明,靠 T4 引入的 vitest-plugin 传递依赖(zod v4)碰巧工作,T7 混用 v3/v4 后立即爆炸 → 已 `npm install zod@^3.25.76` 显式声明,双端 zod 同为 v3.25.76。
- **测试真实性视角(测试对齐现实的三处修正)**:
  1. `tokenize` 对连字符词是"拆开、'-'归分隔符"——初版断言想当然写成一个 token,已对齐实现断言。
  2. `normalizeWord` 的音标处理只去斜杠、不切 token——初版断言错误,已对齐。
  3. `sync` 并发去重语义 = "加入进行中的一轮会标记 rerun,第一轮结束后自动补跑"——初版断言以为只有一轮,实证(diagnose 用例)后对齐为 R1+R2 两轮。
- **AC 对照**:
  - AC-001 测试基建:**达成**(FE 5 文件 28 用例 + worker 3 文件 28 用例,含脏输入路径;E2E 部分归 AC-017 批 5)
  - AC-004 测验记录(本地持久化部分):**达成**(quizResults v5 迁移 + 存取 + owner 隔离测试;看板联动归 T11)
  - AC-013 类型单源:**达成**(字段级定义 grep 唯一;双端 tsc;`GenerateRequestSchema` default 语义原样保留并有断言)
  - AC-015 部分:FE 死代码 `src/lib/schemas.ts`(零引用)删除 ✓;apiProfiles 活引用零 ✓
- **未修复问题**:无。
- **结论**:**通过 → 自动开启批 3**。

## 批 3 审查(2026-09-01)

覆盖 commit:db72631(T9 拆分)/ 2b8f003(T10 测验)/ 69ca1d8(T11 看板)/ 56d1adb(T12 忘记密码前端)。批 3 进行中发生一次仓库误操作(main 被指向 E:\demo\readai\v1 的历史),已按用户确认恢复:main 回 55482e9,T10 cherry-pick 回工作分支,远程探测确认无恙(GitHub 上从无 main 引用)。

- **gate**:worker tsc ✓ / worker vitest 28 ✓ / FE tsc ✓ / FE vitest 49 ✓ / FE build ✓ / index.ts 50 行(≤300)✓
- **T9 拆分审查**:
  1. 纯移动纪律:拆分中发现并当场纠正两处搬运走样——content.ts 漏带 `isPassingAiReview` 审核守卫(行为级!)、一处笔误 shim 引用;grep 确认 test-provider 死路由块已随拆分移除。
  2. `app.onError` 新增:记录 path/method/stack 并返回统一 JSON 500(AC-008 健壮性线达成的 worker 侧)。
  3. 附带统一:session.ts 提供 setSessionCookie 替代原先散落的 `SESSION_TTL_MS / 1000` 拼装(等价重构)。
- **T10/T11/T12 审查**:
  1. 测验计分实现口径与 data-model 一致:correct = 首答词数 − 首答错词数,重练答对不计;错词一次重练;错题追加到队尾并在选义模式下同步生成重练题。
  2. stats 聚合测试抓出两处**测试自身**的造数/断言错误(窗口起点方向、fixture 落在窗口外)——修正后 9/9;实现未发现口径问题。
  3. QuizPage 初版计分逻辑绕(ref 计数 + 模块级可变对象),重写为单一代价模型后再提交——最终版无可变跨渲染状态。
  4. ForgotPassword 失败也进 60s 冷却(防连点),符合契约的静默抑制语义。
- **AC 对照**:
  - AC-002/003(测验两模式):**达成**(纯函数 12 用例 + 页面;E2E 归 T19)
  - AC-005(看板三指标):**达成**(聚合 9 用例 + 页面;口径即验收口径)
  - AC-006 前端部分:**达成**(后端归批 4 T13)
  - AC-012(拆分行为不变):**达成**(入口 50 行;28 个既有测试拆分前后同绿;dry-run 过)
- **遗留到批 4**:四条新路由未注册进 App.tsx(计划归 T16);忘记密码后端(批 4 T13)。
- **结论**:**通过 → 自动开启批 4**。

## 批 4 审查(2026-09-01)

覆盖 commit:dd1470e(T16 路由+ErrorBoundary)/ f147d93(T13 忘记密码后端)/ 1b86c72(T14 daily 收敛)/ 9b66755(T15 限流 binding)/ 1ce4687(T17 空态+首页卡)/ 4e720ab(T18 导入错误路径)。

- **gate**:worker tsc ✓ / worker vitest 36 ✓ / FE tsc ✓ / FE vitest 56 ✓ / FE build ✓
- **T16 审查**:全局 + 路由级双层 ErrorBoundary;fallback 测试三态(生产无堆栈/dev 有/边界捕获);RTL 自动清理依赖 globals,测试文件显式 cleanup 修复堆叠误报。登录页忘记密码入口已接。
- **T13 审查(集成测试抓出两处真 bug,审出即修)**:
  1. **防枚举文案不一致**:未注册邮箱 reset 返回"验证码已失效"而注册错码返回"验证码不对或已过期"——按契约统一为后者(并覆盖"注册但无未用码"分支)。
  2. 测试 stub 只截 input 丢 init,Resend 请求体读不到——测试侧修复。
  3. 迁移注入:插件不自动应用 wrangler 迁移,方案 = vitest.config(Node 侧)读 migrations 拼 schema → miniflare binding `TEST_SCHEMA` → 测试 setup 先删注释行再按分号拆逐语句执行(注释内分号会截断语句,顺序敏感,已留注释)。
  4. 限流跨用例累积 → 每用例独立 cf-connecting-ip(不改产品代码)。
- **T15 审查**:binding 判定直通 + 无 binding 内存回退(10/min、65s 窗口过期测试覆盖);`RL` 字段保留一个周期标注 deprecated;日级配额职责边界在文件头注明。
- **T17 审查(范围调整,理由留痕)**:History/Favorites/Library 已有带行动按钮的品牌化空态,重写为 EmptyState 组件属零价值 churn——保留;实际接入 = 首页两卡 + 两页裸文本加载换 CardSkeleton + Quiz/Stats 页已用 EmptyState/Spinner(零引用债消除)。eslint-disable 死注释已删。
- **T18 审查**:四类边界文案齐;损坏文件原先裸抛 pdfjs/tesseract 英文错误 → 统一包装;0 词结果统一报"没有识别到任何单词";tesseract 以 mock 注入确定性验证包装逻辑(真实 OCR 冒烟归 T19/批 5)。
- **AC 对照**:AC-006 达成(前后端闭环 + 集成测试);AC-007 达成;AC-008 达成(范围调整已述);AC-009 达成(行为验收 = 部署后 11 次连发,归批 6);AC-011 达成(grep 仅注释);AC-016 达成(四边界 + evidence 文档)。
- **结论**:**通过 → 自动开启批 5(E2E 冒烟 + 版本 5.0.0 + README 收敛)**。

## 批 5 审查(2026-09-01)

覆盖 commit:29ff2e2(T20 版本+README)/ c846227(T19 E2E + 两处真修复)。

- **gate(T21 六条全绿)**:FE tsc ✓ / FE build ✓ / worker tsc ✓ / worker vitest 37 ✓ / FE vitest 56 ✓ / Playwright E2E ✓
- **T20 审查**:healthz 版本改为 import 根 package.json(单源,双端共享);version.test.ts 守卫 5.0.0;重写 README 时**保留了 V2 README 里的两段活操作流程**(ECDICT 灌装、内容池生成命令)——它们正是批 6 灌装要用的命令,不是历史。"词遇读"旧名 grep 零匹配(归档文档除外,有意保留)。
- **T19 E2E 审查(价值兑现:抓出两处真 bug,均已修复)**:
  1. **测验无释义词混入题面**(spec §5.2 明令禁止):`lookupDict` 查无结果时返回兜底文案"(暂无释义,可稍后再试)",QuizPage 只判空导致混入 → 导出 FALLBACK_MEANING 并精确排除。spec 禁令条款因此真正落地。
  2. **本地 CORS 被 .dev.vars 的 FRONTEND_ORIGIN 压制**:origin 一配置就完全压过本地白名单,本地 dev 全挂 → 本地白名单 origin 永远放行,生产域名仍由 FRONTEND_ORIGIN 负责(安全面不变:放行的只有 4 个固定 localhost origin)。
- **E2E 确定性设计**:词典释义由 beforeAll 用 wrangler d1 execute 预置 12 条到本地 D1(内置词典路径),测验不依赖外网抖动;webServer 自动拉起 vite + wrangler dev(reuse 现有进程)。连续 3 次运行全绿(4.7s/7.3s/6.9s),无 flaky。
- **范围说明**:注册/邮箱验证/忘记密码的完整后端链路由 worker D1 集成测试覆盖(契约同级,E2E 不做真邮件);E2E 聚焦前端主链路(导入→读→答→测→看板)。
- **AC 对照**:AC-017 达成(可重复冒烟 3/3);AC-014 达成(README 从零可跑、版本单源、旧名清零);AC-010 的版本断言部分就绪(线上验证归批 6)。
- **结论**:**通过 → 移交批 6 发布**(T22 盘点备份 → T23 迁移灌装 → T24 部署合并;需用户 Cloudflare 授权参与)。

## 批 6 审查(2026-09-01,发布批次)

覆盖:T22 盘点备份 / T23a 迁移 0008 / T23b 词典灌装 / T23c 内容池+每日文章 / T24 版本级部署+冒烟。全程 autonomous(用户指令"继续,需要我的时候再说")。
- **gate**:FE tsc ✅ / FE vitest 56 ✅ / worker tsc ✅ / worker vitest 37 ✅ / versions deploy@100 ✅ / 线上冒烟 ✅(证据清单见 release-inventory.md §T24)
- **对抗审查抓出的三个真问题**:
  1. **RATE_LIMITER 从未生效**:wrangler 4.x 静默忽略旧配置键 `[[ratelimit.bindings]]`(每条命令的 "Unexpected fields" 警告是真实信号,此前批 5 把它当良性噪音记录了)。单测/集成测全部通过——因为测试环境是自造 binding,永远发现不了"生产配置被解析器丢弃"这一层。修复:按 wrangler 4.127 config-schema 改顶层 `[[ratelimits]]`(simple 10 次/60s),重新 upload+deploy@100,binding 表实证 `env.RATE_LIMITER (10 requests/60s)`,并以 14 连发 login 实测第 10 次起 429、约 60s 窗口恢复。
  2. **备份文件差点入库**:`worker/backups/backup-2026-09-01.sql` 含 password_hash / token_hash 且未被 gitignore——在首次 commit 前被拦下,已加 .gitignore 并 `git check-ignore` 验证。
  3. **发布门槛 vs 灌装数据的冲突**:30 篇旧短文(~110–140 词)永远过不了 `validatePublicArticle`(CET4 要求 400–500 词)——若图省事直接写 ai_review_json 放行就是伪造审核。处理:review-content.mjs 对确定性校验不过的**不送 LLM、不写审核记录**(保持候选),合规内容由 RSS+LLM 管线重新生成(6 篇全过审,每难度≥1 篇)。
- **T23 审查**:迁移仅差 0008(早期文档假设过期,按实盘为准);远程 D1 compound SELECT 限制、wrangler 网络抖动(两次中断,脚本幂等重跑续传)均有记录;审核链逐字复刻 routes/content.ts(同提示词/同确定性校验/同通过判定/approve 语义一致),差异点(无管理员会话、脚本侧执行、无修复循环)在 release-inventory.md 声明。
- **T24 审查**:版本级部署可回滚(上一版本 0ec7b159 留档);healthz=5.0.0、daily 5 篇、词典精确+词形还原均经 Vercel 代理验证;已知缺口如实入档(went 类不规则词形未中、旧短文待归档、DeepSeek 生成命中率 ~40%)。
- **AC 对照**:AC-010 **基本达成**——备份✅、迁移✅、灌装✅、部署✅、线上冒烟✅、回滚路径✅;**唯"朋友真机冒烟"留待用户执行**(自动流程无法代替真人设备)。
- **结论**:**通过(附 1 项用户待办)** → SDD 流水线批 1–6 全部完成;后续内容扩池用 `generate-content-pool.mjs --remote` + `review-content.mjs --remote` 即可,无需再动代码。
