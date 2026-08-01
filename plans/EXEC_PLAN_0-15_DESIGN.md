# 代办模块（任务事项 / BUG追踪 / 会议）设计文档

> 范围：在「任务」与「报表」中新增「代办」TAB（含任务事项 / BUG追踪 / 会议三个子类型）。
> 本文档为**分析与设计方案**，供评审；尚未执行任何代码改动。
> 设计严格遵循 `RULES.md`：32 位 `genId()` 主键、字典驱动（实体只存 code）、审计字段、IndexedDB 单一事实来源（`config.js` 已收口库名）。

---

## 一、需求理解（TAB 结构推断）

按原文「在任务和报表中，增加新TAB页」，理解为在两处各加一个「代办」入口：

- **任务视图**：新增「代办」TAB，内含 3 个子类型切换：**任务事项 / BUG追踪 / 会议**。
- **报表视图**：新增「代办」统计区（按子类型 + 状态分布计数）。

三者关系：任务事项、BUG追踪同属「代办事项」类（轻量待办，不强制归属项目）；会议为独立子类型（字段差异较大）。

> ⚠️ 放置方式待决：原文写「在任务中」，故默认作为「任务视图内的子 TAB」；也可作为与「任务/报表」并列的**顶级 TAB「代办」**（更清晰，推荐）。见第七节。

---

## 二、需求澄清清单（建议先确认，再执行）

| # | 歧义点 | 原文 | 建议 / 待确认 |
|---|---|---|---|
| Q1 | 关联开发ID（组） | 「关联开发ID（组）」 | 是**单个/多个开发人员**（沿用现有 `developerIds` 数组，存 users 表 32 位 ID），还是**一个「组/团队」实体**？现有系统无「组」实体（仅「需求组」= 项目版本）。若为团队，需先建团队实体。建议：数组存多开发人员 ID。 |
| Q2 | 会议是否同属「代办」 | 三类并列列出，但又说「任务事项和BUG追踪属于代办事项」 | 会议是否也挂在「代办」TAB 下作为子类型？建议：是，统一为「代办」模块下的 `typeCode=MEETING`。 |
| Q3 | BUG 的「关联任务ID」指向 | BUG追踪字段含「关联任务ID」 | 指向**任务事项记录**（即 `typeCode=TASK_ITEM` 的 todo）。需建外键 `relatedTaskId → todos.id`。确认。 |
| Q4 | 操作人字段存什么 | 开始人员/完成人员/转交人员/上线人员/创建人/更新人/反馈人员 | 沿用现有惯例存**账号串**（如 `createdBy`），方便展示；若需引用完整性可改存 32 位 user ID。建议：存账号串（与 `createdBy`/`lifecycle.operator` 一致）。 |
| Q5 | 是否需要项目归属 | 需求未提项目 | 代办事项/会议**不绑定项目**（比 requirementTasks 轻量）。确认无需项目维度。 |
| Q6 | BUG 的 待开发/已上线 与现有任务状态 | BUG状态含「待开发/已上线」 | 与现有 `TASK_STATUS`（待开发/已上线）**语义重叠且易混淆**。建议 BUG 状态用独立字典分类 + 独立 code 前缀（见第五节），不与 `TASK_STATUS` 混用。 |
| Q7 | 「BUG」命名与现有任务类型 | 现有 `TASK_TYPE` 含「线上BUG/普通BUG」 | 新「BUG追踪」是**缺陷流转工作流**，与任务类型里的 BUG 是两回事。建议模块名用「**缺陷追踪**」或在字典分类上明确区分，避免用户混淆。 |

---

## 三、需求设计（页面 / TAB 结构）

**任务视图内（或顶级 TAB）「代办」**
- 顶部子类型切换：`任务事项` | `BUG追踪` | `会议`（按 `typeCode` 过滤列表）。
- 列表行（不展示 32 位内部 ID，符合 RULES）：
  - 任务事项：描述 + 状态标签 + 关联开发 + 开始/完成时间
  - BUG追踪：描述 + 状态标签 + 关联任务 + 关联开发 + 反馈人/时间
  - 会议：会议名称 + 时间 + 地点 + 状态标签
- 右下角 FAB「新建」→ 按当前子类型打开对应表单（字段随类型变化）。
- 详情页：展示全部字段 + 审计（创建人/时间、更新人/时间）；BUG 额外展示流转时间线（见第四节生命周期）。

