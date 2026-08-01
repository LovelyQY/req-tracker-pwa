# 代办统计着色修正计划（TODO_STATS_FIX_PLAN）

> 基于 v1.3.31 批次 16–18 落地后的用户反馈（附截图）。
> 当前版本 `v1.3.31`，本计划从**批次 19** 续接。
> 协作约定同 `RULES.md`：每批次独立提交 + 推送时按需决定是否升版本。

---

## 用户反馈（三张截图对照）

| # | 截图位置 | 问题描述 | 根因 |
|---|---|---|---|
| 1 | 首页·代办·所有子类型统计卡（任务事项/缺陷追踪/会议） | 统计卡有**顶部色条**，与任务模块（纯白底+彩色数字）不一致 | 批次 17 加了 `.status-colored { border-top: 3px solid }`（作用域为整个 `.todo-stats-grid`，覆盖全部子类型） |
| 2 | 首页·代办·缺陷追踪「已上线」 | 显示**紫色**（字典 `BUG_ONLINE #722ed1`），应与任务「已上线」**绿色**一致 | 字典 seed 里 BUG_ONLINE 配的是紫色 |
| 3 | 报表页·缺陷追踪统计 | 6 张卡数字全是**蓝色**（无状态色），任务事项/会议已有色 | 批次 18 只给 todo/meeting 加了 `setNumColor`，漏了 bug |

---

## 批次 19 —（所有待办）去掉统计卡顶部色条（只保留数字颜色）

**问题**：批次 17 给 `.status-colored` 加了 `border-top: 3px solid var(--status-color)`，该规则作用域是 `.todo-stats-grid`（首页代办视图的**全部子类型**统计卡：任务事项 / 缺陷追踪 / 会议），导致所有待办统计卡顶部都有彩色条。任务模块的统计卡是纯白底 + 彩色数字（无色条），用户要求**所有待办统计卡**对齐——去掉色条、只保留数字颜色。

**涉及文件**：`styles.css`

### 改动清单

- [ ] **删除** `.todo-stats-grid .stat-card.status-colored { border-top: 3px solid var(--status-color, #1677ff); }` 这一行
- [ ] **删除** `.todo-stats-grid .stat-card.stat-total { border-top: 3px solid transparent; }` 这一行（总计卡也不需要透明色条）
- [ ] **保留** `.stat-num { color: var(--status-color) }` 和 `.stat-total .stat-num { color: var(--primary) }`（数字颜色不变）

改后 CSS 只剩：
```css
.todo-stats-grid .stat-card.status-colored .stat-num { color: var(--status-color, #1677ff); }
.todo-stats-grid .stat-card.stat-total .stat-num { color: var(--primary); }
```

### 验证
- [ ] 任务事项统计卡（4 张）：无顶部色条，只数字有颜色
- [ ] 缺陷追踪统计卡（6 张）：无顶部色条，只数字有颜色（灰/蓝/绿/橙/紫）
- [ ] 会议统计卡（4 张）：无顶部色条，只数字有颜色
- [ ] 任务模块自身统计卡不受影响

### 发版：按需

---

## 批次 20 — 缺陷追踪"已上线"颜色对齐任务（紫色 → 绿色）

**问题**：字典 `dictionary.js` 里 `BUG_ONLINE` 的 `color` 是 `#722ed1`（紫色），而任务「已上线」用的是 CSS 变量 `--c-已上线: #389e0d`（绿色）。用户要求两者视觉一致。

**决策**：改字典 seed（全局生效——统计卡数字、列表状态标签、筛选 chips、报表状态条、报表统计卡全部统一变绿）。

**涉及文件**：`dictionary.js`

### 改动清单

- [ ] **`dictionary.js` L113**：把 `BUG_ONLINE` 的 `color` 从 `'#722ed1'` 改为 `'#389e0d'`
  ```js
  // 改前
  { type: SEED_TYPE.BUG_STATUS, code: 'BUG_ONLINE',   name: '已上线', order: 5, color: '#722ed1' },
  // 改后
  { type: SEED_TYPE.BUG_STATUS, code: 'BUG_ONLINE',   name: '已上线', order: 5, color: '#389e0d' },
  ```

