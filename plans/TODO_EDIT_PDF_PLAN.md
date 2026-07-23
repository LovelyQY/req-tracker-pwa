# 待办编辑全屏 + 可改时间 + 导出PDF 改进 · 执行清单

> 目标：①将待办编辑弹窗改为全屏页；②编辑页开放时间字段（三类型差异化可改，默认取流转环节最后时间）；③导出PDF直接展示任务详情表格（去掉「任务清单」按钮交互，横版打印）。
> 批次编号从 45 顺延（上一最高批次 = 44）。

---

## 现状分析

### 需求 1：待办编辑页全屏

- 当前编辑表单是居中 Modal（`#todo-modal-overlay` > `.modal`）：`max-width:400px; max-height:85vh; border-radius:16px`，与任务/代办详情全屏范式不一致。
- 任务详情（`#task-detail-overlay`）、代办详情（`#todo-detail-overlay`）均已全屏：`padding:0; align-items:stretch; .modal{width:100%;max-width:none;height:100dvh;border-radius:0;box-shadow:none}`。
- 待办编辑表单 HTML 已有 `modal-header.nav-bar` + `modal-body` + `modal-footer` 三段式结构，天然支持全屏布局，只需 CSS 覆写。

### 需求 2：待办编辑页可改时间

**当前数据模型：**

- todo 对象存储字段（`todos.js createTodo`）：typeCode / statusCode / desc / name / remark / projectId / projectVersionId / relatedDevIds / relatedTaskId / feedbackBy / feedbackTime / meetingTime / location / minutes / createdBy / createdAt / updatedBy / updatedAt
- `pickLifecycle()` 函数从 todo 数据中读取并规范化以下时间字段：startTime / startBy / completeTime / completeBy / handoffTime / handoffBy / onlineTime / onlineBy / cancelTime / cancelBy / cancelReason
- 但状态变更处理器（`TODO_ACTION_HANDLERS`）**不写这些字段**到 todo——只写 statusCode + 创建 lifecycle 记录（记录含 operateTime）
- 例外：cancel 写了 cancelTime/cancelBy/cancelReason 到 todo

**是否涉及数据表字段新增？**

- **不涉及**。`pickLifecycle` / `createTodo` / `updateTodo` 已支持 startTime / completeTime / handoffTime / onlineTime / cancelTime 等字段的读写存储（via `Object.assign(base, pickLifecycle(data))`）。它们是 IndexedDB 的 loose schema，写进 todo 对象即自动持久化。
- 只需让状态变更处理器在推进状态时同步写时间到 todo（类似 requirement_tasks 的 TIME_FIELDS 模式），编辑表单再开放这些字段即可。

**三类型可改时间差异化：**

| 类型 | 可改字段 | 来源（流转环节） |
|------|---------|----------------|
| **TASK_ITEM** | 开始处理时间 (startTime) | TODO_START 操作的 operateTime |
| | 完成时间 (completeTime) | TODO_COMPLETE 操作的 operateTime |
| **BUG** | 反馈时间 (feedbackTime) | 已有字段，用户手动填 |
| | 开始处理时间 (startTime) | TODO_START → BUG_DOING |
| | 完成时间 (completeTime) | TODO_COMPLETE → BUG_DONE |
| | 转交时间 (handoffTime) | TODO_HANDOFF → BUG_WAIT_DEV |
| | 上线时间 (onlineTime) | TODO_ONLINE → BUG_ONLINE |
| **MEETING** | 会议时间 (meetingTime) | 已有字段，用户手动填 |
| | 开始时间 (startTime) | TODO_START → MT_IN_PROGRESS (取 operateTime) |
| | 结束时间 (endTime) | 新增概念：TODO_END → MT_ENDED 的 operateTime |
| | 取消时间 (cancelTime) | 已有，TODO_CANCEL 写入 |

**默认值规则**：编辑页打开时，各时间字段默认值为 todo 对象中存储的值；若未发生该流转环节则为空。

### 需求 3：导出PDF改进

- 当前四个报表页 PDF 导出：`window.print()` 打印统计卡片 + 模块分布柱状图。任务清单通过「rm-list-btn」按钮点击打开 `tl-overlay`，在 PDF 中不可交互。
- 用户要求：去掉按钮交互依赖，直接在 PDF 中以表格展示任务详情（字段尽量全、不显示主ID），竖版不够用横版。

---

## 批次清单

### 批次 45：待办编辑页全屏

**目标**：将 `#todo-modal-overlay` 的居中弹窗样式改为全屏样式，对齐任务/代办详情页的全屏范式。

**改动文件**
- `styles.css`：新增 `#todo-modal-overlay` 和 `#todo-modal-overlay .modal` 全屏覆写规则
- `index.html`：无需改动（HTML 结构已满足全屏布局）

