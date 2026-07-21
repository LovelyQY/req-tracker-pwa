# 代办模块 — 详细执行清单

> 基于 `TODO_MODULE_PLAN.md` 最终方案。每项标注批次编号（用户输入编号即可触发执行）。
> 每批次独立提交 + `./release.sh <版本> "说明"` 升版本。

---

## 批次 00 — 数据库链接配置收口（前置，已完成）

**目标**：把分散在 `db.js` / `imgstore.js` / `app.js` / `storage-backup.js` 的 IndexedDB 链接（库名 / 版本 / store）收口到 `config.js` 单一事实来源。
**详细方案**：`CONFIG_PLAN.md`（Batch 1–4 已完成）。

- [x] **Batch 1**：新增 `config.js`（`databases.main` = `req-tracker` v3 运行时自增；`databases.media` = `req-tracker-pwa` v4；预留 `featureFlags` / `ui` / `sync` / `limits`）+ 新增 `CONFIG_PLAN.md`
- [x] **Batch 2**：15 个入口页在 `db.js` / `imgstore.js` / `app.js` / `storage-backup.js` 之前注入 `<script src="config.js?v=">`；`login/` 页用 `../config.js` 相对路径
- [x] **Batch 3**：主库收口 — `db.js` 的 `DB_NAME` / `DB_VERSION_BASE` 改读 `RT_CONFIG.database('main')`；`storage-backup.js` 的 `BASE_DB_NAME` 改读 `RT_CONFIG.database('main').name`；保留 `RT_DB` / `RT_IMGSTORE` 导出别名兼容
- [x] **Batch 4**：媒体库收口 — `imgstore.js` / `app.js` / `storage-backup.js` 的 `DB_NAME` / `DB_VERSION` / `IMG_STORE` / `ATT_STORE` 改读 `RT_CONFIG.database('media')`
- [x] **验证**：node 模拟加载顺序渲染正确（`db.js`→`req-tracker`、`imgstore.js`→`req-tracker-pwa`）+ 全部改动文件 `node --check` 语法通过 + 运行时各页 `window.RT_CONFIG` 可用

> 本批次为前置已完成项，统一在此追溯。本模块后续 `todos` / `todoLifecycles` 直接 `registerStore` 到主库，无需关心库名 / 版本硬编码。
> **前置规则（防漏接）**：凡是新增的、会打开 IndexedDB 的页面（如本计划的 `report.html`），都必须在数据层脚本前自行注入 `config.js`（版本号与 `index.html` 一致）。原 Batch 2 仅覆盖 15 个既有入口页，新增页面不自动包含，须在建页批次（如批次 10）显式加回。

---

## 批次 01 — 字典种子（dictionary.js）

**文件**：`dictionary.js`

- [x] `SEED_TYPE` 新增 5 个分类：`TODO_TYPE` / `TODO_STATUS` / `BUG_STATUS` / `MEETING_STATUS` / `TODO_OPERATION`
- [x] `SEED` 数组追加 21 条种子记录（含 order / color）
- [x] 幂等播种机制不变（按 type\|code 去重，只补缺失 + 回填 order/color）

---

## 批次 02 — 数据层：todos.js

**新增文件**：`todos.js`

> **配置接线**：`todos.js` 由 `index.html` 加载，复用其已注入的 `config.js`（位于 `db.js` 之前），无需单独注入。`RT_DB.openDB()` 经 `RT_CONFIG.database('main')` 读主库；批次 04 在 `index.html` 注入 `todos.js` 时务必排在 `config.js`/`db.js` 之后。

