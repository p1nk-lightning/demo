# LexiScene V5 · 原子任务清单(tasks.md)

> source: spec.md v1.1(17 条 AC)+ plan.md ADR-001~007
> 纪律:单一动作 · 精确文件路径 · 可跑判据 · 零占位。`[P]` = 文件集合与同批其他线零交集,可并行。
> 每条任务判据都是"能跑出 0/1 的命令或可核对产物",不以"功能正常"交差。

## 批 1(地基,4 线并行)

- [x] T1 [P] worker/src/lib/wordstats.ts : 从 index.ts 纯移动提取无副作用函数——wordstats(englishWordCount/countVocabHits/normalizedText/hasCjk/minimumHits)、time(chinaDayKey/chinaDayNumber/isRotationDay)、validation(validateGeneratedArticle/validatePublicArticle + 难度限值表)、schemas(全部 zod schema);index.ts 改为 import,零逻辑变化 -> AC-012, AC-001
  - 文件集合: worker/src/lib/wordstats.ts, worker/src/lib/time.ts, worker/src/lib/validation.ts, worker/src/schemas.ts, worker/src/index.ts
  - 判据: `cd worker && npx tsc --noEmit` 退出码 0;根 `npm run typecheck` 退出码 0;`git diff` 对 index.ts 仅删定义+加 import(无逻辑改动)