**步骤**
1. 在 `styles.css` 中 `#todo-detail-overlay` 规则块后面（约 1163 行后），新增 `#todo-modal-overlay` 全屏覆写：
   - `padding: 0; align-items: stretch; justify-content: flex-start; background: var(--surface);`
   - `.modal` 覆写：`width:100%;max-width:none;max-height:100dvh;height:100dvh;border-radius:0;box-shadow:none;transform:translateY(12px)`
   - `.show .modal`：`transform: translateY(0);`
2. 确保 `.modal-form` 的 flex 容器撑满全屏（当前已有 `display:flex;flex-direction:column;flex:1;min-height:0`，无需改动）。
3. 验证：新增/编辑代办时弹窗撑满全屏，nav-bar 标题正确、返回按钮关闭表单、表单字段完整、提交正常。

**RULES 合规**
- 返回按钮 `#todo-modal-close` 调用 `closeTodoModal()` 保持为 JS 直接关闭（非 URL 跳转，无需 navTo/goBack）。
- tap-highlight / focus 规则由全局 CSS 继承，不额外处理。

**验证**
- 新增三种类型代办：弹窗全屏，nav-bar 标题"新增代办"，类型 chips/字段显隐正常。
- 编辑已存在代办：弹窗全屏，字段回填正确，保存后列表刷新。
- 返回按钮、取消按钮均能正常关闭弹窗。

**状态**：✅ 已完成（2026-07-23，[no-version-bump] 推送。纯 CSS 改动，styles.css +19 行）

---

### 批次 46：待办编辑页可改时间

**分两阶段：数据层 → 表单层**

#### 阶段 46a：数据层——状态变更时写时间到 todo

**目标**：让 start/complete/handoff/online/end 操作在推进状态的同时把时间写回 todo 对象。

**改动文件**
- `app.js`（`TODO_ACTION_HANDLERS`）

**步骤**
1. **start**（约 2607 行）：`updateTodo` 的 patch 追加 `startTime: Date.now(), startBy: account`
2. **complete**（约 2621 行）：`updateTodo` 的 patch 追加 `completeTime: Date.now(), completeBy: account`
3. **handoff**（约 2635 行）：`updateTodo` 的 patch 追加 `handoffTime: Date.now(), handoffBy: account`
4. **online**（约 2650 行）：`updateTodo` 的 patch 追加 `onlineTime: Date.now(), onlineBy: account`
5. **end**（约 2664 行）：`updateTodo` 的 patch 追加 `completeTime: Date.now(), completeBy: account`（会议结束用 completeTime，与生命周期记录操作码 TODO_END 区分）
6. reset 不额外处理（重置已恢复初始状态码，时间字段保留旧值或手动清空均可，form 编辑弥补）。

**注意**：
- `pickLifecycle` 的 `numOrNull` 和 `updateTodo` 的 `Object.assign(old, base)` 已正确序列化/反序列化这些字段，无需改动 `todos.js`。
- BUG 的 feedbackTime 已存在于 todo 对象 + 表单，本次不动。
- MEETING 的 meetingTime 已存在于 todo 对象 + 表单，本次不动。

**验证**
- 对 TASK_ITEM 执行「开始处理」→ todo 对象 startTime 不为空。
- 对 TASK_ITEM 执行「完成」→ todo 对象 completeTime 不为空。
- 对 BUG 执行「开始处理」→ startTime 写入；「完成」→ completeTime；「转交」→ handoffTime；「上线」→ onlineTime。
- 对 MEETING 执行「开始」→ startTime 写入；「结束」→ completeTime 写入；「取消」�� cancelTime 写入（已有）。

**状态**：✅ 已完成（2026-07-23，[no-version-bump] 推送。app.js +5/-5）

#### 阶段 46b：表单层——新增可编辑时间字段

**目标**：在待办编辑表单中增加按类型差异化显示的时间字段，默认值取自 todo 对象。

**改动文件**
- `index.html`：在 `#todo-form` 中按类型新增时间字段组
- `app.js`：`showHideTodoFormFields()` 增加时间字段显隐；`openTodoEdit()` 回填时间；`onTodoFormSubmit()` 收集时间字段
- `styles.css`：新增时间字段组样式（如 `.tf-time-group`）

