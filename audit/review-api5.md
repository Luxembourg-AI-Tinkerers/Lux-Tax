# API-5 审阅报告

日期: 2026-11-08
审阅对象: `audit/impl-api5.md`, `audit/impl-api5-ui.md`, 工作区实际代码
核对基线: `audit/audit-api.md` API-5, `audit/audit-product.md` PROD-3, 计划 §6.6 / §13.1

**allPass: false** — 2 条必须修；28 条核对项通过，2 条核对项失败（其中 1 条为后端数据完整性、1 条为 UI 状态正确性）。七条已列出的失效触发、no-op 语义、`compareScenarios`、脱敏、历史 DTO/状态规则、DI 与回归门槛均通过代码核对；阻断项来自矩阵外的 freelance demo 写入路径，以及 `FilingPackageView` 在 API 返回 `null` / 切换年度时保留旧状态。

## 1. 结论

这份交付不能按当前状态直接接受。后端共享失效服务的形状、七条矩阵触发、无批准时的 no-op、`compareScenarios` 不失效、私有事实脱敏、历史端点的排序/状态/合成行/审批原因，以及模块依赖都成立；179/179 测试、`tsc` 0、语法 42/42 也复现。但 `POST /freelance/demo` 仍直接写 `ConfirmedFact`，完全绕过 `invalidateForChange`：已批准的工作区加载 demo 数据后，双方批准仍然有效，随后历史还会把该版本报成 `APPROVED`，这正是简报定义的阻断场景。UI 侧 `FilingPackageView` 在 `getReturnVersion`/`getFilingPackage` 返回 `null` 时不清空旧状态，切换税年或重新批准后会把上一版本/上一年度的批准和包继续显示在当前年度下，和新的历史卡直接矛盾。

## 2. 必须修 (2)

### F1 — Freelance demo 写入绕过共享失效服务，批准可在计入申报的事实变更后继续有效

- **位置**: `apps/api/src/modules/freelance/freelance.service.ts:434-490`（`document.create`、`confirmedFact.create` 在 `:475`），`apps/api/src/modules/freelance/freelance.module.ts:7-12`（未导入 `ReturnApprovalsModule`），`apps/api/src/modules/freelance/freelance.controller.ts:59-66`（`POST demo`），`apps/web/src/components/FreelanceBusinessView.tsx:393-398`（用户可见按钮）。
- **问题**: `loadDemoData` 直接创建 `Document`（`visibility: INCLUDED_IN_RETURN`，`:447`）和 `ConfirmedFact`（`:475-490`），其中 `isIncludedInReturn = canIncludeInReturn(doc.visibility)`（`:473`）为 `true`、`isSharedWithHousehold: true`（`:486`）。该服务不注入 `ReturnApprovalsService`，`FreelanceModule` 也不导入 `ReturnApprovalsModule`，因此这条写入路径不会调用共享失效。`POST /api/workspaces/:workspaceId/freelance/demo` 只要求 `PRIMARY_FILER`/`CO_FILER`（`freelance.controller.ts:59-60`），没有对工作区状态或已有批准做任何限制；Web 端按钮始终可见。
- **影响**: 已批准（`APPROVED` 或 `HOUSEHOLD_REVIEW` 且已有批准）的工作区，用户点击 "Load Freelance Demo Data" 后，新的 `FREELANCE_INCOME` / `BUSINESS_EXPENSE` 事实会进入 `CONFIRMED_FACT_IN_RETURN_WHERE` 的申报集合（`filing.service.ts:43-60`、`calculations.service.ts:60-80`），税引擎会据此改变 `freelanceRevenue`/`businessExpenses`/`independentProfit`（`packages/tax-engine/src/engine.ts:275-280, 625`）。旧批准不被 supersede、`activeReturnVersion` 不递增、没有 `APPROVAL_INVALIDATED` 审计；历史端点随后按“活跃批准数达到要求”把该版本报成 `APPROVED`，即出现简报点名的“active approval surviving a material change”和“wrong history status”两个阻断条件。修复前，demo 路径不是只影响演示数据，它写入的是真实申报事实。
- **依据**: 全仓 `confirmedFact` 的写操作只有四处：`facts.service.ts:258`（create）、`:397`（update）、`:502`（delete），以及 `freelance.service.ts:475`；前三个调用点都已接入 `invalidateForChange`（`:289`、`:420`、`:506`），第四个没有。全仓 `invalidateForChange` 调用点只有 facts/questionnaire/documents/calculations 的七处（grep 结果），freelance 模块零处。`impl-api5.md` §1 的表格也没有列出这条路径，§5 的“未覆盖”同样未提。
- **修复方向**: 在 `loadDemoData` 的循环结束后、且 `count > 0` 时调用一次 `returnApprovals.invalidateForChange(workspaceId, actorId, 'Freelance demo facts loaded')`，并把 `ReturnApprovalsModule` 加入 `FreelanceModule`；理由保持通用（不带金额/文件名）。或者让 demo 事实走 `FactsService.confirmFact`，由同一入口失效。若 demo 端点只应在空工作区使用，另加状态守卫（例如仅 `DRAFT`/`COLLECTING` 可调用），但守卫不能替代失效调用。

