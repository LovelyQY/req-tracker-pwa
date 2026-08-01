# 批次 214 执行清单：流程管理重构（#24）

> 目标版本：**v1.4.19** ｜ 类型：重构 + 新建（大）｜ 依赖：决策 1/3 已确认（同批次 213）
> 上游：批次 197（#24 基础 CRUD + 云同步，简易模型）｜ 批次 213（#23 工作流结构化节点）
> 下游强依赖：**214 → 215 首页流程 TAB → 216 通知 → 217 任务/待办挂流程**（顺序不可乱）

## 一、已确认决策（开工前提）

| 决策 | 结论 |
|---|---|
| 决策 1（运行架构） | **本地优先**：流程实例 / 审批动作全部 IndexedDB 本地实现；多角色经「切换当前用户」同设备演示。无后端 |
| 决策 3（数据模型） | **全量重设计 + 软迁移**：`processes` 改结构化（绑定工作流 + 表单模板），新增 `process_instances` 实例 store；旧记录读取时兼容转换 |
| 范围 | **全量引擎**：214 含 流程定义重设计 + 实例 store + 发起流程 + 按工作流节点驱动审批（同意/驳回/撤回/转办/加签）。首页 TAB 展示(215)/通知角标(216)留后续批次 |
| targetKey | **移除**：与 #23 移除工作流 targets 一致，流程只定义「模板 + 关联工作流」，不再挂具体报表页 |
| 流程编码 | **自动编号 `PWA+LCL+NNN`**：前缀 `PWA`+`LCL`+3 位零填充，从现有最大号 +1，只读自动填充，用户不可改 |

## 二、需求拆解（#24 原文 → 落地项）

1. **修复新增入口无反应** — 重写 `process.html` 内联脚本，确保 `openAdd→openSheet→save→crudSave→RT_PROCESSES.createProcess` 链路健壮可用
2. **自动编号 `PWA+LCL+NNN`** — 编码字段只读自动填充，从 1 递增，读现有最大号 +1
3. **移除 targetKey** — 移除「关联页面」下拉与字段；流程不再挂具体报表页
4. **表单模板可视化配置** — 定义可配置字段：`文本框 / 文本域 / 筛选框(下拉) / 多选框 / 图片 / 附件`，每字段含 标签 / 类型 / 选项(select&multiselect) / 必填 / 占位符；可增删字段
5. **流程实例引擎（按节点驱动审批）** — 发起流程时复制工作流节点为实例节点序列；当前节点审批人可对实例执行 同意/驳回/撤回/转办/加签，引擎按节点推进或终止
6. **数据模型重设计 + 软迁移**

## 三、数据模型（新）

```js
// processes store（流程定义）
{
  id:          string   // 32 位自动 ID
  code:        string   // 自动生成 PWA+LCL+001（只读，用户不可改）
  name:        string   // 1–50 位
  description: string   // 最多 200 位（可空）
  workflowId:  string   // 关联工作流 ID（外键，必填）
  formTemplate: [        // 可配置表单模板（替代原固定字段）
    { id: string, label: string, type: 'text'|'textarea'|'select'|'multiselect'|'image'|'attachment',
      options?: string[], required?: bool, placeholder?: string }
  ],
  iconKey:     string   // 列表图标（默认 'process'）
  sort:        number,  // TAB/列表排序
  enabled:     bool,    // 是否启用
  createdBy / createdAt / updatedBy / updatedAt
}
// 移除：targetKey

// process_instances store（流程实例 · NEW）
{
  id:          string
  processId:   string,  processName: string,
  workflowId:  string,  workflowName: string,
  nodes: [ { id, name, status, approver, ops[] } ], // 发起时从工作流复制
  currentNodeIdx: number,                            // 当前待处理节点下标
  status:      'RUNNING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN',
  formData:    { [fieldId]: value },                 // 表单模板填写值
  history: [ { action, operator, nodeIdx, comment, time } ],
  initiator:   string,                               // 发起人账号
  createdBy / createdAt / updatedBy / updatedAt
}
```

**实例状态（代码常量 + i18n，功能类不参与字典）**：`进行中 RUNNING / 已通过 APPROVED / 已驳回 REJECTED / 已撤回 WITHDRAWN`

**审批动作枚举**（复用 #23 节点操作集）：`提交 SUBMIT / 撤回 WITHDRAW / 同意 APPROVE / 驳回 REJECT / 转办 TRANSFER / 加签 ADDSIGN`

**软迁移**（读取时兼容旧记录）：旧 `processes`（含 `targetKey` / 旧 `code` 手动值）→
- `targetKey` 丢弃；`code` 旧手动值保留（`genNextCode` 解析时兼容旧前缀，避开冲突）
- `formTemplate` 旧记录缺省为空数组；编辑保存时按新结构写回，自然完成迁移

## 四、编号生成 `PWA+LCL+NNN`

