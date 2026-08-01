# 任务卡重构方案

> 参照 v1.3.19「详情重构」流程（批次 7.1–7.4），对任务卡片、列表筛选、报表统计、设置页批量操作等模块进行 IndexedDB 双源适配。

---

## 现状问题矩阵

| # | 位置 | 问题 | 严重度 | 对应批次 |
|---|------|------|--------|----------|
| 1 | `normalizeTask` idb 分支 L146 | 未构建 `dates` 对象，导致所有读取 `it.dates` 的链路对 idb 任务均失效 | 🔴 严重 | 8.1 |
| 2 | `primaryTimeText` L1667 | 读取 `it.dates`（legacy 对象），idb 任务始终回落「录入时间」——卡片上永远不显实际阶段时间 | 🟡 中等 | 8.1 |
| 3 | `periodMatch` L1804 | 同上，idb 任务的报表时间筛选始终不命中 | 🟡 中等 | 8.1 |
| 4 | `openModuleTaskList` L1898 | 直接用 `items`（legacy localStorage 数组），idb 任务在报表「任务清单」中完全不可见 | 🔴 严重 | 8.2 |
| 5 | `renderReports` L1984 | 同上，报表统计（总数/测试中/已测完/已上线/工时）全部只算 legacy | 🔴 严重 | 8.2 |
| 6 | `collectReportYears` L1815 | 同上，idb 任务不贡献报表年份筛选选项 | 🟡 中等 | 8.2 |
| 7 | 报表工时 `taskWorkHours` | 内部读取 `it.dates.started`，idb 任务工时恒为 0 | 🟡 中等 | 8.3 |
| 8 | 报表 `notStart` 统计 L1989 | `it.dates.started` 仅 legacy | 🟡 中等 | 8.3 |
| 9 | `updateReferencedValue` L2109–2121 | 设置页重命名/批量替换仅写 `items`，idb 任务完全不受影响 | 🟡 中等 | 8.4 |
| 10 | 设置详情引用查询 L2298–2303 | 只查 `items`，idb 任务在「引用该值的任务」列表中不显示 | 🟡 中等 | 8.4 |

---

## 批次规划

### 批次 8.1：`normalizeTask` 构建 dates 对象 + `primaryTimeText` / `periodMatch` 适配（前置依赖）

**根因**：idb 任务的阶段时间存在 `devSubmitTime` / `testStartTime` / `testEndTime` / `onlineTime` 四个独立字段中，而所有渲染/筛选链路统一读 `it.dates` 对象。`normalizeTask` 的 idb 分支未做映射。

#### 8.1.1 修改 `normalizeTask`（`app.js` L146）— idb 分支构建 dates

```javascript
// 改前（idb 分支 return 中无 dates 字段）
return {
  _source: 'idb',
  id: t.id,
  ...
};

// 改后：在 return 中追加 dates 映射
return {
  _source: 'idb',
  id: t.id,
  ...
  dates: {
    submitted: t.devSubmitTime || null,
    started:   t.testStartTime  || null,
    completed: t.testEndTime    || null,
    online:    t.onlineTime     || null
  }
};
```

**说明**：仅构建兼容 `dates` 对象，不改动原有字段名。所有下游函数（`primaryTimeText`、`periodMatch`、`formatTaskDates`、`taskWorkHours`）无需修改即可正确工作。

#### 8.1.2（可选）验证 `primaryTimeText`

无需改代码——`it.dates` 已有值后，switch 分支自动匹配正确阶段时间。

**依赖**：无（纯 data-layer 改动）

**验证**：新建 idb 任务 → 开发提交 → 卡片显示「提测时间」而非「录入时间」；推进到各阶段后卡片时间随状态变化。

---

### 批次 8.2：报表模块数据源 `items` → `allTasks`

**问题**：`renderReports`、`openModuleTaskList`、`collectReportYears` 直接使用 `items`（仅 legacy），idb 任务在报表模块中完全不参与。

#### 8.2.1 修改 `renderReports`（L1984）

