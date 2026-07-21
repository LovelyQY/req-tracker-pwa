# 详情重构方案

> 参照 v1.3.18「编辑任务重构」流程（批次 6.1–6.7），对详情页及相关数据链路进行 IndexedDB 化改造。

---

## 现状问题矩阵

| # | 位置 | 问题 | 严重度 | 对应批次 |
|---|------|------|--------|----------|
| 1 | `openTaskDetail` L1294 | `it.ops` 只读 legacy 对象内联 ops 数组，idb 任务生命周期时间线始终显示「暂无生命周期记录」 | 🔴 严重 | 7.2 |
| 2 | `createRequirementTask` L180 | `String(operator)` 对 `getCurrentUser()` 返回的对象序列化为 `"[object Object]"`，所有 idb 任务的 createdBy/updatedBy/operator 均存储为垃圾字符串 | 🔴 严重 | 7.1 |
| 3 | `createTaskLifecycle` L97 | 同上，`String(data.operator)` 导致 idb 生命流程记录的 operator 全为 `"[object Object]"` | 🔴 严重 | 7.1 |
| 4 | `updateRequirementTask` L218 | 同上，`String(operator)` 导致更新人字段存储为 `"[object Object]"` | 🔴 严重 | 7.1 |
| 5 | `openTaskDetail` 整体 | idb 任务的 `devSubmitTime`/`testStartTime`/`testEndTime`/`onlineTime` 等生命周期阶段时间未在详情页展示（仅存在于 IndexedDB 字段，未映射到展示层） | 🟡 中等 | 7.3 |
| 6 | `formatOperator` L317 | 仅兼容 `{ account, nickname }` 对象，不兼容纯字符串 account（修复 7.1 后 lifecycle operator 将变为纯 account 字符串） | 🟡 中等 | 7.1 |
| 7 | `normalizeTask` idb 分支 | 未暴露 `createdBy` / `updatedBy` 等审计字段（详情页仅通过 ops 时间线展示，无需单独暴露，但可供未来扩展） | 🟢 低 | — |

---

## 批次规划

### 批次 7.1：operator 序列化修复（前置依赖）

**根因**：`getCurrentUser()` 返回 `{ account, nickname }` 对象，而 IndexedDB 三个写入函数（`createRequirementTask` / `updateRequirementTask` / `createTaskLifecycle`）均使用 `String(operator)` 转换为字符串，结果为 `"[object Object]"`。

**影响面**：所有已写入 idb 任务和生命流程记录的 `createdBy`/`updatedBy`/`operator` 字段均为垃圾值。本批次仅修复「后续写入」，不回溯修复已有脏数据。

#### 7.1.1 修改 `auth.js` — 新增 `getCurrentUserAccount()`

```javascript
// 在 getCurrentUser 下方新增
function getCurrentUserAccount() {
  var u = getCurrentUser();
  return u ? u.account : '';
}
```

**用途**：返回纯 account 字符串，专供 IndexedDB 写入函数使用。

#### 7.1.2 修改 `createRequirementTask`（`requirement-tasks.js` L180）

```javascript
// 改前
var op = (operator == null ? '' : String(operator));

// 改后
var op = (operator == null ? '' : String(operator.account || operator));
```

#### 7.1.3 修改 `updateRequirementTask`（`requirement-tasks.js` L218）

```javascript
// 改前
var op = (operator == null ? '' : String(operator));

// 改后
var op = (operator == null ? '' : String(operator.account || operator));
```

#### 7.1.4 修改 `createTaskLifecycle`（`task-lifecycles.js` L97）

```javascript
// 改前
operator: (data.operator == null ? '' : String(data.operator)),

// 改后
operator: (data.operator == null ? '' : String(data.operator.account || data.operator)),
```

#### 7.1.5 修改 `formatOperator`（`app.js` L317）— 兼容纯字符串