### F2 — FilingPackageView 在 API 返回 null / 切换税年时保留旧版本和旧包，显示不属于当前年度的批准与包

- **位置**: `apps/web/src/components/FilingPackageView.tsx:36-39`（state）、`:51-61`（`loadFilingData` 的 `if (data)` 赋值）、`:63-65`（仅依赖 `workspace.id` 的 effect）；`apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx:124-135`（税年选择器）、`:432-439`（`FilingPackageView` 没有 `key`）。
- **问题**: `loadFilingData` 只在 `verRes.data` / `pkgRes.data` 为真时写入；`getReturnVersion` 和 `getFilingPackage` 在“当前 active 版本没有 `ReturnVersion` 行”时返回 `null`（`filing.service.ts:1127-1132, 1169-1174`），而这正是失效后的正常状态。于是旧 `returnVersion` / `filingPackage` 不会被清空。切换税年时组件不重新挂载（`:432-439` 无 `key`），`useEffect` 只重新拉取，不重置 state；新年度没有版本/包时两个 `null` 响应不会覆盖旧值。新加的 `history` 状态同样没有在 `workspace.id` 变化时重置，只是它的响应几乎总是有数据，所以会先显示上一年的历史直到新响应到达。
- **影响**: 两个可复现场景。(1) 2025 已批准且已生成包，2026 是新工作区；在 Filing 页把税年从 2025 切到 2026：顶部的 "✓ Ready to File"、两位成员的 "Approved"、以及整个 2025 的 Form 100 包和 SHA 仍然显示，而历史卡已经显示 2026 的 "Version 1 — Current draft"。(2) 2025 版本 1 已批准并有包；配偶在另一浏览器改事实触发失效，当前用户仍在 Filing 页点击 "Approve Return Version" 生成版本 2；`loadFilingData` 得到 `getFilingPackage(2025) = null`，`filingPackage` 仍是版本 1 的包，打包区继续显示旧数字/旧哈希，历史卡却显示版本 2 已批准、版本 1 已 superseded。用户可能把旧包当作当前版本的包复制/下载。
- **依据**: `FilingPackageView.tsx:57-59` 的三个 `if (...data)` 是该行为的直接原因；`filing.service.ts:1127-1132` 明确在无 active 行时返回 `null`，`:1169-1174` 在无包时返回 `null`。`dashboard/page.tsx:432-439` 的 `<FilingPackageView>` 没有 `key={workspace.id}`，税年选择器在 `:126-127` 改变 `selectedYear` 后组件保持挂载。
- **修复方向**: 在 `workspace.id` 变化时重置 `returnVersion`、`filingPackage`、`history`、`historyLoaded`（最省事是给 `<FilingPackageView key={workspace.id} ...>`），并在 `loadFilingData` 中区分“请求失败”和“权威的 null”：请求成功且 `data` 为空时显式 `setReturnVersion(null)` / `setFilingPackage(null)`；请求失败时保留旧值或显示错误。这样既保留 `impl-api5-ui.md` 想要的“历史请求失败不抹掉批准/包区”，又不会把旧版本冒充当前版本。

