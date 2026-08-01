# 三类报表卡片对齐首页待办卡片 — 执行清单（批次 58 起）

> 目标：让三类报表（事项 / 缺陷 / 会议）的卡片与首页「待办」卡片视觉、字段一致。
> 分两部分：
> - **批次 58**：项目卡片蓝色头部对齐任务统计模块（`.rm-project-header` ↔ `.rm-title`）
> - **批次 59-62**：点「清单」进入的 `tl-overlay` 卡片字段对齐（`buildTodoCardHtml` ↔ `buildTodoCard`），补全缺失信息、修正标题错乱
> - **批次 63**：逐字段核对自测

## 一、根因分析

### (A) 项目卡片蓝色头部不一致 —— 批次 58 修复

三类报表每个项目一张卡片（`.rm-project-card` > `.rm-project-header` 蓝底白字）。
原 `.rm-project-header` 无负边距，被包在 `.report-module` 的 `padding:16px` 内，呈现为**厚实蓝色块（一整条）**；
而任务统计模块标题 `.rm-title` 用 `margin:-16px` 拉成**全出血细条（小半个卡片蓝色）**，二者视觉不一致。

### (B) 清单卡片字段缺失 —— 批次 59-62 修复

三类报表清单卡片**共用** `report-common.js` 的 `buildTodoCardHtml(t)` 渲染（
`report-todo.js` / `report-bug.js` / `report-meeting.js` 的 `openList` 均 `sub.map(buildTodoCardHtml)`）。

当前 `buildTodoCardHtml` 的硬伤：

1. **标题永远丢失**：`var title = t.title || t.taskName || '(无标题)'`
   - 待办数据源 `allTodos` 是**原始待办记录**，标题字段是 `desc`（事项/缺陷）或 `name`（会议），
     根本没有 `title` / `taskName` → 三类清单卡片**全部显示「(无标题)」**。
   - 正确取法应参照 `app.js buildTodoCard`：`MEETING` 取 `t.name`，其余取 `t.desc`。
2. **时间语义错乱**：统一显示 `createdAt` 标「录入时间」，但待办卡片按类型显示
   事项=开始~完成、缺陷=反馈时间、会议=会议时间。
3. **字段大量缺失**：无版本、无类型色条、无开发人、无关联任务、无反馈、无会议地点。

## 二、字段差异对照（待办卡片 vs 报表清单卡片）

| 字段 | 首页待办卡片 | 报表清单卡片(现状) | 差异 |
|------|------------|------------------|------|
| 标题 | desc / name ✅ | `(无标题)` ❌ | **完全丢失（根因1）** |
| 状态标签(带色) | ✅ | ✅ | 一致 |
| 项目 | ✅ | ✅ | 一致 |
| 版本 | ✅ | ❌ | 缺 |
| 类型色条 `--type-color` | ✅ | ❌ | 缺 |
| 开发人(TASK_ITEM) | ✅ | ❌ | 缺 |
| 时间区间(TASK_ITEM) | start~complete ✅ | ❌ | 缺 |
| 关联任务(BUG) | ✅ | ❌ | 缺 |
| 反馈人+时间(BUG) | ✅ | ❌ | 缺 |
| 会议时间(MEETING) | ✅ | ❌(显示录入时间) | 语义错 |
| 会议地点(MEETING) | ✅ | ❌ | 缺 |
| 创建时间 | ✅ | 被错误时间覆盖 | — |

## 三、执行批次

### 批次 58 — 项目卡片蓝色头部对齐任务统计模块（CSS，无 JS 改动）
- [x] 根因：`.rm-project-header` 无负边距，被 `.report-module` 的 `padding:16px` 包住，呈厚实蓝色块；任务统计 `.rm-title` 为全出血细条，二者不一致
- [x] `.rm-project-header` 加 `margin:-16px -16px 12px -16px` + `border-radius:16px 16px 0 0`，改为与 `.rm-title` 同款全出血细条
- [x] `.rm-project-card` 去除多余 `border / background / border-radius`，复用 `.report-module` 容器样式（仅保留 `overflow:hidden` 与卡片间距），去除「框中框」感
- [x] 改动文件：`styles.css`
- [x] ⚠️ 注意：该修复改了 `styles.css`，但提交用 `[no-version-bump]`，故需随后续发版把报表页 `styles.css?v=` 一并提到新版本（否则 SW 仍服务旧缓存，修复不生效）

### 批次 59 — 通用骨架：标题修正 + 类型色条 + 版本 + 语义化时间
- [x] 标题取法改为：`MEETING ? (t.name||'未命名会议') : (t.desc||'无描述')`
- [x] 卡片根节点加 `style="--type-color:' + typeColor(typeCode) + '"'`（对齐待办类型色条；`typeColor` 已在 report-common 暴露）
- [x] 补齐版本：`versionNameById(t.projectVersionId)` → `<span class="tag grp">版本名</span>`
- [x] 时间改为语义化（去掉「录入时间」错标）：
  - TASK_ITEM：`fmtDateTime(startTime) ~ fmtDateTime(completeTime)`
  - BUG：`fmtDateTime(feedbackTime)`（标「反馈时间」）
  - MEETING：`fmtDateTime(meetingTime)`（标「会议时间」）
- [x] 保留：状态标签(按类型映射着色)、项目标签、无操作按钮

### 批次 60 — 事项(TASK_ITEM) 专属字段
- [x] 开发人：`userNicknamesByIds(t.relatedDevIds)` → `<span class="tag dev">开发：xxx</span>`（空则「未指派」）
- [x] 时间区间已含于批次59；此处确认标签格式「时间：start~complete」与待办一致

### 批次 61 — 缺陷(BUG) 专属字段
- [x] 关联任务名：在 `loadReportData` 结果中构建 `taskNameById` 映射（遍历已加载 `allTasks`），
      卡片内取 `taskNameById(t.relatedTaskId) || (t.relatedTaskId ? '未知任务' : '无关联')`
      → `<span class="tag proj">任务：xxx</span>`
- [x] 反馈：`[feedbackBy, fmtDateTime(feedbackTime)].filter(Boolean).join(' ')` → `<span class="tag grp">反馈：xxx</span>`

### 批次 62 — 会议(MEETING) 专属字段
- [x] 会议地点：`t.location` → `<span class="tag proj">地点：xxx</span>`（会议时间已在批次59）

### 批次 63 — 自测与视觉对齐
- [x] 三类报表各点「清单」→ 截图，与首页待办同类型卡片逐字段核对（标题/版本/开发人/关联任务/地点/时间）
- [x] `npm test` 全绿

## 四、验收标准
- 三类报表项目卡片蓝色头部为全出血细条，与任务统计模块 `.rm-title` 视觉一致（批次 58）
- 三类报表清单卡片不再出现「(无标题)」
- 字段与首页待办卡片同类型一一对应、文案/标签一致
- 仍保持「无操作按钮」（仅展示，符合原 plan 补充A）
- 因 `buildTodoCardHtml` 为共享函数，批次59起任一提交后三类报表同步生效

## 五、备注
- 批次 58 改 `styles.css`（项目卡片头部）；批次 59~62 改 `report-common.js` 的 `buildTodoCardHtml`（清单卡片内容，每批增量可独立验证）
- 样式复用现有 `task-card / task-body / task-header / task-title-row / task-title / task-meta / task-dates`，无需新增 CSS
- 每个批次提交用 `[no-version-bump]`；全部完成后统一升级发版（v1.3.44 已发，涵盖批次 58-63）
