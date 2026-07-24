# 代办模块 — 最终可执行方案 v2

> 状态：已整合全部需求评审，可直接执行。设计严格遵循 `RULES.md`。
> 本文件可保存、可版本化；执行时按阶段推进，每阶段独立提交 + 升版本 + 更新日志。

---

## 零、最终确认的需求要点

| 要点 | 确认结果 |
|---|---|
| TAB 结构 | 首页两个顶级 TAB：**任务** \| **代办**（原「报表」TAB 去掉，迁入独立统计页） |
| 关联开发ID（组） | `relatedDevIds` 数组，存 `users` 表 32 位 ID，支持多个 |
| 项目归属 | 需要 `projectId` + `projectVersionId`（可选），与 `requirementTasks` 同模 |
| BUG 关联任务ID | 指向**任务 TAB 现有任务**（`requirementTasks.id`）——先期反馈 → 后产生修复任务 |
| 操作人字段 | 存**账号串** |
| 会议名称 | `name` 是**会议专属**字段，不是通用字段 |
| 备注字段 | 三类型均增 `remark`（选填，0–500 位） |
| 统计入口 | **侧边栏**基础数据与存储备份之间，新增「统计报表」→ 独立页面 `report.html` |
| 统计页面 | 4 项模块列表，每个统计视图仅含**时间维度筛选 + 导出 PDF**（与现有报表一致） |
| 命名隔离 | BUG 状态用 `BUG_` 前缀；模块统称「缺陷追踪」；字典分类独立 |

---

## 一、评估：首页「报表」TAB 去留

### 现状

首页现有两个顶级 TAB：`任务` / `报表`。报表是内嵌在首页的一个视图，含任务统计卡 + 已进入/未进入测试模块分布。

### 新需求

统计改为独立页面，侧边栏入口进入。你给出的 5 项中第 1 项是「任务统计报表」，即**原有首页报表的数据迁移到新页面**。

### 评估结论：**去掉首页「报表」TAB，统一到独立统计页**

理由：
- 双入口（首页报表 TAB + 侧边栏统计页）会导致用户困惑、数据口径不一、维护双份代码。
- 独立页面（`report.html`）风格与 `basic-data.html` 一致，侧边栏集中入口，符合现有信息架构。
- 首页只保留 `任务` / `代办` 两个 TAB，更简洁。
- 原首页报表代码（`renderReports` 等约 400 行）可整体迁入 `report.html` 自包含脚本，而非继续留在 `app.js` 里做双份维护。

> 你提到「原有的报表可继续展示任务的，或者去掉」——**建议去掉首页报表 TAB，全部迁到独立统计页**。若你倾向保留首页报表 TAB，请在评审时标注，我可改回双入口方案（不推荐）。

---

## 二、TAB 结构（最终版）

**首页**：
```
┌────────────────────────────────────────────┐
│  任务  │  代办                               │  ← 顶级 TAB
└────────────────────────────────────────────┘
         │
         ├─ [任务事项] [缺陷追踪] [会议]        ← 代办内子类型切换
         ├─ 列表（按子类型过滤，不展示 32 位 ID）
         ├─ FAB「新建」（表单随 typeCode 动态字段）
         └─ 详情页（含 BUG 流转时间线）
```

**侧边栏**（在基础数据与存储备份之间插入）：
```
个人信息 →
账号与安全 →
基础数据 →
统计报表 →    ← 新增，进入 report.html
存储与备份 →
关于 →
退出登录
```

**统计报表独立页**（`report.html`，同 `basic-data.html` 风格）：
```
┌──────────────────────────────────────┐
│  ← 统计报表                          │  ← 顶部导航栏
├──────────────────────────────────────┤
│  任务统计报表       →                 │
│  任务事项统计报表   →                 │
│  缺陷追踪统计报表   →                 │  ← 4 项模块列表（白底卡片，每行右侧箭头）
│  会议统计报表       →                 │
└──────────────────────────────────────┘
```

- 4 项模块行，每行点击展开/跳转对应统计视图。
- 页面自包含脚本 `report.js`，通过 `navTo`/`goBack` 进出。

---

## 三、数据库设计（最终版）