```javascript
// 改前
function formatOperator(u) {
  if (!u || !u.account) return '—';
  const acct = escapeHtml(u.account);
  const nick = (u.nickname && u.nickname !== u.account) ? escapeHtml(u.nickname) : '';
  return nick ? (nick + '(' + acct + ')') : acct;
}

// 改后
function formatOperator(u) {
  if (!u) return '—';
  // 兼容纯字符串 account（IndexedDB 存储格式）
  if (typeof u === 'string') return escapeHtml(u);
  // 兼容旧 legacy 对象格式 { account, nickname }
  if (!u.account) return '—';
  var acct = escapeHtml(u.account);
  var nick = (u.nickname && u.nickname !== u.account) ? escapeHtml(u.nickname) : '';
  return nick ? (nick + '(' + acct + ')') : acct;
}
```

**依赖**：无（纯 data-layer 改动）

**验证**：新建一个 idb 任务 → `requirementTasks` 表中 `createdBy` 为 account 字符串；推送一次状态 → `taskLifecycles` 表中 `operator` 为 account 字符串。

---

### 批次 7.2：详情页生命周期时间线 idb 适配（核心）

**文件**：`app.js`

**问题**：`openTaskDetail` 中生命周期时间线仅渲染 `it.ops`（legacy 字段），idb 任务的生命流程记录存于 `taskLifecycles` 表，未被读取和渲染。

**改动**：`openTaskDetail` 中生命周期渲染改为双源适配。

#### 7.2.1 idb 生命流程记录 → legacy ops 格式映射

新增 `lifecycleToOps(lifecycles)` 映射函数：

```javascript
// 将 IndexedDB taskLifecycles 记录映射为 legacy ops 格式（供详情页时间线渲染复用）
function lifecycleToOps(lifecycles) {
  if (!lifecycles || !lifecycles.length) return [];
  // 操作码→中文 action 映射（复用字典）
  var OP_NAME = {
    'CREATE': '创建', 'EDIT': '编辑', 'DEV_SUBMIT': '开发提交',
    'TEST_START': '测试开始', 'PAUSE': '暂停', 'RESUME': '暂停恢复',
    'TEST_DONE': '测试完成', 'ONLINE': '上线', 'RESET': '重置', 'DELETE': '删除'
  };
  // 状态码→中文 status 映射
  var STATUS_NAME = {
    'TODO': '待开发', 'SUBMITTED': '已提测', 'TESTING': '测试中',
    'TESTED': '已测完', 'ONLINE': '已上线'
  };

  return lifecycles.map(function (lc) {
    return {
      action: OP_NAME[lc.operationCode] || lc.operationCode || '操作',
      status: STATUS_NAME[lc.statusCode] || lc.statusCode || null,
      by: lc.operator || '',          // 纯 account 字符串（7.1 修复后）
      at: lc.operateTime || 0
    };
  });
}
```

#### 7.2.2 `openTaskDetail` 生命周期渲染适配

```javascript
// 改前 (L1294)
const opsHtml = (it.ops && it.ops.length)
  ? '<div class="lc-timeline">' + it.ops.slice().reverse().map((o) => {
      ...
    }).join('') + '</div>'
  : '<div class="task-detail-empty">暂无生命周期记录</div>';

// 改后
// ---- 生命流程记录：双源适配 ----
var opsForDisplay = [];
if (raw._source === 'idb') {
  // idb：从 taskLifecycles 表按 taskId 查询，映射为 ops 格式
  try {
    var lifecycles = await RT_TASK_LIFECYCLES.getByTaskId(raw.id);
    opsForDisplay = lifecycleToOps(lifecycles || []);
  } catch (e) {
    console.warn('加载生命流程记录失败:', e);
    opsForDisplay = [];
  }
} else {
  // legacy：直接用内联 ops 数组
  opsForDisplay = it.ops || [];
}

const opsHtml = opsForDisplay.length
  ? '<div class="lc-timeline">' + opsForDisplay.slice().reverse().map(function (o) {
      var status = statusForOp(o);
      var color = lifeColor(status);
      var who = formatOperator(o.by);
      var when = o.at ? fmtDate(o.at) : '';
      var action = escapeHtml(o.action || '操作');
      var badge = status
        ? '<span class="lc-badge" style="background:var(--c-' + status + '-bg);color:' + color + '">' + escapeHtml(status) + '</span>'
        : '<span class="lc-badge" style="background:#94a3b81f;color:#64748b">编辑</span>';
      return '<div class="lc-item" style="--c:' + color + '">' +
        '<span class="lc-dot"></span>' +
        '<div class="lc-body">' +
        '<div class="lc-head"><span class="lc-action">' + action + '</span>' + badge + '</div>' +
        '<div class="lc-meta">操作人 <span class="op">' + who + '</span> · ' + escapeHtml(when) + '</div>' +
        '</div></div>';
    }).join('') + '</div>'
  : '<div class="task-detail-empty">暂无生命周期记录</div>';

document.getElementById('task-detail-ops').innerHTML = opsHtml;
```

