# 待办（TODO）详情体验重构 —— 分析与执行清单

> 目标：围绕「待办详情」的 6 项改进，分批执行。
> **批次编号：自 26 起**（此前已到 25）。
> 仓库硬性规则（见 `RULES.md`）：ID 用 `genId()` 不展示、返回走 `goBack()/navTo()`、发版走 `release.sh` 且必带说明、本计划与执行清单须提交进 `plans/`。
> 公开仓库，无需令牌；写操作请用 `gh` 登录，勿在对话贴明文令牌。

---

## 0. 代码落点速查（分析结论）

| 需求 | 现状 | 关键代码位置 |
|---|---|---|
| ①操作按钮就地刷新（**卡片**） | 卡片按钮已调用 `renderTodoList()` 重渲染，但重渲染位于 `updateTodo()`+`createTodoLifecycle()` 之后；若任一 `await` 抛错（外键/字典校验失败、流转写入异常等）则 `renderTodoList()` 被跳过，DB 已更新却未重绘 → 必须刷新页面才看到状态/按钮变化。详情页为只读，**不内嵌操作按钮**（见②③④⑥） | 卡片按钮 `app.js:1394-1401`；处理器 `app.js:2530-2610`（重渲染在 `renderTodoStats(); renderTodoList();`），`updateTodo` 校验链 `todos.js:262-308`、`createTodoLifecycle` 校验 `todo-lifecycles.js:104-141` |
| ②详情去编辑/删除 | 详情 footer 有「编辑」「删除」按钮与绑定 | DOM `index.html:489-490`；绑定 `app.js:3014-3036` |
| ③详情改全屏 | 详情是 `modal-overlay > modal.task-detail-modal`（居中卡片，`max-width:400px`） | DOM `index.html:473-494`；样式 `styles.css:1034,879,1098-1137` |
| ④流转记录补全 | `renderTodoLifecycleTimeline` 已渲染「操作+状态+操作人+时间」，但**节点无状态色**、未显示会议取消原因、风格弱于任务详情 | `app.js:1712-1742`；参照任务详情 `app.js:1920-1957` |
| ⑤类型色字典化 | `TODO_TYPE` 种子已带 `color`，但 `resolveTypeColor()` 只读 `TASK_TYPE`，对三类回退灰色；仅类型筛选 chips 读到字典色 | 种子 `dictionary.js:101-103`；回填空 `dictionary.js:157-159`；`resolveTypeColor` `app.js:35-36`；用法 `app.js:1383,1783` |
| ⑥详情状态非颜色标签 | 详情状态渲染为 `<span class="tag status-XXX">`（代码类，如 `status-TD_TODO`，CSS 无对应规则故当前其实没上色） | `app.js:1786` |

**连贯设计（重要）**：②③④⑥ 合成「详情体验」重构——详情改为**全屏只读页**（去编辑/删除、状态为纯文本、流转记录补全），**不内嵌操作按钮**。需求①单独处理，且对象是**卡片**：卡片上的「开始处理/完成/转交/上线/结束/取消」点击后须**就地重渲染卡片**（状态文字 + 可用按钮集 + 统计），无需刷新页面。⑤ 是底层配色基础，建议**最先做**，其余需求都依赖它。

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

## 批次 29 —— 需求①：卡片操作按钮点击后就地刷新（无需刷新页面）

**目标**：点击卡片上的「开始处理/完成/转交/上线/结束/取消」后，**卡片状态文字与可用按钮集即时更新、统计同步**，全程**不需要刷新页面**。详情页保持只读、不内嵌操作按钮（见批次27/28）。

**根因（关键）**：`TODO_ACTION_HANDLERS`（`app.js:2530-2610`）各方法均先 `await RT_TODOS.updateTodo(...)`，再 `await RT_TODO_LIFECYCLES.createTodoLifecycle(...)`，最后才 `renderTodoStats(); renderTodoList();`。重渲染写在整条 await 链**之后**——只要任一 await 抛错（如 `updateTodo` 的 `assertForeignKeys` 外键校验、`createTodoLifecycle` 的字典/父代办校验，或流转写入异常），`renderTodoList()` 就被跳过；此时 DB 实际已更新，卡片却未重绘，表现就是「点了要刷新页面才变」。