```javascript
// 改前
const list = items.filter((it) => periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode));

// 改后：使用 allTasks（含 idb + legacy），normalizeTask 归一化后筛选
const list = allTasks
  .map(normalizeTask)
  .filter((it) => periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode));
```

#### 8.2.2 `renderReports` 内后续字段适配

`renderReports` 内 `i.status` / `i.dates.started` 等字段在 `normalizeTask` 后的命名空间下：
- `i.status` → `i.statusText`（normalizeTask 统一字段）
- `i.dates` → 8.1 已构建，无需改

```javascript
// 改前
const testing = list.filter((i) => i.status === '测试中' || i.status === '暂停中').length;
const tested  = list.filter((i) => i.status === '已测完').length;
const online  = list.filter((i) => i.status === '已上线').length;
const notStart = list.filter((i) => { const d = i.dates || {}; return !d.started; }).length;

// 改后
const testing = list.filter((i) => i.statusText === '测试中' || i.statusText === '暂停中').length;
const tested  = list.filter((i) => i.statusText === '已测完').length;
const online  = list.filter((i) => i.statusText === '已上线').length;
const notStart = list.filter((i) => { const d = i.dates || {}; return !d.started; }).length;
```

#### 8.2.3 修改 `openModuleTaskList`（L1898）

```javascript
// 改前
const base = items.filter((it) => periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode));
const sub = isEntered
  ? base.filter((i) => ENTERED.includes(i.status))
  : base.filter((i) => !ENTERED.includes(i.status));

// 改后：normalizeTask 归一化
const base = allTasks
  .map(normalizeTask)
  .filter((it) => periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode));
const sub = isEntered
  ? base.filter((i) => ENTERED.includes(i.statusText))
  : base.filter((i) => !ENTERED.includes(i.statusText));
```

> ⚠️ `openModuleTaskList` 中 `normalizeTask(it)` 的输出可直接传 `buildTaskCardHtml`——已是 normalizeTask 格式。

#### 8.2.4 修改 `collectReportYears`（L1815）

```javascript
// 改前
items.forEach((it) => {
  if (it.createdAt) set.add(new Date(it.createdAt).getFullYear());
  const d = it.dates || {};
  ...
});

// 改后：遍历 allTasks，normalizeTask 后收集
allTasks.map(normalizeTask).forEach((it) => {
  if (it.createdAt) set.add(new Date(it.createdAt).getFullYear());
  const d = it.dates || {};
  if (d.started)  set.add(new Date(d.started).getFullYear());
  if (d.completed) set.add(new Date(d.completed).getFullYear());
});
```

**依赖**：批次 8.1（`dates` 对象必须可用）

**验证**：报表视图 → 统计数据包含 idb 任务；年份筛选下拉包含 idb 任务年份；任务清单中可见 idb 任务。

---

### 批次 8.3：报表统计与图表适配

#### 8.3.1 `renderReports` 工时计算适配

`taskWorkHours` 读取 `it.dates.started` 和 `it.dates.pauseEvents`。8.1 已构建 `dates.started`，但 **pauseEvents 未映射**（idb 的暂停/恢复记录在 `taskLifecycles` 表中）。

**方案**：`taskWorkHours` 需要改造为双源读取暂停事件。由于改动较大，本批次先做「初步支持」——工时计算对 idb 任务不含暂停扣除（暂停时长默认 0）。

```javascript
// taskWorkHours 中：
// 改前
const pe = (i.dates && i.dates.pauseEvents) || [];

// 改后（idb 任务暂不支持暂停扣除，后续版本完善）
const pe = (i._source === 'idb') ? [] : ((i.dates && i.dates.pauseEvents) || []);
```

> ⚠️ 完整的暂停事件映射需要从 `taskLifecycles` 表读取 PAUSE/RESUME 记录对。可在后续批次单独处理。

#### 8.3.2 `notStart` 统计确认

8.2.2 中 `i.dates.started` 已通过 8.1 可用，`notStart` 统计自然生效，无需额外改动。

**依赖**：批次 8.2