> ⚠️ `openTaskDetail` 从同步函数变为 `async`——因为 idb 路径需要 `await RT_TASK_LIFECYCLES.getByTaskId()`。所有调用方 `openTaskDetail(card.dataset.id)` 无需更改（浏览器允许忽略 async 返回值）。

#### 7.2.3 `statusForOp` 扩展——兼容纯 code 状态值

```javascript
// 改前
function statusForOp(o) {
  if (o.status) return o.status;
  ...
}

// 改后（o.status 现在可能是中文 legacy 值，也可能是 code 值；lifecycleToOps 已统一转为中文）
// 无需改动——lifecycleToOps 已把 statusCode 转为中文名
```

**依赖**：批次 7.1（operator 序列化修复，确保 timeLine 中 operator 可读）

**验证**：打开任意 idb 任务详情 → 生命流程时间线显示完整操作历史（创建/开发提交/编辑/暂停/恢复等）。

---

### 批次 7.3：详情页补充生命周期阶段时间展示

**文件**：`app.js` index.html（如需新增 DOM）

**问题**：idb 任务有 `devSubmitTime`/`testStartTime`/`testEndTime`/`onlineTime` 及对应操作人字段（`devSubmitBy`/`testStartBy`/`testEndBy`/`onlineBy`），详情页目前未展示这些时间。legacy 任务的阶段时间存在于 `it.dates`（已通过生命周期时间线间接展示）。

**分析**：v1.2.28 已移除独立的"时间模块"，阶段时间融入生命周期时间线中展示。idb 任务当前缺少的是「首次进入各阶段的时间」在时间线中的显示。解决方案有两种：

- **方案 A（推荐）**：在生命周期时间线中，对 advance 类操作（DEV_SUBMIT / TEST_START / TEST_DONE / ONLINE）的条目额外显示"阶段时间"标签。
- **方案 B**：在详情页底部新增独立的时间信息区域。

**推荐方案 A**，改动最小且与现有 timeline 风格一致。

#### 7.3.1 扩展 `lifecycleToOps` — 携带阶段时间戳

```javascript
function lifecycleToOps(lifecycles, rawTask) {
  // ... existing mapping ...
  // 对 advance 类操作，附加阶段时间戳（来自 rawTask 的对应字段）
  var TIME_FIELD_MAP = {
    'DEV_SUBMIT': 'devSubmitTime',
    'TEST_START': 'testStartTime',
    'TEST_DONE': 'testEndTime',
    'ONLINE': 'onlineTime'
  };

  return lifecycles.map(function (lc) {
    var op = {
      action: OP_NAME[lc.operationCode] || lc.operationCode || '操作',
      status: STATUS_NAME[lc.statusCode] || lc.statusCode || null,
      by: lc.operator || '',
      at: lc.operateTime || 0
    };
    // 附加阶段时间戳（用于时间线中显示）
    var tfKey = TIME_FIELD_MAP[lc.operationCode];
    if (tfKey && rawTask && rawTask[tfKey] != null) {
      op.stageTime = rawTask[tfKey];
    }
    return op;
  });
}
```

#### 7.3.2 详情页时间线渲染 — 显示阶段时间

```javascript
// 在 opsHtml 的 .lc-body 中，对含 stageTime 的条目追加时间行
// ... 在现有 lc-meta 行下方追加 ...
// + (o.stageTime ? '<div class="lc-meta lc-stage-time">' + escapeHtml(fmtDate(o.stageTime)) + '</div>' : '')
```

> ⚠️ 此批次为体验增强，非阻断性功能。如果 index.html 中不存在对应的 CSS 类，需在 styles.css 或页面 `<style>` 中补充 `.lc-stage-time` 样式。

**依赖**：批次 7.2

