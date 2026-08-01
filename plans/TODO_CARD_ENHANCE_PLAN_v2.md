# 代办卡片增强与修正计划 v3（TODO_CARD_ENHANCE_PLAN）

> 基于 v1.3.32 落地后的用户反馈（含 4 张截图 + kill-sw 清缓存确认 + 本次新增会议取消需求）。  
> 当前版本 `v1.3.32`，本计划从**批次 22** 续接。  
> 协作约定同 `RULES.md`：每批次独立提交；推送到 `main` 时必须升版本号并由 `pre-push` hook 校验。

---

## 一、用户反馈（已确认 + 本次新增）

| # | 问题 | 截图 / 证据 | 当前状态 |
|---|------|------------|---------|
| 1 | 缺陷追踪「已上线」统计卡仍是紫色 | 截图1 | 字典 seed 已改绿 `#389e0d`，但 DB 旧值未回填，需运行时覆盖 |
| 2 | 代办卡片无操作按钮（任务卡有开发提交/暂停/重置/编辑/删除） | 截图2/3 | `buildTodoCard()` 未渲染 `.task-actions` |
| 3 | 代办卡片缺少项目/版本/创建时间 | 截图2/3 | meta 只按子类型渲染特有字段，缺通用字段 |
| 4 | 点击代办卡片进入编辑页而非详情页 | kill-sw + 清空缓存后确认 | `initTodoView()` 已绑定 `openTodoDetail`，但运行时可能被覆盖或 CDN 旧版导致 |
| 5 | 代办编辑页状态是无色 `<select>` | 编辑表单 L328 | 需改为带色 chips |
| **6（新增）** | **会议类型缺少「取消」操作按钮；取消时需要记录原因字段** | 字典截图 | `TODO_OPERATION` 无 `TODO_CANCEL`；`todos` 表无 `cancelReason` |

---

## 二、批次规划

### 批次 22 — BUG_ONLINE 运行时颜色覆盖 + 首页统计卡同步覆盖

**问题**：批次 20 改了 `dictionary.js` seed 为绿 `#389e0d`，但 IndexedDB 已存旧紫色 `#722ed1`。字典播种幂等不回填已有记录。

**涉及文件**：`report.js`、`app.js`

#### 改动清单

- [x] `report.js bugStatusColor()`：加运行时硬编码覆盖
  ```js
  function bugStatusColor(code) {
    if (code === 'BUG_ONLINE') return '#389e0d';
    return BUG_STATUS_CODE_TO_COLOR[code] || '#8c8c8c';
  }
  ```
- [x] `app.js renderTodoStats()`：渲染状态卡时对 `BUG_ONLINE` 强制覆盖
  ```js
  // 在 items.map 内，取 color 时：
  const c = (d.code === 'BUG_ONLINE') ? '#389e0d' : (d.color || '#8c8c8c');
  ```

#### 影响范围

- 报表·缺陷追踪统计卡「已上线」→ 绿
- 报表·缺陷追踪状态条「已上线」→ 绿
- 首页代办·缺陷追踪统计卡「已上线」→ 绿

#### 验证

- [x] 各处「已上线」均为绿色 `#389e0d`
- [x] 其他状态色不变

**发版**：按需

> **实现说明（重要）**：批次 22 原计划采用「运行时硬编码绿色」手段（report.js / app.js 两处 `if (code==='BUG_ONLINE') return '#389e0d'`）。该手段已在**配置化提交 `5a00de7`** 中被撤销并升级——改为由字典 seed（`BUG_ONLINE.color = #389e0d`）+ `seedDict` 颜色回填统一驱动，效果等价（已上线显示绿、其他状态色不变）且**可配置**（改字典种子色即全站同步）。故本批次「目标已达成、手段已演进」，checkbox 标记完成。

---

### 批次 23 — 代办卡片操作按钮（按状态+类型动态显示）+ 修复点击行为 + 会议取消

**合并问题**：

1. 操作按钮要像任务卡一样根据**当前状态 + 类型**动态显示多种（开始处理 / 完成 / 转交 / 上线 / 取消 / 编辑 / 删除）。
2. 点击卡片必须打开**详情页**（非编辑页），用户已 kill-sw + 清缓存确认当前行为错误。
3. **会议类型**需补充「取消」按钮；取消时必须填写`取消原因`，并回写到 `todos.cancelReason` 字段。

