# 代办统计增强计划（TODO_STATS_ENHANCE_PLAN）

> 目标：让「代办」视图的统计栏在**只有 4 项时一行显示**、并**像「任务」模块那样给类型/状态上色**。
> 当前版本 `v1.3.31`，代办模块（批次 00–15）已完成；**批次 16–18 已全部实现并随 v1.3.31 发版推送到 `main`**。
> 协作约定（见 `RULES.md`）：每批次独立提交 + `./release.sh <版本> "说明"` 升版本（推 `main` 必升版本；无说明 `pre-push` 拒绝推送）。

---

## 范围确认（请先读这一段）

你提的三点，我的理解是：

1. **「只有 4 个的，一行显示」** → 代办统计栏里卡片数 = 4 的子类型（**任务事项**：总计+未处理/处理中/已完成 = 4 张；**会议**：总计+未开始/已结束/已取消 = 4 张）改成**一行 4 列**；卡片数 = 6 的（**缺陷追踪**：总计+5 状态 = 6 张）维持 **2×3**。
2. **「类型和状态与任务一样，增加颜色」** → 「类型」其实已经上色（`--type-color` 左边条 + 类型 chips 的 `--chip-color`）；**缺口在「状态」**：统计卡、状态筛选 chips、列表状态标签目前都没颜色（因为 `.tag.status-*` / `.chip[data-status=...]` 的着色规则全是按「任务」状态名硬编码的，对代办的 `TD_TODO`/`BUG_ONLINE` 等字典 code 无效）。本计划把字典里**已配好的状态 `color`** 注入这三处，写法对齐「任务」的浅底深字。
3. **「列出计划执行清单，我分批次执行」** → 下方批次 16–17 为主范围，批次 18 为可选（仅当范围含报表页时执行）。

> ⚠️ 范围边界：批次 16–17 只动**首页代办视图**（`index.html` + `app.js` + `styles.css`）。报表页 `report.html` 的「任务事项统计 / 会议统计」也各有 4 张卡，若你希望它们也一并对齐，执行批次 18。

---

## 现状锚点（已核实）

| 位置 | 当前行为 | 问题 |
|---|---|---|
| `styles.css` `.todo-stats-grid` | 写死 `grid-template-columns: repeat(3, 1fr)` | 4 张卡会折成 3+1，不是一行 |
| `app.js` `renderTodoStats()` (L1243) | 渲染「总计」+ 各状态卡，**无颜色** | 状态无着色；列数写死 |
| `app.js` `renderTodoStatusChips()` (L1144) | `<button class="chip" data-status="CODE">`，**无 `--chip-color`** | 选中态无颜色（无 `.chip[data-status=TD_TODO]` 规则） |
| `app.js` `buildTodoCard()` (L1347) | 状态标签 `<span class="tag status-CODE">`，**无 color** | 无 `.tag.status-TD_TODO` 规则 → 无底色 |
| `dictionary.js` SEED | 每个代办状态**已带 `color`**（`TD_TODO #8c8c8c`、`TD_DOING #1677ff`、`TD_DONE #52c41a`、`BUG_ONLINE #722ed1`、`MT_CANCELLED #ff4d4f`…） | 取色数据源已就绪，无需改字典 |
| `app.js` `resolveTypeColor()` (L35) | 同步 `TYPE_CODE_TO_COLOR` 查类型色 | 「类型」已上色，本计划不动 |

---

## 批次 16 —（已完成）代办统计栏动态列（4 项一行 / 6 项 2×3）

**涉及文件**：`styles.css`、 `app.js`（`renderTodoStats`）

### 改动清单

- [x] **`styles.css` `.todo-stats-grid`**：去掉写死的 3 列，改为两个修饰类（保留 `.stats-grid` 自身 4 列不动，以免影响任务模块）：
  ```css
  /* 代办统计栏：按卡片数自适应列 */
  .todo-stats-grid.is-4col { grid-template-columns: repeat(4, 1fr); }
  .todo-stats-grid.is-6col { grid-template-columns: repeat(3, 1fr); }
  ```
  > 删除原 `.todo-stats-grid { grid-template-columns: repeat(3, 1fr); }` 这一行（或保留为默认回退）。