**步骤**：
1. 把卡片重渲染做成「不依赖流转写入成败」：将 `renderTodoStats(); renderTodoList();` 移入 `try/finally`（或在 `updateTodo` 成功后即触发重绘，把 `createTodoLifecycle` 的失败降级为 `toast` 警告而不阻断 UI）。确保无论流转记录是否写入成功，卡片都**先就地刷新**。
   - 推荐写法（以 `start` 为例，其余 `complete/handoff/online/end/cancel` 同改）：
     ```js
     async start(id) {
       const todo = await RT_TODOS.getTodo(id); if (!todo) return;
       const { user, account } = currentTodoOperator();
       const nextCode = (todo.typeCode === 'BUG') ? 'BUG_DOING' : (todo.typeCode === 'MEETING' ? 'MT_IN_PROGRESS' : 'TD_DOING');
       await RT_TODOS.updateTodo(id, { statusCode: nextCode }, user);
       toast(todo.typeCode === 'MEETING' ? '会议已开始' : '已开始处理');
       try { await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, statusCode: nextCode, operationCode: 'TODO_START', operator: account }); }
       catch (e) { toast('状态已更新，但流转记录写入失败', 'warn'); }
       finally { renderTodoStats(); renderTodoList(); }
     }
     ```
2. 兜底：若 `updateTodo` 本身失败（如外键校验不通过），`catch` 后 `toast` 错误并**仍尝试** `renderTodoList()`（DB 未变，重绘结果等同现状，但保证不卡死、不要求刷新）。
3. 确认 `renderTodoList()`（`app.js:1364`）每次都从 `getAllTodos()`（`todos.js:333`，实读 IndexedDB、无缓存）重新取数；卡片状态与按钮由 `buildTodoCard`→`getTodoActions(statusCode,typeCode)`（`app.js:1441/2504`）按**最新** `statusCode` 生成——已满足，无需改。
4. 不改动卡片按钮的 `edit/del`（保留），也不在详情页加操作按钮（详情只读）。

**验证**：点卡片「开始处理」→ 卡片状态文字即时变「处理中」、按钮即时变为「完成/编辑」、顶部统计数字同步更新；点「完成」→ 变「已完成」且仅剩「编辑」；点会议「结束/取消」→ 状态与按钮即时更新；全程**不刷新页面**；若刻意制造流转写入异常，卡片仍会刷新（仅弹警告），不再需要手动刷新页面。

> **状态**：已完成（2026-07-22，[no-version-bump] 推送）。改动仅 `app.js` 的 `TODO_ACTION_HANDLERS`（`start/complete/handoff/online/end/cancel/del` 重绘移入 `finally`、流转写入失败降级警告）；卡片按钮集合、`renderTodoList` 实读逻辑均未变。CHANGELOG v1.3.35 已补录。

---

## 批次 30 —— 需求④：详情流转记录补全（对齐任务详情）

**目标**：待办详情的流转时间线与任务详情风格一致、信息完整。

**步骤**：
1. `renderTodoLifecycleTimeline`（`app.js` `renderTodoLifecycleTimeline`）增强：
   - 节点圆点/标签**按状态字典色上色**（复用状态字典 `color` 字段，浅底深字 `${color}1a`/`${color}`，对齐任务详情 `lifeColor` 思路）；编辑(`TODO_EDIT`)等无状态动作保持中性灰，圆点经 `.lc-item` 的 `--c` 变量着色。
   - 保证已记录的每类操作均展示：创建(`TODO_CREATE`)、编辑(`TODO_EDIT`)、开始处理/完成/转交/上线/结束/取消（`TODO_*`）——目前 action handlers 与创建/编辑均已写 lifecycle（`app.js:1676-1683,2503,...`），确认无遗漏。
   - **会议取消原因**：若 `operationCode==='TODO_CANCEL'`（或状态 `MT_CANCELLED`），在对应节点追加显示 `取消原因`（取自 todo 记录 `cancelReason`，`app.js:1816-1821` 已取），使流转记录完整。
2. 展示顺序保持「最新在前」（`lc.slice().reverse()`，现有逻辑已满足）；字段：动作 + 状态标签 + 操作人 + 时间，与任务详情一致。
3. 如需阶段时间（如会议时间、完成时间）可在节点补充，待办数据模型无独立 stageTime 字段，可省略或取 `operateTime`。

**验证**：详情流转记录节点带状态色、与任务详情视觉一致；完整覆盖创建→各状态推进→（取消含原因）；操作人/时间正确；最新在前。

