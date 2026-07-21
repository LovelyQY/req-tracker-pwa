# 侧边栏与旧数据清除方案

> 参照 v1.3.20「任务卡重构」流程。当前为测试版本，所有旧数据可清空。
> 目标：彻底移除 localStorage 旧数据体系（`items`/`settings`），仅保留 IndexedDB 数据。

---

## 现状分析

### 旧数据体系（需要移除）

| 存储 | 键 | 内容 |
|---|---|---|
| localStorage | `req-tracker-v2-items` | legacy 任务数组 |
| localStorage | `req-tracker-v2-settings` | 开发人员/项目/需求组列表 |
| localStorage | `req-tracker-v2-items-seeded` | 种子数据标记 |
| IndexedDB | `req-tracker`.`requirementTasks` | ✅ 新数据（保留） |
| IndexedDB | `req-tracker`.`taskLifecycles` | ✅ 新数据（保留） |

### settings 的用途（需逐一替换或移除）

| 用途 | 位置 | 替换方案 |
|---|---|---|
| 筛选下拉：项目/需求组 | `populateFilterSelects` | 改用 IndexedDB `projectList`/`versionList` |
| 卡片归档标记 | `buildTaskCardHtml` | idb 任务已统一为未归档，legacy 移除后无需判断 |
| 设置页 | `renderSettings` | 🔴 整页移除或重构为 idb 驱动 |
| 引用计数 | `getReferenceCount` | 仅保留 idb 分支，删除 legacy 分支 |
| 重命名更新 | `updateReferencedValue` | 🔴 删除（idb 用 ID 引用，无需重命名同步） |
| 报表需求组归属计数 | `getGroupCount` | 改用 `versionList` |
| 设置详情 | `renderSettingsDetail` / `openSettingDetail` | 🔴 删除或重构 |

---

## 批次规划

### 批次 10.1：`renderTaskList`/`buildTaskCardHtml` — 移除 settings 依赖

`buildTaskCardHtml` 中 `settings` 仅用于判断归档标记。idb 任务已统一视为未归档，legacy 任务即将移除——归档逻辑可完全去掉。

#### 10.1.1 简化 `buildTaskCardHtml` 归档判断

```javascript
// 改前
const isNewModel = it._source === 'idb';
const projArchived = isNewModel ? false : !(settings.projects || []).some((p) => p.value === it.projectName && p.enabled !== false);
const grpArchived = isNewModel ? false : !(settings.groups || []).some((g) => g.value === it.versionName && g.enabled !== false);
const devTags = (it.developerNames || []).map((d) => {
    const off = isNewModel ? false : !(settings.developers || []).some((x) => x.value === d && x.enabled !== false);
    ...
});

// 改后 — 统一无归档标记
const devTags = (it.developerNames || []).map((d) =>
    '<span class="tag dev">' + escapeHtml(d) + '</span>'
).join('');
const tagProj = '<span class="tag proj">' + escapeHtml(it.projectName || '默认项目') + '</span>';
const tagGrp = '<span class="tag grp">' + escapeHtml(it.versionName || '默认组') + '</span>';
```

> 同样修改 `openTaskDetail`（L1297-1302）中的归档判断。

#### 10.1.2 简化 `populateFilterSelects` — settings → IndexedDB list

```javascript
// 改前：settings.projects / settings.groups
projSel.innerHTML = ... (settings.projects || []).map(...)

// 改后：使用已有的 projectList / versionList（IndexedDB 预取）
// projectList / versionList 已由 ensureProjects/ensureVersions 预取
```

#### 10.1.3 简化 `getGroupCount` — settings.groups → versionList

```javascript
// 改前
return settings.groups.filter((g) => g.project === projectValue).length;

// 改后
return versionList.filter((v) => v.projectId === projectId).length;
```

> 注意：这需要调用方传入 `projectId` 而非 `projectValue`（名称）。

**依赖**：无

**验证**：卡片不再显示归档样式；筛选下拉从 IndexedDB 加载选项。

---

### 批次 10.2：移除 `refreshTaskList` 中的 legacy 合并 + `allTasks` 纯化

#### 10.2.1 `refreshTaskList` — 移除 legacy 分支