## 3. 值得考虑 (2)

### W1 — 新增测试只覆盖纯函数，`invalidateForChange` / `getHistory` 没有服务级测试

- **位置**: `apps/api/test/return-version-history.spec.ts:1-124`（10 个测试，全部是 `historyStatus` / `mergeHistory`）；`apps/api/src/modules/filing/return-approvals.service.ts:44-197` 无对应测试。
- **问题**: 矩阵最关键的行为——无批准时零写入、有批准时 `updateMany` + `NEEDS_REVIEW` + 一次 `increment` + 一条 `APPROVAL_INVALIDATED`——以及 `getHistory` 的 Prisma 查询、`requiredApproverCount`、`finalTaxLiability` 提取、`packageGenerated` 都只靠代码阅读，没有测试保护；API e2e 在本机不可运行。服务层若回归（例如把 `increment` 放错分支、漏掉 audit、把 `packageGenerated` 写成 truthy 判断），现有 179 个测试仍会全绿。
- **建议**: 加一个 mocked-Prisma 的服务级单测：无活跃批准 → `updateMany`/`workspace.update`/`logEvent` 均未调用且返回 `{ invalidated: 0 }`；两个活跃批准 → 三者各一次且 `increment: 1`；`getHistory` 给一个假 Prisma 返回值 → 验证合成行、状态、`finalTaxLiability` 的有限数检查、`packageGenerated`、superseded 原因透出。现有纯函数测试保留。

### W2 — 失效写入不是事务；失败路径会留下“变更已保存、批准仍有效”，只能靠重试

- **位置**: `apps/api/src/modules/filing/return-approvals.service.ts:71-109`（`updateMany` → `workspace.update` → `logEvent` 三次独立写入）；`impl-api5.md` §5.6 已承认。
- **问题**: 如果 `updateMany` 之后、`workspace.update` 之前失败（或 `logEvent` 失败），请求会抛错，但触发写入已经提交；批准可能已 supersede 而版本未递增，或批准仍活跃而版本/审计未写。`impl-api5.md` 的判断是“失败比静默保留批准好”，这没错，但客户端并不保证重试；在重试之前，活跃批准仍然覆盖已变更的事实。
- **建议**: 把 supersede + workspace 更新 + 审计放进 `prisma.$transaction`（审计写入也纳入同一事务，或改为 outbox）；至少在 workspace 更新失败时把 `NEEDS_REVIEW` 与版本递增做成同一个原子写。若保持非事务，前端/调用方需要在失败后强制刷新并提示“批准可能仍有效，请重试”，而不是把错误当作普通失败。

## 4. 仅记录 (8)

