# 统计报表多页化 · 执行清单

> 目标：把现有的「单页 + 同页切换」统计报表（`report.html` 内联四个 `.report-section`，点击模块名在下方切换显示）改造为「入口页 + 四个独立报表页」。
> 入口页列出四个报表，点击进入各自独立页面，页面内独立展示统计信息。
> 与 `plans/REPORT_REFACTOR_PLAN.md`（批次 9.x，IndexedDB 双源适配）**主题不同，互不冲突**。

---

## 现状

- `report.html`：单页，含四个内联 `<section class="report-section" data-key="task|todo|bug|meeting">`，通过 `moduleList` 点击 → `switchSection(key)` 切换 `.active` 在**下方**显示。
- `report.js`：四个报表的渲染逻辑全部耦合在同一 IIFE 内（`renderTaskReport` / `renderBugReport` / `renderTodoReport` / `renderMeetingReport` + 各自 `wire*Controls`），`init()` 一次性 `wire` 全部并默认 `switchSection('task')`。
- 四个报表（取自 `report.js` 的 `MODULES`）：
  1. `task` —— 任务统计
  2. `todo` —— 任务事项统计
  3. `bug` —— 缺陷追踪统计
  4. `meeting` —— 会议统计

## 方案概述

| 文件 | 角色 | 变动 |
|------|------|------|
| `report.html` | **入口页**（纯列表） | 移除四个内联 section / `#reportContent` / `tl-overlay`；`module-list` 点击改为 `navTo('report-xxx.html')`；保留登录闸门、nav-bar、tap 高亮 |
| `report-task.html` | 任务统计独立页 | 新建，搬入 task section + `report-task.js` |
| `report-todo.html` | 任务事项统计独立页 | 新建，搬入 todo section + `report-todo.js` |
| `report-bug.html` | 缺陷追踪统计独立页 | 新建，搬入 bug section + `report-bug.js` |
| `report-meeting.html` | 会议统计独立页 | 新建，搬入 meeting section + `report-meeting.js` |
| `report-common.js` | 共享逻辑 | 新建，抽取四报表共用函数与数据预取 |
| `report.js` | 原耦合脚本 | 拆分为 `report-common.js` + 四个 `report-xxx.js` 后删除 |

**共享抽取内容**（`report-common.js`，IIFE 暴露 `window.RT_REPORT_COMMON`）：`escapeHtml`、`fmtDate`、`statusName/typeName/typeColor/priorityName/projectNameById/versionNameById/userNicknamesByIds`、`inPeriod`、`loadReportData`（字典 + 实体表预取）、`buildTimeValueRow`、`wireTimeSeg`、`renderProjectBars`、`renderBars`、`setNumColor`、`normalizeTask`、`estimateWorkHours/taskWorkHours`、`buildTodoCardHtml`（todos 卡片、**无操作按钮**，供补充 A 三报表清单复用；批次 41–43 填充）等。
各 `report-xxx.js` 仅保留本报表专属的渲染与控件绑定，依赖 `RT_REPORT_COMMON`。

**样式复用**：报表样式（`report-toolbar/grid/card/modules`、`rm-*`、`bar-*`、`rf-*`、`tl-*`）定义在 `styles.css`；各独立页引入 `styles.css?v=<版本>` 即可复用。`module-list/module-row` 的内联样式仅入口页需要，保留在 `report.html`。

---

## 补充需求（追加）

### 补充 A：每个报表均提供「任务清单」按钮（清单详情视图，卡片无操作按钮）

- 任务统计页**已具备**（模块区 `rm-list-btn` → `tl-overlay` 全屏清单，卡片由 `buildTaskCardHtml` 渲染、不含操作按钮），本项对齐其余三报表。
- 任务事项 / 缺陷追踪 / 会议 三个报表独立页，各在报表模块区增加「任务清单」按钮（位置、样式同任务统计页的 `rm-list-btn`）。
- 点击进入清单详情视图：沿用任务统计的 `tl-overlay` 全屏覆盖模式（视觉等同独立页面，符合「进入清单详情页面」表述），展示**当前报表筛选范围内**的记录卡片。
- 卡片**不含操作按钮**：任务统计清单为 `requirement_tasks` 卡片（已实现）；其余三报表数据源为 todos，需在 `report-common.js` 新增 `buildTodoCardHtml`（沿用任务卡片风格，仅展示信息、无操作按钮）供三报表复用。
- 范围：以各报表当前时间维度 + 状态范围过滤清单（缺陷追踪列出范围内全部 BUG；会议列出范围内全部 MEETING；任务事项列出范围内全部 TASK_ITEM）。

### 补充 B：统计时间口径调整