### 3.1 IndexedDB 建表确认

**是，`todos` 和 `todoLifecycles` 两张表都建在 `req-tracker` 库。**

- 通过 `db.js` 的 `registerStore` 机制建表（与 `requirementTasks` / `taskLifecycles` 完全同模）。
- 首次加载任一新模块脚本即自动建出 store + 索引，无需手动迁移。
- 库名收口于 `config.js`（已收口完成），无需额外改动。

### 3.2 单表 `todos`（store: `todos`）

```
┌────────────────────┬─────────┬──────────────────────────────────────┐
│ 字段               │ 类型    │ 说明                                 │
├────────────────────┼─────────┼──────────────────────────────────────┤
│ id                 │ string  │ 32 位主键（RT_DB.genId()）           │
│ typeCode           │ string  │ TODO_TYPE: TASK_ITEM/BUG/MEETING     │
│ statusCode         │ string  │ 按 typeCode 取对应状态字典            │
│                    │         │                                      │
│ ── 任务事项 / 缺陷追踪 共用 ──                                    │
│ desc               │ string  │ 任务描述 / BUG 描述（1–500，必填）    │
│                    │         │                                      │
│ ── 会议专属 ──                                                     │
│ name               │ string  │ 会议名称（MEETING 必填，1–100）      │
│ meetingTime        │ number  │ 会议时间（时间戳）                    │
│ location           │ string  │ 会议地点（选填，0–100）               │
│ minutes            │ string  │ 会议纪要（选填，0–2000）              │
│                    │         │                                      │
│ ── 缺陷追踪 专属 ──                                                │
│ feedbackBy         │ string  │ 反馈人员（账号串）                    │
│ feedbackTime       │ number  │ 反馈时间（时间戳）                    │
│ relatedTaskId      │ string  │ 关联任务 ID（FK→requirementTasks.id） │
│ handoffTime/       │ num/str │ 转交时间 / 转交人                    │
│   handoffBy        │         │                                      │
│ onlineTime/        │ num/str │ 上线时间 / 上线人                    │
│   onlineBy         │         │                                      │
│                    │         │                                      │
│ ── 通用（三类型共用）──                                            │
│ remark             │ string  │ ★ 备注（选填，0–500）                │
│ projectId          │ string  │ 所属项目 ID（必填，FK→projects）     │
│ projectVersionId   │ string  │ 所属项目版本 ID（选填，FK→projectVersions）│
│ relatedDevIds      │ array   │ 关联开发 ID 数组（multiEntry 索引）  │
│ startTime/startBy  │ num/str │ 开始时间（时间戳）/ 开始人（账号串） │
│ completeTime/      │ num/str │ 完成时间 / 完成人                    │
│   completeBy       │         │                                      │
│ createdBy/createdAt│ str/num │ 审计字段（创建人/创建时间戳）         │
│ updatedBy/updatedAt│ str/num │ 审计字段（更新人/更新时间戳）         │
└────────────────────┴─────────┴──────────────────────────────────────┘
```

**字段归属对照**：

| 字段 | TASK_ITEM | BUG | MEETING |
|---|---|---|---|
| `desc` | ✅ 必填 | ✅ 必填 | ❌ |
| `name` | ❌ | ❌ | ✅ 必填 |
| `meetingTime` / `location` / `minutes` | ❌ | ❌ | ✅ |
| `feedbackBy` / `feedbackTime` | ❌ | ✅ | ❌ |
| `relatedTaskId` | ❌ | ✅ 选填 | ❌ |
| `handoffTime` / `handoffBy` | ❌ | ✅ | ❌ |
| `onlineTime` / `onlineBy` | ❌ | ✅ | ❌ |
| `remark` | ✅ 选填 | ✅ 选填 | ✅ 选填 |
| `projectId` / `projectVersionId` | ✅ | ✅ | ✅ |
| `relatedDevIds` | ✅ | ✅ | ✅ |
| `startTime` / `startBy` | ✅ | ✅ | ❌ |
| `completeTime` / `completeBy` | ✅ | ✅ | ❌ |
| 审计字段 | ✅ | ✅ | ✅ |