- [x] `registerStore('todos', { keyPath:'id', indexes:[...] })` 注册 store + 全部索引
- [x] `LIMITS` 常量定义（DESC_MAX/NAME_MAX/REMARK_MAX/LOCATION_MAX/MINUTES_MAX/ACTOR_MAX/PROJECT_ID_MAX/RELATED_TASK_ID_MAX）
- [x] `validateTodo(data)`：按 `typeCode` 动态必填（TASK_ITEM/BUG→`desc`；MEETING→`name`）；备注长度校验
- [x] `createTodo(data, operator)`：字段填充 + 字典 code 校验 + 外键校验（projectId→projects、projectVersionId→projectVersions、relatedDevIds→users、relatedTaskId→requirementTasks）+ `genId()`
- [x] `updateTodo(id, patch, operator)`：字段更新 + 字典 code 校验 + 外键校验 + `updatedBy`/`updatedAt`
- [x] `deleteTodo(id)`：级联删除 `todoLifecycles` + 图片/附件（预留接口）
- [x] `getTodo(id)` / `getAllTodos()`
- [x] 挂全局：`root.RT_TODOS = api`

---

## 批次 03 — 数据层：todo-lifecycles.js

**新增文件**：`todo-lifecycles.js`

> **配置接线**：同上，由 `index.html` 加载，复用已注入的 `config.js`，无需单独注入；注入顺序排在 `config.js`/`db.js` 之后。

- [x] `registerStore('todoLifecycles', { keyPath:'id', indexes:[...] })` 注册 store + 索引
- [x] `createTodoLifecycle(data)`：字段填充 + 字典 code 校验 + 外键 `todoId` 存在性校验
- [x] `getByTodoId(todoId)` / `getAllTodoLifecycles()`
- [x] `deleteByTodoId(todoId)`：按 `todoId` 索引游标级联删除
- [x] `deleteTodoLifecycle(id)`：单条删除（异常修复用）
- [x] 挂全局：`root.RT_TODO_LIFECYCLES = api`

---

## 批次 04 — 首页：代办 TAB 框架（index.html + app.js）

**文件**：`index.html`、`app.js`

- [x] `index.html`：新增顶级 TAB 按钮「代办」（`data-view="todo"`），位于「任务」右侧
- [x] `index.html`：新增 `#view-todo` 容器（含子类型切换栏 + 筛选栏 + 列表区占位）
- [x] `index.html`：去掉「报表」TAB 按钮（`data-view="report"`）
- [x] `index.html`：注入 `<script src="todos.js?v=1.3.25">` 和 `<script src="todo-lifecycles.js?v=1.3.25">`（位于 `task-lifecycles.js` 之后、`app.js` 之前）
- [x] `app.js`：`switchView` 扩展 `todo`（含 init 逻辑：首次切换到代办时预取主数据 + 渲染子类型 chips）
- [x] `app.js`：移除 `switchView('report')` 中 `renderReportValueRow()` 和 `renderReports()` 调用（暂时保留函数定义，阶段 9 再清理）
- [x] `app.js`：FAB 按钮在代办视图下显示（点击走 `openTodoModal` 占位，批次 07 实现表单）

---

## 批次 05 — 代办筛选栏（index.html + app.js）

**文件**：`index.html`、`app.js`

- [ ] 子类型切换 chips：`[任务事项] [缺陷追踪] [会议]`，单选，默认任务事项
- [ ] 子类型切换后，状态 chips 自动切换到对应字典（TD_STATUS / BUG_STATUS / MEETING_STATUS）
- [ ] 状态 chips：多选胶囊，从 `dictionary.js` 动态渲染，含「全部状态」
- [ ] 项目下拉：读取 `projects` 表，含「全部项目」
- [ ] 项目版本下拉：联动项目选择，仅展示归属该项目的版本
- [ ] 搜索框：按 `desc`（任务事项/BUG）或 `name`（会议）实时过滤，debounce 200ms
- [ ] 重置按钮：清空全部筛选条件
- [ ] 代办统计栏（stats-bar）：按子类型动态显示数量摘要（4 项一行 / 6 项两行各 3 个）

---

## 批次 06 — 代办列表渲染（app.js）

**文件**：`app.js`