- 任务统计（task）：**维持原口径**（测试开始 / 测试结束时间），不变。
- 任务事项（todo）：改为按「录入时间或创建时间」= `createdAt` 统计（移除以前对 `feedback/start/complete/handoff/online` 等多候选时间任一命中的口径）。
- 缺陷追踪（bug）：改为按 `createdAt` 统计（同上）。
- 会议（meeting）：改为按「会议时间」= `meetingTime` 统计（移除以前多候选时间口径）。
- 兜底：口径字段为空时不计入时间筛选（仍计入「总 X」基数，仅不匹配年/季/月下拉）。
- 实现注意：`collectXxxYears`（年份下拉选项）与 `*InScope`（范围过滤）两处都需改用新口径字段，保持同步。

---

## 批次清单（从 39 顺延，历史最高批次 = 38）

### 批次 39：框架与共享抽取（多页化基础）

**目标**：`report.html` 变为纯入口页；抽取 `report-common.js`；搭好四个独立页骨架，确保入口点击可进入各页（不 404、不报错）。

**改动文件**
- 新建 `report-common.js`
- 改写 `report.js` → 仅保留任务统计逻辑（作为后续 `report-task.js` 的前身），引入 `report-common.js`；移除 `switchSection` / `renderModuleList` / `renderPlaceholder` 及 todo/bug/meeting 专属函数与 `wire*Controls`
- 改写 `report.html`：入口化
- 新建 `report-task.html` / `report-todo.html` / `report-bug.html` / `report-meeting.html`（框架）

**步骤**
1. 新建 `report-common.js`：迁移上表列出的共享函数与 `loadReportData`，结尾 `window.RT_REPORT_COMMON = { ... }`；预留 `buildTodoCardHtml` 接口（批次 41–43 填充实现）。
2. `report.js`：删去共享函数（改引用 `RT_REPORT_COMMON.*`）、删去其它三报表逻辑；`init()` 仅 `renderTaskReport + wireTaskControls`（为批次 40 前置，本批可暂留 task 全量待用）。
3. `report.html`：
   - 删除 `#reportContent` 内四个 `<section>`、`tl-overlay`、相关 `<style>`；
   - `moduleList` 渲染后点击行为改为 `navTo('report-' + key + '.html')`（key ∈ task/todo/bug/meeting）；
   - 保留登录闸门、`.nav-bar`、tap 高亮全局规则。
4. 四个独立页框架（以 `report-task.html` 为模板）：登录闸门、`nav-bar`（标题对应）、返回按钮 `onclick="goBack()"`、引入 `styles.css?v=<版本>` + `auth.js?v=<版本>` + `report-common.js?v=<版本>` + 对应 `report-xxx.js?v=<版本>`；内容区先放「报表建设中」占位（含返回），保证不 404。

**验证**
- 入口页显示四个入口（名称/图标/描述正确）；
- 点击各入口 → 进入对应独立页（标题正确、有返回按钮、无控制台报错）；
- 独立页返回按钮 `goBack()` 回入口页；
- 遵守 RULES：全局 tap 高亮、返回用 `goBack`、不渲染 32 位 ID。

**依赖**：无

**状态**：✅ 已完成（2026-07-22，入口化 + report-common.js 抽取 + 四页骨架；未升版本，按 `[no-version-bump]` 推送）

---

### 批次 40：report-task.html 任务统计完整实现

**目标**：任务统计独立页功能与原单页完全一致（含补充 A 的任务统计部分，已满足，本批保持即可）。

**步骤**
1. 把 `report.html` 中原 task `<section>` 的 HTML（toolbar / grid / modules / `tl-overlay`）整体搬入 `report-task.html` 内容区。
2. 新建 `report-task.js`：从 `report.js` 迁移任务统计全部逻辑（`renderTaskReport` / `renderReports` / `wireTaskControls` / `openModuleTaskList` / `buildTaskCardHtml` / `exportReportPDF` 及 `STATUS_NAME` / `reportFilter` / `reportExcludeTypes` 等模块级状态），共享部分改引用 `RT_REPORT_COMMON`。
3. `report-task.html` 引用 `report-common.js` + `report-task.js`；删除 `report.js`（任务逻辑已迁）。
4. 各页 `<style>` 加入对应 `@media print` 规则（仅保留当前页报表，参考原 `report.html` 的 print 段）。

**验证**
- 统计卡（总任务/总工时/测试中/已测完/已上线/未开始）、类型·状态分布、已进入/未进入测试模块、普通 BUG 勾选、年/季/月筛选、导出 PDF、任务清单 overlay（卡片无操作按钮）—— 与原单页一致。
- 补充 A（任务统计部分）：任务清单按钮正常，卡片无操作按钮。

**依赖**：批次 39

