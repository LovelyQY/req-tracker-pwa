# 批次 215 执行清单：首页「流程」TAB（#25）

> 目标版本：**v1.4.20** ｜ 类型：新建（中）｜ 依赖：批次 213(#23) + 批次 214(#24) 已完成
> 上游：批次 214（流程定义重设计 + 实例引擎 + 审批中心 process-instances.html）
> 下游强依赖：**215 → 216 通知角标 → 217 任务/待办挂流程**（顺序不可乱）

## 一、已确认决策（开工前提）

| 决策 | 结论 |
|---|---|
| 运行架构 | **本地优先**：首页只读 IndexedDB `process_instances` store，无需后端 |
| TAB 位置 | 插在「代办」(data-view=todo) 与「日历」(data-view=calendar) 之间，data-view=`process` |
| 三子 TAB（审批视角） | **待我审批 / 我已处理 / 已完结**（对齐 #25 原文「待处理·待审批、已处理·已审批、已完结」）；我发起的进行中实例不单列（发起中心在 process-instances.html） |
| 流程筛选器 | **实现**：顶部下拉，按「流程模板名 / 工作流名」去重筛选（含「全部」） |
| 字典分类 | **跳过**（#25 标记为可选，避免范围蔓延，留后续批次） |
| FAB 发起 | **不加** FAB；首页聚焦审批视图，发起走 process-instances.html |
| 跳转 | 列表卡片点击跳 `process-instances.html#detail?id=<实例id>`，直接定位实例详情/审批 |

## 二、需求拆解（#25 原文 → 落地项）

1. **首页 TAB 注入** — index.html `nav.tabs` 在 todo/calendar 之间加「流程」按钮（data-view=process, data-i18n=tab.process）；新增 `<div class="view" id="view-process">` 容器；加载 `process-instances.js`（app.js 之前）
2. **三子 TAB 渲染** — `app.js` 新增 `renderProcessTab()`（switchView 加 `process` 分支）：
   - 待我审批：`RT_PROCESS_INSTANCES.listByPending(me)`（当前节点 approver===me 且 RUNNING）
   - 我已处理：`RT_PROCESS_INSTANCES.listByActor(me)`（history 中 operator===me 且 action≠SUBMIT）—— **需新增该 API**
   - 已完结：`RT_PROCESS_INSTANCES.listByStatus(['APPROVED','REJECTED','WITHDRAWN'])`
3. **流程筛选器** — 顶部下拉，选项 = 全部 + 各实例 `processName`（或 `workflowName`）去重；仅过滤当前子 TAB 列表
4. **列表卡片** — 流程名 / 发起人 / 状态徽章 / 当前节点 / 更新时间；待我审批且我是当前审批人时显示「去审批」按钮
5. **i18n** — 6 语言新增 tab.process 及子 TAB / 筛选 / 空态 / 去审批 等字面量 key
6. **发版工具** — release.sh 为 index.html 登记 `process-instances.js` 升版（否则漂移自检拦截）

## 三、数据 / API（复用 Batch 214）

```js
// process-instances.js 现状 API
RT_PROCESS_INSTANCES = {
  STATUS: { RUNNING, APPROVED, REJECTED, WITHDRAWN },
  listByPending(approver),   // 待我审批（当前节点 approver === me 且 RUNNING）
  listByInitiator(account),  // 我发起
  listByStatus(status),      // 按状态（单值或数组）
  getAllInstances(),         // 全量（按 updatedAt 倒序）
  // —— 批次215 新增 ——
  listByActor(account)       // 我已处理：history 中 operator===account 且 action≠SUBMIT
}
```

实例结构（关键字段，供卡片渲染）：
- `processName` / `workflowName`（快照）
- `initiator`（发起人账号）
- `status`（RUNNING/APPROVED/REJECTED/WITHDRAWN）
- `nodes[currentNodeIdx]`（当前节点：name/status/approver）
- `updatedAt`（时间）

## 四、文件清单

| 文件 | 改动 |
|---|---|
| `plans/EXEC_PLAN_215.md` | 本清单（新建） |
| `process-instances.js` | 新增 `listByActor(account)` 并导出 |
| `index.html` | TAB 栏加流程按钮 + 新增 `view-process` 容器 + 加载 `process-instances.js` |
| `app.js` | `switchView` 加 process 分支；实现 `renderProcessTab()` |
| `i18n/{zh-CN,zh-HK,zh-TW,en,ko,ja}.js` | 新增流程 TAB 相关 ~10 key |
| `release.sh` | 为 index.html 登记 `process-instances.js` 升版 |
| `tests/test-batch215-home-process-tab.js` | 新建测试（listByActor + 静态契约 + i18n 对称性） |

## 五、实现顺序

1. `process-instances.js` 新增 `listByActor` → 导出 api
2. `index.html`：TAB 按钮 + view-process 容器 + 加载 process-instances.js
3. `app.js`：`switchView` 分支 + `renderProcessTab()`（含子 TAB 切换、筛选、卡片、跳转）
4. `i18n` 6 语言补全 key
5. `release.sh` 登记 index.html process-instances.js 升版
6. `tests/test-batch215-*.js` + 全量 `node --test`（基线 343/337/6，无新回归）
7. `release.sh 1.4.20` → 漂移自检 → 自动提交 → `git push` → `deploy-cloudbase.sh` → 验证线上 version.json=1.4.20

## 六、验收标准

- [ ] 首页 TAB 栏出现「流程」（代办与日历之间），点击切到 view-process
- [ ] 三子 TAB：待我审批 / 我已处理 / 已完结，数据分别来自 listByPending / listByActor / listByStatus
- [ ] 顶部流程筛选器可按流程模板/工作流名过滤当前子 TAB
- [ ] 卡片展示流程名/发起人/状态/当前节点/时间；待我审批显示「去审批」
- [ ] 点击卡片跳 process-instances.html#detail?id= 定位实例
- [ ] 6 语言 i18n 无悬空 key（静态扫描通过）
- [ ] 全量测试无新回归；发版漂移自检通过；线上 v1.4.20 验证