> **状态**：已完成（2026-07-22，[no-version-bump] 推送）。改动 `app.js` 的 `renderTodoLifecycleTimeline`（状态字典色上色 + 会议取消原因行）+ `styles.css` 的 `.lc-cancel-reason`。CHANGELOG v1.3.35 已补录。

---

## 批次 31 —— 收尾：计划提交与发版

**步骤**：
1. 将本计划（`plans/TODO_DETAIL_REDESIGN_PLAN.md`）与每批次的执行清单/验证清单一并 `git add` 并提交（仓库规则：计划文档须纳入版本管理）。
2. 每批次如需独立提交，提交信息带 `[no-version-bump]`（小步）；整体完成后用 `./release.sh <版本> "说明"` 升级版本（当前 `1.3.35`），说明写实（如「待办详情重构：全屏只读+操作就地刷新+类型色字典化+流转记录补全」）。
3. `pre-push` hook 会校验版本递增且 CHANGELOG 非空；推送前 `git config core.hooksPath .githooks` 已启用则本地即拦。
4. GitHub Pages 有缓存滞后：发版后等边缘节点刷新，浏览器**硬刷新**（`Ctrl/Cmd+Shift+R`）确认；`version.json` 读取已带 `?_t=` 时间戳，勿回退。
5. 真机/多浏览器（尤其华为自带浏览器）验证返回栈 `goBack()` 行为，避免落到兜底首页。

> **状态**：已完成（2026-07-22）。`release.sh` 升版本至 **v1.3.36**（23 个文件同步：index.html 的 APP_VERSION/SW_VERSION/app.js、styles.css 版本化 URL、sw.js 的 CACHE、version.json、APP_RELEASE_TIME，及各页面脚本 ?v= 缓存破坏）；CHANGELOG 顶部新增 v1.3.36 条目（汇总批次26-31 的 6 项需求），保留 v1.3.25–v1.0.28 完整历史；发版提交 `chore(release): v1.3.36` 已推送。本计划文档随版本管理一并纳入。

---

## 风险与注意
- **不要动 `resolveTypeColor` 对需求任务类型的既有行为**（任务卡片 `app.js:1884,2277,2281` 依赖它），新增 `resolveTodoTypeColor` 独立解析待办类型，避免相互污染（见 0.1 审计全仓调用点）。
- 颜色唯一权威源是字典；改色只改 `dictionary.js` 种子，靠回填空同步老库，不要在业务代码里硬编码 hex。
- 操作按钮**只在卡片**（`buildTodoCard` → `getTodoActions`），详情页为只读**不内嵌**任何操作按钮（编辑/删除已在批次27移除，状态推进按钮也不进详情）。批次29 只加固卡片点击后的就地重绘，不改变按钮集合本身。
- 全屏详情与既有任务详情弹窗（`task-detail-overlay`）是两套 DOM，互不影响，注意别改错选择器。
- 报表页待办三段仅用**状态**色（已字典化），不展示待办**类型**色（各段按类型预筛），属正常设计，不强行加类型色。

---

## 批次 32 —— 类型筛选按钮选中色走字典配置

**目标**：待办页面「任务事项 / 缺陷追踪 / 会议」三个类型筛选 chip，选中后背景色取自 `dictionary.js` `SEED_TYPE.TODO_TYPE` 的 `color` 字段（橙/红/蓝），不再统一蓝色。

### 根因分析

| 层 | 现状 | 问题 |
|---|---|---|
| JS 渲染 | `app.js:1162-1164` `renderTodoTypeChips()` 生成的按钮 **不带** `style="--chip-color:..."` | 与状态筛选 chips（`app.js:1189-1191` 已注入颜色）不一致 |
| CSS 规则 | `styles.css:432-437` `.chip.active` 缺省用 `--primary`（= `#1677ff` 蓝） | 所有未特殊着色的 active chip 都命中此规则 |
| CSS 特殊规则 | `styles.css:469` `.chip[data-type-code].active` 按 `--chip-color` 着色 | 但按钮用的是 `data-todo-type` 属性名，**属性名不匹配**，规则不生效 |

**结果**：类型筛选按钮选中 → 命中 `.chip.active`（蓝）→ 字典色完全被忽略。

### 步骤