**索引**：`typeCode`、`statusCode`、`projectId`、`projectVersionId`、`relatedDevIds`（multiEntry）、`relatedTaskId`、`updatedAt`、`createdAt`、`meetingTime`

**长度上限**：`DESC_MAX=500` / `NAME_MAX=100` / `REMARK_MAX=500` / `LOCATION_MAX=100` / `MINUTES_MAX=2000` / `ACTOR_MAX=64` / `PROJECT_ID_MAX=64` / `RELATED_TASK_ID_MAX=64`

### 3.3 生命周期流水 `todoLifecycles`（store: `todoLifecycles`）

与 `taskLifecycles` 同构，append-only，三类型共用。

```
id             string  32 位主键
todoId         string  FK → todos.id
statusCode     string  状态 code（字典）
operationCode  string  操作 code（字典）
operator       string  操作人（账号串）
operateTime    number  操作时间（时间戳）
```

**索引**：`todoId`、`statusCode`、`operationCode`、`operator`、`operateTime`

级联删除：删除 todo 时清理其所有 `todoLifecycles` 记录。

---

## 四、字典设计

在 `dictionary.js` 新增 5 个分类（不改动现有分类），code 全部带前缀防撞名。

### 4.1 SEED_TYPE 新增

```javascript
TODO_TYPE: '代办类型',
TODO_STATUS: '代办事项状态',
BUG_STATUS: '缺陷追踪状态',
MEETING_STATUS: '会议状态',
TODO_OPERATION: '代办操作'
```

### 4.2 SEED 种子新增（17 条）

| type | code | name | order | color |
|---|---|---|---|---|
| **TODO_TYPE** | TASK_ITEM | 任务事项 | 1 | `#096dd9` |
| TODO_TYPE | BUG | 缺陷追踪 | 2 | `#cf1322` |
| TODO_TYPE | MEETING | 会议 | 3 | `#389e0d` |
| **TODO_STATUS** | TD_TODO | 未处理 | 1 | `#8c8c8c` |
| TODO_STATUS | TD_DOING | 处理中 | 2 | `#1677ff` |
| TODO_STATUS | TD_DONE | 已完成 | 3 | `#52c41a` |
| **BUG_STATUS** | BUG_TODO | 未处理 | 1 | `#8c8c8c` |
| BUG_STATUS | BUG_DOING | 处理中 | 2 | `#1677ff` |
| BUG_STATUS | BUG_DONE | 已完成 | 3 | `#52c41a` |
| BUG_STATUS | BUG_WAIT_DEV | 待开发 | 4 | `#fa8c16` |
| BUG_STATUS | BUG_ONLINE | 已上线 | 5 | `#722ed1` |
| **MEETING_STATUS** | MT_NOT_STARTED | 未开始 | 1 | `#8c8c8c` |
| MEETING_STATUS | MT_ENDED | 已结束 | 2 | `#52c41a` |
| MEETING_STATUS | MT_CANCELLED | 已取消 | 3 | `#ff4d4f` |
| **TODO_OPERATION** | TODO_CREATE | 创建 | 0 | — |
| TODO_OPERATION | TODO_EDIT | 编辑 | 1 | — |
| TODO_OPERATION | TODO_START | 开始处理 | 2 | — |
| TODO_OPERATION | TODO_COMPLETE | 完成 | 3 | — |
| TODO_OPERATION | TODO_HANDOFF | 转交 | 4 | — |
| TODO_OPERATION | TODO_ONLINE | 上线 | 5 | — |
| TODO_OPERATION | TODO_DELETE | 删除 | 6 | — |

---

## 五、外键关系

```
todos.projectId          → projects.id          (必填)
todos.projectVersionId   → projectVersions.id   (选填，须归属 projectId)
todos.relatedDevIds[*]   → users.id             (选填，逐个校验存在)
todos.relatedTaskId      → requirementTasks.id  (选填，BUG 专属)

todoLifecycles.todoId    → todos.id             (必填，级联删除)
```

---

## 五·五、前置工作：数据库链接收口（已完成）