**状态**：✅ 已完成（2026-07-23，[no-version-bump] 推送。`report-task.js` 含完整任务统计逻辑；`report-task.html` 补齐数据层脚本 config/db/dictionary/projects/project-versions/requirement-tasks/task-lifecycles/todos/todo-lifecycles/companies/departments/users + report-common.js + report-task.js）

---

### 批次 41：report-todo.html 任务事项统计

**目标**：任务事项统计独立页，含补充 A 清单按钮、补充 B 时间口径。

**步骤**
1. 搬 todo `<section>` + `renderTodoReport` 系列（`collectTodoYears` / `todosInScope` / `todoStatusColor` / `renderTodoReports` / `exportTodoPDF` / `wireTodoControls` / `todoFilter`）到 `report-todo.html` + `report-todo.js`。
2. **补充 A**：在报表模块区增加「任务清单」按钮（`rm-list-btn`），点击打开 `tl-overlay` 列出范围内 `TASK_ITEM` 卡片（调用 `RT_REPORT_COMMON.buildTodoCardHtml`，无操作按钮）。
3. **补充 B**：时间口径改 `createdAt` —— `collectTodoYears` 年份候选仅取 `createdAt`；`todosInScope` 改用 `createdAt` 匹配（移除 `todoCandidateDates` 多字段口径）。
4. 各页 `<style>` 加入 `@media print` 规则。

**验证**
- 总事项/未处理/处理中/已完成、状态分布、按项目进度、筛选、导出 PDF 与原单页一致。
- 补充 A：任务清单按钮存在，点击打开清单（TASK_ITEM 卡片、无操作按钮）。
- 补充 B：年/季/月筛选按 `createdAt`（录入/创建时间）生效。

**依赖**：批次 39

**状态**：✅ 已完成（2026-07-23，[no-version-bump] 推送。`report-todo.html` 含完整 DOM（4 统计卡 + 3 状态模块 + tl-overlay）；`report-todo.js` 含完整统计/筛选/导出/任务清单逻辑；补充 A：每模块含「任务清单」按钮调用 `buildTodoCardHtml` 无操作按钮；补充 B：时间口径仅按 `createdAt`）

---

### 批次 42：report-bug.html 缺陷追踪统计

**目标**：缺陷追踪统计独立页，含补充 A 清单按钮、补充 B 时间口径。

**步骤**
1. 搬 bug `<section>` + `renderBugReport` 系列（`collectBugYears` / `bugsInScope` / `bugStatusColor` / `renderBugReports` / `exportBugPDF` / `wireBugControls` / `bugFilter` / 关联任务统计）到 `report-bug.html` + `report-bug.js`。
2. **补充 A**：增加「任务清单」按钮（`rm-list-btn`），点击打开 `tl-overlay` 列出范围内 `BUG` 卡片（`buildTodoCardHtml`，无操作按钮）。
3. **补充 B**：时间口径改 `createdAt` —— `collectBugYears` 年份候选仅取 `createdAt`；`bugsInScope` 改用 `createdAt` 匹配（移除 `bugCandidateDates` 多字段口径）。
4. 各页 `<style>` 加入 `@media print` 规则。

**验证**
- 总缺陷/未处理/处理中/已完成/待开发/已上线、状态分布、关联任务、筛选、导出 PDF 与原单页一致。
- 补充 A：任务清单按钮存在，点击打开清单（BUG 卡片、无操作按钮）。
- 补充 B：年/季/月筛选按 `createdAt` 生效。

**依赖**：批次 39

**状态**：✅ 已完成（2026-07-23，[no-version-bump] 推送。`report-bug.html` 含完整 DOM（6 统计卡 + 5 状态模块 + 关联任务统计 + tl-overlay）；`report-bug.js` 含完整统计/筛选/导出/任务清单逻辑；补充 A：每模块含「任务清单」按钮调用 `buildTodoCardHtml` 无操作按钮；补充 B：时间口径仅按 `createdAt`）

---

### 批次 43：report-meeting.html 会议统计

**目标**：会议统计独立页，含补充 A 清单按钮、补充 B 时间口径。

**步骤**
1. 搬 meeting `<section>` + `renderMeetingReport` 系列（`collectMeetingYears` / `meetingsInScope` / `meetingStatusColor` / `renderMeetingReports` / `exportMeetingPDF` / `wireMeetingControls` / `meetingFilter`）到 `report-meeting.html` + `report-meeting.js`。
2. **补充 A**：增加「任务清单」按钮（`rm-list-btn`），点击打开 `tl-overlay` 列出范围内 `MEETING` 卡片（`buildTodoCardHtml`，无操作按钮）。
3. **补充 B**：时间口径改 `meetingTime` —— `collectMeetingYears` 年份候选仅取 `meetingTime`；`meetingsInScope` 改用 `meetingTime` 匹配（移除 `todoCandidateDates` 多字段口径）。
4. 各页 `<style>` 加入 `@media print` 规则。