**涉及文件**：

- `dictionary.js`（新增 `TODO_CANCEL` 操作枚举）
- `todos.js`（新增 `cancelTime / cancelBy / cancelReason` 字段）
- `app.js`（`buildTodoCard`、`renderTodoList`、新增 `TODO_ACTION_HANDLERS`、`getTodoActions`、取消原因弹窗）
- `DB_SCHEMA.md`（补充字段说明）
- `styles.css`（操作按钮样式，复用任务卡样式）

#### 23.0 前置：数据模型 + 字典

| 文件 | 变更 | 说明 |
|------|------|------|
| `dictionary.js` | ① `TODO_OPERATION` 追加 `TODO_CANCEL`(取消,order 7) + `TODO_END`(结束,order 8)；② `MEETING_STATUS` 新增 `MT_IN_PROGRESS`(会议中,order 2)；③ 仅**会议**使用「未开始」状态 +「开始」按钮，任务事项/缺陷追踪保持「未处理」+「开始处理」（`TODO_START` 名保持「开始处理」，`MT_NOT_STARTED` 名「未开始」）；④ 删除操作仅初始态（未处理/未开始）提供 | 幂等播种自动补入新增枚举 |
| `todos.js` | `pickLifecycle(data)` 追加 `cancelTime / cancelBy / cancelReason`；`createTodo` / `updateTodo` 透传；`LIMITS` 新增 `CANCEL_REASON_MAX: 200` | 与 `startTime/startBy` 等生命周期字段同风格 |
| `DB_SCHEMA.md` | 在 todos 表字段说明中补充 `cancelTime / cancelBy / cancelReason` | 保持文档同步 |

#### 23.1 操作按钮设计

依据用户确认的状态操作流程（三种类型各自的流转），字典侧已同步调整：

- 仅**会议**使用「未开始」状态 +「开始」按钮；任务事项 / 缺陷追踪保持「未处理」+「开始处理」
- 会议新增「会议中」(`MT_IN_PROGRESS`) 状态
- 操作枚举新增「取消」(`TODO_CANCEL`)、「结束」(`TODO_END`)
- **删除**操作仅初始态（未处理 / 未开始）提供；其余状态不显示删除

**状态操作流程总览**

| 类型 | 流转（操作 → 下一状态） |
|------|------------------------|
| 任务事项 | 未处理 →[开始处理]→ 处理中 →[完成]→ 已完成 |
| 任务事项 | 未处理 →[删除]→ （删除） |
| 缺陷追踪 | 未处理 →[开始处理]→ 处理中 →[完成]→ 已完成 |
| 缺陷追踪 | 未处理 →[开始处理]→ 处理中 →[转交]→ 待开发 →[上线]→ 已上线 |
| 缺陷追踪 | 未处理 →[删除]→ （删除） |
| 会议 | 未开始 →[开始]→ 会议中 →[结束]→ 已结束 |
| 会议 | 未开始 →[取消]→ 已取消 |
| 会议 | 未开始 →[删除]→ （删除） |

**状态 → 可用操作映射（删除仅初始态）**

| 当前状态 | 可用操作 | 说明 |
|---------|---------|------|
| `TD_TODO`（未处理） | 开始处理、编辑、删除 | 「开始处理」→ `TD_DOING` |
| `TD_DOING`（处理中） | 完成、编辑 | 「完成」→ `TD_DONE` |
| `TD_DONE`（已完成） | 编辑 | 终态（无上线、无删除） |
| `BUG_TODO`（未处理） | 开始处理、编辑、删除 | 「开始处理」→ `BUG_DOING` |
| `BUG_DOING（处理中）` | 完成、转交、编辑 | 「完成」→ `BUG_DONE`；「转交」→ `BUG_WAIT_DEV` |
| `BUG_DONE（已完成）` | 编辑 | 终态（**无上线**、无删除） |
| `BUG_WAIT_DEV（待开发）` | 上线、编辑 | 「上线」→ `BUG_ONLINE` |
| `BUG_ONLINE（已上线）` | 编辑 | 终态（无删除） |
| `MT_NOT_STARTED（未开始）` | 开始、取消、编辑、删除 | 「开始」→ `MT_IN_PROGRESS`；「取消」→ `MT_CANCELLED`，需填原因 |
| `MT_IN_PROGRESS（会议中）` | 结束、编辑 | 「结束」→ `MT_ENDED`（无删除） |
| `MT_ENDED（已结束）` | 编辑 | |
| `MT_CANCELLED（已取消）` | 编辑 | 终态；详情页展示取消原因 |

