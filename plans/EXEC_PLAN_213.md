# 批次 213 执行清单：工作流管理重构（#23）

> 目标版本：**v1.4.18** ｜ 类型：重构 + 新建（大）｜ 依赖：需先确认决策 1/3（已确认）
> 上游：批次 196（#23 基础 CRUD + 云同步）已落地，但创建入口待修复、模型为简易文本模型
> 下游强依赖：213 → 214 流程实例 → 215 首页流程 TAB → 216 通知 → 217 任务/待办挂流程（顺序不可乱）

## 一、已确认决策（开工前提）

| 决策 | 结论 |
|---|---|
| 决策 1（运行架构） | **本地优先**：审批流转 / 通知全部 IndexedDB 本地实现，应用内红点/角标；多角色经「切换当前用户」同设备演示。无后端 |
| 决策 3（数据模型） | **全量重设计 + 软迁移**：`nodes` 改结构化数组 `[{id,name,status,approver,ops[]}]`，移除 `transitions`/`targets`；旧记录读取时兼容转换 |
| 关联对象 | **移除 `targets`**：工作流只定义流程本身（节点/状态/审批人/操作集），不绑定业务对象类型 |

## 二、需求拆解（#23 原文 → 落地项）

1. **修复创建入口无反应** — 运行时验证 `openAdd→openSheet→save→crudSave→RT_WORKFLOWS.createWorkflow` 链路，定位根因并修复
2. **自动编号 `PWA+GZL+NNN`** — 前缀 `PWA`+`GZL`+3 位零填充序号，从 1 递增，读现有最大号 +1；编码字段只读自动填充，用户不可改
3. **不关联业务对象** — 移除 `targets` 多选 UI 与字段
4. **节点/规则可视化重构（弃 `->` 文本）** — 列表式节点名 + 流转规则文本 → 可视化节点卡片，可增删节点、设节点状态/审批人/可用操作集
5. **结构化节点**：每个节点 `{ id, name, status, approver, ops[] }`
   - `status`：节点状态，字典驱动（新建 `WF_NODE_STATUS`）
   - `approver`：审批人，选自用户目录（`getAllUsers()`）
   - `ops[]`：该节点可用操作，枚举 提交/撤回/同意/驳回/转办/加签
6. **数据模型重设计**（决策 3）：结构化节点 + 软迁移

## 三、数据模型（新）

```js
// workflows store 记录结构
{
  id:          string   // 32 位自动 ID
  code:        string   // 自动生成 PWA+GZL+001（只读，用户不可改）
  name:        string   // 1–50 位
  description: string   // 最多 200 位（可空）
  nodes: [               // 结构化节点（替代旧 nodes[] 名列表 + transitions[] 文本）
    { id: string, name: string, status: string, approver: string, ops: string[] }
  ],
  createdBy / createdAt / updatedBy / updatedAt  // 审计字段
}
// 移除：targets[], transitions[]
```

**节点状态字典 `WF_NODE_STATUS`**（类似 CLOCK_STATUS）：种子 `未开始 / 进行中 / 已完成 / 已驳回 / 已撤回`
**节点操作枚举**（固定，i18n 标签）：`提交 / 撤回 / 同意 / 驳回 / 转办 / 加签`

**软迁移**（读取时兼容旧记录）：旧 `nodes: string[]` + `transitions` + `targets` →
- `nodes` 每项映射为 `{ id: genId(), name: 原节点名, status: '未开始', approver: '', ops: [] }`
- 丢弃 `transitions`/`targets`（不再展示）
- 编辑保存时按新结构写回，自然完成迁移

## 四、编号生成 `PWA+GZL+NNN`

- `genNextCode()`：读全部 workflows，解析 `PWA+GZL+(\d+)` 取最大 N，返回 `PWA+GZL` + zeroPad(N+1, 3)
- 新建时自动填充 `code`（只读展示），编辑时保持原 code 不变
- 符合"从 1 递增、读现有最大号 +1"

## 五、涉及文件

| 文件 | 改动 |
|---|---|
| `workflows.js` | 重设计数据模型（结构化 nodes）、`genNextCode()`、软迁移、校验调整（code 不再必填用户输入，由系统生成） |
| `workflow.html` | 编码只读自动展示；移除 targets/transitions 文本区；节点可视化卡片编辑（增删/状态/审批人/操作集）；绑定新 API |
| `i18n/{zh-CN,zh-HK,zh-TW,en,ko,ja}.js` | 新增 workflow 节点状态/审批人/操作集 key |
| `dictionary` 数据/初始化 | 新增 `WF_NODE_STATUS` 字典种子（类似 CLOCK_STATUS 注册方式） |
| `tests/test-batch213-workflow-redesign.js` | 数据模型契约 + 编号生成 + 软迁移 + UI 静态契约 |
| `release.sh` / `CHANGELOG.md` | 升 v1.4.18 + 条目 |

## 六、实现顺序

1. `workflows.js`：结构化节点 + `genNextCode()` + 软迁移 + 校验（code 系统生成）
2. `i18n` 6 语言新增 key（节点状态/审批人/操作集）
3. `WF_NODE_STATUS` 字典种子 + 注册
4. `workflow.html`：编码只读 + 节点可视化编辑重构 + 绑定新 API
5. 排查并修复创建入口无反应（重写内联脚本更健壮，浏览器/逻辑验证）
6. `test-batch213-workflow-redesign.js` + 全量测试
7. `release.sh` 升 v1.4.18 + CHANGELOG + 发版
8. 部署 CloudBase + 验证（version.json + 线上节点 UI 代码）

## 七、验收标准

- [ ] 点击「+ 新增」弹出抽屉，编码自动显示 `PWAGZL001`（空库时）
- [ ] 可增删节点卡片；每节点可设状态（WF_NODE_STATUS 下拉）、审批人（用户下拉）、操作集（6 项多选）
- [ ] 保存后列表按节点卡片展示；编辑可改节点；删除生效
- [ ] 旧 workflows 记录（如有）打开不报错，节点名保留、状态默认、审批人/操作集空
- [ ] 6 语言 i18n 零 missing/extra key
- [ ] 全量测试无新回归（基线 320/314/6）
- [ ] 部署后线上 version.json = 1.4.18，节点 UI 代码生效