1. **`app.js` `renderTodoTypeChips()`（第 1162–1164 行）**：仿照 `renderTodoStatusChips()` 的做法，注入字典 `color` 为内联 CSS 变量：
   ```js
   // 改前
   wrap.innerHTML = items.map((d) =>
     '<button class="chip' + (d.code === currentTodoType ? ' active' : '') + '" data-todo-type="' + d.code + '">' + (d.name || d.code) + '</button>'
   ).join('');

   // 改后
   wrap.innerHTML = items.map((d) => {
     const active = d.code === currentTodoType ? ' active' : '';
     const c = d.color ? ' style="--chip-color:' + d.color + '"' : '';
     return '<button class="chip' + active + '" data-todo-type="' + d.code + '"' + c + '>' + (d.name || d.code) + '</button>';
   }).join('');
   ```

2. **`styles.css`**：在 `.chip[data-type-code].active`（第 469 行）之后新增一条针对 `data-todo-type` 的对称规则（兜底，即使未来内联样式被移除也能正确着色）：
   ```css
   .chip[data-todo-type].active { background: var(--chip-color, var(--primary)); border-color: var(--chip-color, var(--primary)); color: #fff; }
   ```

3. **不改动的部分**：`index.html` 中 `id="todo-type-chips"` 容器不变；`dictionary.js` 种子色已定义（`#fa8c16` / `#cf1322` / `#1677ff`）；状态筛选 chips 不受影响。

### 验证

- 选中「任务事项」chip → 背景橙色（`#fa8c16`）
- 选中「缺陷追踪」chip → 背景红色（`#cf1322`）
- 选中「会议」chip → 背景蓝色（`#1677ff`）
- 未选中态保持灰色中性底（不受影响）
- `node --check app.js` 通过

---

## 批次 33 —— 修复流转记录写入失败

**目标**：卡片操作按钮点击后，不再每次提示"流转记录写入失败"；流转记录应正常写入 IndexedDB。

### 根因分析

`todo-lifecycles.js:104-141` 的 `createTodoLifecycle()` 在真正写入 IndexedDB 前做了两道**硬性字典枚举校验**：

1. **操作码校验**（第 118–121 行）：`assertDictCode(SEED_TYPE.TODO_OPERATION, operationCode)` — 校验 `TODO_START/TODO_COMPLETE` 等是否在本地字典存在
2. **状态码校验**（第 124–131 行）：通过父代办 typeCode 映射到对应状态字典（`TODO_STATUS/BUG_STATUS/MEETING_STATUS`），再 `assertDictCode` 校验 statusCode

**关键不对称**：
- 创建/编辑走的是 `TODO_CREATE/TODO_EDIT`（最早播种的 code，基本都在）
- 卡片操作用的 `TODO_START/TDO_COMPLETE/TDO_HANDOFF/TDO_ONLINE/TDO_END/TDO_CANCEL` 以及新状态码 `TD_DOING/BUG_DOING/MT_IN_PROGRESS` 等——如果本地 IndexedDB 字典与最新 `dictionary.js` 种子不同步（老库、播种时序问题），这些 code 在本地 `dicts` 表缺失 → `assertDictCode` 每次抛 `字典枚举无效` → 被 `catch` 降级为 warn toast

**表现**：创建/编辑不报错，但每次点卡片操作按钮都弹"流转记录写入失败"。

### 步骤

1. **诊断增强**（先做，确认根因）：把 `app.js` 中 6 处 `TODO_ACTION_HANDLERS` 的 catch 文案带上真实错误信息（当前只写固定文字，看不到具体失败原因）：
   ```js
   // 改前（6 处均同）
   } catch (e) { toast('状态已更新，但流转记录写入失败', 'warn'); }

   // 改后
   } catch (e) { toast('状态已更新，但流转记录写入失败：' + (e && e.message ? e.message : ''), 'warn'); }
   ```
   涉及位置：`start(2555行)`、`complete(2569行)`、`handoff(2584行)`、`online(2597行)`、`end(2611行)`、`cancel(2633行)`

2. **根治**（`todo-lifecycles.js` 第 133 行）：将字典枚举校验从"硬性前置条件"改为"尽力而为、不阻塞写入"。流转记录是 append-only 流水，展示用字典缺失不应导致记录丢失：
   ```js
   // 改前
   return Promise.all(dictChecks.concat([todoCheck])).then(function () {
     // ... 写入 DB
   });

   // 改后：字典校验降级为 warn，不阻塞写入
   return Promise.all(
     dictChecks.map(function(p){ return p.catch(function(e){ console.warn('[lifecycle] 字典校验跳过:', e && e.message); }); })
     .concat([todoCheck.catch(function(e){ console.warn('[lifecycle] 状态校验跳过:', e && e.message); })])
   ).then(function () {
     // ... 写入 DB（原逻辑不变）
   });
   ```