> 本代办模块依赖的 IndexedDB 链接收口已于 `CONFIG_PLAN.md` 的 Batch 1–4 完成，先于本计划执行。
> 此处仅作索引，确保追溯完整；改动集中在 `config.js`，不改动本模块业务逻辑。

**已完成项（对应 `CONFIG_PLAN.md`）**：

- **Batch 1**：新增 `config.js`（单一事实来源：`databases.main` / `databases.media` + 预留 `featureFlags` / `ui` / `sync` / `limits`）+ `CONFIG_PLAN.md`。
- **Batch 2**：15 个入口页在打开 IndexedDB 的脚本前注入 `<script src="config.js?v=">`；`login/` 页用相对路径 `../config.js`。
- **Batch 3**：主库收口 — `db.js`（`DB_NAME` / `DB_VERSION_BASE`）与 `storage-backup.js`（`BASE_DB_NAME`）改读 `RT_CONFIG.database('main')`；保留 `RT_DB` / `RT_IMGSTORE` 导出别名兼容。
- **Batch 4**：媒体库收口 — `imgstore.js` / `app.js` / `storage-backup.js` 的 `DB_NAME` / `DB_VERSION` / `IMG_STORE` / `ATT_STORE` 改读 `RT_CONFIG.database('media')`。
- **验证**：node 模拟加载顺序 + 全部改动文件 `node --check` 通过；运行时 `window.RT_CONFIG` 各页可用。

**对本模块的意义**：阶段 2 / 3 新增的 `todos` / `todoLifecycles` 两个 store 注册在 `req-tracker` 主库（即 `config.js` 的 `databases.main`），业务代码直接 `registerStore` 即可，无需关心库名 / 版本硬编码。

---

## 六、分阶段执行计划

每阶段独立提交，按 `RULES.md` 用 `./release.sh <版本> "说明"` 升版本。