- [x] T2 [P] package.json : 前端测试与依赖地基——devDeps 增 vitest@^4.1、jsdom@^30、@testing-library/react@^16.3.3、@testing-library/dom@^10、@testing-library/jest-dom@^7、fake-indexeddb@^6.2.5、recharts@^3.10.1、react-error-boundary@^6.1.4、@playwright/test@^1.62;新建 vitest.config.ts(jsdom 环境 + setupFiles)、src/test/setup.ts(fake-indexeddb/auto + jest-dom)、playwright.config.ts(测试仅认 e2e/*.spec.ts)、e2e/ 目录;.gitignore加 playwright-artifacts -> AC-001
  - 文件集合: package.json, package-lock.json, vitest.config.ts, src/test/setup.ts, playwright.config.ts, e2e/.gitkeep, .gitignore
  - 判据: `npx vitest --run --passWithNoTests` 退出码 0;`npx playwright install chromium` 成功且 `npx playwright --version` 输出版本
- [x] T3 [P] docs/history/README.md : 过程文档归档与死文件清理——Prd.md、V2/V3/V4 的 handoff+log 共 7 份移入 docs/history/(Prd.md 标注"V1 原始 PRD,已被 V3/V4 演进");新建归档索引;删根目录 vite.config.js 与 vite.config.d.ts(tsc 误编译产物);tmp/ 测试脚本删、reset-admin-password.ps1 移 docs/history/ops/ -> AC-014, AC-015
  - 文件集合: docs/history/(新建含索引 README), 根目录 7 份过程文档(移动), vite.config.js, vite.config.d.ts, tmp/
  - 判据: 根目录仅剩活跃文件(README/package.json/配置);`npm run typecheck` 与 `npm run build` 退出码 0(证明删产物无影响);`git status` 仅移动+删除
- [x] T4 [P] worker/package.json : Worker 测试配置——devDeps 增 vitest@^4.1、@cloudflare/vitest-plugin@^1.1.2;新建 worker/vitest.config.ts(cloudflareTest 挂 wrangler configPath,miniflare 提供本地 D1 绑定) -> AC-001
  - 文件集合: worker/package.json, worker/package-lock.json, worker/vitest.config.ts
  - 判据: `cd worker && npx vitest --run --passWithNoTests` 退出码 0

## 批 2(测试 + 单源,4 线并行)

- [ ] T5 [P] worker/src/lib/wordstats.test.ts : Worker 纯函数单测——wordstats(英文词数/命中统计边界:标点、大小写、词边界)、time(北京日界跨天、轮换日奇偶)、validation(词数越界/题数不符/中文混入/证据句缺失/重复选项各触发对应 issue;修复重试输入用非 JSON 脏数据) -> AC-001
  - 文件集合: worker/src/lib/wordstats.test.ts, worker/src/lib/time.test.ts, worker/src/lib/validation.test.ts
  - 前置: <- T1, T4
  - 判据: `cd worker && npx vitest --run` 全绿,每模块 ≥1 正常路径 + ≥1 脏输入用例
- [ ] T6 [P] src/lib/vocab.test.ts : 前端现有模块单测——vocab(TXT/xlsx 词提取、归一化去标点、去重)、highlight(分词与词表匹配)、schemas(zod 拒绝脏数据)、utils、sync(乱序竞态:mock apiRequest + fake timers 验证 inFlight 去重与 rerun 补跑) -> AC-001
  - 文件集合: src/lib/vocab.test.ts, src/lib/highlight.test.ts, src/lib/schemas.test.ts, src/lib/utils.test.ts, src/lib/sync.test.ts
  - 前置: <- T2
  - 判据: `npx vitest --run` 全绿;sync 竞态用例覆盖"同用户并发同步只跑一次 + 完成后有新变更自动补跑"
- [ ] T7 [P] shared/contracts.ts : 双端契约单源——Difficulty/WordSource/ArticleTopic/ModelProvider/Question/Word/VocabularyList/VocabularyItem/Article(同步线缆格式)/UserProgress/SyncPayload/GenerateRequest/GenerateResponse/DictItem 全部 zod schema + z.infer;worker/src/schemas.ts 改为从 shared import 并 re-export;src/types/domain.ts 改 re-export + 保留前端本地扩展(localId/isFavorite 等);两端 tsconfig.json 与 vite.config.ts 增 @shared 路径 -> AC-013
  - 文件集合: shared/contracts.ts, worker/src/schemas.ts, src/types/domain.ts, tsconfig.json, vite.config.ts, worker/tsconfig.json
  - 前置: <- T1
  - 判据: 根与 worker `tsc --noEmit` 双绿;`Question`/`UserProgress` 字段级定义全库 grep 仅 shared/contracts.ts 一处
- [ ] T8 [P] src/lib/db.ts : Dexie v5 迁移 + 测验存取——version(5) 增 quizResults 表(id/ownerId/completedAt/mode 索引);新增 saveQuizResult/listQuizResultsByRange;db.test.ts(fake-indexeddb)覆盖 v4 老库升级打开不报错、quizResults 写读、按 completedAt 范围查询;确认 apiProfiles 在 version stores 之外零活引用 -> AC-004, AC-015
  - 文件集合: src/lib/db.ts, src/lib/db.test.ts
  - 前置: <- T2
  - 判据: `npx vitest --run` 全绿(含迁移用例);`grep -r apiProfiles src/` 仅命中 db.ts 的 version(1)-(4) stores 行

## 批 3(路由拆分 + 功能竖切,4 线并行)

- [ ] T9 [P] worker/src/routes/auth.ts : Worker 路由拆分(行为不变)——auth/sync/dictionary/content(含 admin+favorites+daily)/generate 五个路由文件 + lib/session.ts(密码哈希/会话/cookie/Turnstile/邮件) + types.ts(Env);index.ts 收敛为挂载入口 ≤300 行;新增 app.onError 统一 JSON 500 + console.error;删除 /api/test-provider 注释块 -> AC-012
  - 文件集合: worker/src/routes/auth.ts, routes/sync.ts, routes/dictionary.ts, routes/content.ts, routes/generate.ts, worker/src/lib/session.ts, worker/src/types.ts, worker/src/index.ts
  - 前置: <- T5(测试护栏就位后才拆)
  - 判据: index.ts ≤300 行;T5 全部测试拆分前后同绿;`npx wrangler deploy --dry-run` 退出码 0;`grep -r test-provider worker/src` 零匹配
- [ ] T10 [P] src/lib/quiz.ts : 词汇测验竖切——quiz.ts 纯函数(从激活词库抽 10 词、无释义词跳过计数、干扰项从其他词释义生成且随机分布、判分:大小写/首尾空格容忍但后缀判错、错词入本轮队尾重练)+ quiz.test.ts 全覆盖 + QuizPage.tsx 两模式界面(状态按 spec §5.2 六态:空/加载/成功/失败/无权限/重复提交锁定) -> AC-002, AC-003
  - 文件集合: src/lib/quiz.ts, src/lib/quiz.test.ts, src/pages/QuizPage.tsx
  - 前置: <- T8
  - 判据: quiz.test.ts 覆盖抽词/干扰项/判分/重练四组(含"patterns 判错展示 pattern"用例);`npx vitest --run` 全绿
- [ ] T11 [P] src/lib/stats.ts : 学习看板竖切——stats.ts 聚合纯函数(每日阅读量按 Asia/Shanghai 日界;词汇复现率 = 窗口内 vocabHitIds 并集 ∩ 激活词库 ÷ 词库总数;得分趋势阅读+测验双序列)+ stats.test.ts 三天造数断言(含跨日界用例)+ StatsPage.tsx(recharts 三卡 + 近 7/30 天切换 + 空态用 EmptyState) -> AC-005
  - 文件集合: src/lib/stats.ts, src/lib/stats.test.ts, src/pages/StatsPage.tsx
  - 前置: <- T8, T2
  - 判据: stats.test.ts 断言三指标口径(数值来自造数,非拍摄);`npx vitest --run` 全绿
- [ ] T12 [P] src/lib/auth.ts : 忘记密码前端——auth.ts 增 requestPasswordReset/resetPassword 两个 API 封装(按 contracts/auth-password-reset.md);ForgotPasswordPage.tsx(邮箱提交、统一文案、60 秒倒计时禁用)+ ResetPasswordPage.tsx(验证码+新密码、错误态、成功跳登录);两页状态按 spec §5.2 六态 -> AC-006
  - 文件集合: src/lib/auth.ts, src/pages/ForgotPasswordPage.tsx, src/pages/ResetPasswordPage.tsx
  - 前置: <- T2
  - 判据: `npm run typecheck` 退出码 0;倒计时与错误态有组件级断言(RTL)或 T19 E2E 覆盖项在 e2e 清单登记

## 批 4(功能后端 + 集成界面,6 线并行)

- [ ] T13 [P] worker/migrations/0008_password_reset_tokens.sql : 忘记密码后端——建表(结构见 data-model.md §1)+ routes/auth.ts 增 POST /api/auth/forgot-password 与 /api/auth/reset-password(逻辑按 contracts/auth-password-reset.md:统一 200 防枚举、60 秒/每日 5 次静默抑制、错 5 次作废、重置同 batch 吊销全部会话);routes/auth.test.ts(vitest-plugin + miniflare fetchMock 截获 Resend 读码)覆盖全流程/未注册邮箱响应一致/作废/旧会话 401 -> AC-006
  - 文件集合: worker/migrations/0008_password_reset_tokens.sql, worker/src/routes/auth.ts, worker/src/routes/auth.test.ts
  - 前置: <- T9, T4
  - 判据: `cd worker && npx vitest --run` 全绿;未注册与已注册邮箱的 forgot 响应体字节级一致(测试断言)
- [ ] T14 [P] worker/src/routes/content.ts : daily 双路径收敛——删除 legacy daily_articles 回退分支;新表空结果显式 console.error 并返回空列表 -> AC-011
  - 文件集合: worker/src/routes/content.ts
  - 前置: <- T9
  - 判据: `grep -r daily_articles worker/src` 零匹配(迁移文件除外);worker vitest 全绿;部署顺序约束(迁移先于新代码上线)由 T23 runbook 保证
- [ ] T15 [P] worker/src/lib/rate-limit.ts : 限流切 Rate Limiting binding——checkRateLimit 重写:有 RATE_LIMITER binding 走 limit({key: ip})(60 秒窗/10 次),无 binding 保留内存兜底;删 KV 分支;types.ts 删 RL 改 RATE_LIMITER(本地最小接口);wrangler.toml 增 [[ratelimit.bindings]] 删注释 KV 段 -> AC-009
  - 文件集合: worker/src/lib/rate-limit.ts, worker/src/lib/rate-limit.test.ts, worker/src/types.ts, worker/wrangler.toml
  - 前置: <- T9
  - 判据: rate-limit.test.ts 断言 binding 成功/拒绝两路径 + 内存兜底 10/min 等价;`grep kv_namespaces worker/wrangler.toml` 零匹配;`grep "\bRL\b" worker/src/types.ts` 零匹配;worker vitest 全绿
- [ ] T16 [P] src/App.tsx : 路由注册与异常边界——App.tsx 注册 /quiz、/stats、/forgot-password、/reset-password 四路由;main.tsx 挂全局 ErrorBoundary,App.tsx 每路由包路由级边界(react-error-boundary);新建 components/AppErrorFallback.tsx(spec 文案"页面出错了 — 你的数据没有丢…",仅开发模式显示错误信息)+ AppErrorFallback.test.tsx -> AC-007
  - 文件集合: src/App.tsx, src/main.tsx, src/components/AppErrorFallback.tsx, src/components/AppErrorFallback.test.tsx
  - 前置: <- T10, T11, T12
  - 判据: AppErrorFallback.test.tsx:子组件抛错渲染兜底文案且不含堆栈;`npx vitest --run` 全绿;dev 起服务四路由可达(手动判定项记入验收)
- [ ] T17 [P] src/pages/HomePage.tsx : 空态/加载态统一 + 首页新卡——HomePage 增"词汇测验""学习看板"两卡(链接 /quiz /stats);HomePage/LibraryPage/HistoryPage/FavoritesPage 空态接 EmptyState(带行动按钮)、加载态接 Skeleton(文案照抄 spec §5);ReadingPage.tsx 删无效 eslint-disable 死注释 -> AC-008, AC-015
  - 文件集合: src/pages/HomePage.tsx, src/pages/LibraryPage.tsx, src/pages/HistoryPage.tsx, src/pages/FavoritesPage.tsx, src/pages/ReadingPage.tsx
  - 前置: <- T10, T11
  - 判据: `grep -r eslint-disable src/` 零匹配;`grep -r "EmptyState" src/pages` ≥4 处引用;清数据后五页空态文案与 spec §5 逐字一致
- [ ] T18 [P] src/lib/documentImport.ts : 导入错误路径补验(V4 欠账)——documentImport.test.ts 造四类边界样本(超大文件/损坏 PDF/空白图片/不支持格式)断言各有明确中文提示且不抛未捕获异常;DocumentImportPage.tsx 与 ImportPage.tsx 确保提示落现有 Toast/错误组件;实测记录(实际文案)写 docs/sdd/lexiscene-v5/evidence-import-errors.md -> AC-016
  - 文件集合: src/lib/documentImport.ts, src/lib/documentImport.test.ts, src/pages/DocumentImportPage.tsx, src/pages/ImportPage.tsx
  - 前置: <- T2
  - 判据: documentImport.test.ts 四用例全绿;evidence-import-errors.md 含四条实际提示文案原文

## 批 5(E2E 与收尾,2 线并行 + 1 串行)

- [ ] T19 [P] e2e/smoke.spec.ts : E2E 冒烟主链路——SQL 预置已验证用户与今日文章(e2e/fixtures/article.sql);链路 = 登录 → 导入 12 词 → 读今日文章 → 答题 3/5 → 一轮测验 → /stats 见数据点;注册/邮箱验证/忘记密码的完整链路由 T13 的 worker 集成测试覆盖(fetchMock 读码,E2E 不做真邮件) -> AC-017
  - 文件集合: e2e/smoke.spec.ts, e2e/fixtures/(预置 SQL)
  - 前置: <- T13, T16, T17
  - 判据: `npx playwright test` 连续 3 次全绿;Turnstile 用官方测试密钥(dev 环境)
- [ ] T20 [P] README.md : 版本统一与 README 重写——package.json 5.0.0、worker 健康检查 version 同步("5.0.0");新建 worker/src/version.test.ts 断言 healthz 版本 === package.json 版本;README 重写:产品一句话/当前状态/快速开始/部署(链接发布 runbook)/文档索引(指向 docs/history 与 docs/sdd);全库清除"词遇读"旧名 -> AC-014, AC-010
  - 文件集合: README.md, package.json, worker/src/index.ts, worker/src/version.test.ts
  - 前置: <- T9
  - 判据: `grep -r 词遇读 . --exclude-dir=node_modules` 零匹配;`cd worker && npx vitest --run` 中 version.test.ts 断言两端版本一致;README"快速开始"命令在新目录照跑成功
- [ ] T21 集成冒烟(本地全量) <- T19, T20 -> AC-012, AC-017, AC-001
  - 判据: 一次性依次跑 `npm run typecheck` + `npm run build` + `cd worker && npx tsc --noEmit` + 根 `npx vitest --run` + `cd worker && npx vitest --run` + `npx playwright test`,六条退出码全 0

## 批 6(发布,串行,用户参与 Cloudflare 授权)

- [ ] T22 docs/sdd/lexiscene-v5/release-inventory.md : 生产盘点与全表备份——wrangler d1 migrations list lexiscene --remote + 逐表 COUNT(users/sessions/dictionary_entries/dictionary_forms/content_articles/daily_articles/generation_usage)记入盘点文档;`wrangler d1 export lexiscene --remote --output backups/backup-<日期>.sql` 全表备份 -> AC-010
  - 文件集合: docs/sdd/lexiscene-v5/release-inventory.md, backups/
  - 判据: 盘点文档含真实迁移状态与逐表行数;备份文件存在且体积 > 0;盘点结论决定 T23 的迁移清单(不按文档假设)
- [ ] T23 docs/sdd/lexiscene-v5/release-log.md : 远程迁移核对与数据灌装 <- T22 -> AC-010
  - 判据: `wrangler d1 migrations apply lexiscene --remote` 后 `migrations list` 无待应用;词典导入后 `SELECT COUNT(*) FROM dictionary_entries` ≥ 本地基准;内容池远程重建后各难度 `/api/daily` 返回非空且 source=content_library;过程与命令输出记入 release-log.md
- [ ] T24 版本级部署与线上冒烟 <- T23 -> AC-010
  - 判据: `wrangler versions upload` 新版本 → 线上 `/healthz` version=5.0.0、词典抽样有释义、daily 非空;一位朋友真实设备走通"注册→验证→导入→读今日文章→一轮测验"并记录;PASS 后 `git merge` 回 main 并推送;异常则 `wrangler rollback` 并记录;结果记入 docs/sdd/lexiscene-v5/release-log.md