> 核心原则：**仅初始态（未处理 / 未开始）提供「删除」**；其余状态只保留「编辑」+ 状态推进操作；会议「未开始」额外提供「取消」，「会议中」提供「结束」。

#### 23.2 代码改动

**A. 新增代办操作处理器 `TODO_ACTION_HANDLERS`**

仿照 `TASK_ACTION_HANDLERS`，在 `app.js` 中新增：

```js
const TODO_ACTION_HANDLERS = {
  // ---- 状态推进 ----
  async start(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const op = getCurrentUserAccount();
    const nextCode = (todo.typeCode === 'BUG') ? 'BUG_DOING' : (todo.typeCode === 'MEETING' ? 'MT_IN_PROGRESS' : 'TD_DOING');
    await RT_TODOS.updateTodo(id, { statusCode: nextCode }, op);
    const opCode = 'TODO_START';
    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: opCode, operator: op });
    renderTodoStats(); renderTodoList();
    toast(todo.typeCode === 'MEETING' ? '会议已开始' : '已开始处理');
  },
  async complete(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const op = getCurrentUserAccount();
    const nextCode = (todo.typeCode === 'BUG') ? 'BUG_DONE' : 'TD_DONE';
    await RT_TODOS.updateTodo(id, { statusCode: nextCode }, op);
    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: 'TODO_COMPLETE', operator: op });
    renderTodoStats(); renderTodoList();
    toast('已完成');
  },
  async handoff(id) {
    const op = getCurrentUserAccount();
    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: 'TODO_HANDOFF', operator: op });
    renderTodoList();
    toast('已转交');
  },
  async online(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const op = getCurrentUserAccount();
    const nextCode = 'BUG_ONLINE'; // 仅 BUG_DONE / BUG_WAIT_DEV 拥有「上线」按钮
    await RT_TODOS.updateTodo(id, { statusCode: nextCode }, op);
    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: 'TODO_ONLINE', operator: op });
    renderTodoStats(); renderTodoList();
    toast('已上线');
  },
  // ---- 会议结束（新增）----
  async end(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const op = getCurrentUserAccount();
    await RT_TODOS.updateTodo(id, { statusCode: 'MT_ENDED' }, op);
    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: 'TODO_END', operator: op });
    renderTodoStats(); renderTodoList();
    toast('会议已结束');
  },
  async waitdev(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const op = getCurrentUserAccount();
    await RT_TODOS.updateTodo(id, { statusCode: 'BUG_WAIT_DEV' }, op);
    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: 'TODO_WAITDEV', operator: op });
    renderTodoStats(); renderTodoList();
    toast('已回退至待开发');
  },
  // ---- 会议取消（新增）----
  async cancel(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const op = getCurrentUserAccount();
    const reason = await promptCancelReason('请填写会议取消原因（必填）');
    if (reason == null) return;          // 用户点取消
    if (!reason.trim()) { toast('取消原因不能为空'); return; }
    await RT_TODOS.updateTodo(id, {
      statusCode: 'MT_CANCELLED',
      cancelTime: Date.now(),
      cancelBy: op,
      cancelReason: reason.trim()
    }, op);
    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: 'TODO_CANCEL', operator: op });
    renderTodoStats(); renderTodoList();
    toast('会议已取消');
  },
  // ---- 编辑 ----
  async edit(id) { openTodoEdit(id); },
  // ---- 删除 ----
  async del(id) {
    const ok = await customConfirm('确认删除该代办？删除后将一并清理其流转记录，且不可恢复。', { danger: true });
    if (!ok) return;
    await RT_TODOS.deleteTodo(id);
    renderTodoStats(); renderTodoList();
    toast('已删除', 'success');
  }
};
```