**报表视图内「代办」统计区**
- 按子类型分块：任务事项 / BUG追踪 / 会议。
- 每块内：状态分布进度条（数量 + 占比），配色取自字典 `color`（可后续补）。
- 时间筛选可复用现有 `reportFilter`（按开始/完成时间维度）。

---

## 四、数据库设计

### 方案 A（推荐）：单表 `todos` + `typeCode`

与现有 `requirementTasks`（单表 + `taskTypeCode`）同构，类型差异字段**可空**。最贴合现有架构、报表按 `typeCode` 聚合最简单。

```
todos (store, keyPath='id')
  id              string  32位（genId）            主键
  typeCode        string  必填  TODO_TYPE(TASK_ITEM/BUG/MEETING)
  statusCode      string  必填  按 typeCode 取对应状态字典
  desc            string  任务事项/BUG 的描述（必填其一；会议用 name）
  name            string  会议名称（MEETING 必填）
  relatedDevIds   array   关联开发ID（组）：users 表 32位ID 数组（multiEntry 索引）
  relatedTaskId   string  BUG 关联任务ID → todos.id（type=TASK_ITEM）外键
  feedbackBy      string  BUG 反馈人员（账号串）
  feedbackTime    number  BUG 反馈时间（时间戳）
  startTime/startBy       number/string  开始时间/开始人
  completeTime/completeBy number/string  完成时间/完成人
  handoffTime/handoffBy   number/string  BUG 转交时间/转交人
  onlineTime/onlineBy     number/string  BUG 上线时间/上线人
  meetingTime     number  会议时间
  location        string  会议地点
  minutes         string  会议纪要
  createdBy/createdAt/updatedBy/updatedAt  string/number  审计
索引: typeCode, statusCode, relatedDevIds(multiEntry), relatedTaskId,
      updatedAt, createdAt, meetingTime
```

**合理之处**：单表最小存储；`typeCode` 字典驱动；`relatedDevIds` 复用 `developerIds` 数组模式；审计字段与现有一致；32 位 ID 合规。

**需注意**：会议类型的 `desc/relatedDevIds/...` 列留空（稀疏列），可接受。

### 方案 B（备选）：三张独立表 `taskItems` / `bugs` / `meetings`

每类一张表，字段纯净。但任务事项与 BUG 高度重合（约 80% 字段相同），会产生明显重复代码，且与现有「单表 + typeCode」风格不一致。**不推荐**。

### 生命周期流水（推荐，尤其 BUG）

沿用现有 `taskLifecycles` 模式，新增 **`todoLifecycles`** 表（append-only），记录每次状态流转：

```
todoLifecycles (store, keyPath='id')
  id, todoId(FK→todos.id), statusCode, operationCode, operator, operateTime
索引: todoId, statusCode, operationCode, operator, operateTime
```

- BUG 的 转交/上线 等步骤各记一行，详情时间线直接渲染。
- 主表 `todos` 同时保留 `startTime/completeTime/handoffTime/onlineTime` 等**平铺列**作为快照（与 `requirementTasks` 的 `devSubmitTime/onlineTime` 一致），便于列表/报表快速读取。
- 删除 todo 时级联清理 `todoLifecycles`（同 `requirementTasks`→`taskLifecycles`）。

> 决策点：是否建 `todoLifecycles`？建议 BUG 必建（流转复杂）；任务事项/会议可仅用平铺列 + 审计，不强制流水。

---

## 五、字典设计

现有 `dictionary.js` 为**分类 + code + name + order + color**，只读幂等播种。新增以下分类（不改动现有分类）：

| type（分类） | code | name | order | 说明 |
|---|---|---|---|---|
| `TODO_TYPE` | TASK_ITEM | 任务事项 | 1 | — |
| `TODO_TYPE` | BUG | 缺陷追踪 | 2 | 建议名「缺陷追踪」避免与 TASK_TYPE.BUG 混淆（见 Q7） |
| `TODO_TYPE` | MEETING | 会议 | 3 | — |
| `TODO_STATUS` | TD_TODO | 未处理 | 1 | 任务事项状态（code 加 `TD_` 前缀区别于 TASK_STATUS.TODO） |
| `TODO_STATUS` | TD_DOING | 处理中 | 2 | — |
| `TODO_STATUS` | TD_DONE | 已完成 | 3 | — |
| `BUG_STATUS` | BUG_TODO | 未处理 | 1 | code 加 `BUG_` 前缀，避免与 TASK_STATUS 混淆（Q6） |
| `BUG_STATUS` | BUG_DOING | 处理中 | 2 | — |
| `BUG_STATUS` | BUG_DONE | 已完成 | 3 | — |
| `BUG_STATUS` | BUG_WAIT_DEV | 待开发 | 4 | 不与 TASK_STATUS 混用 |
| `BUG_STATUS` | BUG_ONLINE | 已上线 | 5 | 不与 TASK_STATUS 混用 |
| `MEETING_STATUS` | MT_NOT_STARTED | 未开始 | 1 | — |
| `MEETING_STATUS` | MT_ENDED | 已结束 | 2 | — |
| `MEETING_STATUS` | MT_CANCELLED | 已取消 | 3 | — |

