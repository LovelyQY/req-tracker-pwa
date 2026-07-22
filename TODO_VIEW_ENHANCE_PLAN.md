# 代办视图增强方案

> 状态：待执行。每批次独立提交 + `./release.sh <版本> "说明"` 升版本。

---

## 背景与现状

当前代办页（`index.html` + `app.js`）已实现：
- 子类型切换（任务事项 / 缺陷追踪 / 会议）
- 状态 chips 动态渲染（按子类型取 TODO_STATUS / BUG_STATUS / MEETING_STATUS）
- 项目 / 版本下拉联动
- 统计栏 `renderTodoStats()` 按状态计数

待改进点：
1. **统计缺少「总计」卡片**：目前只展示各状态数量，没有当前子类型的总代办数。
2. **布局为 4 列**：`styles.css` 中 `.stats-grid` 固定 `grid-template-columns: repeat(4, 1fr)`。
   - 任务事项 3 状态 → 3 张状态卡（排 1 行）
   - 缺陷追踪 5 状态 → 5 张状态卡（排成 4+1，第二行仅 1 张）
   - 增加「总计」后，缺陷追踪将达到 6 张卡，4 列会排成 4+2，不符合「6 个两排、上下各三个」的预期。
3. **缺少隐藏/显示统计与筛选**：任务页已有 `隐藏统计` / `隐藏筛选` 按钮及 `uiState` 持久化，代办页没有对应功能。

---

## 目标

- 代办统计栏增加「总计」卡片，且始终放在第一位。
- 代办统计栏改为 **3 列布局**，使 6 张卡时自然呈现 **2 排 × 3 个**。
- 代办页增加与任务页同款的 **隐藏/显示统计**、**隐藏/显示筛选** 按钮，状态持久化到 `localStorage`。

---

## 批次 14 — 代办统计栏：总计卡片 + 3 列布局

**涉及文件**：`index.html`、`app.js`、`styles.css`

### 改动清单

- [ ] **`app.js` `renderTodoStats()`**：在状态卡片之前插入「总计」卡片。
  - 计算当前 `currentTodoType` 的总数 `total = sub.length`。
  - 渲染 HTML：`<div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">总计</div></div>` + 原有各状态卡片。
- [ ] **`index.html`**：给 `#todo-stats-grid` 增加专属 class `todo-stats-grid`，避免影响任务页统计布局。
  ```html
  <div class="stats-grid todo-stats-grid" id="todo-stats-grid"></div>
  ```
- [ ] **`styles.css`**：新增代办统计 3 列规则。
  ```css
  .todo-stats-grid { grid-template-columns: repeat(3, 1fr); }
  ```
- [ ] **验证**：
  - 任务事项（3 状态）+ 总计 = 4 张卡 → 第 1 行 3 张，第 2 行 1 张。
  - 缺陷追踪（5 状态）+ 总计 = 6 张卡 → 第 1 行 3 张，第 2 行 3 张。
  - 会议（3 状态）+ 总计 = 4 张卡 → 第 1 行 3 张，第 2 行 1 张。
- [ ] **发版**：`./release.sh <版本> "代办统计栏增加总计卡片并改为3列布局"`

---

## 批次 15 — 代办页：隐藏/显示统计与筛选

**涉及文件**：`index.html`、`app.js`

### 改动清单

- [ ] **`app.js` `DEFAULT_UI_STATE`**：扩展两项状态开关。
  ```javascript
  const DEFAULT_UI_STATE = { showStats: true, showFilters: true, todoShowStats: true, todoShowFilters: true };
  ```
  - 说明：`loadUIState()` 使用 `{ ...DEFAULT_UI_STATE, ...JSON.parse(raw) }`，旧本地记录会自动补齐默认值，兼容已有用户。
- [ ] **`index.html` 代办 section-header**：在「代办」标题右侧增加操作按钮（与任务页同款 `section-actions`）。
  ```html
  <div class="section-header">
    <h2 class="section-title">代办</h2>
    <div class="section-actions">
      <button class="link" id="btn-todo-toggle-stats" type="button">隐藏统计</button>
      <button class="link" id="btn-todo-toggle-filters" type="button">隐藏筛选</button>
    </div>
  </div>
  ```
- [ ] **`app.js` 新增函数**：
  - `toggleTodoStats()`：切换 `uiState.todoShowStats`，持久化，调用 `renderTodoStats()`。
  - `toggleTodoFilters()`：切换 `uiState.todoShowFilters`，持久化，调用 `renderTodoFiltersVisibility()`（或直接在 `renderTodoStats` 中处理筛选卡显隐）。
- [ ] **`app.js` `renderTodoStats()`**：在渲染卡片后，根据 `uiState.todoShowStats` 显隐 `#todo-stats-bar`，并同步 `#btn-todo-toggle-stats` 文案。
  ```javascript
  if (bar) bar.classList.toggle('hidden', !uiState.todoShowStats);
  if (btnStats) btnStats.textContent = uiState.todoShowStats ? '隐藏统计' : '显示统计';
  ```
- [ ] **`app.js` 新增/修改筛选栏显隐函数**：
  - 新增 `renderTodoFiltersVisibility()`：根据 `uiState.todoShowFilters` 显隐 `#todo-filter-card`，并同步 `#btn-todo-toggle-filters` 文案。
  - 说明：搜索栏 `.search-bar` 保持常驻（与任务页一致），仅隐藏筛选卡。
- [ ] **`app.js` `initTodoView()` / `bindTodoFilters()`**：在代办视图初始化时绑定两个按钮点击事件。
  ```javascript
  document.getElementById('btn-todo-toggle-stats').addEventListener('click', toggleTodoStats);
  document.getElementById('btn-todo-toggle-filters').addEventListener('click', toggleTodoFilters);
  ```
  - 注意：按钮元素在 `#view-todo` 内，需在 `initTodoView()` 首次切换时绑定一次即可，避免重复绑定。
- [ ] **验证**：
  - 点击「隐藏统计」→ `#todo-stats-bar` 隐藏，按钮文案变为「显示统计」。
  - 点击「显示统计」→ 统计栏恢复，文案变回「隐藏统计」。
  - 点击「隐藏筛选」→ `#todo-filter-card` 隐藏，按钮文案变为「显示筛选」。
  - 点击「显示筛选」→ 筛选卡恢复。
  - 刷新页面后，上次设置的显隐状态保持。
- [ ] **发版**：`./release.sh <版本> "代办页增加隐藏/显示统计与筛选按钮"`

---

## 执行顺序

```
批次 14（统计总计 + 3 列布局）
    ↓
批次 15（隐藏/显示统计与筛选）
```

---

## 设计要点

- **不改动任务页**：所有新增 CSS 类、UI 状态键均带 `todo` 前缀，避免与任务页 `stats-grid`、`showStats/showFilters` 冲突。
- **本地状态兼容**：扩展 `DEFAULT_UI_STATE` 即可，旧用户的 `localStorage` 记录无需迁移。
- **「总计」口径**：按当前选中的子类型（`currentTodoType`）计数，与筛选条件无关，反映「该类型下全部代办数」。
- **布局响应式**：3 列布局在手机端（小屏）仍由现有 `@media (max-width: 360px)` 的 `gap` / 字体规则适配，无需额外改动。
