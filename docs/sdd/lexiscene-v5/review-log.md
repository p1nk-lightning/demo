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
