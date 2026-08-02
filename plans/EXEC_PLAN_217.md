# EXEC_PLAN_217 — 任务/代办挂流程（#27，v1.4.22）

## 目标
任务/代办详情可关联一个流程实例（选工作流发起），流程状态随节点流转；流程实例侧可回跳来源任务/代办。

## 设计决策（与用户确认）
- **范围**：需求任务 + 代办都做关联流程。
- **状态联动**：独立展示「流程状态」区块（流程名 + 实例状态徽章 + 当前节点 + 节点状态徽章 + 节点列表），**不覆盖**任务自身 `statusCode`（避免与 `devSubmitTime/testStartTime/...` 生命周期字段冲突）。
- **反向关联**：流程实例加 `sourceRef` 回链（`{type:'requirementTask'|'todo', id}`），可跳回来源。

## 改动清单
### 数据层
- `requirement-tasks.js`：新增 `processInstanceId` 字段 + 索引；`validateRequirementTask` 仅做长度保护；`create`/`update` 持久化；`updateRequirementTask` 重构为先取旧记录→合并→校验合并体（支持 `linkProcess` 部分更新）；导出 `linkProcess`/`unlinkProcess`。
- `todos.js`：同上（与既有 `relatedTaskId` 并存不冲突）。
- `process-instances.js`：记录新增 `sourceRef`；`normalizeInstance` 默认 `null`；新增 `linkSourceRef(id, sourceRef, operator)` 并导出。

### UI
- `app.js`（index.html）：`openTaskDetail`/`openTodoDetail` 注入关联流程区块；新增 `openLinkProcessSheet`（选工作流→`startInstance`→回写 `processInstanceId` + `sourceRef`）、`renderProcessLinkBlock`、`processNodeColor`、`handleFocusDeepLink`（从流程实例页 `?focus=task|todo&id=` 回跳）。
- `process-instances.html`：`instanceCard` 渲染 `sourceRef` 回链（复用既有 `?id=` 深链）。
- `index.html`：任务详情加 `#task-detail-process` 容器；新增 `#link-process-overlay` 弹层；补 `processes.js`/`workflows.js` 脚本（`startInstance` 依赖）。

### i18n
- 6 语言对称新增 15 个 key：`common.processStatus`/`common.noLinkedProcess`、`process.linkTitle`/`process.linkHint`/`process.sourceRef`/`process.sourceTask`/`process.sourceTodo`/`process.nodeStatus.*(5)`、`task.linkProcess`/`task.viewProcess`/`task.unlinkProcess`。实例/节点状态徽章复用既有 `process.status.*`。

### 发布
- `release.sh`：INDEX_APP 块补 `processes.js`/`workflows.js` 的 `?v=` bump。
- 全量测试 371/378 通过（7 个为预存/环境网络问题，与本次无关）；新增 `tests/test-batch217-link-process.js`（11 项全过）。
- 已部署 CloudBase，线上 `version.json` = v1.4.22。

## 演示路径
需求任务/代办详情 → 关联流程 → 选工作流发起 → 区块显示「开发→测试」节点流转；流程实例详情 → 来源 → 回跳任务/代办。