**步骤**
1. **HTML**（`#todo-form` 的 `.modal-body` 内，在「备注」之上插入）：
   ```html
   <!-- 时间字段组（按类型显隐，批次46b） -->
   <div class="form-group todo-field tf-time-taskitem" hidden>
     <label class="tf-time-label">时间信息</label>
     <div class="tf-time-group">
       <div class="tf-time-row"><span class="tf-time-name">创建时间</span><span id="todo-f-created-at" class="tf-time-val">—</span></div>
       <div class="tf-time-row"><span class="tf-time-name">开始处理</span><input id="todo-f-start-time" type="datetime-local" /></div>
       <div class="tf-time-row"><span class="tf-time-name">完成</span><input id="todo-f-complete-time" type="datetime-local" /></div>
     </div>
   </div>
   <div class="form-group todo-field tf-time-bug" hidden>
     <label class="tf-time-label">时间信息</label>
     <div class="tf-time-group">
       <div class="tf-time-row"><span class="tf-time-name">创建时间</span><span id="todo-f-created-at-bug" class="tf-time-val">—</span></div>
       <div class="tf-time-row"><span class="tf-time-name">开始处理</span><input id="todo-f-start-time-bug" type="datetime-local" /></div>
       <div class="tf-time-row"><span class="tf-time-name">完成</span><input id="todo-f-complete-time-bug" type="datetime-local" /></div>
       <div class="tf-time-row"><span class="tf-time-name">转交</span><input id="todo-f-handoff-time" type="datetime-local" /></div>
       <div class="tf-time-row"><span class="tf-time-name">上线</span><input id="todo-f-online-time" type="datetime-local" /></div>
     </div>
   </div>
   <div class="form-group todo-field tf-time-meeting" hidden>
     <label class="tf-time-label">时间信息</label>
     <div class="tf-time-group">
       <div class="tf-time-row"><span class="tf-time-name">创建时间</span><span id="todo-f-created-at-meeting" class="tf-time-val">—</span></div>
       <div class="tf-time-row"><span class="tf-time-name">开始</span><input id="todo-f-start-time-meeting" type="datetime-local" /></div>
       <div class="tf-time-row"><span class="tf-time-name">结束</span><input id="todo-f-end-time" type="datetime-local" /></div>
       <div class="tf-time-row"><span class="tf-time-name">取消</span><input id="todo-f-cancel-time" type="datetime-local" /></div>
     </div>
   </div>
   ```
   > 注：BUG 的 feedbackTime / MEETING 的 meetingTime 已在各自 `.tf-bug` / `.tf-meeting` 区块中，不重复。
   > 创建时间为只读展示（`<span>`），不可编辑。

2. **`app.js` — `showHideTodoFormFields()`** 扩展：
   ```javascript
   // 现有逻辑保留
   document.querySelectorAll('#todo-form .tf-meeting').forEach(/*...*/);
   document.querySelectorAll('#todo-form .tf-bug').forEach(/*...*/);
   document.querySelectorAll('#todo-form .tf-desc').forEach(/*...*/);
   // 新增：时间字段组显隐
   document.querySelectorAll('#todo-form .tf-time-taskitem').forEach(function(el){el.hidden = typeCode !== 'TASK_ITEM';});
   document.querySelectorAll('#todo-form .tf-time-bug').forEach(function(el){el.hidden = typeCode !== 'BUG';});
   document.querySelectorAll('#todo-form .tf-time-meeting').forEach(function(el){el.hidden = typeCode !== 'MEETING';});
   ```

3. **`app.js` — `openTodoEdit()`** 回填时间（约 1706–1738 行）：
   - 新增辅助函数 `toDatetimeLocal(ts)` → `ts ? new Date(ts).toISOString().slice(0,16) : ''`
   - 回填 created_at 为只读展示文本（`fmtDateTime`）
   - TASK_ITEM：回填 `#todo-f-start-time`、`#todo-f-complete-time`
   - BUG：回填 bug 专属时间字段
   - MEETING：回填 meeting 专属时间字段

4. **`app.js` — `onTodoFormSubmit()`** 收集时间（约 1740 行附近）：
   ```javascript
   // 根据 typeCode 收集时间字段
   if (typeCode === 'TASK_ITEM') {
     patch.startTime = inputTimestamp('todo-f-start-time');
     patch.completeTime = inputTimestamp('todo-f-complete-time');
   } else if (typeCode === 'BUG') {
     patch.startTime = inputTimestamp('todo-f-start-time-bug');
     patch.completeTime = inputTimestamp('todo-f-complete-time-bug');
     patch.handoffTime = inputTimestamp('todo-f-handoff-time');
     patch.onlineTime = inputTimestamp('todo-f-online-time');
   } else if (typeCode === 'MEETING') {
     patch.startTime = inputTimestamp('todo-f-start-time-meeting');
     patch.completeTime = inputTimestamp('todo-f-end-time'); // MEETING 结束时间映射到 completeTime
     patch.cancelTime = inputTimestamp('todo-f-cancel-time');
   }
   ```
   - `inputTimestamp(id)` 辅助函数：读取 datetime-local input，转 Number(ms) 或 null。