**验证**：报表统计中「工时」对 idb 任务有非零值（不含暂停扣除）；「未进入测试」计数正确。

---

### 批次 8.4：设置页批量操作双源适配

**问题**：`updateReferencedValue` 和设置详情引用查询仅操作 `items`（legacy），idb 任务不受影响。

#### 8.4.1 修改 `updateReferencedValue` — 同步更新 idb 任务

设置页重命名开发人员/项目/需求组时，需要同时更新 idb 任务中的对应引用。

```javascript
// 在 updateReferencedValue 中，保留现有 items 操作，追加 idb 路径
function updateReferencedValue(oldVal, newVal, key) {
  // ... 现有 settings / items 操作保持不变 ...

  // 追加：同步更新 idb 任务
  allTasks.filter(function (t) { return t._source === 'idb'; }).forEach(function (t) {
    var changed = false;
    if (key === 'dev' && t.developerIds && t.developerIds.length) {
      // developerIds 存的是用户 ID，不是昵称字符串——重命名场景不适用
      // 此处仅对「项目/需求组名称变更」做 idb 同步
    } else if (key === 'project' && t.projectName === oldVal) {
      // idb 任务存的是 projectId，不是名称——重命名场景不影响 idb 引用
    } else if (key === 'group' && t.versionName === oldVal) {
      // 同上，versionId 不变，重命名不影响
    }
    // 实际上 idb 任务存的是 ID 引用，设置页重命名只改名不改 ID，
    // 所以 idb 任务的引用不受影响。仅需确认 normalizeTask 解析正确即可。
  });
}
```

**关键发现**：idb 任务存储的是 **ID 引用**（`projectId` / `projectVersionId` / `developerIds`），而非名称字符串。设置页重命名只改 `settings` 中的展示名、不改 ID，因此 **idb 任务天然不需要同步**。

**实际需要改的**：设置详情引用查询（L2298–2303）——当前只查 `items`，应同时查 `allTasks`。

#### 8.4.2 修改设置详情引用查询（L2298–2303）

```javascript
// 改前
if (detailItem.key === 'dev') {
  tasks = items.filter((it) => it.developers && it.developers.includes(detailItem.value));
} else if (detailItem.key === 'project') {
  tasks = items.filter((it) => it.project === detailItem.value);
} else if (detailItem.key === 'group') {
  tasks = items.filter((it) => it.group === detailItem.value);
}

// 改后：双源查询
var legacyTasks = [];
var idbTasks = [];
if (detailItem.key === 'dev') {
  legacyTasks = items.filter((it) => it.developers && it.developers.includes(detailItem.value));
  idbTasks = allTasks
    .filter(function (t) { return t._source === 'idb'; })
    .map(normalizeTask)
    .filter(function (it) { return it.developerNames && it.developerNames.includes(detailItem.value); });
} else if (detailItem.key === 'project') {
  legacyTasks = items.filter((it) => it.project === detailItem.value);
  idbTasks = allTasks
    .filter(function (t) { return t._source === 'idb'; })
    .map(normalizeTask)
    .filter(function (it) { return it.projectName === detailItem.value; });
} else if (detailItem.key === 'group') {
  legacyTasks = items.filter((it) => it.group === detailItem.value);
  idbTasks = allTasks
    .filter(function (t) { return t._source === 'idb'; })
    .map(normalizeTask)
    .filter(function (it) { return it.versionName === detailItem.value; });
}
tasks = legacyTasks.concat(idbTasks.map(function (it) { return it.raw; }));
```

> ⚠️ 设置详情列表渲染使用原始 `tasks` 数组中的 `taskName` / `status` 等字段。idb 任务的 `raw` 保留原始字段名，渲染时需对应适配——或统一走 `normalizeTask` 后渲染。

**依赖**：无

**验证**：设置页 → 点击开发人员/项目/需求组 → 详情展开后「关联任务」列表包含 idb 任务。

---

### 批次 8.5：联调测试与边界修复

**范围**：端到端回归 + 代码审查。