- `FilingPackageView.tsx:215` 的 `approvalRecord?.isSuperseded` 分支仍不可达：`getLatestReturnVersion` 在 `filing.service.ts:1134` 过滤掉 superseded 批准；失效原因现在只在新历史卡里显示。可删掉旧分支，或改为从 history 取当前版本的 superseded 记录。
- `FilingPackageView.tsx:242-245` 的 `history.versions.length === 0` 空态不可达：`mergeHistory` 在 `return-version-history.ts:41-55` 总会补上 active 版本；该分支只会在后端契约变化时才有意义。
- `FilingPackageView.tsx` 历史卡的空批准文案写死 “this draft still needs every spouse to approve”；单 filer（Class 1）也显示 “every spouse”，措辞不准确。
- 历史 DTO 和卡片不含 `packageSha256`，也没有字段级 diff / 变更人 / 变更时间；PROD-3 的 “history lists package hash”“explain what changed” 只部分满足。`impl-api5.md` §5.2 明确说 diff 端点未实现，属于本任务范围外。
- `409 RECALCULATION_REQUIRED` 的新鲜度守卫仍未实现（`impl-api5.md` §5.8）：失效后用户可以立刻重新批准一份旧 `calculationResult`，批准本身会被新的历史记录覆盖，但“数字是否来自变更后的事实”仍无检查。属于 PROD-3 的未交付项，不在本次矩阵内。
- `return-approvals.service.ts:143-146` 用“活跃成员数量”作 `requiredApproverCount`，而 `approveReturn` 在 `filing.service.ts:149-155` 检查的是“每个活跃成员的 userId 都在批准列表里”。今天两者等价（批准只能由当前活跃成员产生，且没有移除成员/停用成员的端点）；一旦加入成员移除或停用，计数法可能把“非成员的历史批准”算进配额。属于潜在假设，暂不构成缺陷。
- 邀请接受（`households.service.ts:267-275`）会给家庭增加一个 ACTIVE 成员，但不触发失效；两人 Class 2 已批准后新增第三人，`requiredApproverCount` 从 2 变 3，历史卡会变成 DRAFT，而 `tax_year_workspaces.status` 仍是 APPROVED（税年下拉仍显示 `(APPROVED)`）。这是 PROD-2/成员管理范围，不在 API-5 的七条矩阵内。
- 既有的文档审计行（`documents.service.ts:302-308`、`:377-382`）仍会把 `PRIVATE_DRAFT` 的 `originalName` 写进家庭可读的 activity feed；新的失效理由本身是通用的（“Document visibility changed”/“Document deleted”），没有新增泄漏，但“无审计泄漏”在整条请求上仍不成立。属于既有的 PROD-1 问题，`impl-api5.md` §1 已明说“audit row that precedes it names the document”。

## 5. 审阅范围与未覆盖

### 核对项与判定