3. **加固播种**（可选但推荐）：确认 `ensureTodoTypes()`（`app.js:74-85`）中的 `seedDict()` 在新库/老库场景都能补齐全量 SEED。`seedDict` 本身是幂等去重+仅补缺失，逻辑正确；若仍有问题可在初始化时加一次强制 re-seed。

### 验证

- 点任意卡片的「开始处理/完成/转交/上线/结束/取消」→ **不再弹出**"流转记录写入失败"警告（或至少能看到具体原因）
- 打开详情页 → 流转记录时间线中**新增一条**对应的操作记录（说明写入成功）
- `node --check app.js` 和 `node --check todo-lifecycles.js` 均通过

---

## 批次 34 —— 详情页状态改为彩色标签（第三遍）

**目标**：详情页的状态显示从纯文本 `状态：XXX` 改为与卡片一致的彩色 `<span class="tag status-XXX">` 标签。

### 根因分析

| 位置 | 当前代码 | 问题 |
|---|---|---|
| `app.js:1798-1809` | `Promise.all` 只解构 `[typeName, statusName]` | **没有解析 `statusColor`** |
| `app.js:1833` | `'<span class="detail-status-text">状态：' + escapeHtml(statusName) + '</span>'` | 输出纯文本，非彩色标签 |
| 对比卡片 `app.js:1453` | `'<span class="tag status-' + ... + '" style="background:' + statusColor + '1a;color:' + statusColor + '">'` | 彩色标签，应为目标样式 |

这是第三次提出该需求。前两次（批次28将其改为纯文本、批次30完成流转记录）均未将详情状态改为**彩色标签**。

### 步骤

1. **`app.js` `openTodoDetail()`（第 1798–1809 行）**：在 `Promise.all` 中新增第三个 Promise 解析 `statusColor`：
   ```js
   // 改前
   const [typeName, statusName] = await Promise.all([
     /* typeName promise */,
     /* statusName promise */
   ]);

   // 改后
   const [typeName, statusName, statusColor] = await Promise.all([
     /* typeName promise（不变） */,
     /* statusName promise（不变） */,
     (function() {
       const stType = SEED && TODO_STATUS_DICT[todo.typeCode];
       if (!stType) return Promise.resolve('#8c8c8c');
       return window.RT_DICT.getDictByType(stType).then(function(l) {
         const d = (l || []).find(function(x) { return x.code === todo.statusCode; });
         return (d && d.color) || '#8c8c8c';
       });
     })()
   ]);
   ```

2. **`app.js` 第 1831–1834 行**：将状态从纯文本改为彩色标签：
   ```js
   // 改前
   document.getElementById('todo-detail-tags-main').innerHTML = [
     '<span class="tag" style="background:' + (color || '#8c8c8c') + '1a;color:' + (color || '#8c8c8c') + '">' + escapeHtml(typeName) + '</span>',
     '<span class="detail-status-text">状态：' + escapeHtml(statusName) + '</span>'
   ].join('');

   // 改后
   document.getElementById('todo-detail-tags-main').innerHTML = [
     '<span class="tag" style="background:' + (color || '#8c8c8c') + '1a;color:' + (color || '#8c8c8c') + '">' + escapeHtml(typeName) + '</span>',
     '<span class="tag status-' + escapeHtml(todo.statusCode || '') + '" style="background:' + statusColor + '1a;color:' + statusColor + '">' + escapeHtml(statusName) + '</span>'
   ].join('');
   ```

3. **`styles.css`**：`.detail-status-text` 样式可保留（不影响，因为不再生成该类元素）；`.tag.status-*` 已有基础样式，无需额外改动。

### 验证

- 详情页状态显示为**彩色圆角标签**（浅底深字），样式与卡片上的状态标签一致
- 「任务事项」待办各状态色：未处理灰、处理中蓝、已完成绿
- 「缺陷追踪」待办各状态色：未处理灰、处理中蓝、已完成绿、待开发橙、已上线深绿
- 「会议」待办各状态色：未开始灰、会议中蓝、已结束绿、已取消红
- 类型标签（左侧第一个 tag）保持其字典色不变
- `node --check app.js` 通过

---

## 批次 35 —— 待办卡片增加"重置"按钮

