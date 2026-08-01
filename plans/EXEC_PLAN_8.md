# 报表页面重构方案

> 参照 v1.3.20「任务卡重构」流程（批次 8.1–8.5），对报表模块中残留的 legacy-only 路径进行 IndexedDB 双源适配和 bug 修复。

---

## 现状问题矩阵

| # | 位置 | 问题 | 严重度 | 对应批次 |
|---|------|------|--------|----------|
| 1 | `openModuleTaskList` L1920 | **double-normalize bug**：`sub` 已通过 `allTasks.map(normalizeTask)` 归一化，但 `buildTaskCardHtml(normalizeTask(it), false)` 又调了一次 normalizeTask。idb 任务第二次 normalizeTask 时从 `it.devSubmitTime`（已归一化对象上不存在）重建 `dates`，导致 `dates` 被全部清为 null → 卡片时间退化回「录入时间」 | 🔴 严重 | 9.1 |
| 2 | `toggleStats` L3237 | `renderStats(items)` 传 raw `items`（仅 legacy），切换统计显隐后 idb 任务计数丢失 | 🟡 中等 | 9.1 |
| 3 | `toggleFilters` L3243 | 同上，`renderStats(items)` 仅 legacy | 🟡 中等 | 9.1 |
| 4 | `normalizeTask` legacy 分支 | 未显式设置 `typeCode`，依赖 `migrateItemTypeCodes()` 预先在 raw items 上注入。若迁移未执行则 `typeRows` 过滤全空 | 🟢 低 | 9.2 |
| 5 | `formatTaskDates` L1657 | 定义后从未调用，死代码 | 🟢 低 | 9.2 |
| 6 | `taskWorkHours` L1963 | 8.3 已将 idb 暂停事件按空数组处理，但仍读取 `it.dates.started`（8.1 已构建）。确认正常 | ✅ | — |

---

## 批次规划

### 批次 9.1：double-normalize 修复 + stats 数据源修复（核心）

#### 9.1.1 修复 `openModuleTaskList` — 移除冗余 normalizeTask 调用

```javascript
// 改前（L1920）
? sub.sort((a, b) => b.createdAt - a.createdAt).map((it) => buildTaskCardHtml(normalizeTask(it), false)).join('')

// 改后 — it 已经是 normalizeTask 输出，移除冗余调用
? sub.sort((a, b) => b.createdAt - a.createdAt).map((it) => buildTaskCardHtml(it, false)).join('')
```

**说明**：`sub` 来自 `allTasks.map(normalizeTask).filter(...)`，元素已包含 `_source`、`typeCode`、`title`、`statusText`、`dates` 等 `buildTaskCardHtml` 所需的全部字段。移除冗余调用即可。

#### 9.1.2 修复 `toggleStats` — 改用 normalizeTask 数据

```javascript
// 改前
function toggleStats() {
  uiState.showStats = !uiState.showStats;
  saveUIState();
  renderStats(items);
}

// 改后
function toggleStats() {
  uiState.showStats = !uiState.showStats;
  saveUIState();
  renderStats(allTasks.map(normalizeTask));
}
```

#### 9.1.3 修复 `toggleFilters` — 同上

```javascript
// 改前
function toggleFilters() {
  uiState.showFilters = !uiState.showFilters;
  saveUIState();
  renderStats(items);
}

// 改后
function toggleFilters() {
  uiState.showFilters = !uiState.showFilters;
  saveUIState();
  renderStats(allTasks.map(normalizeTask));
}
```

**依赖**：无

**验证**：
- 报表 → 点击「已进入测试」→ 任务清单中 idb 任务卡片时间正确显示阶段时间
- 首页 → 点击「隐藏统计」→ 再点「显示统计」→ 统计数包含 idb 任务

---

### 批次 9.2：legacy normalizeTask 显式设置 typeCode + 死代码清理

**根因**：legacy `normalizeTask` 分支依赖 `migrateItemTypeCodes()` 预先在 raw items 上注入 `typeCode`。若迁移因任何原因未执行，`typeRows`（`i.typeCode === t.code`）将全部不匹配。

#### 9.2.1 修改 `normalizeTask` legacy 分支 — 显式设置 typeCode