- [x] **`app.js` `renderTodoStats()`**：渲染完 `grid.innerHTML` 后，按卡片数切列（卡片数 = `items.length + 1`，含「总计」）：
  ```js
  const cardCount = items.length + 1;          // 任务事项/会议=4；缺陷追踪=6
  grid.classList.toggle('is-4col', cardCount <= 4);
  grid.classList.toggle('is-6col', cardCount > 4);
  ```
  > 当前 `renderTodoStats` 在 L1259 `grid.innerHTML = cards;` 之后、L1260 `renderTodoVisibility();` 之前插入上述逻辑即可。

- [x] **`index.html` 容器**：确认 `#todo-stats-grid` 仍带 `class="stats-grid todo-stats-grid"`（不变）。

### 验证
- [x] 切到「任务事项」→ 4 张卡（总计/未处理/处理中/已完成）**一行 4 列**
- [x] 切到「会议」→ 4 张卡（总计/未开始/已结束/已取消）**一行 4 列**
- [x] 切到「缺陷追踪」→ 6 张卡 **2 排 × 3 个**（不变成 4 列）
- [x] 任务模块统计栏（`.stats-grid`）布局不受影响

### 发版
- [x] `git` 提交（说明含本批次要点）+ `./release.sh <版本> "说明"`（或与其他批次合并时统一升版本；单独推送且非合并则必须升版本）

---

## 批次 17 —（已完成）状态着色（仿「任务」浅底深字）

**涉及文件**：`app.js`（`renderTodoStats` / `renderTodoStatusChips` / `renderTodoList` / `buildTodoCard`）、`styles.css`

> 取色来源：`getDictByType(dictType)` 返回的 `items`/`list` 里每条都带 `color`（与 `renderTodoFormTypeChips` L1389 用 `d.color` 同口径）。**无需新增全局取色函数**。唯一例外是列表卡片 `buildTodoCard` 同步渲染，需把颜色随 `nameMap` 一起传进去。

### 改动清单

- [x] **统计卡着色** — `renderTodoStats()` 改造卡片 HTML，给状态卡注入 `--status-color`，总计卡加 `stat-total`：
  ```js
  const totalCard = '<div class="stat-card stat-total"><div class="stat-num">' + total + '</div><div class="stat-label">总计</div></div>';
  const statusCards = items.map(function (d) {
    const n = sub.filter(function (t) { return t.statusCode === d.code; }).length;
    const c = d.color || '#8c8c8c';
    return '<div class="stat-card status-colored" style="--status-color:' + c + '">' +
             '<div class="stat-num">' + n + '</div><div class="stat-label">' + (d.name || d.code) + '</div></div>';
  }).join('');
  grid.innerHTML = totalCard + statusCards;
  ```

- [x] **统计卡着色 CSS** — `styles.css` 追加（仿 `.tag.status-*` 的浅底深字思路，这里用顶部色条 + 数字同色）：
  ```css
  .todo-stats-grid .stat-card.status-colored { border-top: 3px solid var(--status-color, #1677ff); }
  .todo-stats-grid .stat-card.status-colored .stat-num { color: var(--status-color, #1677ff); }
  .todo-stats-grid .stat-card.stat-total .stat-num { color: var(--primary); }
  ```

- [x] **状态筛选 chips 着色** — `renderTodoStatusChips()` 给每个 chip 注入 `--chip-color`：
  ```js
  let html = '<button class="chip' + (todoFilter.statusCodes.length === 0 ? ' active' : '') + '" data-status="__all__">全部状态</button>';
  html += list.map(function (d) {
    const active = todoFilter.statusCodes.indexOf(d.code) >= 0 ? ' active' : '';
    const c = d.color ? ' style="--chip-color:' + d.color + '"' : '';
    return '<button class="chip' + active + '" data-status="' + d.code + '"' + c + '>' + (d.name || d.code) + '</button>';
  }).join('');
  ```
  > CSS 用**容器作用域**，避免与「任务」硬编码的 `.chip[data-status="测试中"].active` 规则冲突：
  ```css
  #todo-status-chips .chip.active { background: var(--chip-color, #1677ff); border-color: var(--chip-color, #1677ff); color: #fff; }
  ```
  > ⚠️ 不要写通用的 `.chip[data-status].active`，否则会覆盖「任务」状态 chips 的已有颜色。