> **阶段 0（前置，已完成）**：数据库链接收口，见 [五·五](#五五前置工作数据库链接收口已完成) / `CONFIG_PLAN.md`。本模块执行前已就绪。

### 阶段 1 — 字典种子

**文件**：`dictionary.js`

- `SEED_TYPE` 新增 5 个分类。
- `SEED` 数组追加约 17 条种子记录（含 order / color）。
- 幂等播种机制不变。

### 阶段 2 — 数据层（todos.js）

**新增文件**：`todos.js`

> **配置接线**：`todos.js` 由 `index.html` 加载，复用其已注入的 `config.js`（位于 `db.js` 之前），**无需在本文件单独注入**。`RT_DB.openDB()` 经 `RT_CONFIG.database('main')` 读主库名/版本，批次 04 在 `index.html` 注入 `todos.js` 时务必排在 `config.js`/`db.js` 之后即可。

- `registerStore('todos', ...)` + 全部索引。
- `validateTodo(data)`：按 `typeCode` 动态必填（TASK_ITEM/BUG→`desc`；MEETING→`name`）。
- `createTodo` / `updateTodo` / `deleteTodo` / `getTodo` / `getAllTodos`。
- 外键校验：projectId→projects、projectVersionId→projectVersions、relatedDevIds→users、relatedTaskId→requirementTasks。
- 字典 code 校验。
- 级联删除 `todoLifecycles`。
- 挂全局：`root.RT_TODOS = api`。

### 阶段 3 — 数据层（todo-lifecycles.js）

**新增文件**：`todo-lifecycles.js`

> **配置接线**：同上，由 `index.html` 加载，复用已注入的 `config.js`，无需单独注入；注入顺序排在 `config.js`/`db.js` 之后。

- `registerStore('todoLifecycles', ...)` + 索引。
- `createTodoLifecycle` / `getByTodoId` / `deleteByTodoId`。
- 字典 code + 外键 `todoId` 存在性校验。
- 挂全局：`root.RT_TODO_LIFECYCLES = api`。

### 阶段 4 — 首页：代办 TAB 框架 + 筛选 + 列表 + 表单 + 详情

**文件**：`index.html`、`app.js`

- `index.html`：新增顶级 TAB「代办」（`data-view="todo"`），去掉「报表」TAB。
- `index.html`：注入 `todos.js?v=` / `todo-lifecycles.js?v=`。

#### 代办页面筛选框（同任务样式）

代办列表上方筛选栏，与现有任务筛选完全一致的交互模式：

```
┌──────────────────────────────────────────────────┐
│  [任务事项] [缺陷追踪] [会议]                      │  ← 子类型切换 chips（单选，默认任务事项）
│  [未处理] [处理中] [已完成] [待开发] [已上线] ...  │  ← 状态 chips（多选，按当前子类型动态切换字典）
│  [全部项目 ▼]  [全部版本 ▼]                       │  ← 项目/项目版本下拉（联动）
│  [🔍 输入关键字检索...]                  [重置]    │  ← 搜索框 + 重置按钮
└──────────────────────────────────────────────────┘
```

- **子类型切换**：chips 样式，`任务事项` | `缺陷追踪` | `会议`，选中高亮，切换后状态 chips 自动切换对应字典（TD_STATUS / BUG_STATUS / MEETING_STATUS）。
- **状态 chips**：多选胶囊，按当前子类型动态渲染对应字典枚举（取自 `dictionary.js`），含「全部状态」选项。
- **项目下拉**：读取 `projects` 表，含「全部项目」选项；选中后联动**项目版本下拉**（仅该项目的版本）。
- **搜索框**：按 `desc`（任务事项/BUG）或 `name`（会议）实时过滤，debounce 200ms。
- **重置按钮**：清空所有筛选条件，恢复默认。
- **统计栏**（可选，位于筛选上方）：当前筛选范围内的数量摘要（如「共 12 条」），与任务 TAB 的 `stats-bar` 风格一致。

#### 列表 + 表单 + 详情
- 列表行渲染（三类各自展示）。
- 新建/编辑表单（字段随 `typeCode` 动态显隐）。
- 详情页（全屏，含 BUG 流转时间线）。
- 去点击蓝框、不展示 32 位 ID、返回栈规范。

### 阶段 5 — 侧边栏：新增「统计报表」入口

**文件**：`index.html`

- 在基础数据与存储备份之间插入 `<a class="drawer-item" href="report.html" onclick="navTo('report.html');return false;">`。
- 图标/文案：「统计报表」。

### 阶段 6 — 统计报表独立页面（report.html + report.js）

**新增文件**：`report.html`、`report.js`

- `report.html`：顶部导航栏（返回箭头 `goBack()` + 居中标题「统计报表」），白底全页，4 项模块列表（`basic-data.html` 同款 `.module-row` 样式）。
- `report.js` 自包含数据读取：`requirementTasks` + `taskLifecycles`（任务统计） + `todos` + `todoLifecycles`（代办统计）。

#### 统计视图筛选工具条（与现有报表一致，不额外增加）

```
┌──────────────────────────────────────────────────┐
│  时间维度：[年度] [季度] [月度]    [2026年 ▼]     │
│                                     [导出PDF]     │  ← 位置与现有首页报表一致（右侧）
└──────────────────────────────────────────────────┘
```

- **时间维度**：年度/季度/月度切换 + 年份/季度/月下拉（复用现有 `reportFilter` 逻辑）。
- **导出 PDF**：右侧按钮，系统打印当前统计视图。
- **不包含**：项目下拉、项目版本下拉、搜索框、类型勾选（任务统计报表的「普通BUG」勾选框保留，属任务统计自身逻辑，与代办无关）。
- 筛选条下方：统计卡（4 项一行、6 项两行各 3 个），再下方模块分布。

#### 4 个统计视图各自内容

**① 任务统计报表**（迁移首页原报表）
- 筛选工具条：时间维度（年度/季度/月度）+ 年份/季度/月下拉 + 普通BUG 勾选框 + 导出 PDF。
- 统计卡（6 项，**两行各 3 个**）：
  - 第一行：总任务 / 总测试工时 / 测试中
  - 第二行：已测完 / 已上线 / 未开始
- 模块分布：「已进入测试」（类型分布 + 状态分布 + 暂停中备注 + 任务清单按钮）、「未进入测试」（类型分布 + 状态分布 + 任务清单按钮）。
- 数据源：`requirementTasks` + `taskLifecycles`。

**② 任务事项统计报表**
- 筛选工具条：时间维度 + 导出 PDF。
- 统计卡（4 项，**一行 4 个**）：
  - 总事项 / 未处理 / 处理中 / 已完成
- 模块分布：「未处理」（按项目分布进度条 + 数量）、「处理中」（同上）、「已完成」（同上）。
- 数据源：`todos`（`typeCode=TASK_ITEM`）。

**③ 缺陷追踪统计报表**
- 筛选工具条：时间维度 + 导出 PDF。
- 统计卡（6 项，**两行各 3 个**）：
  - 第一行：总缺陷 / 未处理 / 处理中
  - 第二行：已完成 / 待开发 / 已上线
- 模块分布：「未处理」「处理中」「已完成」「待开发」「已上线」各按项目分布进度条 + 数量；底部「关联任务统计」：按关联的 `requirementTasks.taskName` 分组计数。
- 数据源：`todos`（`typeCode=BUG`）。

**④ 会议统计报表**
- 筛选工具条：时间维度 + 导出 PDF。
- 统计卡（4 项，**一行 4 个**）：
  - 总会议 / 未开始 / 已结束 / 已取消
- 模块分布：「未开始」（按项目分布进度条 + 数量）、「已结束」（同上）、「已取消」（同上）。
- 数据源：`todos`（`typeCode=MEETING`）。

**统计卡布局规则**：复用首页现有 `report-grid`（CSS Grid），4 项一行展示（`grid-template-columns: repeat(4, 1fr)`），6 项两行各 3 个（`repeat(3, 1fr)`），窄屏自适应。

#### 技术要点
- **`report.html` 必须自行注入 `config.js`**：它是新增独立页面，**不在 `CONFIG_PLAN.md` Batch 2 原 15 个入口页范围内**。须在数据层脚本最前注入 `<script src="config.js?v=1.3.25"></script>`（版本号与 `index.html` 一致），且**必须排在 `db.js` 之前**——`db.js` 的 `RT_DB.openDB()` 在模块加载时同步读取 `RT_CONFIG.database('main')`，晚于 config.js 会拿到 `undefined` 导致主库打开失败。
- 引入数据层脚本顺序（严格按此序）：`config.js` → `db.js` → `dictionary.js` → `projects.js` → `project-versions.js` → `requirement-tasks.js` → `task-lifecycles.js` → `todos.js` → `todo-lifecycles.js` → `companies.js` → `departments.js` → `users.js`（项目下拉需读部门/公司，开发人员统计需读 users）。
- 遵守 RULES：去点击蓝框、返回栈 `navTo`/`goBack`、不展示 32 位系统 ID。

### 阶段 7 — 收尾

- 清理 `app.js` 中首页「报表」TAB 相关代码（`view-report` DOM、`renderReports` 等，约 400 行）。
- `DB_SCHEMA.md`：补 `todos` / `todoLifecycles` 结构说明，更新总表数。
- **导出/导入备份范围扩展**：`storage-backup.js` 的 `BASE_STORES` 追加 `requirementTasks`、`taskLifecycles`、`todos`、`todoLifecycles` 四个 store（见下方详细分析）。
- **字典管理页下拉改造**：`dictionary.html` 将横向滚动 chips 改为 `<select>` 下拉框（见下方详细分析）。
- `release.sh`：补齐 `todos.js`、`todo-lifecycles.js`、`requirement-tasks.js`、`task-lifecycles.js`、`report.js` 的版本化 URL。
- `sw.js`：`APP_SHELL` 追加 `report.html`、`report.js` 预缓存。
- 全量回归冒烟。
- 发版。

---

## 七、实施注意事项

1. **`todos.js` 与 `requirement-tasks.js` 同构**：可大量复用代码骨架（validate 模式、外键断言、CRUD 模板）。
2. **校验分支**：`validateTodo` 中 `typeCode=TASK_ITEM/BUG` 必填 `desc`（非 `name`）；`typeCode=MEETING` 必填 `name`（非 `desc`）。互斥。
3. **`release.sh` 补位**：阶段 7 需补齐 `todos.js`、`todo-lifecycles.js`、`requirement-tasks.js`、`task-lifecycles.js`、`report.js` 的 `?v=` 版本化 URL 替换（目前均遗漏）。
4. **首页报表 TAB 删除**：阶段 4 删除 `index.html` 中「报表」TAB 按钮及 `#view-report` 容器；阶段 7 清理 `app.js` 中相关 JS 代码（`renderReports`、`renderReportValueRow`、`toggleStats`、`collectReportYears` 等）。
5. **代办页面筛选**（`app.js`）：子类型切换联动状态 chips 字典变化；项目/项目版本下拉联动（选项目 → 版本仅该项目的）；搜索框 debounce 200ms 过滤；重置按钮清空全部条件。与现有任务筛选同模实现。
6. **BUG 关联任务删除处理**：`todos.BUG` 的 `relatedTaskId` 指向 `requirementTasks`。删除任务时**不自动级联删除关联的 BUG**（仅标记失效），避免数据丢失。
8. **已有索引补建**：`db.js` 自动处理，新 store 首次•••载即建出，无需手动迁移。
9. **`report.js` 依赖脚本多**：需引入 10+ 个数据层脚本（config/db/dictionary/projects/project-versions/requirement-tasks/task-lifecycles/todos/todo-lifecycles/companies/departments/users），按依赖顺序排列，`db.js` 必须最先加载。

---

## 八、附属改动

### 8.1 导出/导入备份范围扩展

**现状**：`storage-backup.js` 的 `BASE_STORES` 仅含 8 个基础数据 store：
```
users / departments / positions / companies / projects / projectVersions / dict / changelog
```
**缺失**：`requirementTasks`、`taskLifecycles`，以及即将新增的 `todos`、`todoLifecycles`。

**影响**：
- 用户导出备份 → 不包含任务数据、代办数据。
- 导入备份到新设备 → 任务和代办全部丢失。

**方案**：`BASE_STORES` 追加 4 个 store：
```
requirementTasks, taskLifecycles, todos, todoLifecycles
```
变更后完整列表（12 个）：
```
users, departments, positions, companies, projects, projectVersions, dict, changelog,
requirementTasks, taskLifecycles, todos, todoLifecycles
```
- 追加而非替换，`exportBaseData` 的 `filter(n => db.objectStoreNames.contains(n))` 逻辑自动适配——store 不存在时跳过，旧用户不影响。
- 导入时按同样顺序 `clear + put`，无外键冲突（数据按依赖顺序：先 users/projects，再 requirementTasks/todos，最后 lifecycles）。

### 8.2 字典管理页改为下拉框

**现状**：`dictionary.html` 顶部用横向滚动 chips（`.filter-tabs`）切换字典分类：
```
[全部] [任务类型] [优先级] [任务状态] [项目状态] [人员状态] [职级] [任务操作管理]
```
加上代办模块新增的 5 个分类后，将达到 **13 个标签**。

**分析**：
- **问题**：13 个标签在移动端一行放不下，必须横向滚动，且无法一眼看到全部选项；新增分类越多体验越差。
- **方案**：改为 `<select>` 下拉框。

**改造内容**（`dictionary.html`）：
- 删除 `.filter-tabs` 容器及 chips 渲染逻辑。
- 在页面顶部（导航栏下方）增加一个 `<select>` 下拉框：
  ```html
  <div class="type-select-wrap">
    <select id="type-select" onchange="setType(this.value)">
      <option value="全部">全部</option>
      <!-- 由 renderTypeSelect 动态填充各分类 -->
    </select>
  </div>
  ```
- `renderTypeSelect` 从 `RT_DICT.SEED_TYPE` 动态生成所有分类选项（含代办新增的 5 个）。
- 下拉框样式：与现有 `.filter-select`（任务筛选的项目下拉）一致，宽度撑满，高度 40px+，圆角边框。
- **向下兼容**：老用户浏览器中 `SEED_TYPE` 缺少新增分类 → 下拉仅显示已有分类；种子播种后 `pageshow` 重渲染自动补齐。

**合理性**：下拉框比横向滚动 chips 更适合分类多（10+）的场景，且与项目中项目筛选下拉、状态选择等交互一致，降低用户学习成本。