5. **`styles.css`**：新增 `.tf-time-group` / `.tf-time-row` / `.tf-time-name` / `.tf-time-val` 样式（紧凑排列，每行 label:value，input 占位）。

**RULES 合规**
- 所有新 ID 为业务语义命名，非 32 位 hex。
- 时间字段默认值来自流转环节最后时间，修改后立即写回 todo 对象持久化。

**验证**
- TASK_ITEM：编辑页显示「创建时间 / 开始处理 / 完成」三段，均为 datetime-local input（创建时间除外，只读展示）。
- BUG：编辑页显示「反馈时间(已有) + 创建时间 / 开始处理 / 完成 / 转交 / 上线」。
- MEETING：编辑页显示「会议时间(已有) + 创建时间 / 开始 / 结束 / 取消」。
- 每项默认值 = 对应流转环节最后发生的时间（无则为空）。
- 修改时间后保存，重新打开编辑页看到修改后的值。
- 不影响现有状态推进 → 写 lifecycle → 刷新卡片的流程。

**状态**：✅ 已完成（2026-07-23，[no-version-bump] 推送。index.html + app.js + styles.css，+86 行）

---

### 批次 47：导出PDF改进（报表页直接展示任务详情表格）

**目标**：四个报表页的 PDF 导出去掉「任务清单」按钮交互依赖，直接在打印输出中以表格展示任务详情（字段尽量全、不显示主ID、竖版不够用横版 `@page{size:landscape}`）。

**改动文件**
- `report-task.html` + `report-task.js`
- `report-todo.html` + `report-todo.js`
- `report-bug.html` + `report-bug.js`
- `report-meeting.html` + `report-meeting.js`

**步骤**

1. **HTML**（四个报表页）：在 `.report-modules` 之后、`tl-overlay` 之前，新增：
   ```html
   <table class="rf-detail-table" id="rf-detail-table">
     <thead><tr></tr></thead>
     <tbody></tbody>
   </table>
   ```
   - `display:none` 默认（屏幕不显示），`@media print` 中 `display:table`。

2. **CSS @media print**（四个报表页）：
   ```css
   @page { size: A4 landscape; margin: 12mm; }
   .rf-detail-table { display: table; width: 100%; border-collapse: collapse; font-size: 8pt; }
   .rf-detail-table th, .rf-detail-table td { border: 0.5px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
   .rf-detail-table thead { background: #f0f2f5; }
   .rm-list-btn { display: none !important; }   /* 去掉任务清单按钮 */
   .tl-overlay { display: none !important; }    /* 去掉 overlay */
   ```
   - 已在 `styles.css` 中的全局 `@media print` 规则会隐藏 `.nav-bar` 等，无需重复。
   - 用 `@page { size: landscape; }` 确保横版。

3. **JS**（四个 report-xxx.js）：新增 `buildDetailTable()` 函数
   - 从当前筛选范围内的数据（已在各报表的筛选函数中缓存）构建 `<tr>` 行
   - **任务统计**（report-task.js）：表头 = 名称/类型/优先级/状态/项目/版本/描述/开发提交时间/测试开始时间/测试结束时间/上线时间/工时
   - **任务事项**（report-todo.js）：表头 = 描述/类型/状态/项目/版本/关联开发/备注/创建时间/开始处理时间/完成时间
   - **缺陷追踪**（report-bug.js）：表头 = 描述/类型/状态/项目/版本/关联任务/反馈人/反馈时间/备注/开始处理时间/完成时间/转交时间/上线时间
   - **会议**（report-meeting.js）：表头 = 名称/类型/状态/项目/版本/会议时间/会议地点/会议纪要/备注/开始时间/结束时间/取消时间/取消原因
   - 所有表格**不显示主ID**（id/relatedTaskId 等 hex ID）；
   - 时间字段用 `fmtDateTime()` 格式化；
   - 字典 code 转中文名（statusName/typeName）。

4. 在 `exportPDF()` 中（四个 .js 文件），`window.print()` 前调用 `buildDetailTable()`：
   ```javascript
   function exportPDF() {
     buildDetailTable();
     renderTimeControls(); // 或 updateCaption()
     setTimeout(function () { window.print(); }, 60);
   }
   ```

**RULES 合规**
- 表格不渲染 32 位 hex ID，仅展示业务字段（名称/状态/时间/项目等）。
- @media print 中隐藏 nav-bar + tl-overlay + rm-list-btn。

**验证**
- 各报表页导出 PDF：统计卡 + 模块分布图 + **任务详情表格** 均有。
- 表格在横版 A4 中完整展示，列宽合理无溢出。
- 无主 ID 列，时间/状态/类型均格式化显示。

