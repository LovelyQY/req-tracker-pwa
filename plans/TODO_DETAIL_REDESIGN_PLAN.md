# 待办（TODO）详情体验重构 —— 分析与执行清单

> 目标：围绕「待办详情」的 6 项改进，分批执行。
> **批次编号：自 26 起**（此前已到 25）。
> 仓库硬性规则（见 `RULES.md`）：ID 用 `genId()` 不展示、返回走 `goBack()/navTo()`、发版走 `release.sh` 且必带说明、本计划与执行清单须提交进 `plans/`。
> 公开仓库，无需令牌；写操作请用 `gh` 登录，勿在对话贴明文令牌。

---

## 0. 代码落点速查（分析结论）

| 需求 | 现状 | 关键代码位置 |
|---|---|---|
| ①操作按钮就地刷新 | 操作按钮只在**卡片**（`buildTodoCard`）；处理器有 `renderTodoList()` 重渲染列表，但**详情页无操作按钮**，详情也无法就地刷新 | 卡片按钮 `app.js:1406-1409`；处理器 `app.js:2495-2575`；详情 `app.js:1744-1841` |
| ②详情去编辑/删除 | 详情 footer 有「编辑」「删除」按钮与绑定 | DOM `index.html:489-490`；绑定 `app.js:3014-3036` |
| ③详情改全屏 | 详情是 `modal-overlay > modal.task-detail-modal`（居中卡片，`max-width:400px`） | DOM `index.html:473-494`；样式 `styles.css:1034,879,1098-1137` |
| ④流转记录补全 | `renderTodoLifecycleTimeline` 已渲染「操作+状态+操作人+时间」，但**节点无状态色**、未显示会议取消原因、风格弱于任务详情 | `app.js:1712-1742`；参照任务详情 `app.js:1920-1957` |
| ⑤类型色字典化 | `TODO_TYPE` 种子已带 `color`，但 `resolveTypeColor()` 只读 `TASK_TYPE`，对三类回退灰色；仅类型筛选 chips 读到字典色 | 种子 `dictionary.js:101-103`；回填空 `dictionary.js:157-159`；`resolveTypeColor` `app.js:35-36`；用法 `app.js:1383,1783` |
| ⑥详情状态非颜色标签 | 详情状态渲染为 `<span class="tag status-XXX">`（代码类，如 `status-TD_TODO`，CSS 无对应规则故当前其实没上色） | `app.js:1786` |

**连贯设计（重要）**：①③④⑥ 合成一个「详情体验」重构——详情改为**全屏只读页**（去编辑/删除、状态为纯文本），但内嵌**类型对应的操作按钮**（开始处理/完成/转交/上线/结束/取消），点击后**就地重渲染详情**（状态+按钮+流转），无需刷新页面（即需求①）。⑤ 是底层配色基础，建议**最先做**，其余需求都依赖它。

**字典现状与目标色**（`dictionary.js:101-103`）：
- `TASK_ITEM` 任务事项：现为 `#096dd9`(蓝) → 改为 **`#fa8c16`(橙)**
- `BUG` 缺陷追踪：现为 `#cf1322`(红) → 保持 **`#cf1322`(红)**
- `MEETING` 会议：现为 `#389e0d`(绿) → 改为 **`#1677ff`(蓝)**

老库脏色由 `seedDict` 颜色回填空自动对齐（`dictionary.js:157-159`），改种子即全站同步（符合「可配置」）。

---

## 0.1 可配置性审计结论（状态 / 类型名称 / 标签色 是否均为字典项）

> 用户要求：确认**待办所有页面**的状态、类型名称、标签颜色都为可配置项（字典驱动）。
> 审计范围：首页待办视图（卡片/统计/类型chips/状态chips）、待办详情、报表页（任务事项/缺陷追踪/会议三段）。
> 全仓 `resolveTypeColor` 仅 5 处调用：`app.js:1383,1783`（待办，需改）、`1884,2277,2281`（需求任务，保留不动）。