#### 测试矩阵

| 场景 | 操作 | 预期 |
|------|------|------|
| idb 任务卡片时间 | 新建 idb 任务 → 查看卡片 | 显示「录入时间」 |
| idb 任务卡片时间 | 开发提交后查看卡片 | 显示「提测时间」 |
| idb 任务卡片时间 | 推进到各阶段后查看卡片 | 时间随阶段变化（测试中→开始时间，已测完→完成时间，已上线→上线时间） |
| 报表统计 | 切换到报表视图 | idb 任务计入总数、各状态计数 |
| 报表筛选 | 选择年份/季度/月份 | idb 任务按时间范围筛选正确 |
| 报表任务清单 | 点击「已进入测试」/「未进入测试」 | 清单包含 idb 任务 |
| 报表工时 | 查看工时统计 | idb 任务有非零工时（不含暂停扣除） |
| 设置页引用查询 | 点击开发人员/项目/需求组 → 查看引用 | 关联任务列表含 idb 任务 |
| legacy 任务卡片时间 | 查看 legacy 任务卡片 | 与之前完全一致，无退行 |
| legacy 报表 | 查看 legacy 任务报表 | 与之前完全一致，无退行 |

---

## 依赖关系图

```
8.1 (normalizeTask 构建 dates)
 │
 ├──→ 8.2 (报表数据源 items → allTasks)
 │      │
 │      ├──→ 8.3 (报表统计/工时适配)
 │      │
 │      └──→ 8.4 (设置页引用查询双源适配)
 │             │
 │             └──→ 8.5 (联调测试)
```

---

## 变更文件清单

| 文件 | 批次 | 改动量 |
|------|------|--------|
| `app.js` | 8.1 | +4 行（`normalizeTask` idb 分支追加 `dates`） |
| `app.js` | 8.2 | ~20 行（`renderReports` / `openModuleTaskList` / `collectReportYears` 数据源切换） |
| `app.js` | 8.3 | ~5 行（`taskWorkHours` 暂停事件双源判断） |
| `app.js` | 8.4 | ~30 行（设置详情引用查询双源适配） |

---

## 风险与注意事项

1. **8.1 的 `dates` 对象仅做映射，不修改存储**：idb 任务的原始字段（`devSubmitTime` 等）保持不变，`dates` 仅在 `normalizeTask` 归一化时临时构建，不写回 IndexedDB。

2. **8.2 数据源切换为 `allTasks.map(normalizeTask)`**：这会让 `renderReports` 和 `openModuleTaskList` 中的 `it` 变为 normalizeTask 格式。必须确认所有下游字段访问与 normalizeTask 的命名空间一致（`status` → `statusText`，`type` → `typeCode` 等）。

3. **8.3 工时计算不支持 idb 暂停扣除**：idb 任务的暂停/恢复记录在 `taskLifecycles` 表中（PAUSE/RESUME 操作对），`taskWorkHours` 需要按 `taskId` 查询并计算暂停时长。本批次暂不做完整支持，idb 任务的暂停时长按 0 计算。

4. **8.4 设置详情引用查询**：idb 任务以 `normalizeTask` 格式参与筛选（`projectName` / `versionName` / `developerNames`），筛选后再取 `raw` 供详情列表渲染。需确认列表渲染兼容 legacy items 的字段格式。

5. **Legacy 任务不受影响**：所有改动都保留 legacy 路径，`items` 相关逻辑不动。

---

## 建议执行顺序

1. **逐步推进**：8.1 → 8.2 → 8.3 → 8.4 → 8.5
2. **每批次完成后验证**：确保该批次功能正常后再进入下一批
3. **关键里程碑**：
   - 8.1 完成后：idb 任务卡片显示正确阶段时间
   - 8.2 完成后：报表模块统计含 idb 任务
   - 8.4 完成后：设置页引用查询含 idb 任务

---

> 📅 方案制定日期：2026-07-21
> 📋 参照版本：v1.3.19（详情重构完成）
> 🎯 目标版本：v1.3.20（任务卡重构）