**状态**：✅ 已完成（2026-07-23，[no-version-bump] 推送。8 文件变更，+178 行）

---

### 批次 48：报表卡片改「按项目分布」（todo / bug / meeting 三报表）

**目标**：将任务事项、缺陷追踪、会议三个报表的模块区从「按状态分组 → 每个状态模块内按项目分布条」改为「按项目分组 → 每个项目卡片内展示状态分布」。**任务统计报表（report-task.html）不受影响**，维持原布局。

**当前结构 vs 新结构：**

| | 当前（状态-项目） | 新（项目-状态） |
|--|-----------------|----------------|
| 模块分组依据 | 按状态（1个模块 = 1个状态） | 按项目（1个卡片 = 1个项目） |
| 模块内容 | 「未处理」→ 项目A bar, 项目B bar... | 「项目A」→ 未处理:X / 处理中:Y / 已完成:Z |
| 任务清单按钮 | 每个状态模块 1 个，列出该状态下所有记录 | 每个项目卡片 1 个，列出该项目**全部**记录 |
| 适用报表 | report-todo / report-bug / report-meeting | 同左 |

**卡片样式设计：**

```
┌──────────────────────────────────────────┐
│ 🔵 项目名称                        [任务清单 →] │  ← rm-title + rm-list-btn
│ ┌─────────┬─────────┬─────────┐          │
│ │ 未处理 3 │ 处理中 1 │ 已完成 5 │          │  ← 状态分布 row
│ │ ████░░░░ │ █░░░░░░░ │ ████████ │          │  ← 迷你进度条（按字典色）
│ └─────────┴─────────┴─────────┘          │
└──────────────────────────────────────────┘
```

每个状态格显示：状态名 + 数量 + 迷你进度条（进度 = 该状态数 / 该项目总数）

**改动文件**
- `report-todo.html` + `report-todo.js`
- `report-bug.html` + `report-bug.js`
- `report-meeting.html` + `report-meeting.js`

**步骤**

**3-1. HTML**（三个报表页的 `.report-modules` 容器）

原结构（以 todo 为例）：
```html
<div class="report-modules">
  <div class="report-module"><div class="rm-title">未处理</div>...<button data-scope="todo">任务清单</button></div>
  <div class="report-module"><div class="rm-title">处理中</div>...<button data-scope="doing">任务清单</button></div>
  <div class="report-module"><div class="rm-title">已完成</div>...<button data-scope="done">任务清单</button></div>
</div>
```

新结构：
```html
<div class="report-modules" id="rm-project-modules">
  <!-- 由 JS 动态渲染，每项目一张卡片 -->
</div>
```

- todo/bug/meeting 三个页面的 `#rm-project-modules` 均由 JS 动态填充，HTML 只放一个空容器。
- 保留顶部 `.report-grid`（统计卡）不变。

**3-2. CSS**（styles.css 或各页内联 `<style>`）

新增样式类：
```css
.rm-project-card { background: #fff; border: 1px solid var(--border); border-radius: 12px; margin-bottom: 12px; overflow: hidden; }
.rm-project-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #f0f2f5; }
.rm-project-name { font-size: 15px; font-weight: 600; color: #1e293b; }
.rm-status-row { display: flex; gap: 0; padding: 10px 16px; }
.rm-status-cell { flex: 1; text-align: center; padding: 4px 0; }
.rm-status-num { font-size: 20px; font-weight: 700; }  /* 颜色由 JS 动态设置 */
.rm-status-label { font-size: 11px; color: #64748b; margin-top: 2px; }
.rm-status-bar { height: 6px; border-radius: 3px; background: #f0f2f5; margin: 6px 4px 0; overflow: hidden; }
.rm-status-bar-inner { height: 100%; border-radius: 3px; transition: width 0.3s; }
```

**3-3. JS**（三个 report-xxx.js）

核心改造 —— `renderReport()` 函数中替换「按状态分组」为「按项目分组」：

**report-todo.js 改造**：