### 影响范围（全部自动跟随，无需额外改动）
| 位置 | 效果 |
|---|---|
| 首页代办·缺陷追踪统计卡「已上线」数字 | 紫 → 绿 |
| 首页代办·缺陷追踪列表状态标签 | 紫 → 绿 |
| 首页代办·缺陷追踪筛选 chip 选中态 | 紫 → 绿 |
| 报表·缺陷追踪状态条「已上线」 | 紫 → 绿 |
| 报表·缺陷追踪统计卡「已上线」数字 | 紫 → 绿（批次 21 一并生效） |

### 注意事项
- 字典播种是**幂等的**（按 type\|code 去重，只补缺失 + 回填 order/color）。但已有数据库里的旧记录**不会自动回填**——如果 IndexedDB 里已经存了 `#722ed1` 的旧 color，需要用户在字典管理页手动编辑该条目触发更新，或清空数据重新播种。新安装/首次使用不受影响。
- 若不希望改字典影响历史数据，替代方案是在 `bugStatusColor()` 函数里做运行时覆盖（仅 `code === 'BUG_ONLINE'` 时返回 `'#389e0d'`），这样只影响渲染层不改存储层。**请确认用哪种方案**（默认推荐改字典）。

### 验证
- [ ] 缺陷追踪「已上线」在各处显示为绿色（与任务「已上线」 #389e0d 一致）
- [ ] 其他缺陷追踪状态色不变（未处理灰、处理中蓝、已完成绿、待开发橙）

### 发版：按需

---

## 批次 21 — 报表页缺陷追踪统计卡数字上色

**问题**：批次 18 给任务事项（`renderTodoReports`）和会议（`renderMeetingReports`）加了 `setNumColor()` 调用，但**漏了缺陷追踪**（`renderBugReports`），导致报表页缺陷追踪 6 张统计卡全是默认蓝色。

**涉及文件**：`report.js`

### 改动清单

- [ ] 在 `renderBugReports()` 的 `setBugText` 之后追加 `setNumColor` 调用（仿照批次 18 对 todo/meeting 的写法）：
  ```js
  setBugText('b-total', total);
  setBugText('b-todo', cnt('BUG_TODO'));
  setBugText('b-doing', cnt('BUG_DOING'));
  setBugText('b-done', cnt('BUG_DONE'));
  setBugText('b-waitdev', cnt('BUG_WAIT_DEV'));
  setBugText('b-online', cnt('BUG_ONLINE'));
  // 新增：统计卡数字按状态上色
  setNumColor('b-todo', bugStatusColor('BUG_TODO'));
  setNumColor('b-doing', bugStatusColor('BUG_DOING'));
  setNumColor('b-done', bugStatusColor('BUG_DONE'));
  setNumColor('b-waitdev', bugStatusColor('BUG_WAIT_DEV'));
  setNumColor('b-online', bugStatusColor('BUG_ONLINE'));
  ```

> `setNumColor()` 已在批次 18 定义（report.js L842 附近），直接复用即可。

### 验证
- [ ] 报表页·缺陷追踪统计：总缺陷(蓝色)、未处理(灰)、处理中(蓝)、已完成(绿)、待开发(橙)、已上线(绿)
- [ ] 报表页·任务事项/会议统计不受影响（已有色）
- [ ] 切换时间维度筛选后颜色保持正确

### 发版：按需

---

## 执行顺序建议

```
批次 19（去色条）
    ↓
批次 20（BUG_ONLINE 颜色对齐）
    ↓
批次 21（报表缺陷追踪统计卡上色）
    ↓
可选：统一升版 + 推送
```

三个批次可单独执行也可合并。回我编号（如 `19`、`20 21`、`19 20 21`）即触发执行。