| ID | 核对项 | 判定 | 证据 |
|---|---|---|---|
| V1.1 | 事实 confirm/update/delete 走同一服务，supersede 全部活跃批准、NEEDS_REVIEW、版本 +1、审计、无批准 no-op | 通过 | `facts.service.ts:289, 420, 506`；`return-approvals.service.ts:59-109`；无批准分支 `:67-69` 在 update/bump/audit 之前返回 |
| V1.2 | Questionnaire save 走同一服务 | 通过 | `questionnaire.service.ts:93-98`；controller 传 `userId` + `req.ip`（`questionnaire.controller.ts:36-51`） |
| V1.3 | 文档 visibility / delete 走同一服务，理由不含文件名/金额 | 通过 | `documents.service.ts:313-318, 384-389`；理由为固定字符串 |
| V1.4 | 持久化 recalculation 走同一服务；`compareScenarios` 不失效 | 通过 | `calculations.service.ts:318, 359-364`；`class-resolution.ts:257-259` 的 `shouldPersist`；`compareScenarios` 三次调用均 `persist: false`（`:378-389`） |
| V1.5 | 无批准时 no-op：不写 `isSuperseded`、不设 NEEDS_REVIEW、不递增、不审计 | 通过 | `return-approvals.service.ts:59-69` 的 early return；`return-version-history.ts` 不参与写入 |
| V1.6 | 没有重复失效 / 一次请求只 bump 一次 | 通过 | 第一次 `updateMany` 后不再有 `isSuperseded: false`，后续调用在 `:67-69` no-op；`QuestionnaireView.tsx:81-109` 的多次 `confirmFact` + `saveProfile` 只会 bump 一次 |
| V1.7 | 没有漏掉的触发 | **失败** | `freelance.service.ts:475` 直接 `confirmedFact.create`，`FreelanceModule` 未导入 `ReturnApprovalsModule`；见 F1 |
| V2.1 | 私有事实理由保持脱敏 | 通过 | `facts.service.ts:41-46, 284-292, 415-424, 502-510`；`fact-visibility.ts:75-99` 的 `shouldRedactFactAudit`；私有草稿/未共享手工事实均走 redacted 字符串 |
| V2.2 | 文档理由不含文件名/金额 | 通过 | `documents.service.ts:316, 387` 的固定字符串；`return-approvals.service.ts:98-102` 只写 reason/count/version |
| V2.3 | 失效不产生通知泄漏；审计不新增私有数据 | 通过 | `return-approvals.service.ts` 不注入/调用 `NotificationsService`；`newValue` 只有 `reason`、`invalidatedApprovals`、`supersededVersion`；见“仅记录”中的既有文档审计泄漏 |
| V3.1 | `GET return-versions` 返回全部版本，newest-first | 通过 | `return-approvals.service.ts:132-141` 的 `findMany` 无版本过滤、`orderBy versionNumber desc`；`mergeHistory` 再排序（`return-version-history.ts:57`） |
| V3.2 | active 版本无行时补 synthetic DRAFT，不写库 | 通过 | `return-version-history.ts:41-55`；`return-approvals.service.ts:189`；测试 `return-version-history.spec.ts` 的 synthetic 用例 |
| V3.3 | 状态 DRAFT/APPROVED/SUPERSEDED 正确 | 通过 | `return-version-history.ts:14-29`：`< active` → SUPERSEDED；`=== active` 且 `required > 0` 且活跃批准数达标 → APPROVED；否则 DRAFT；测试覆盖 6 个分支 |
| V3.4 | requiredApproverCount = Class 2 活跃成员数，否则 1，与 `approveReturn` 一致 | 通过（有计数/集合的潜在差异） | `return-approvals.service.ts:143-146`；`approveReturn` `filing.service.ts:149-155`；见“仅记录”中的 count-vs-set |
| V3.5 | finalTaxLiability / packageGenerated 正确 | 通过 | `return-approvals.service.ts:166-169`；`snapshotFinalTaxLiability` `:198-205` 只接受有限 number；`packageGenerated` 用 `filingPackage !== null` |
| V3.6 | approvals 包含 superseded 及原因 | 通过 | `return-approvals.service.ts:132-141` 的 include 不过滤；`:170-184` 映射 `isSuperseded`/`supersededAt`/`supersedingReason` |
| V3.7 | 输入顺序稳定 | 通过 | `mergeHistory` 用新数组排序，不修改入参；测试 `return-version-history.spec.ts` 的“不修改输入”用例 |
| V4.1 | client URL 与服务端路由匹配 | 通过 | `packages/api-client/src/client.ts:414-422` 的 `/api/workspaces/${workspaceId}/return-versions`；`filing.controller.ts:89-94` 的 `@Get('return-versions')` |
| V4.2 | 加载历史；approve/generate 后重新加载 | 通过 | `FilingPackageView.tsx:51-61`（`Promise.all` 三项）、`:78`、`:93` 的 `await loadFilingData()` |
| V4.3 | 渲染 status/current/liability/package/approvals/superseded 原因 | 通过 | `FilingPackageView.tsx:226-330`：`VERSION_STATUS_STYLES`、`Current version` pill、`€` 金额、`packageGenerated`、approval 列表、superseded 面板 |
| V4.4 | 空态/加载态 | 通过（一个不可达分支） | `:236-245`：`history === null` 的 loading/unavailable、`versions.length === 0` 的空态；后者不可达（见“仅记录”） |
| V4.5 | 没有死控件 / 假数据 | **失败**（假数据）；死控件未新增 | 历史卡没有控件；旧的 `isSuperseded` 分支仍死（`:215`）；假数据来自 F2 的 stale state |
| V5.1 | `ReturnApprovalsModule` 只依赖 Prisma/Audit | 通过 | `return-approvals.module.ts:1-14`；只 `imports: [PrismaModule, AuditModule]` |
| V5.2 | Facts/Questionnaire/Documents/Calculations/Filing 导入该模块 | 通过 | `facts.module.ts:8`、`questionnaire.module.ts:3`、`documents.module.ts:8`、`calculations.module.ts:8`、`filing.module.ts:8` |
| V5.3 | 没有循环模块 | 通过 | `ReturnApprovalsModule` 不导入任何 feature module；`AuditModule` 不导入任何模块；`PrismaModule` 是 `@Global`（`prisma.module.ts:1-9`） |
| V5.4 | 构造函数/控制器签名一致 | 通过 | `facts.service.ts:83-89`、`questionnaire.service.ts:19-22`、`documents.service.ts:29-34`、`calculations.service.ts:37-41`、`filing.controller.ts:22-27`；controller 调用参数匹配（`questionnaire.controller.ts:46-51`、`documents.controller.ts:68-74/85`、`filing.controller.ts:89-94`） |
| V6.1 | 八个测试文件 179/179 | 通过 | 复跑命令：`node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test ...` → `tests 179 / suites 30 / pass 179 / fail 0` |
| V6.2 | `tsc` 0 | 通过（仅纯层） | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` → exit 0；该配置不含 `return-approvals.service.ts` / module / controller / 改动的 feature services（见未覆盖） |
| V6.3 | syntax 42/42 | 通过 | `node .tools/syntax_check.cjs` → 42 个 `ok`，exit 0 |
| V6.4 | 既有修复未回退 | 通过（按测试） | 其余七个套件（tax-engine、annex-pdf、platform-admin、fact-visibility、class-resolution、form100-case-map、notification-rules）全部通过；工作区全部改动未提交，无法做基线 diff |

### 未覆盖

- **API e2e / DB / 浏览器不可用**：本机 `node_modules` 没有 `@nestjs/*`、`@prisma/client`、Postgres、`next`/`@types/react`，Nest DI 图、Prisma 查询、`GET return-versions` 端点、Guard 路径和七条失效矩阵都没有执行过；`tsc -p tsconfig.api.json` 在缺模块时整体失败，不能作为本改动的类型信号。
- **`tsc` 范围**：`tsconfig.test.json` 只 include 纯层（`return-version-history.ts`、`fact-visibility.ts`、`class-resolution.ts` 等）和测试；`return-approvals.service.ts`、`return-approvals.module.ts`、`filing.controller.ts` 以及 facts/questionnaire/documents/calculations 的改动只经过 `syntax_check.cjs` 的 transpile，没有类型检查。
- **UI 类型/渲染**：没有 `next build`、`next dev`、浏览器；`FilingPackageView.tsx` 只做 JSX transpile + `tmp/tsconfig.probe-api5.json` 的 client/contract 探针，不是 TSX 严格类型检查，也没有实际渲染历史卡、ring/pill、响应式布局。
- **运行时历史载荷**：newest-first 顺序、synthetic 行、`APPROVED`/`SUPERSEDED` 状态、`finalTaxLiability`、`packageGenerated`、approvals 原因都只在代码和纯函数测试层面核对，没有真实 API/DB 观测。
- **服务级测试**：10 个新测试只覆盖 `historyStatus`/`mergeHistory`；`invalidateForChange` 和 `getHistory` 没有 mock-Prisma 测试（见 W1）。
- **既有修复**：八个套件通过是回归证据；但所有改动都在工作区未提交，无法用 baseline commit 做逐行 diff 证明“未回退”，只能按测试覆盖判断。

---

**总结**: 七条列出的触发、no-op、`compareScenarios`、脱敏、历史 DTO/状态、DI 和回归门槛都成立；不能接受的原因是 F1（freelance demo 绕过失效，批准在事实变更后仍有效，历史还会报 APPROVED）和 F2（FilingPackageView 的 stale version/package 在切换税年或重新批准后显示错误年度的批准与包）。F1 是数据完整性问题，优先修；F2 是 UI 状态问题，修法与 F1 独立。