```javascript
// normalizeTask legacy 分支中追加 typeCode
return Object.assign({}, t, {
  _source: 'legacy',
  title: t.title,
  desc: t.desc,
  typeCode: t.typeCode || legacyTypeToCode(t.type),  // 新增
  ...
});
```

> ⚠️ 需要新增 `legacyTypeToCode()` 工具函数，与已有的 `legacyStatusToCode` / `legacyPriorityToCode` 模式一致。

```javascript
// 在 legacyStatusToCode / legacyPriorityToCode 附近新增
var LEGACY_TYPE_MAP = { '需求': 'REQ', '线上BUG': 'ONLINE_BUG', '普通BUG': 'COMMON_BUG' };
function legacyTypeToCode(s) { return LEGACY_TYPE_MAP[s] || 'REQ'; }
```

#### 9.2.2 移除死代码 `formatTaskDates`

```javascript
// 删除 L1657 的 formatTaskDates 定义（整个函数未被任何地方调用）
```

**依赖**：批次 9.1

**验证**：
- 报表图表中 legacy 任务在类型分布条中出现（不因缺 typeCode 而遗漏）
- `formatTaskDates` 删除后无引用报错

---

### 批次 9.3：联调测试与边界修复

**范围**：端到端回归 + 代码审查。

#### 测试矩阵

| 场景 | 操作 | 预期 |
|------|------|------|
| 报表统计 | 切换到报表视图 | 总数含 idb + legacy |
| 报表图表 | 查看类型/状态分布条 | idb 任务正确分类 |
| 报表模块按钮 | 点「已进入测试」「未进入测试」 | 任务清单含 idb 任务 |
| 任务清单卡片 | 查看清单中 idb 任务卡片时间 | 显示正确阶段时间（非「录入时间」） |
| 统计显隐 | 首页点「隐藏统计」再「显示统计」 | 统计数含 idb 任务 |
| 报表筛选 | 切换年份/季度/月份 | idb 任务按时间筛选正确 |
| 报表工时 | 查看工时统计 | idb 任务有非零工时 |
| 报表 PDF | 点「导出 PDF」 | 打印预览中统计数据正确 |
| legacy 退行 | 查看 legacy 任务报表 | 与之前一致，无变化 |

---

## 依赖关系图

```
9.1 (double-normalize + stats)
 │
 ├──→ 9.2 (legacy typeCode + 死代码清理)
 │
 └──→ 9.3 (联调测试)
```

---

## 变更文件清单

| 文件 | 批次 | 改动量 |
|------|------|--------|
| `app.js` | 9.1 | 3 处改动（`openModuleTaskList`、`toggleStats`、`toggleFilters`）— ~5 行 |
| `app.js` | 9.2 | `normalizeTask` legacy +1 行、新增 `legacyTypeToCode` +3 行、删除 `formatTaskDates` −17 行 |
| `app.js` | 9.3 | 视测试结果修补 |

---

## 风险与注意事项

1. **9.1 的 double-normalize 修复是阻断性 bug**：影响 idb 任务在报表清单中的卡片时间展示（始终显示「录入时间」）。修复后 `buildTaskCardHtml` 直接使用已归一化的 `sub` 元素，需确认 `sub` 中所有 `buildTaskCardHtml` 所需的字段（`_source`、`title`、`typeCode`、`statusText`、`dates`、`projectName`、`versionName`、`developerNames`、`images`、`attachments` 等）均已由 normalizeTask 提供。

2. **9.2 的 `legacyTypeToCode` 映射表**：需覆盖所有可能的 legacy 中文类型名（当前为「需求」「线上BUG」「普通BUG」三种），与 `TYPE_NAME_TO_CODE` 保持一致。

3. **`renderStats` 传入 `allTasks.map(normalizeTask)` 的代价**：每次 toggle 都重新 normalize，复杂度 O(n)。对于任务总数 < 1000 的场景可接受；若后续量级增长可加缓存。

---

## 建议执行顺序

1. **逐步推进**：9.1 → 9.2 → 9.3
2. **每批次完成后验证**：确保功能正常后再进入下一批
3. **关键里程碑**：
   - 9.1 完成后：报表清单中 idb 任务卡片时间正确，统计显隐含 idb

---

> 📅 方案制定日期：2026-07-21
> 📋 参照版本：v1.3.20（任务卡重构完成）
> 🎯 目标版本：v1.3.21（报表重构）