**目标**：所有待办卡片、任意状态下都显示「重置」按钮；位于「操作」和「编辑」之间；灰色样式；点击后将当前卡片状态重置到初始状态（重新开始）。操作按钮及配色加入字典配置。

### 根因分析

| 层 | 现状 | 缺口 |
|---|---|---|
| 字典 `dictionary.js:120-128` | `SEED_TYPE.TODO_OPERATION` 有 9 个枚举 | **缺少 `TODO_RESET`** |
| `app.js:2516-2540` `getTodoActions()` | `MAP` 定义每状态的按钮列表，`LABELS` 定义文案 | **无 `reset` 条目** |
| `app.js:2542+` `TODO_ACTION_HANDLERS` | 各操作的处理器对象 | **无 `reset` 方法** |
| `styles.css:835` | `.btn.action-重置`（中文类名） | **死代码** — JS 生成的是英文 `action-reset`，类名不匹配 |
| `styles.css:47` | `--c-重置: #bfbfbf`（灰色变量） | ✅ 已定义，可直接复用 |

### 步骤

#### ① 字典补充（`dictionary.js`）

在第 128 行（`TODO_END` 之后）追加：
```js
{ type: SEED_TYPE.TODO_OPERATION, code: 'TODO_RESET', name: '重置', order: 9 },
```
满足"操作按钮及配色加入字典配置"要求。

#### ② 卡片按钮渲染（`app.js` `getTodoActions()` 第 2516–2540 行）

- `LABELS` 新增：`reset: '重置'`
- 在 `return` 之前统一注入 `reset` 到每个状态按钮列表，且保证位置在 `edit` **之前**（"操作和编辑之间"）：
```js
const LABELS = {
  start: (typeCode === 'MEETING') ? '开始' : '开始处理',
  complete: '完成', handoff: '转交', end: '结束',
  online: '上线', cancel: '取消', edit: '编辑', del: '删除',
  reset: '重置'   // ← 新增
};
// return 前注入 reset（在 edit 之前）
return (MAP[statusCode] || ['edit']).map(function(act) {
  return { act: act, label: LABELS[act] || act };
}).reduce(function(acc, item) {
  if (item.act === 'edit') acc.push({ act: 'reset', label: LABELS.reset });
  acc.push(item);
  return acc;
}, []);
```

效果示例：
- `TD_TODO`: `[start, reset, edit, del]` （start=操作, reset在中间, edit=编辑）
- `TD_DOING`: `[complete, reset, edit]`
- `MT_NOT_STARTED`: `[start, cancel, reset, edit, del]`
- `MT_ENDED`: `[reset, edit]` （只有编辑时，reset 在编辑前）

#### ③ 操作处理器（`app.js` `TODO_ACTION_HANDLERS`）

在 `del` 处理器之后（约第 2640 行前）新增 `reset`：
```js
async reset(id) {
  const todo = await RT_TODOS.getTodo(id);
  if (!todo) return;
  const { user, account } = currentTodoOperator();
  // 按类型映射到初始状态码
  const initCode = (todo.typeCode === 'BUG')    ? 'BUG_TODO'
                 : (todo.typeCode === 'MEETING') ? 'MT_NOT_STARTED'
                 :                                  'TD_TODO';
  try {
    await RT_TODOS.updateTodo(id, { statusCode: initCode }, user);
    toast('已重置到初始状态');
    try {
      await RT_TODO_LIFECYCLES.createTodoLifecycle({
        todoId: id, statusCode: initCode,
        operationCode: 'TODO_RESET', operator: account
      });
    } catch (e) {
      toast('状态已重置，但流转记录写入失败：' + (e && e.message ? e.message : ''), 'warn');
    }
  } catch (e) {
    toast((e && e.message) ? e.message : '操作失败', 'error');
  }
  finally { renderTodoStats(); renderTodoList(); }
},
```

#### ④ 样式修复（`styles.css`）

第 835 行的死规则 `.btn.action-重置`（中文类名）改为英文（JS 生成的类名是 `action-reset`）：
```css
/* 改前 */
.btn.action-重置 { background: var(--c-重置); color: #fff; }

/* 改后 */
.btn.action-reset { background: var(--c-重置, #bfbfbf); color: #fff; border: 1px solid var(--c-重置, #bfbfbf); }
```
`--c-重置: #bfbfbf` 已在第 47 行定义（灰色），直接复用。

### 验证