**合理之处**：完全复用现有字典机制；新分类独立，不污染 `TASK_STATUS`/`TASK_TYPE`；`order` 固定展示顺序；code 前缀避免跨分类撞名。

**需修正（原文风险）**：
- 原文 BUG 状态直接写「待开发/已上线」，与现有 `TASK_STATUS` 的「待开发/已上线」语义不同却同名 → 用 `BUG_` 前缀区分（Q6）。
- 原文「BUG追踪」与任务类型「线上BUG/普通BUG」易混 → 模块统称「缺陷追踪」或在 UI 明确区分（Q7）。

---

## 六、合理性结论

**总体合理**：需求与现有架构（字典驱动、32 位 ID、typeCode 单表、审计、IndexedDB 单一库）高度契合，可直接落地。

**执行前须修正/确认的点**：
1. 字典 code 命名冲突（BUG/待开发/已上线 与现有 TASK_STATUS/TASK_TYPE）→ 用前缀 + 改名解决（第五节）。
2. 「关联开发ID（组）」语义（Q1）→ 默认按多开发人员 ID 数组实现，若指「团队」需先建团队实体。
3. 操作人存账号串还是 user ID（Q4）→ 默认账号串（与现状一致）。
4. 是否建 `todoLifecycles` 流水表（第四节）→ 建议 BUG 建。
5. 会议是否归入「代办」TAB（Q2）→ 默认是。

---

## 七、可执行方案（分阶段，待评审通过后执行）

> 每阶段独立成提交；涉及 `main` 推送按 `RULES.md` 用 `./release.sh` 升版本（已强制带更新日志说明）。

**阶段 0 — 澄清**：就第二节 Q1~Q7 与需求方确认（尤其 Q1 关联开发「组」、Q6/Q7 命名）。

**阶段 1 — 字典**：`dictionary.js` 增加 `TODO_TYPE`/`TODO_STATUS`/`BUG_STATUS`/`MEETING_STATUS` 四类种子（含 order/前缀 code）。

**阶段 2 — 数据层**：
- 新增 `todos.js`：`registerStore` + 校验（格式/必填）+ 字典 code 校验 + 外键校验（relatedDevIds→users、relatedTaskId→todos）+ CRUD + `getAll`/`getById`。
- （可选）新增 `todo-lifecycles.js`：BUG 流转流水，级联删除。

**阶段 3 — UI（任务视图）**：
- 新增/复用「代办」TAB（顶级或子 TAB），3 子类型切换。
- 列表 + 新建/编辑表单（字段随 `typeCode` 动态显隐）+ 详情页（含 BUG 流转时间线）。
- 遵守 RULES：不展示 32 位 ID、返回栈 `navTo`/`goBack`、去点击蓝框、`genId()` 主键。

**阶段 4 — UI（报表视图）**：新增「代办」统计区，按子类型 + 状态分布；复用 `reportFilter` 时间维度。

**阶段 5 — 收尾**：`DB_SCHEMA.md` 补 `todos`/`todoLifecycles` 结构说明；`index.html` 注入新脚本（带 `?v=` 缓存破坏，release.sh 已支持）；发版。

---

## 八、风险与待决项

- **术语混淆**（最高优先）：BUG / 待开发 / 已上线 与现有任务体系撞名，必须在字典 code 与 UI 文案上隔离。
- **「组」实体缺失**：若「关联开发ID（组）」确指团队，需先设计团队/组实体（超出本模块，建议单列需求）。
- **稀疏列**：单表方案下会议类型多数字段为空，属可接受权衡；若未来会议字段大幅扩张，可再拆表。
- **生命周期范围**：任务事项/会议是否也需要流水审计，影响 `todoLifecycles` 的适用范围。