> `promptCancelReason()` 实现方案二选一：
> 1. 扩展 `customConfirm` 增加 `opts.input = true`（返回输入值或 `null`）；
> 2. 新增独立函数 `promptCancelReason(message)`，动态创建含 `<textarea>` 的居中弹窗。  
> 推荐方案 2，避免污染通用确认框语义。

**B. 新增 `getTodoActions(statusCode)` 函数**

```js
function getTodoActions(statusCode, typeCode) {
  const MAP = {
    'TD_TODO':       ['start',   'edit', 'del'],
    'TD_DOING':      ['complete','handoff','edit'],
    'TD_DONE':       ['edit'],
    'BUG_TODO':      ['start',   'edit', 'del'],
    'BUG_DOING':     ['complete','waitdev','handoff','edit'],
    'BUG_DONE':      ['edit'],
    'BUG_WAIT_DEV':  ['online',  'edit'],
    'BUG_ONLINE':    ['edit'],
    'MT_NOT_STARTED':['start',   'cancel','edit','del'],
    'MT_IN_PROGRESS':['end',     'edit'],
    'MT_ENDED':      ['edit'],
    'MT_CANCELLED':  ['edit']
  };
  const LABELS = {
    // 「开始」按钮：仅会议显示「开始」，任务事项/缺陷追踪显示「开始处理」
    start: (typeCode === 'MEETING') ? '开始' : '开始处理',
    complete: '完成', handoff: '转交', end: '结束',
    online: '上线', waitdev: '待开发', cancel: '取消',
    edit: '编辑', del: '删除'
  };
  return (MAP[statusCode] || ['edit']).map(function(act) {
    return { act: act, label: LABELS[act] || act };
  });
}
```

**C. 改造 `buildTodoCard()`**

追加操作按钮行 + 确保点击行为正确（注意：allMeta / createdTime 是批次 24 内容；本批次先用现有 meta）：

```js
function buildTodoCard(t, nameMap, colorMap, extras) {
  // ... 现有 title/status/meta 逻辑 ...

  // 操作按钮行（批次23）
  const actions = getTodoActions(t.statusCode, t.typeCode);
  const actionBtns = actions.map(function(a) {
    return '<button class="btn action-' + a.act + '" data-todo-act="' + a.act + '" data-id="' + t.id + '">' + a.label + '</button>';
  }).join('');

  return '<div class="task-card t-' + (t.typeCode || '') + '" data-id="' + t.id + '" style="--type-color:' + color + '">' +
    '<div class="task-body">' +
      '<div class="task-header">' +
        '<div class="task-title-row"><h3 class="task-title">' + escapeHtml(title) + '</h3></div>' +
        '<span class="tag status-' + escapeHtml(t.statusCode || '') + '" style="background:' + statusColor + '1a;color:' + statusColor + '">' + escapeHtml(statusText) + '</span>' +
      '</div>' +
      (meta ? '<div class="task-meta">' + meta + '</div>' : '') +
      (actionBtns ? '<div class="task-actions">' + actionBtns + '</div>' : '') +
    '</div>' +
  '</div>';
}
```

**D. 事件委托（关键：修复点击行为 + 操作按钮）**

在 `renderTodoList()` 的 `box.innerHTML = ...` 之后追加：

```js
// 操作按钮事件委托（必须 stopPropagation）
box.querySelectorAll('[data-todo-act]').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    const act = btn.dataset.todoAct;
    const id = btn.dataset.id;
    const handler = TODO_ACTION_HANDLERS[act];
    if (handler) handler(id);
  });
});

// 强制确保卡片点击打开详情（非编辑），防御性重新绑定
box.onclick = function(e) {
  if (e.target.closest('[data-todo-act]')) return;
  const card = e.target.closest('.task-card');
  if (card && card.dataset.id) openTodoDetail(card.dataset.id);
};
```

**E. 会议取消原因弹窗 `promptCancelReason()`**

