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