```javascript
function renderReport() {
  var list = C.getData().allTodos.filter(inScope);
  var total = list.length;
  // ... 统计卡逻辑不变 ...

  // ★ 新：按项目分组，每个项目一张卡片
  var byProject = {};
  list.forEach(function (t) {
    var pid = t.projectId || '__noproj__';
    (byProject[pid] = byProject[pid] || []).push(t);
  });

  var projIds = Object.keys(byProject);
  var container = document.getElementById('rm-project-modules');
  if (!container) return;

  // 获取所有项目名
  var projLabel = function (pid) { return C.projectNameById(pid); };

  var html = '';
  var STATUSES = [
    { code: 'TD_TODO', name: '未处理', colorKey: 'TD_TODO' },
    { code: 'TD_DOING', name: '处理中', colorKey: 'TD_DOING' },
    { code: 'TD_DONE', name: '已完成', colorKey: 'TD_DONE' }
  ];
  // 状态色
  var sc = {};
  C.getData().TODO_STATUS_LIST.forEach(function (d) { if (d && d.code) sc[d.code] = d.color || '#8c8c8c'; });

  projIds.sort(function (a, b) {
    return (byProject[b] && byProject[b].length || 0) - (byProject[a] && byProject[a].length || 0);
  });

  projIds.forEach(function (pid) {
    var items = byProject[pid];
    var pTotal = items.length;
    var pName = pid === '__noproj__' ? '(未指定项目)' : escapeHtml(projLabel(pid) || pid);
    var statusCells = '';
    STATUSES.forEach(function (s) {
      var cnt = items.filter(function (t) { return t.statusCode === s.code; }).length;
      var pct = pTotal > 0 ? Math.round(cnt / pTotal * 100) : 0;
      statusCells += '<div class="rm-status-cell">'
        + '<div class="rm-status-num" style="color:' + (sc[s.colorKey] || '#8c8c8c') + '">' + cnt + '</div>'
        + '<div class="rm-status-label">' + s.name + '</div>'
        + '<div class="rm-status-bar"><div class="rm-status-bar-inner" style="width:' + pct + '%;background:' + (sc[s.colorKey] || '#8c8c8c') + '"></div></div>'
        + '</div>';
    });
    html += '<div class="report-module rm-project-card">'
      + '<div class="rm-project-header">'
      + '<div class="rm-project-name">' + pName + '</div>'
      + '<button class="rm-list-btn" data-project="' + escapeHtml(pid) + '" type="button">'
      + '<span>任务清单 (' + pTotal + ')</span>'
      + '<svg class="rm-list-arrow" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>'
      + '</button>'
      + '</div>'
      + '<div class="rm-status-row">' + statusCells + '</div>'
      + '</div>';
  });

  container.innerHTML = html || '<div class="empty"><div class="empty-icon">📭</div>该范围暂无数据</div>';
  updateCaption();
}
```

**report-bug.js 改造**（5 状态 + 保留关联任务统计区）：

同上模式，`STATUSES` 数组改为 BUG 的 5 个状态（BUG_TODO/BUG_DOING/BUG_DONE/BUG_WAIT_DEV/BUG_ONLINE）。关联任务统计区域（`.report-module` id=`bug-related`）独立保留在 `.report-modules` 之后。

**report-meeting.js 改造**（3 状态）：

同上模式，`STATUSES` 数组改为 MEETING 的 3 个状态（MT_NOT_STARTED/MT_ENDED/MT_CANCELLED）。

**3-4. JS — `openList()` 逻辑调整**

原逻辑按 status scope 过滤（`data-scope="todo/doing/done"`），新逻辑按 project 过滤（`data-project="projectId"`）：

```javascript
function openList(projectId) {
  var list = C.getData().allTodos.filter(inScope);
  var sub = list.filter(function (t) {
    return (t.projectId || '__noproj__') === projectId;
  });
  // ... 排序 + 渲染 overlay 不变 ...
  var pName = projectId === '__noproj__' ? '(未指定项目)' : C.projectNameById(projectId);
  setText('tl-title', pName);
  setText('tl-meta', '共 ' + sub.length + ' 项');
  // ... buildTodoCardHtml 渲染不变 ...
}
```

**3-5. JS — `wireControls()` 调整**

```javascript
// 原：document.querySelectorAll('.rm-list-btn').forEach(btn => { btn.addEventListener('click', () => openList(btn.dataset.scope)); });
// 新：
document.querySelectorAll('.rm-list-btn').forEach(function (btn) {
  btn.addEventListener('click', function () { openList(btn.dataset.project); });
});
```

**report-bug 特殊处理**：关联任务统计（bug-bars-related）保留，其 HTML 中的 `rm-list-btn` 如有独立逻辑保持不变。

**RULES 合规**
- `data-project` 值为 projectId（可能为 32 位 hex），但仅作为 `dataset` 属性传递（不渲染为可见文本），合规。
- 项目名从 `projectNameById()` 取中文名展示，不暴露 hex ID。