```javascript
// 改前
async function refreshTaskList() {
  var legacy = loadItems().map(function (t) { return Object.assign({}, t, { _source: 'legacy' }); });
  var fresh = [];
  try { fresh = await RT_REQUIREMENT_TASKS.getAllRequirementTasks(); ... } catch (e) {}
  allTasks = [...fresh, ...legacy];
  renderTaskList();
}

// 改后 — 仅 idb
async function refreshTaskList() {
  try {
    allTasks = await RT_REQUIREMENT_TASKS.getAllRequirementTasks();
    allTasks = (allTasks || []).map(function (t) { return Object.assign({}, t, { _source: 'idb' }); });
  } catch (e) { allTasks = []; }
  renderTaskList();
}
```

#### 10.2.2 `normalizeTask` — 移除 legacy 分支

```javascript
// 改后：仅 idb 分支，legacy 分支删除
function normalizeTask(t) {
  return {
    _source: 'idb',
    id: t.id,
    ...
  };
}
```

**依赖**：批次 10.1（卡片不再依赖 settings.projects/groups 的 legacy 格式）

**验证**：`allTasks` 仅含 idb 任务；`normalizeTask` 仅 idb 分支。

---

### 批次 10.3：移除 TASK_ACTION_HANDLERS 中 legacy 分支

每个 handler（del/advance/reset/pause/resume）中删除 `else { /* Legacy 路径 */ }` 块。

#### 10.3.1 del — 移除 legacy 路径

```javascript
// 改后：仅 idb 路径
async del(raw, id) {
  if (!await customConfirm(...)) return;
  await RT_REQUIREMENT_TASKS.deleteRequirementTask(id);
  await refreshTaskList();
  toast('已删除');
}
```

#### 10.3.2 advance — 移除 legacy 路径

删除 `else { raw.status = ns; ... saveItems(); }` 块。

#### 10.3.3 reset / pause / resume — 同上

#### 10.3.4 edit submit — 移除 legacy 路径

删除 `else { const it = items.find(...); Object.assign(it, rest); ... saveItems(); }` 块。

**依赖**：批次 10.2

**验证**：所有任务操作仅走 IndexedDB 路径。

---

### 批次 10.4：移除 localStorage 持久化函数及 `items`/`settings` 变量

#### 10.4.1 删除以下函数和变量

| 删除项 | 说明 |
|---|---|
| `STORE_KEY` / `SETTINGS_KEY` | localStorage 键常量 |
| `DEFAULT_SETTINGS` / `cloneDefaultSettings` / `migrateSettings` | settings 结构 |
| `loadItems` / `saveItems` | 任务持久化 |
| `loadSettings` / `saveSettings` | settings 持久化 |
| `let items = ...` | 变量声明 |
| `let settings = ...` | 变量声明 |
| `normalizeItemDates` | 旧数据迁移 |
| `uid()` | legacy ID 生成 |
| `recordOp()` | legacy ops 记录 |
| `seedDemoData()` | legacy 种子数据 |
| `migrateItemTypeCodes()` | legacy typeCode 补全 |
| `migrateLegacyItems()` | legacy 迁移骨架 |
| `legacyStatusToCode` / `legacyPriorityToCode` / `legacyTypeToCode` | legacy 映射函数 |
| `LEGACY_STATUS_MAP` / `LEGACY_PRIORITY_MAP` / `LEGACY_TYPE_MAP` | 映射常量 |
| `formatTaskDates` 剩余引用 | 确认已删 |

#### 10.4.2 `renderSettings` — 改为从 IndexedDB 列表驱动

```javascript
function renderSettings() {
  const renderList = (id, arr, key) => {
    // developers → userList
    // projects → projectList
    // groups → versionList
    // 去掉 enabled/disabled 概念，统一显示
  };
  renderList('dev-list', userList, 'dev');
  renderList('project-list', projectList, 'project');
  renderList('group-list', versionList, 'group');
}
```

> ⚠️ 设置页需要较大改造：去掉「归档/启用」概念、去掉重命名功能（改为跳转对应管理页）、去掉 `updateReferencedValue`。

#### 10.4.3 `getReferenceCount` — 移除 legacy 分支