- **所有状态**的待办卡片都出现「重置」按钮（灰色背景白字）
- 重置按钮位置恒在「最后一个操作按钮」和「编辑」之间
- 点「重置」→ 状态回到初始值（任务事项→未处理、缺陷→未处理、会议→未开始）
- 卡片即时刷新（按钮集更新、统计同步），不需要刷新页面
- 详情页流转记录新增一条「重置」记录
- `node --check app.js` 通过

---

## 批次 36 —— 本地字典强制同步（种子版本门控，治本）

**目标**：从根上消除"本地 IndexedDB 字典缺 code"——保证客户端字典与最新 `dictionary.js` SEED 始终一致，不再只看批次 33 的"非阻塞降级"兜底。

### 根因（回顾）

`seedDict()`（`dictionary.js:133`）对全量 `SEED` 做"缺失补齐 + 颜色/order 回填"，本应每次启动补齐新 code。但两个漏洞导致旧库/缓存场景缺 code：

1. **SW 缓存旧 `dictionary.js`**：浏览器缓存了发布前的 `dictionary.js`，其 `SEED` 没有 `TODO_START/TD_DOING/TODO_RESET` 等新 code → `seedDict` 用的 SEED 也是旧的，永远补不上。
2. **缺统一启动播种 + 版本变更强制重播**：`seedDict` 只在各视图 `init` 时经 `ensureTodoTypes/ensureTaskTypes/ensurePriorities` 间接触发，没有"发版了就强制重跑"的开关；上次用旧 SEED "成功"后不再补。

表现：本地 `dicts` store 缺 code → `createTodoLifecycle` 的 `assertDictCode` 在 IndexedDB 查不到 → 抛「字典枚举无效」→ 批次 33 之前弹"流转记录写入失败"。

### 步骤

1. **`dictionary.js`：`seedDict` 增加 `force` 参数**
   - 新增第二参数 `force`（默认 `false`）。
   - `force=true` 时：跳过 `if (!missing.length && !backfills.length) return ...` 提前返回；对所有 existing 记录无条件回写 `order`/`color`（保证老库脏值/新 code 颜色被刷新）。
   - `api` 中新增导出 `DICT_SEED_SIGNATURE`（对 `SEED` 生成的稳定 hash 字符串），供启动比对是否变更。

2. **`app.js`：新增 `ensureAllDicts()`，启动即全量播种**
   ```js
   async function ensureAllDicts() {
     const account = (typeof getSessionAccount === 'function' ? getSessionAccount() : 'system') || 'system';
     const last = localStorage.getItem('rt_dict_seed_ver') || '';
     const cur = (window.APP_VERSION || (window.RT_DICT && RT_DICT.DICT_SEED_SIGNATURE) || '');
     const changed = last !== cur;
     try {
       if (changed && window.RT_DICT && RT_DICT.seedDict) {
         await RT_DICT.seedDict(account, true);   // 版本变更 → 强制重播
       } else if (window.RT_DICT && RT_DICT.seedDict) {
         await RT_DICT.seedDict(account);          // 常规补齐
       }
     } catch (e) { console.warn('[dict] 播种失败:', e && e.message); }
     try { localStorage.setItem('rt_dict_seed_ver', String(cur)); } catch (e) {}
   }
   ```
   - 在启动入口最早处 `await ensureAllDicts()`（早于 `initTodoView` 等任何视图 init）。
   - `ensureTodoTypes/ensureTaskTypes/ensurePriorities` 内现有 `seedDict` 调用保留（幂等，作为双保险），主同步改由 `ensureAllDicts` 负责。

3. **`version.json` / `release.sh`**：发版时 `APP_VERSION` 由 `release.sh` 自动 bump；`ensureAllDicts` 读取它作为"种子版本标记"（发版 = 种子可能变更 = 强制重播）。

4. **`sw.js`**：`release.sh` 已 bump `CACHE`；确认 `dictionary.js` 在预缓存清单中，使客户端发版后拉取新 `dictionary.js`（这是新 code 能被 `seedDict` 读到的前提）。

### 验证

- 真机/旧库：打开应用（新版本）→ console 见 `seedDict` 补齐缺失 code（如 `TODO_RESET`）；`getAllDict()` 对应 type 的 code 齐全。
- 模拟缺码：DevTools 删除某条 todo 字典记录 → 刷新 → 该记录被自动补回。
- 流转记录：点卡片操作按钮不再触发"字典枚举无效"（治本后批次 33 降级分支基本不再命中）。
- `node --check app.js && node --check dictionary.js` 通过。