| 展示面 | 状态色 | 类型名称 | 类型/标签色 | 结论 |
|---|---|---|---|---|
| 首页·待办卡片 `buildTodoCard` | ✅ 字典(`colorMap`=状态字典 `color`) | ✅ 字典(`nameMap`) | ⚠️ 类型色 `resolveTypeColor` 回退灰 → **批次26修** | 仅类型色待修 |
| 首页·待办统计 `renderTodoStats` | ✅ 字典(`d.color`) | — | — | 已合规 |
| 首页·类型筛选chips `renderTodoTypeChips` | — | ✅ 字典(`name`) | ✅ 字典(`d.color`) | 已合规 |
| 首页·状态筛选chips `renderTodoStatusChips` | ✅ 字典(`d.color`) | — | ✅ 字典(`d.color`) | 已合规 |
| 待办详情 `openTodoDetail` | ⚠️ 现状为灰标签 → **批次28改纯文本**（非颜色标签即满足需求⑥，底色由字典状态色改为无） | ✅ 字典 | ⚠️ 类型色 `resolveTypeColor` 回退灰 → **批次26修** | 类型色待修；状态批次28 |
| 报表·任务事项段 | ✅ 字典(`TODO_STATUS`) | — | 不展示待办类型色（按类型预筛） | 已合规 |
| 报表·缺陷追踪段 | ✅ 字典(`BUG_STATUS`) | — | 不展示待办类型色 | 已合规 |
| 报表·会议段 | ✅ 字典(`MEETING_STATUS`) | — | 不展示待办类型色 | 已合规 |

**结论**：
- **状态色**：待办在所有页面（首页卡片/统计/状态chips/详情/报表三类段）**已是字典驱动**，无需改动，即已是可配置项。
- **类型名称**：全站取自字典 `TODO_TYPE.name`，已是可配置项。
- **标签色（含类型色）**：唯一缺口是**首页卡片与详情的"待办类型色"**仍走 `resolveTypeColor` 的灰色回退（因 `resolveTypeColor` 只读 `TASK_TYPE`）。**批次26** 新增 `resolveTodoTypeColor()` 读 `TODO_TYPE` 字典并替换 `app.js:1383,1783` 即可全站闭环；报表不展示待办类型色，故无需改。
- 验收口径：批次26完成后，待办所有展示面的「状态色、类型名称、类型/标签色」均取自字典，改 `dictionary.js` 种子色即全站同步，无任何业务代码硬编码 hex。

---

## 批次 26 —— 需求⑤基础：类型色字典化（先做）

**目标**：让待办三类（任务事项/缺陷追踪/会议）的类型色读字典，全站统一为橙/红/蓝，且以后只改字典即可。同时坐实"所有页面标签色可配置"的闭环（见 0.1 审计）。

**步骤**：
1. `dictionary.js:101-103` 修改 `TODO_TYPE` 种子 `color`：
   - `TASK_ITEM` → `#fa8c16`
   - `BUG` → `#cf1322`
   - `MEETING` → `#1677ff`
2. 新增「待办类型色」解析器（仿 `setTaskTypeList`/`resolveTypeColor` 模式，`app.js:13-37`）：
   - 在 `ensureTaskTypes` 旁新增 `ensureTodoTypes()`，从 `RT_DICT.SEED_TYPE.TODO_TYPE` 预取，填充 `TODO_TYPE_LIST` 与 `TODO_TYPE_CODE_TO_COLOR`（含 `color`）。
   - 新增 `resolveTodoTypeColor(code)`：`return TODO_TYPE_CODE_TO_COLOR[code] || '#8c8c8c';`
   - 在 `initTodoView()`（`app.js:1100` 附近）调用 `ensureTodoTypes()` 预加载。
3. 替换**待办**类型色取值（仅改这两处，勿动需求任务卡片 `app.js:1884,2277,2281`）：
   - `app.js:1383` `buildTodoCard`：`const color = resolveTodoTypeColor(t.typeCode);`
   - `app.js:1783` `openTodoDetail`：`const color = resolveTodoTypeColor(todo.typeCode);`
4. 审计其余页面是否硬编码待办类型色（grep 全仓 `#096dd9|#cf1322|#389e0d|#1677ff|#fa8c16` 与 `TASK_ITEM|'BUG'|MEETING` 组合）。报表 `report.js` 当前仅用 `MEETING_STATUS_CODE_TO_COLOR` 等**状态**色（已字典化），不展示待办**类型**色，确认无遗漏即可，不强行加类型色。
5. 类型筛选 chips 已用 `d.color`（`app.js:1437`），状态筛选 chips 用 `d.color`（`app.js:1168` 附近），均合规，无需改；确认其颜色随种子生效。