- `genNextCode()`：读全部 processes，解析 `PWA+LCL+(\d+)` 取最大 N，返回 `PWA+LCL` + zeroPad(N+1, 3)
- 新建时自动填充 `code`（只读展示），编辑时保持原 code 不变

## 五、审批引擎（process-instances.js）

- `startInstance(processId, formData, operator)`：取流程定义 + 关联工作流，复制 `nodes` 为实例节点序列，`currentNodeIdx=0`，`status='RUNNING'`，`initiator=operator`，写历史 `SUBMIT`
- `approve(id, operator, comment)`：当前节点标记为通过，推进 `currentNodeIdx+1`；若已到末节点 → `status='APPROVED'`；写历史 `APPROVE`
- `reject(id, operator, comment)`：`status='REJECTED'`，终止；写历史 `REJECT`
- `withdraw(id, operator, comment)`：发起人撤回 → `status='WITHDRAWN'`，`currentNodeIdx=0`；写历史 `WITHDRAW`
- `transfer(id, operator, toAccount, comment)`：改当前节点 `approver=toAccount`；写历史 `TRANSFER`
- `addsign(id, operator, toAccount, comment)`：在当前节点后插入一个加签节点（approver=toAccount）；写历史 `ADDSIGN`
- 查询：`listByPending(approver)`（当前节点审批人=approver 且 RUNNING）、`listByInitiator(account)`、`listByStatus(status)`

## 六、涉及文件

| 文件 | 改动 |
|---|---|
| `processes.js` | 重设计数据模型（移除 targetKey、新增 formTemplate）、`genNextCode()`、软迁移、校验（code 系统生成、workflowId 必填） |
| `process-instances.js` | **新建** 实例 store + 审批引擎（start/approve/reject/withdraw/transfer/addsign + 查询） |
| `process.html` | 重写：编码只读自动展示；移除 targetKey；表单模板可视化配置 UI；绑定新 API；修复新增入口 |
| `process-instances.html` | **新建** 流程审批中心：发起表单（渲染模板字段）+ 待我审批/我已发起/已完结 三栏 + 审批动作面板 + 节点进度时间线 |
| `i18n/{zh-CN,zh-HK,zh-TW,en,ko,ja}.js` | 新增 process 表单模板 / 字段类型 / 实例 / 审批动作 / 实例状态 key（字面量 key 满足静态扫描） |
| `permissions-registry.js` | 新增 `page_process_instance`（view/create/approve → `op_process_instance_*`） |
| `cloud-adapter.js` | `WRITE_MAP` 新增 `RT_PROCESS_INSTANCES`（coll `process_instances`，匿名同步按用户隔离） |
| `release.sh` / `CHANGELOG.md` | 升 v1.4.19 + 条目；`release.sh` 新增 `PROCESS_INSTANCES_PAGES` 循环注册 `process-instances.html` 脚本 `?v=` |
| `tests/test-batch214-process-redesign.js` | 数据模型契约 + 自动编号 + 软迁移 + 表单模板 + 实例引擎 + i18n + UI 静态契约 |

## 七、实现顺序

1. `processes.js`：移除 targetKey、新增 formTemplate、genNextCode()、软迁移、校验调整
2. `process-instances.js`：实例 store + 审批引擎 + 查询
3. `i18n` 6 语言新增 key（表单模板/字段类型/实例/审批动作/实例状态）
4. `permissions-registry.js`：新增 `page_process_instance`
5. `cloud-adapter.js`：WRITE_MAP 新增 process_instances
6. `process.html`：编码只读 + 移除 targetKey + 表单模板配置 UI + 修复新增入口
7. `process-instances.html`：审批中心（发起 + 三栏 + 审批动作 + 时间线）
8. `release.sh`：新增 `PROCESS_INSTANCES_PAGES` 循环
9. `test-batch214-process-redesign.js` + 全量测试
10. `release.sh` 升 v1.4.19 + CHANGELOG + 发版 + 部署 CloudBase

## 八、验收标准

- [ ] 点击「+ 新增」弹出抽屉，编码自动显示 `PWA+LCL001`（空库时）
- [ ] 可增删表单模板字段；字段可设类型（6 种）、标签、选项、必填
- [ ] 保存后列表展示；编辑可改模板；删除生效；targetKey 不再出现
- [ ] 新建 `process-instances.html`：可发起流程（渲染模板字段）、待我审批/我已发起/已完结 三栏可见
- [ ] 审批动作：同意推进节点、末节点通过→已通过；驳回→已驳回；撤回→已撤回；转办/加签生效并写历史
- [ ] 旧 processes 记录（含 targetKey）打开不报错，模板为空、其余字段保留
- [ ] 6 语言 i18n 零 missing/extra key（静态扫描通过）
- [ ] 全量测试无新回归（基线 328/322/6）
- [ ] 部署后线上 version.json = 1.4.19，表单模板 UI 代码生效