- [ ] `renderTodoList()`：从 `RT_TODOS.getAllTodos()` 读取 + 按筛选条件过滤 + 渲染
- [ ] 任务事项列表行：描述 + 状态标签 + 关联开发 + 开始/完成时间
- [ ] 缺陷追踪列表行：描述 + 状态标签 + 关联任务 + 反馈人/时间
- [ ] 会议列表行：名称 + 时间 + 地点 + 状态标签
- [ ] 不展示 32 位系统 ID
- [ ] 点击行打开详情页

---

## 批次 07 — 代办新建/编辑表单（app.js + index.html）

**文件**：`app.js`、`index.html`

- [ ] 表单字段按 `typeCode` 动态显隐（任务事项/BUG 显示 desc；MEETING 显示 name/meetingTime/location/minutes；BUG 显示 feedbackBy/feedbackTime/relatedTaskId）
- [ ] `projectId` / `projectVersionId` 下拉联动（与现有任务表单一致）
- [ ] `relatedDevIds` 多选（同现有开发人员选择）
- [ ] `remark` 备注字段（textarea，选填，500 字上限）
- [ ] 创建时调 `RT_TODOS.createTodo` + 写入 `todoLifecycles`（TODO_CREATE）
- [ ] 编辑时调 `RT_TODOS.updateTodo` + 写入 `todoLifecycles`（TODO_EDIT）
- [ ] 校验提示（红色边框 + 错误文案）

---

## 批次 08 — 代办详情页（app.js）

**文件**：`app.js`

- [ ] 全屏详情页（`navTo`/`goBack`），顶部返回箭头 + 标题
- [ ] 展示全部字段（含备注），按类型动态显隐
- [ ] BUG 详情额外展示 `todoLifecycles` 流转时间线（创建/编辑/开始/完成/转交/上线）
- [ ] 删除确认弹窗（确认按钮红色），删除后级联清理 `todoLifecycles`
- [ ] 去点击蓝框、不展示 32 位 ID

---

## 批次 09 — 侧边栏：新增「统计报表」入口（index.html）

**文件**：`index.html`

- [ ] 在基础数据与存储备份之间插入 `<a class="drawer-item" href="report.html" onclick="navTo('report.html');return false;">`
- [ ] 图标 SVG + 文案「统计报表」

---

## 批次 10 — 统计报表独立页面（report.html + report.js）

**新增文件**：`report.html`、`report.js`

- [ ] `report.html` 注入 `<script src="config.js?v=1.3.25"></script>`（版本号与 `index.html` 一致），且**必须置于 `db.js` 等数据层脚本之前**——`report.html` 是新增独立页面，不在 `CONFIG_PLAN.md` Batch 2 原 15 个入口页范围内，必须自行注入，否则 `RT_DB.openDB()` 读不到 `RT_CONFIG` 主库配置
- [ ] `report.html`：顶部导航栏（返回箭头 `goBack()` + 居中标题「统计报表」），白底全页
- [ ] 4 项模块列表（`.module-row`，`basic-data.html` 同款样式）：任务统计 / 任务事项统计 / 缺陷追踪统计 / 会议统计
- [ ] 每行点击展开对应统计视图（可在同页内联切换，或跳转子页面）
- [ ] `report.js` 自包含数据读取逻辑

### 任务统计报表（迁移首页原报表）
- [ ] 时间维度筛选（年度/季度/月度 + 年份/季度/月下拉）+ 普通BUG 勾选框 + 导出 PDF
- [ ] 统计卡（6 项，两行各 3 个）：总任务 / 总测试工时 / 测试中 | 已测完 / 已上线 / 未开始
- [ ] 模块分布：「已进入测试」（类型+状态分布 + 暂停中备注 + 任务清单按钮）、「未进入测试」（类型+状态分布 + 任务清单按钮）

### 任务事项统计报表
- [ ] 时间维度筛选 + 导出 PDF
- [ ] 统计卡（4 项，一行 4 个）：总事项 / 未处理 / 处理中 / 已完成
- [ ] 模块分布：按状态分块，每块按项目分布进度条 + 数量