**验证**
- 总会议/未开始/已结束/已取消、状态分布、按项目进度、筛选、导出 PDF 与原单页一致。
- 补充 A：任务清单按钮存在，点击打开清单（MEETING 卡片、无操作按钮）。
- 补充 B：年/季/月筛选按 `meetingTime`（会议时间）生效。

**依赖**：批次 39

**状态**：✅ 已完成（2026-07-23，[no-version-bump] 推送。`report-meeting.html` 含完整 DOM（4 统计卡 + 3 状态模块 + tl-overlay）；`report-meeting.js` 含完整统计/筛选/导出/任务清单逻辑；补充 A：每模块含「任务清单」按钮调用 `buildTodoCardHtml` 无操作按钮；补充 B：时间口径仅按 `meetingTime`）

---

### 批次 44：联调与收尾

**目标**：全量自测 + 清理 + 发版。

**步骤**
1. `grep` 全仓确认所有 `report.html` 引用（侧边栏/入口）指向入口页正确。
2. 确认 `report.js` 已无残留（功能全迁入 `report-common.js` + 4 个 `report-xxx.js`），删除并移除相关 `<script>` 引用。
3. 全量自测：入口 → 四页跳转 / 返回；四页统计 / 筛选 / 导出 PDF；离线（Service Worker）加载正常。
4. 更新本清单进度标记、CHANGELOG 指针、`version.json`（如需）。
5. **发版**：本批次为功能性发版，须升版本 —— `git config core.hooksPath .githooks` + `./release.sh <版本> "说明"`（不带 `[no-version-bump]`，pre-push hook 会校验版本递增）。

**验证（补充需求回归）**
- 补充 A：四个报表均有「任务清单」按钮；任务统计清单为 requirement_tasks 卡片、其余三报表为 todos 卡片，全部**无操作按钮**。
- 补充 B：任务事项/缺陷追踪按 `createdAt` 统计、会议按 `meetingTime` 统计、任务统计维持测试时间口径，四类口径互不串味。

**依赖**：批次 40–43

**状态**：✅ 已完成（2026-07-23，v1.3.40 正式发版。sw.js 适配四新页 APP_SHELL + release.sh 新增 REPORT_SPLIT_PAGES 版本补丁 + 全量版本同步 + CHANGELOG 汇总 39-44）

---

## 风险与注意事项

1. **RULES 合规**：所有下钻入口用 `navTo()`，返回用 `goBack()`；全局 `-webkit-tap-highlight-color: transparent` + `:focus:not(:focus-visible)`；页面不渲染 32 位系统 ID；发版必须 bump 版本号（功能性批次 44 不带 `[no-version-bump]`）。
2. **作用域隔离**：原 `report.js` 的模块级变量（`reportFilter` / `bugFilter` / `todoFilter` / `meetingFilter` / 各 `*_LIST` 缓存）拆分到各 `report-xxx.js` 后天然隔离；共享缓存（`projectList` / `userList` 等）放在 `report-common.js` 的闭包内，由各页 `loadReportData()` 独立填充（PWA 单页独立加载，不跨页共享）。
3. **命名冲突**：`report-common.js` 暴露的 `RT_REPORT_COMMON` 与各页 `report-xxx.js` 内部变量避免重名。
4. **样式版本号**：所有 `<script>` / `<link>` 的 `?v=` 跟随当前 `APP_VERSION`，发版后由 `release.sh` 同步；新增页面引用须带正确 `?v=`。
5. **PDF 导出**：每个独立页的 `@media print` 仅保留自身报表内容，删除原 `report.html` 中针对多 section 切换的 print 规则残留。
6. **补充 A 卡片无操作按钮**：`buildTodoCardHtml` 仅展示字段（标题/状态/项目/时间等），不得带编辑/删除/流转等按钮；复用任务卡片视觉风格。
7. **补充 B 口径两处同步**：`collectXxxYears`（年份下拉）与 `*InScope`（范围过滤）必须同步改用 `createdAt` / `meetingTime`，避免「下拉有年份但筛选无数据」或反之；空值字段不计入时间筛选但保留在「总 X」基数。

---

## 建议执行顺序

39（框架）→ 40（任务统计）→ 41（任务事项）→ 42（缺陷追踪）→ 43（会议）→ 44（联调发版）。
每批次完成后验证通过再进入下一批。

> 📅 制定日期：2026-07-22
> 🎯 批次区间：v1.3.38+（批次 39–44）
> 📋 关联计划：`plans/REPORT_REFACTOR_PLAN.md`（批次 9.x，主题不同，互不冲突）
> 📝 补充需求：A（四报表均含任务清单按钮，卡片无操作按钮）、B（todo/bug 按 createdAt、meeting 按 meetingTime、task 不变）