**验证**
- 任务事项报表：3 个项目时显示 3 张卡片，每张卡片内 3 格状态分布，数字+色条正确。
- 缺陷追踪报表：N 个项目，每张卡片 5 格状态分布（含 BUG 专属色），关联任务统计区仍正常展示。
- 会议报表：N 个项目，每张卡片 3 格状态分布。
- 任务清单按钮：点击某项目卡片按钮 → tl-overlay 列出该项目全部记录（跨状态），卡片由 buildTodoCardHtml 渲染、无操作按钮。
- 空项目 / 未指定项目：各卡片正常处理。
- 时间筛选切换后项目卡片即时刷新。
- 导出 PDF：项目卡片和统计卡一起打印（批次 47 在此基础上叠加）。

**依赖**：无（独立于批次 45-47，可在任何阶段执行）

**状态**：✅ 已完成（2026-07-23，[no-version-bump] 推送。7 文件变更，+189/-203）

---

## 风险与注意事项

1. **批次 46a 时间回写时机**：在 `TODO_ACTION_HANDLERS` 的 `updateTodo` 中追加 time 字段，与状态码一起写入同一个 updateTodo 调用，保证原子性（IndexedDB 事务内）。不要分两次 updateTodo。
2. **批次 46b 时间字段编码**：`datetime-local` input 的 value 需要 `YYYY-MM-DDTHH:mm` 格式，`toISOString().slice(0,16)` 适配；保存时 `new Date(value).getTime()` 转时间戳。需处理空值（null / ''）。
3. **批次 47 横版打印**：`@page { size: landscape; }` 在 Chrome/Edge 有效，但不同浏览器行为略有差异。竖版够用的场景保留 `size: A4 portrait` 的默认值即可（通过 JS 判断列数动态选择）。
4. **批次 47 与补充 A 的关系**：补充 A 的「任务清单」按钮（rm-list-btn）在屏幕交互中保留不变——仅打印时隐藏，改为表格直接展示。屏幕交互体验不受影响。
5. **BUG 的 feedbackTime / MEETING 的 meetingTime**：已在现有表单中，批次 46 不动这两个字段，只确保它们在各自的时间信息区域中可见可选（通过 CSS 可见性而非重复 input）。
6. **回退兼容**：旧 todo 记录没有 startTime 等字段，`pickLifecycle` 的 `numOrNull` 会返回 null，表单显示为空，不影响功能。

---

## 建议执行顺序

45（编辑全屏）→ 46a（数据层写时间）→ 46b（表单时间字段）→ 47（PDF表格）→ 48（报表卡片按项目分布）→ **49（全量回归测试）**

45–48 代码已全部完成并推送。49 为一次性手工验证，需浏览器环境 + IndexedDB 数据。按表中 #1–45 编号顺序执行即可。

---


---

### 批次 49：全量回归测试

**目标**：对批次 45–48 的全部改动执行一次性回归验证，共 45 项。

**前置**：Chrome/Edge 桌面端，IndexedDB 中有各类型代办数据。打开 DevTools → Application → IndexedDB → `req-tracker` → `todos` 便于验证数据层写入。

#### 45 · 编辑页全屏（#1–8）

| # | 操作 | 预期 |
|---|------|------|
| 1 | 代办 TAB → 点击 + | 弹窗全屏 100vw×100dvh 无圆角，标题"新增代办" |
| 2 | 任意卡片「编辑」 | 同 #1，标题"编辑代办"，字段回填正确 |
| 3 | 新增时切换类型 chips | TASK_ITEM/BUG/MEETING 字段组正确显隐（含 tf-time-*） |
| 4 | 编辑页 ← 返回按钮 | 弹窗关闭，body 滚动恢复 |
| 5 | 编辑页「取消」按钮 | 同 #4 |
| 6 | 编辑 → 改字段 → 保存 | toast"已保存"，列表刷新 |
| 7 | 表单滚动到底 | `modal-footer` sticky 可见 |
| 8 | 打开/关闭动画 | slide-up (translateY 12→0) |

#### 46a · 状态变更写时间（#9–15）

| # | 操作 | 预期（DevTools IndexedDB 中确认） |
|---|------|------|
| 9 | TASK_ITEM 开始处理 | `startTime` + `startBy` 不为 null |
| 10 | TASK_ITEM 完成 | `completeTime` + `completeBy` 写入，`startTime` 不变 |
| 11 | BUG 完整流转（开始→完成→上线） | `startTime` / `completeTime` / `onlineTime` 分别写入 |
| 12 | BUG 转交 | `handoffTime` + `handoffBy` 写入 |
| 13 | MEETING 开始→结束 | `startTime` 写入；结束写 `completeTime` |
| 14 | MEETING 取消（填原因） | `cancelTime` + `cancelBy` + `cancelReason` 写入 |
| 15 | 对同一条目重复「开始处理」 | 第二次 `startTime` 覆盖第一次 |

#### 46b · 表单时间字段（#16–25）