---

## 批次 37 —— 测试用例

**目标**：编写测试验证批次 32–36 的改动；全部通过后升级版本并推送。

### 测试方案

项目无构建步骤，但 `db.js/dictionary.js/todo-lifecycles.js` 带 `module.exports` 守卫（Node 可直接 require），`app.js` 中 `getTodoActions/resolveTodoTypeColor` 等为纯函数（不触碰 DOM），适合轻量测试。

#### 测试文件结构

```
tests/
├── test-batch32-type-chip-color.js    # 批次32：类型筛选chips颜色
├── test-batch33-lifecycle-write.js     # 批次33：流转记录写入
├── test-batch34-detail-status-tag.js   # 批次34：详情状态标签
├── test-batch35-reset-button.js        # 批次35：重置按钮
└── test-batch36-dict-sync.js           # 批次36：本地字典强制同步
```

运行方式：`node --test tests/test-batch*.js`（Node 内置 test runner，无需额外安装框架）。

#### 各测试覆盖要点

| 批次 | 测试文件 | 关键断言 |
|---|---|---|
| 32 | `test-batch32` | `dictionary.js` 中 `SEED_TYPE.TODO_TYPE` 三项均有 `color` 且非空；`renderTodoTypeChips` 输出 HTML 含 `style="--chip-color:"` |
| 33 | `test-batch33` | `createTodoLifecycle` 在字典校验失败时不抛错（或降级为 warn）；正常参数下能成功写入并读取回记录 |
| 34 | `test-batch34` | `openTodoDetail` 的状态输出含 `class="tag status-` 而非 `class="detail-status-text"`；statusColor 取自字典 `color` 字段 |
| 35 | `test-batch35` | `getTodoActions` 对**所有** 11 种状态码返回的按钮列表均包含 `{act:'reset'}`；`reset` 的 index < `edit` 的 index；`TODO_ACTION_HANDLERS.reset` 存在且为 async function；字典含 `TODO_RESET` |
| 36 | `test-batch36` | `seedDict` 能补齐缺失 code（`getAllDict` 缺一条后重播即恢复）；`force=true` 时无条件回写 color/order |

> 注：由于 `app.js` 依赖浏览器环境（DOM/BOM），纯函数测试可通过提取关键逻辑到可 require 的模块、或在测试中 mock `window/document` 实现。若某些断言难以在不启动浏览器的情况下覆盖，可标注为**手动验收项**。

### 发版步骤

1. 全部测试通过（或手动验收完毕）
2. `git add -A && git commit -m "[no-version-bump] 批次32-36：类型筛选色+流转修复+详情状态标签+重置按钮+字典同步"`
3. 推送验证
4. `./release.sh <新版本号> "类型筛选字典色、流转记录修复、详情状态彩色标签、卡片重置按钮、本地字典强制同步"`
5. 推送发版提交
6. 更新本计划文档，标记批次 32–38 状态为已完成

---

## 风险与注意（续，适用于批次 32–38）

- **批次32**：只改 `renderTodoTypeChips` 的内联样式注入 + CSS 兜底规则，不动状态筛选 chips（已有颜色）、不动卡片类型标签（已走 `resolveTodoTypeColor`）
- **批次33**：字典校验降级为 non-blocking 后，流转记录可能携带本地字典中不存在的历史 code——这是可接受的（记录本身是事实流水，展示层可容错）
- **批次34**：第三次改详情状态，这次必须产出 `<span class="tag status-...">` 而非任何形式的纯文本。改完后 grep 全仓 `detail-status-text` 确认无残留
- **批次35**：重置功能涉及状态回退（如从"已完成"回到"未处理"），需确认业务上允许此操作（用户明确要求"重新开始"）。流转记录会记一笔 `TODO_RESET`，形成完整审计链
- **批次36**：治本项。`ensureAllDicts` 的"版本门控"依赖 `APP_VERSION` 随发版 bump；若 SW 未刷新导致旧 `dictionary.js` 仍在跑，新 code 不会被 `seedDict` 读到——故必须保证 `release.sh` 同步 bump `sw.js` 的 `CACHE`（强制客户端拉新资源）
- **跨批次依赖**：批次 33（流转写入修复）应在 35（重置按钮也写流转）之前完成，否则重置也会触发"写入失败"警告。建议执行顺序 32→33→34→35→36→37→38
