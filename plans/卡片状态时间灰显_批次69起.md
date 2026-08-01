# 卡片新增灰色「状态时间」——批次 69 起

## 背景与目标

需求：任务事项、缺陷追踪、会议的卡片，以及统计报表的清单卡片，各**新增一条灰色显示的时间**，内容为「最新状态对应操作的操作时间」。

- 不替换现有时间行（事项 `startTime~completeTime`、会议 `meetingTime`、缺陷反馈时间、首页「创建时间」灰行保留）。
- 灰色样式复用现成 `.task-dates`（`#9ca3af` / 12px），与「创建时间」视觉一致。
- 文案：`状态时间：`。

## 数据源（已具备，无需新增脚本）

- `todoLifecycles` 表（append-only 流水，每条含 `todoId` / `statusCode` / `operationCode` / `operator` / `operateTime`）。
- `RT_TODO_LIFECYCLES` 在首页 `index.html` 与四个报表页均已加载，故不触发批次 67 的 `release.sh` 注册要求。
- 关键方法：`getByTodoId(todoId)`（按 `operateTime` 升序）、`getAllTodoLifecycles()`。

## 核心算法（批次 69 实现于 todo-lifecycles.js）

```
getStatusOpTime(todo, lifecycles):
  1) 取 statusCode === todo.statusCode 的流水记录中 operateTime 最大者
  2) 无对应流水 → 退化为全部流水中 operateTime 最大者（最近一次操作）
  3) 仍无（老数据无流水）→ 按类型回退实体时间字段：
       会议 MEETING → meetingTime
       缺陷 BUG     → feedbackTime
       事项 TASK_ITEM（及其它）→ completeTime || startTime
   调用方可在返回 null 时再退化到 createdAt
```

## 批次清单

### 批次 69 — 数据层：新增 getStatusOpTime + getAllGroupedByTodoId（改 todo-lifecycles.js，不升级）

[x] 在 `todo-lifecycles.js` 的 `api` 内新增纯函数 `statusOpTimeOf(todo, lifecycles)`（含上述回退规则），并新增 `getAllGroupedByTodoId()`（批量取流水按 todoId 分组）

[x] node 自测：当前状态对应流水取最大 operateTime；无流水回退实体时间字段

[x] 提交信息含 [no-version-bump]，推 main（已推送：aeec00d）

### 批次 70 — 报表清单卡片渲染（改 report-common.js，不升级）

[x] `loadReportData()` 中新增 `RT_TODO_LIFECYCLES.getAllGroupedByTodoId()`，构建模块级 `lifecycleMap`；为每个 todo 计算 `t.statusOpTime = RT_TODO_LIFECYCLES.statusOpTimeOf(t, map[t.id])`

[x] `buildTodoCardHtml(t)` 末尾（meta 之后）新增灰行：`<div class="task-dates">状态时间：{fmtDateTime(t.statusOpTime)}</div>`（仅当 statusOpTime 存在）

[x] 自测：报表四类清单卡片均显示灰色「状态时间」，值 = 该卡片当前状态对应流水的最近操作时间（与详情页时间线最新节点一致）

[x] 提交信息含 [no-version-bump]，推 main（已推送：81f59d9）

### 批次 71 — 首页待办卡片渲染（改 app.js，不升级）

[x] 渲染列表处（约 1437 `box.innerHTML = list.map(...buildTodoCard...)` 之前）批量取 `getAllGroupedByTodoId()` 构建 `lifecycleMap`，为每个 `t` 算 `t.statusOpTime`

[x] `buildTodoCard(t,...)` 中，在「创建时间」灰行之后追加灰行：`<div class="task-dates">状态时间：{fmtDateTime(t.statusOpTime)}</div>`（仅当存在）

[x] 确认状态操作后列表走 `renderTodoList()` 重渲染路径，灰时间随状态刷新（处理器在 finally 中 await 写生命周期后 renderTodoList）

[x] 提交信息含 [no-version-bump]，推 main（已推送：f730c27）

### 批次 72 — 自测与收尾（不升级）

[x] `node --check` 三个改动文件（todo-lifecycles.js / report-common.js / app.js）语法通过；node 单元自测 getStatusOpTime 边界（8/8 通过：当前状态对应流水取 max / 无对应流水退化全部 max / 无流水按类型回退 meetingTime·feedbackTime·completeTime·startTime / 完全无数据 null）

[x] 本地 `python3 -m http.server` 冒烟：index / report-task / report-todo / report-bug / report-meeting 均返回 200；集成校验确认插入点就位、app.js 无 `root.RT_TODO_LIFECYCLES` 残留（已改全局 `RT_TODO_LIFECYCLES`）。浏览器视觉核验（灰「状态时间」随状态刷新、会议灰行与蓝行区分）建议人工确认

[x] 提交信息含 [no-version-bump]，推 main（已推送：）

## 发版

本序列（批次 69–72）已随 **v1.3.46** 统一发版（`chore(release): v1.3.46`）。`CHANGELOG.md` 顶部 `## v1.3.46` 汇总本序列内容：四类卡片新增灰色「状态时间」= 最新状态对应操作的操作时间（取自 todoLifecycles 流水表）。三处改动文件（todo-lifecycles.js / report-common.js / app.js）的 `?v=` 引用均已由 release.sh 正确登记并随发版升级，漂移自检零 ❌。