```js
function promptCancelReason(message) {
  return new Promise(function(resolve) {
    const existing = document.getElementById('todo-cancel-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'todo-cancel-overlay';
    overlay.innerHTML =
      '<div class="modal-card">' +
        '<div class="modal-header"><h3>' + escapeHtml(message) + '</h3></div>' +
        '<div class="modal-body"><textarea id="todo-cancel-reason" rows="3" placeholder="请输入取消原因..."></textarea></div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-secondary" type="button" data-action="cancel">取消</button>' +
          '<button class="btn btn-primary" type="button" data-action="confirm">确认取消</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('#todo-cancel-reason');
    const close = function(val) {
      overlay.remove();
      resolve(val);
    };
    overlay.querySelector('[data-action="cancel"]').onclick = function() { close(null); };
    overlay.querySelector('[data-action="confirm"]').onclick = function() { close(textarea.value); };
    textarea.focus();
  });
}
```

**F. 操作按钮着色（`styles.css`，批次 23 必做）**

任务卡的 `.btn.action-*` 规则是按**任务操作中文标签**（如 `.action-开发提交`、`.action-编辑`、`.action-删除`）命名的，与代办按钮的**动作码 class**（`action-start` / `action-complete` / `action-handoff` / `action-online` / `action-cancel` / `action-end` / `action-waitdev` / `action-edit` / `action-del`）不匹配；而 `.btn` 基础样式为 `border:none; color:inherit` 且无背景，故**不补规则则按钮无边框无底色**。需在 `styles.css` 新增代办按钮着色，对齐任务卡语义：编辑蓝边、删除红边、状态推进主色填充、「取消」红底白字（与「删除」红边区分）。

```css
/* 代办操作按钮着色：编辑蓝边、删除红边、状态推进主色填充、取消红底白字 */
.btn.action-edit { background: transparent; border: 1px solid var(--c-编辑); color: var(--c-编辑); }
.btn.action-del  { background: transparent; border: 1px solid var(--c-删除); color: var(--c-删除); }
.btn.action-cancel { background: var(--c-删除); color: #fff; border: 1px solid var(--c-删除); }
.btn.action-start,
.btn.action-complete,
.btn.action-handoff,
.btn.action-online,
.btn.action-end,
.btn.action-waitdev { background: var(--primary); color: #fff; border: 1px solid var(--primary); }
.btn.action-start:active,
.btn.action-complete:active,
.btn.action-handoff:active,
.btn.action-online:active,
.btn.action-end:active,
.btn.action-waitdev:active { background: #4096ff; }
```

> 说明：计划正文「删除红色背景」与任务卡实际（红边）不一致，此处按任务卡统一为**红边**。

#### 验证

- [x] 任务事项 / 缺陷追踪初始态显示「开始处理 / 编辑 / 删除」；会议初始态显示「开始 / 取消 / 编辑 / 删除」
- [x] **删除按钮仅出现在初始态**（未处理 / 未开始）；处理中、已完成、已上线、会议中、已结束、已取消均**无**删除
- [x] 缺陷追踪「已完成」状态**无**上线按钮（上线仅从「待开发」）
- [x] 会议「未开始」状态显示「开始 / 取消 / 编辑 / 删除」
- [x] 点「取消」→ 弹出原因输入框；未填原因点确认 → 提示不能为空
- [x] 填写原因后确认 → 会议状态变为 `MT_CANCELLED`，`todos.cancelReason` 写入，lifecycle 生成 `TODO_CANCEL`
- [x] 已取消会议详情页展示取消原因、取消人、取消时间
- [x] 点操作按钮 → 执行对应操作，不触发详情页
- [x] 点卡片其他区域 → 打开详情页（非编辑页）
- [x] 操作按钮颜色与任务卡一致（编辑蓝色边框、删除红边、状态推进主色填充；取消红底白字）

**发版**：建议批次 22–23 合并发一版；或独立提交后统一 `./release.sh`

---

### 批次 24 — 代办卡片增加项目 / 版本 / 创建时间

**问题**：代办卡片缺少通用字段（项目名、版本名、创建时间），任务卡的标准布局是四层：
`header → meta(项目+版本+其他) → dates(录入时间) → actions(操作按钮)`

**涉及文件**：`app.js`（`resolveTodoRowExtras`、`buildTodoCard`、`renderTodoList`）

#### 改动清单