**验证**：首页待办卡片三类左边/类型标签分别为橙/红/蓝；全屏详情类型标签同色；改 `dictionary.js` 种子色后全站（卡片/详情/chips）同步变化；老数据经回填空自动对齐；对照 0.1 表确认所有页面状态/类型/标签色均取自字典，无硬编码。

---

## 批次 27 —— 需求③+②：详情改全屏只读

**目标**：详情从居中弹窗改为全屏页；移除「编辑」「删除」按钮及其事件绑定。

**步骤**：
1. `index.html:473-494`：将 `todo-detail-overlay` 由「`modal-overlay > modal task-detail-modal` + footer 编辑/删除」改为**全屏容器**（保留 `nav-back` 返回、标题、tags、body；删除 `modal-footer` 内的编辑/删除按钮 `index.html:487-492`）。
2. `styles.css`：新增全屏样式——`#todo-detail-overlay`（或加类名）`position:fixed; inset:0; background:#fff; display:flex; flex-direction:column; overflow:auto;`，去掉 `.task-detail-modal` 的 `max-width:400px`（`styles.css:1034`）；复用现有 `.task-detail-header/.task-detail-body` 布局，确保移动端全屏可用、可滚动。参考既有全屏处理 `styles.css:1098-1137`。
3. `app.js:3014-3036`：删除 `todoDetailEdit`、`todoDetailDelete` 的事件绑定代码块。
4. `closeTodoDetail`（`app.js:1836-1841`）：保持清理 `hidden/overflow`，确认不再引用已删元素。
5. 返回按钮已用 `todo-detail-close → closeTodoDetail`（`app.js:3008-3009`），符合「返回上一页」规范，保留。

**验证**：点卡片打开**全屏**详情（非居中卡片）；页面内无编辑/删除按钮；点返回正常回到列表；不破坏任务详情弹窗（`task-detail-overlay` 不受影响）。

---

## 批次 28 —— 需求⑥：详情状态非颜色标签

**目标**：详情页状态以纯文本展示，不再用彩色标签。

**步骤**：
1. `app.js:1784-1787`（`openTodoDetail` 主标签区）：将状态那一项从
   `<span class="tag status-...">状态名</span>` 改为纯文本，如
   `<span class="detail-status-text">状态：处理中</span>`（仅类型保留彩色标签或也转文本，按视觉取舍；需求仅约束状态非颜色标签）。
2. 如需样式，在 `styles.css` 加 `.detail-status-text`（普通文字，无背景色）。
3. 类型标签（`app.js:1785`，`typeName`）保留彩色（其色来自批次26字典），与状态区分。

**验证**：详情状态显示为黑色/普通文字，无彩色 pill；类型标签仍为对应字典色。

---

## 批次 29 —— 需求①：操作按钮内嵌详情并就地刷新

**目标**：详情页内嵌类型对应的操作按钮；点击后**就地重渲染详情**（状态、可用按钮、流转记录），无需刷新页面。卡片上的按钮保留原有 `renderTodoList()` 行为不变。

**步骤**：
1. 抽出详情重渲染函数：将 `openTodoDetail`（`app.js:1744-1834`）中「取数据→填充 DOM→渲染流转」的部分抽为 `renderTodoDetailContent(id)`；`openTodoDetail` 负责 `show` 遮罩 + 调 `renderTodoDetailContent`；新增 `refreshTodoDetail(id)` = 直接调 `renderTodoDetailContent(id)`（不重建遮罩）。
2. 详情底部新增操作按钮区（在 `app.js:1824` 流转区块之前或之后插入一个 `#todo-detail-actions` 容器），由 `getTodoDetailActions(statusCode, typeCode)` 渲染——复用 `getTodoActions`（`app.js:2469-2493`）的 `MAP`，但**排除 `edit`/`del`**（详情只读，编辑/删除已在批次27移除）。
3. 按钮绑定：点击 → 调 `TODO_ACTION_HANDLERS[act](id)`；在处理器成功后**额外**刷新详情：
   - 最简做法：在 `TODO_ACTION_HANDLERS` 各方法中，动作成功后追加 `if (currentTodoDetailId === id) refreshTodoDetail(id);`（保持现有 `renderTodoStats(); renderTodoList();` 不动，背景卡片同步刷新）。
   - 或在各 handler 末尾统一包一层：执行原逻辑后 `renderTodoList(); if (currentTodoDetailId===id) refreshTodoDetail(id);`。