- [x] **列表状态标签着色** — `renderTodoList()` 在建 `nameMap` 时同建 `colorMap`，并传给 `buildTodoCard`：
  ```js
  // renderTodoList 内（L1323 附近）
  (Array.isArray(list) ? list : []).forEach(function (d) { nameMap[d.code] = d.name || d.code; colorMap[d.code] = d.color || '#8c8c8c'; });
  ...
  box.innerHTML = list.map(function (t, i) { return buildTodoCard(t, nameMap, colorMap, extras[i]); }).join('');
  ```
  > `buildTodoCard(t, nameMap, colorMap, extras)` 改写状态标签（对齐 `app.js` L1814 任务类型标签写法 `${color}1a` 浅底 + `${color}` 深字）：
  ```js
  const statusColor = (colorMap && colorMap[t.statusCode]) || '#8c8c8c';
  const statusText = (nameMap && nameMap[t.statusCode]) || t.statusCode || '';
  ...
  '<span class="tag status-' + escapeHtml(t.statusCode || '') + '" style="background:' + statusColor + '1a;color:' + statusColor + '">' + escapeHtml(statusText) + '</span>'
  ```
  > 注意：`buildTodoCard` 签名在 `app.js` 被 L1341 调用，需同步改调用处入参（见上）。

### 验证
- [x] 代办三子类型的统计卡、状态筛选 chips、列表状态标签均按字典色着色（灰/蓝/绿/橙/紫/红等）
- [x] 「任务」模块的颜色（`.tag.status-测试中`、`.chip[data-status="测试中"]` 等）**完全不受影响**
- [x] 切换子类型时，状态色随对应字典变化（任务事项蓝绿灰、缺陷追踪多色、会议绿红灰）
- [x] 不展示 32 位系统 ID（无回归）

### 发版
- [x] `git` 提交 + `./release.sh <版本> "说明"`；`index.html` 中若 `<script src="app.js?v=…">` / `<link …styles.css?v=…">` 带 `?v=` 查询，同步抬高该值以触发缓存刷新（SW 已 `no-store`，但 HTML 引用版本号建议一并抬高）

---

## 批次 18 —（已完成）报表页「任务事项统计 / 会议统计」对齐

> 仅当你的范围包含 `report.html` 时执行。两个报表 section 各 4 张卡，当前也应一行显示并着色。

**涉及文件**：`report.js`（任务事项统计 / 会议统计的渲染函数）、`styles.css`

- [x] 这两个报表的统计卡容器设为 **4 列一行**（复用 `.is-4col` 或在 `report.js` 内联 `grid-template-columns:repeat(4,1fr)`）
- [x] 其「模块分布」按状态分块处，状态块按字典 `color` 着色（复用批次 17 的 `--status-color` 写法）
- [x] 验证：报表页任务事项/会议统计 4 卡一行且状态着色；任务统计 / 缺陷追踪统计不受影响
- [x] 发版：`git` 提交 + `./release.sh`（若改了 `report.js`/`styles.css`，`report.html` 引用版本号一并抬高）

---

## 执行顺序建议

```
批次 16（动态列：4项一行 / 6项2×3）
    ↓
批次 17（状态着色：统计卡 + 筛选chips + 列表标签）
    ↓
批次 18（可选：报表页对齐，仅当范围含 report.html）
```

> 每批次独立提交 + 升版本（遵循 `RULES.md`）。回我批次编号（如 `16`、`17`）即可触发该批次执行；我会按上面清单改代码、自测、升版本，需要推送时再用你给的令牌推到 `main`。