**验证**：idb 任务推进到各阶段后，时间线中对应操作下显示阶段时间。

---

### 批次 7.4：联调测试与边界修复

**范围**：端到端回归 + 代码审查。

#### 测试矩阵

| 场景 | 操作 | 预期 |
|------|------|------|
| 查看 idb 任务详情 | 点击 idb 任务卡片 | 详情弹窗打开，标签/描述/图片/附件正常 |
| idb 任务生命周期 | 查看已操作过的 idb 任务详情 | 时间线显示完整 CREATE/ADVANCE/EDIT/PAUSE/RESUME 历史，operator 显示正确 account |
| legacy 任务详情 | 查看 legacy 任务详情 | 生命周期时间线与之前完全一致，无退行 |
| 新建任务后查看详情 | FAB → 填写 → 保存 → 点击卡片 | 时间线有 CREATE 记录，operator 正确 |
| 编辑后查看详情 | 编辑保存 → 点击卡片 | 时间线新增 EDIT 记录 |
| 推进状态后查看详情 | 推进 → 点击卡片 | 时间线新增对应 ADVANCE 记录+阶段时间 |
| 暂停/恢复后查看详情 | 暂停/恢复 → 点击卡片 | 时间线新增 PAUSE/RESUME 记录 |
| 重置后查看详情 | 重置 → 点击详情 | 时间线新增 RESET 记录 |
| 删除 idb 任务 | 删除 → 确认 | 任务消失，IDB 中数据级联清理 |
| 图片附件回填（详情复用） | 编辑加图/附件 → 保存 → 查看详情 | 详情页正确显示缩略图 |

---

## 依赖关系图

```
7.1 (operator 序列化修复)
 │
 ├──→ 7.2 (详情页生命周期时间线 idb 适配)
 │      │
 │      └──→ 7.3 (阶段时间展示)
 │             │
 │             └──→ 7.4 (联调测试)
```

---

## 变更文件清单

| 文件 | 批次 | 改动量 |
|------|------|--------|
| `auth.js` | 7.1 | +8 行（`getCurrentUserAccount`） |
| `requirement-tasks.js` | 7.1 | 2 处改动（`String(operator.account \|\| operator)`） |
| `task-lifecycles.js` | 7.1 | 1 处改动（同上） |
| `app.js` | 7.1 | ~8 行（`formatOperator` 兼容字符串） |
| `app.js` | 7.2 | +60 行（`lifecycleToOps` + `openTaskDetail` 双源适配） |
| `app.js` | 7.3 | ~20 行（阶段时间扩展） |
| `app.js` / `styles.css` | 7.3 | 视情况补充 `.lc-stage-time` 样式 |

---

## 风险与注意事项

1. **7.1 不回溯修复已有脏数据**：批次 7.1 仅修复「后续写入」，v1.3.17–v1.3.18 期间已创建的任务/生命流程记录中 `createdBy`/`updatedBy`/`operator` 仍为 `"[object Object]"`。详情页渲染时 `formatOperator` 遇到此值会显示为 `[object Object]`（不可读但不会报错）。可通过手动数据迁移脚本清理，或在后续版本中提供数据修复工具。

2. **`openTaskDetail` 改为 async**：对调用方透明（`onTaskAction` L2590 和 `openModuleTaskList` 等均忽略返回值），无兼容风险。

3. **`lifecycleToOps` 映射中操作码的中文名硬编码**：当前不从字典表动态查询（避免详情页额外 IndexedDB 查询）。保持与 `statusForOp` 等现有映射函数一致的硬编码模式。

4. **Legacy 任务不受影响**：所有改动都保留 legacy 路径（`raw._source !== 'idb'` 时走原有逻辑）。

---

## 建议执行顺序

1. **逐步推进**：7.1 → 7.2 → 7.3 → 7.4
2. **每批次完成后验证**：确保该批次功能正常后再进入下一批
3. **关键里程碑**：
   - 7.1 完成后：所有后续 idb 写入的 operator 字段正确
   - 7.2 完成后：idb 任务详情页生命周期时间线可正常展示

---

> 📅 方案制定日期：2026-07-21
> 📋 参照版本：v1.3.18（编辑任务重构）
> 🎯 目标版本：v1.3.19（详情重构）