4. 会议「取消」会 `promptCancelReason`（`app.js:2578`）弹原因框，成功后同样刷新详情。
5. `renderTodoDetailContent` 须重渲染：主标签（类型+状态）、各字段区块、流转记录（`renderTodoLifecycleTimeline`）、以及操作按钮区（因状态变了，可用按钮集变了）。

**验证**：在详情页点「开始处理/完成/转交/上线/结束/取消」→ 状态文字即时更新、操作按钮集即时变为下一状态对应项、流转记录新增一条；全程**不刷新页面**；返回列表后卡片状态也已更新。

---

## 批次 30 —— 需求④：详情流转记录补全（对齐任务详情）

**目标**：待办详情的流转时间线与任务详情风格一致、信息完整。

**步骤**：
1. `renderTodoLifecycleTimeline`（`app.js:1712-1742`）增强：
   - 节点圆点/标签**按状态字典色上色**（复用 `statusColor`/状态字典 `color` 字段），对齐任务详情 `lifeColor`/`statusForOp` 思路（`app.js:240-256`）；编辑等无状态动作保持中性灰。
   - 保证已记录的每类操作均展示：创建(`TODO_CREATE`)、编辑(`TODO_EDIT`)、开始处理/完成/转交/上线/结束/取消（`TODO_*`）——目前 action handlers 与创建/编辑均已写 lifecycle（`app.js:1676-1683,2503,...`），确认无遗漏。
   - **会议取消原因**：若 `operationCode==='TODO_CANCEL'`（或状态 `MT_CANCELLED`），在对应节点追加显示 `取消原因`（取自 todo 记录 `cancelReason`，`app.js:1816-1821` 已取），使流转记录完整。
2. 展示顺序保持「最新在前」（`lc.slice().reverse()`，现有逻辑已满足）；字段：动作 + 状态标签 + 操作人 + 时间，与任务详情一致。
3. 如需阶段时间（如会议时间、完成时间）可在节点补充，待办数据模型无独立 stageTime 字段，可省略或取 `operateTime`。

**验证**：详情流转记录节点带状态色、与任务详情视觉一致；完整覆盖创建→各状态推进→（取消含原因）；操作人/时间正确；最新在前。

---

## 批次 31 —— 收尾：计划提交与发版

**步骤**：
1. 将本计划（`plans/TODO_DETAIL_REDESIGN_PLAN.md`）与每批次的执行清单/验证清单一并 `git add` 并提交（仓库规则：计划文档须纳入版本管理）。
2. 每批次如需独立提交，提交信息带 `[no-version-bump]`（小步）；整体完成后用 `./release.sh <版本> "说明"` 升级版本（当前 `1.3.35`），说明写实（如「待办详情重构：全屏只读+操作就地刷新+类型色字典化+流转记录补全」）。
3. `pre-push` hook 会校验版本递增且 CHANGELOG 非空；推送前 `git config core.hooksPath .githooks` 已启用则本地即拦。
4. GitHub Pages 有缓存滞后：发版后等边缘节点刷新，浏览器**硬刷新**（`Ctrl/Cmd+Shift+R`）确认；`version.json` 读取已带 `?_t=` 时间戳，勿回退。
5. 真机/多浏览器（尤其华为自带浏览器）验证返回栈 `goBack()` 行为，避免落到兜底首页。

---

## 风险与注意
- **不要动 `resolveTypeColor` 对需求任务类型的既有行为**（任务卡片 `app.js:1884,2277,2281` 依赖它），新增 `resolveTodoTypeColor` 独立解析待办类型，避免相互污染（见 0.1 审计全仓调用点）。
- 颜色唯一权威源是字典；改色只改 `dictionary.js` 种子，靠回填空同步老库，不要在业务代码里硬编码 hex。
- 操作按钮从「仅卡片」扩展到「详情内嵌」时，卡片按钮保留 `edit/del`，详情按钮排除 `edit/del`（只读）——两者复用同一 `MAP` 但过滤不同。
- 全屏详情与既有任务详情弹窗（`task-detail-overlay`）是两套 DOM，互不影响，注意别改错选择器。
- 报表页待办三段仅用**状态**色（已字典化），不展示待办**类型**色（各段按类型预筛），属正常设计，不强行加类型色。