### 缺陷追踪统计报表
- [ ] 时间维度筛选 + 导出 PDF
- [ ] 统计卡（6 项，两行各 3 个）：总缺陷 / 未处理 / 处理中 | 已完成 / 待开发 / 已上线
- [ ] 模块分布：按 5 个状态分块 + 底部「关联任务统计」

### 会议统计报表
- [ ] 时间维度筛选 + 导出 PDF
- [ ] 统计卡（4 项，一行 4 个）：总会议 / 未开始 / 已结束 / 已取消
- [ ] 模块分布：按状态分块，每块按项目分布进度条 + 数量

- [ ] 引入数据层脚本（config.js / db.js / dictionary.js / projects.js / project-versions.js / requirement-tasks.js / task-lifecycles.js / todos.js / todo-lifecycles.js / users.js）
- [ ] 遵守 RULES：去蓝框、返回栈、不展示系统 ID

---

## 批次 11 — 导出/导入备份范围扩展（storage-backup.js）

**文件**：`storage-backup.js`

- [ ] `BASE_STORES` 从 8 个扩展为 12 个：追加 `requirementTasks` / `taskLifecycles` / `todos` / `todoLifecycles`
- [ ] 验证：`filter(n => db.objectStoreNames.contains(n))` 逻辑自动适配，store 不存在时跳过

---

## 批次 12 — 字典管理页下拉改造（dictionary.html）

**文件**：`dictionary.html`

- [ ] 删除 `.filter-tabs` 横向滚动 chips 容器及渲染逻辑（`renderTabs` / `setType` 中 chips 部分）
- [ ] 新增 `<select id="type-select">` 下拉框（样式与 `.filter-select` 一致）
- [ ] `renderTypeSelect()`：从 `RT_DICT.SEED_TYPE` 动态生成所有分类选项（含代办新增 5 个）
- [ ] `setType` 改为监听 `onchange`
- [ ] `pageshow` / `visibilitychange` 中同步调用 `renderTypeSelect()`

---

## 批次 13 — 收尾与发版

**文件**：多个

- [ ] 清理 `app.js` 中首页「报表」TAB 残留代码：
  - 删除 `#view-report` 相关渲染逻辑引用
  - 删除 `renderReports` / `renderReportValueRow` / `toggleStats` / `toggleFilters` / `collectReportYears` 等函数
  - 删除 `switchView('report')` 相关分支
  - 删除 `reportFilter` / `reportExcludeTypes` 全局状态（已迁移到 report.js）
- [ ] `DB_SCHEMA.md`：补 `todos` / `todoLifecycles` 结构说明，更新总表数为 12
- [ ] `release.sh`：补齐版本化 URL 替换规则
  - 新增：`todos.js`、`todo-lifecycles.js`、`report.js`
  - 补齐遗漏：`requirement-tasks.js`、`task-lifecycles.js`
- [ ] `sw.js`：`APP_SHELL` 追加 `'./report.html'`、`'./report.js'`
- [ ] 全量回归冒烟：创建/编辑/删除各类型代办、BUG 流转、统计区、字典下拉、备份导出/导入
- [ ] `./release.sh <版本> "说明"` 发版

---

## 执行顺序建议

```
00 数据库链接收口（前置，已完成）
    ↓
01 字典种子
    ↓
02 todos.js ──→ 03 todo-lifecycles.js
    ↓
04 代办 TAB 框���
    ↓
05 代办筛选栏
    ↓
06 代办列表渲染
    ↓
07 代办新建/编辑表单 ──→ 08 代办详情页
    ↓
09 侧边栏入口
    ↓
10 统计报表页面（可拆为 10a/10b/10c/10d 四个子批次）
    ↓
11 备份范围扩展 ──→ 12 字典下拉改造
    ↓
13 收尾与发版
```

> 用户输入批次编号（如 `01`）即可触发该批次的执行。批次 `00` 为前置已完成项，可跳过或按清单核对。