| # | 操作 | 预期 |
|---|------|------|
| 16 | 编辑 TASK_ITEM | 「时间信息」组：创建时间(只读) + 开始处理 + 完成 |
| 17 | 编辑 BUG | 5 个可编辑字段（开始处理/完成/转交/上线 + tf-bug 中的反馈时间） |
| 18 | 编辑 MEETING | 4 个可编辑字段（开始/结束/取消 + tf-meeting 中的会议时间） |
| 19 | 切换类型 chips | 时间字段组随类型正确显隐 |
| 20 | 先「开始处理」→再编辑 | 「开始处理」默认值 = 刚才流转时间 (YYYY-MM-DDTHH:mm) |
| 21 | 手动修改时间→保存→再编辑 | 显示修改后的值，未被流转覆盖 |
| 22 | 清空时间→保存→再编辑 | 显示为空 |
| 23 | 创建时间为只读文本 | 无 input 框，纯文本 yyyy-MM-dd HH:mm |
| 24 | 新增代办 | 时间字段全部为空 |
| 25 | 旧记录编辑 | 无时间字段的旧记录不报错，显示为空 |

#### 47 · 导出PDF表格（#26–35）

| # | 操作 | 预期（打印预览模式检查） |
|---|------|------|
| 26 | report-task → 导出PDF | 横版 A4，12 列表格（名称/类型/优先级/状态/项目/版本/描述/开发提交/测试开始/测试结束/上线/工时） |
| 27 | report-todo → 导出PDF | 横版 A4，10 列（含备注/创建时间/开始处理时间/完成时间） |
| 28 | report-bug → 导出PDF | 横版 A4，13 列（含反馈人/反馈时间/备注/开始处理/完成/转交/上线 时间） |
| 29 | report-meeting → 导出PDF | 横版 A4，13 列（含会议地点/会议纪要/备注/开始/结束/取消 时间+原因） |
| 30 | 检查任意 PDF 表格 | 无 32 位 hex ID，项目/版本转为中文名 |
| 31 | 屏幕正常浏览报表 | `.rf-detail-table` 不可见 |
| 32 | PDF 预览中检查 | `rm-list-btn`、`tl-overlay`、`nav-bar` 均不可见 |
| 33 | 筛选无数据时段→导出 | 仅统计卡+图，无表格 |
| 34 | 检查时间列格式 | yyyy-MM-dd HH:mm，非时间戳 |
| 35 | 任务统计「工时」列 | 如 `12.5H` |

#### 48 · 报表卡片按项目分布（#36–45）

| # | 操作 | 预期 |
|---|------|------|
| 36 | report-todo，≥2 项目 | 每项目一卡片，3 格状态（未处理/处理中/已完成），含数字+色条，按条目数降序 |
| 37 | report-bug | 每项目一卡片，5 格状态，颜色取自字典 |
| 38 | report-meeting | 每项目一卡片，3 格状态 |
| 39 | 点击项目卡片「任务清单(N)」 | tl-overlay 列出该项目全部记录（跨状态），标题=项目名 |
| 40 | 色条百分比 | 宽度 = 该状态数/该项目总数×100% |
| 41 | 为空的 projectId 代办 | 显示「(未指定项目)」卡片 |
| 42 | 筛选无数据时段 | "📭 该范围暂无数据" |
| 43 | 修改年/季/月 | 项目卡片即时刷新 |
| 44 | report-bug「关联任务统计」 | 仍正常展示（不受影响） |
| 45 | report-task 报表 | 布局不变（不受批次 48 影响） |

**依赖**：批次 45–48 全部代码已提交

**状态**：✅ 自动化通过（2026-07-23），手工部分待浏览器执行

**自动化结果**（7 项全部通过）：
1. ✅ 6 个 JS 文件语法检查（app.js / report-task/todo/bug/meeting/common.js）
2. ✅ 4 个 HTML 无重复 ID
3. ✅ index.html todo form 字段 26 个 ID 在 HTML/JS 两端完全一致
4. ✅ 所有新增 CSS 类（rm-project-*/rf-detail-table/tf-time-*）正确定义且有引用
5. ✅ app.js 中 5 处时间写入 + 18 处时间采集均正确
6. ✅ 3 个报表 JS 各含 2 处事件委托 + buildDetailTable（定义+调用）
7. ✅ 旧引用清理干净：`renderProjectBars`(0处) / `data-scope`(0处) / 旧 bars ID(0处)

**手工部分**（#1–45）需 Chrome + IndexedDB 数据环境执行。

---

> 📋 共 45 项，按编号顺序执行即可一次性覆盖 45–48 全部功能。

> 📅 制定日期：2026-07-23 | 🎯 批次区间：v1.3.40+（45–49）