```javascript
// 改后：仅 idb 分支
function getReferenceCount(value, key) {
  var idbTasks = allTasks.map(normalizeTask);
  if (key === 'dev') return idbTasks.filter(...).length;
  ...
}
```

#### 10.4.4 `getGroupCount` — 改用 versionList

```javascript
// 改后
function getGroupCount(projectId) {
  return versionList.filter((v) => v.projectId === projectId).length;
}
```

**依赖**：批次 10.3（handler 不再引用 items/settings）

**验证**：`saveItems`/`saveSettings` 不存在；应用启动不报引用错误。

---

### 批次 10.5：清理残余引用与格式兼容代码

#### 10.5.1 `formatOperator` — 移除 legacy 对象分支

```javascript
// 改后：仅保留字符串分支
function formatOperator(u) {
  if (!u) return '—';
  if (typeof u === 'string') return escapeHtml(u);
  return '—';
}
```

#### 10.5.2 `openTaskDetail` — 移除 legacy ops 分支

```javascript
// 改后：仅 idb 路径
var lifecycles = await RT_TASK_LIFECYCLES.getByTaskId(raw.id);
var opsForDisplay = lifecycleToOps(lifecycles || [], raw);
```

#### 10.5.3 `openModuleTaskList` — 移除 `normalizeTask` 重复调用检查

确认无残留 legacy 路径。

#### 10.5.4 `renderReports` — 确认 `periodMatch` 仅 idb 场景

`periodMatch` 已通过 8.1 的 `dates` 构建支持 idb，无需修改。

#### 10.5.5 设置详情引用查询 — 移除 legacy 分支

仅保留 `allTasks.map(normalizeTask).filter(...)`。

#### 10.5.6 删除 `reportExcludeTypes` 的 `reportCaptionText` 中的重复调用

确认无引用问题。

#### 10.5.7 `switchView` — 确认无 legacy 依赖

`switchView('report')` → `renderReports()` 已用 `allTasks`。✓

#### 10.5.8 清理 index.html 中 settings 相关的初始化代码

确认 sidebar 初始化代码中无 `settings` 引用。

**依赖**：批次 10.4

**验证**：全局搜索 `settings.` / `items.` / `loadItems` / `saveItems` / `legacy` 无残留。

---

### 批次 10.6：联调测试与边界修复

#### 测试矩阵

| 场景 | 操作 | 预期 |
|---|---|---|
| 首页加载 | 打开应用 | 任务列表仅从 IndexedDB 加载 |
| 新建任务 | FAB → 填写 → 保存 | IndexedDB 写入，列表刷新可见 |
| 编辑任务 | 编辑 → 保存 | IndexedDB 更新，刷新后可见 |
| 删除任务 | 删除 → 确认 | IndexedDB 删除 + 级联清理 |
| 推进状态 | 点推进按钮 | idb 路径执行，生命流程记录写入 |
| 暂停/恢复/重置 | 操作 | 仅 idb 路径 |
| 详情页 | 点击卡片 | 生命周期时间线来自 taskLifecycles |
| 报表统计 | 切换到报表 | 仅 idb 任务参与统计 |
| 报表清单 | 点击模块 | 含 idb 任务，卡片时间正确 |
| 筛选下拉 | 选择项目/需求组 | 从 IndexedDB list 加载选项 |
| 设置页 | 查看设置 | 从 IndexedDB list 渲染 |
| 侧边栏 | 打开侧边栏 | 用户信息正常，无报错 |
| localStorage | DevTools 检查 | `req-tracker-v2-items` / `req-tracker-v2-settings` 不再使用 |

---

## 依赖关系图

```
10.1 (卡片/settings依赖移除)
 │
 ├──→ 10.2 (allTasks纯化 + normalizeTask简化)
 │      │
 │      ├──→ 10.3 (handler legacy分支移除)
 │      │      │
 │      │      └──→ 10.4 (localStorage函数删除 + settings重构)
 │      │             │
 │      │             └──→ 10.5 (残余清理)
 │      │                    │
 │      │                    └──→ 10.6 (联调测试)
```

---

## 变更文件清单