- [x] 扩展 `resolveTodoRowExtras()`：增加项目名和版本名的异步解析
- [x] 改造 `buildTodoCard()`：
  - 追加 `projectName` / `versionName` 到 meta 区域（所有子类型统一）
  - 追加 `createdTime` 行（`t.createdAt` 格式化为「创建时间 YYYY-MM-DD HH:mm」）

#### 最终布局（对齐任务卡）

```
[类型标签] 标题                              [状态标签]
[项目] [版本] [子类型特有字段...]
创建时间 2026-07-22 16:30
[操作按钮行]
```

#### 各子类型完整 meta

| 子类型 | meta 完整内容 |
|--------|--------------|
| TASK_ITEM | 项目(新) + 版本(新) + 开发人员(原) + 时间范围(原) |
| BUG | 项目(新) + 版本(新) + 关联任务(原) + 反馈人/时间(原) |
| MEETING | 项目(新) + 版本(新) + 会议时间(原) + 地点(原) |

#### 验证

- [x] 三类代办卡片均显示项目名标签 + 版本名标签
- [x] 所有代办卡片底部显示「创建时间 ...」行
- [x] 子类型原有 meta 信息保留
- [x] 无项目/无版本时该标签不显示

**发版**：按需（已随批次23一并 [no-version-bump] 推送，见 commit f3a57f7；本批次 24 单独补推）

---

### 批次 25 — 代办编辑页状态 `<select>` → chips（带颜色）

**问题**：代办编辑表单的状态选择器是 `<select>` 无颜色。任务用 chips 带色。

**涉及文件**：`index.html`、`app.js`

#### 改动清单

- [x] `index.html`：`<select id="todo-f-status">` → `<div class="chip-group" id="todo-f-status-chips"></div>` + `<input type="hidden" id="todo-f-status">`
- [x] `app.js renderTodoFormStatusOptions()`：改造为渲染 chips，选中态带 `--chip-color`
- [x] 表单提交从隐藏 input 取值

#### 验证

- [x] 编辑页状态区为彩色 chips
- [x] 选中态有背景色
- [x] 切换子类型时刷新
- [x] 编辑回填正确高亮
- [x] 提交能正确读取值

**发版**：按需（已随批次24后单独 [no-version-bump] 推送，见 commit 236954b；本批次 25 单独补推）

---

## 三、关于点击行为的特别说明

**代码现状**：`app.js L1238–1241` 写的是 `openTodoDetail(card.dataset.id)`，看起来正确。  
**用户反馈**：kill-sw + 清空缓存后，点击代办卡片仍然进入编辑页而非详情页。  
**可能根因**（将在批次 23 执行时逐一排查）：

| 可能性 | 排查方式 |
|--------|---------|
| GitHub Pages CDN 边缘节点可能仍在返回旧版 `app.js`（旧版可能调的是 `openTodoEdit`） | 在 `openTodoDetail` 开头加 `console.log('[debug] openTodoDetail called:', id)` 区分 |
| `todo-detail-overlay` 与 `todo-modal-overlay` ID/样式冲突 | 检查 HTML 中两 overlay 的 hidden 初始状态 |
| 某段代码在运行时覆盖了 `listBox.onclick` | 在 `renderTodoList` 末尾显式重新绑定 |

**批次 23 的防御性修复**：无论根因是什么，会在 `renderTodoList()` 末尾强制重新绑定 `box.onclick = function() { openTodoDetail(...) }`，并在操作按钮上加 `stopPropagation()`，双保险确保行为正确。

---

## 四、执行顺序建议

```
批次 22（BUG_ONLINE 颜色运行时覆盖）
    ↓
批次 23（操作按钮 + 修复点击行为 + 会议取消/原因字段）← 核心批次，改动最大
    ↓
批次 24（卡片增加项目/版本/创建时间）
    ↓
批次 25（编辑页状态 select → chips）
    ↓
统一升版 + 推送
```

各批次可独立执行也可合并。批次 23 内部建议按 **23.0 → 23.1 → 23.2 → 23 验证** 顺序执行，确保字典/模型先行。

---

## 五、回我编号即可触发执行

例如：
- 「执行 22+23」→ 先做颜色覆盖 + 操作按钮/点击行为/会议取消
- 「全部执行 22–25」→ 合并为一次发版
- 「只改清单，不执行」→ 本文件即为最终版，等待进一步确认