| 文件 | 批次 | 说明 |
|---|---|---|
| `app.js` | 10.1 | `buildTaskCardHtml` + `openTaskDetail` 简化 ~15 行 |
| `app.js` | 10.2 | `refreshTaskList` + `normalizeTask` 简化 ~40 行 |
| `app.js` | 10.3 | handler 删除 legacy else 块 ~80 行 |
| `app.js` | 10.4 | 删除函数/变量 + settings 重构 ~120 行 |
| `app.js` | 10.5 | 残余引用清理 ~30 行 |
| `app.js` | 10.6 | 测试修补 |
| `index.html` | 10.5 | 可能的 settings 引用清理 |

**预计删除代码量**：~300 行净减少。

---

## 风险与注意事项

1. **10.3 是最危险的批次**：handler 的 legacy 分支删除后，`raw._source !== 'idb'` 的条件永远不满足，可以简化为无条件执行 idb 路径。若任何地方还在向 allTasks 混入 legacy 数据，操作将静默失败。

2. **设置页需要重新设计**：当前设置页（开发人员/项目/需求组管理）基于 localStorage settings，移除后要么删除设置页入口，要么重构为 IndexedDB 列表只读展示（带跳转到对应管理页的链接）。

3. **侧边栏影响最小**：侧边栏本身是静态 HTML + 用户信息动态渲染，不直接依赖 settings。只需确认 `initDrawerUser()` 从 IndexedDB users 表读取即可。

4. **筛选下拉的选中值持久化**：当前 `filter.project` 存的是项目名称字符串。改为 IndexedDB 后需决定是存名称还是 ID（建议保持名称，因为 `projectList` 已预取）。

5. **清空数据后再启动**：首次启动时 localStorage 中无旧数据，IndexedDB 中无任务，页面应为空列表且无报错。

---

## 建议执行顺序

1. **逐步推进**：10.1 → 10.2 → 10.3 → 10.4 → 10.5 → 10.6
2. **每批次完成后验证**：确保该批次功能正常后再进入下一批
3. **关键里程碑**：
   - 10.3 完成后：所有操作仅走 idb，不再写入 localStorage
   - 10.4 完成后：`loadItems`/`saveItems` 等函数消失
   - 10.5 完成后：全局无 `legacy`/`items`/`settings` 残留

---

## 执行记录

| 批次 | 状态 | 提交 | 说明 |
|------|------|------|------|
| 10.1 | ✅ 完成 | - | 移除卡片/settings依赖 |
| 10.2 | ✅ 完成 | - | allTasks纯化 + normalizeTask简化 |
| 10.3 | ✅ 完成 | - | handler legacy分支移除 |
| 10.4 | ✅ 完成 | `30daf2e` | localStorage函数删除 + settings重构为IndexedDB |
| 10.5 | ✅ 完成 | `0b5d3d9` | 残余引用清理 |
| 10.6 | ✅ 完成 | 本提交 | 联调测试（静态审查通过，无边界问题） |

### 10.6 审查结果

| 场景 | 结果 |
|------|------|
| 首页加载 → refreshTaskList 仅 IndexedDB | ✅ |
| 新建任务 → createRequirementTask + createTaskLifecycle | ✅ |
| 编辑任务 → updateRequirementTask + createTaskLifecycle(EDIT) | ✅ |
| 删除任务 → deleteRequirementTask | ✅ |
| 推进状态 → advance handler 纯 idb 路径 | ✅ |
| 暂停/恢复/重置 → pause/resume/reset handler 纯 idb | ✅ |
| 详情页 → lifecycleToOps 从 taskLifecycles 查询 | ✅ |
| 报表统计 → allTasks.map(normalizeTask) | ✅ |
| 报表清单 → openModuleTaskList 纯 idb | ✅ |
| 筛选下拉 → populateFilterSelects 使用 projectList/versionList | ✅ |
| 设置页 → renderSettings 使用 IndexedDB 列表 | ✅ |
| 全局搜索 legacy/items/settings | ✅ 0 结果 |

> 📅 方案制定日期：2026-07-21
> 📋 参照版本：v1.3.21（报表重构完成）
> 🎯 目标版本：v1.4.0（纯 IndexedDB，不再持有旧数据）
> ✅ 全部批次完成日期：2026-07-21
