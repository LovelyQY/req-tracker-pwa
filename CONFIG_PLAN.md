# 配置集中化方案（CONFIG_PLAN）

> 目标：把所有 IndexedDB 链接收口到单一配置文件，并预留扩展位供后续其它配置信息使用。
> 当前状态：Batch 1~4 已完成（含 `config.js` + 本计划 + 入口页接入 + 模块收口）；Batch 5 待用户提供具体配置内容后执行。

## 一、背景与现状（已核实）

项目实际只有 **2 个 IndexedDB 库**，但连接常量被重复硬编码在 4 个文件：

| 库 | 名称 | 版本 | store | 硬编码位置 |
|---|---|---|---|---|
| 主业务库 `main` | `req-tracker` | 3（运行时自动抬升） | users / companies / departments / positions / projects / projectVersions / dict / requirementTasks / taskLifecycles / changelog | `db.js`（RT_DB 统一拥有） |
| 媒体库 `media` | `req-tracker-pwa` | 4 | images / attachments | `imgstore.js`、`app.js`、`storage-backup.js` 各抄一份 |

风险：媒体库 `name/version` 在 3 处重复，升版本号极易漏改；主库名在 `storage-backup.js` 又用 `BASE_DB_NAME` 抄了一份。

## 二、配置文件设计（`config.js`）

- 同步全局 `window.RT_CONFIG`（与 `RT_DB`/`RT_IMGSTORE` 同风格），不引 JSON（避免异步 fetch 赶不上模块同步读取）。
- 两层结构：
  - `databases`：IndexedDB 链接（`main` / `media`，每项含 `key` / `name` / `version` / `owner` / `stores` / `description`）。
  - 预留分组 `featureFlags` / `ui` / `sync` / `limits`：后续配置直接往里加。
- 便捷方法：`RT_CONFIG.database('media').name`。
- 新增库：在 `databases` 下追加一项即可。

## 三、分批执行计划

### ✅ Batch 1 — 落地配置文件（已完成）
- [x] 新增 `config.js`（含 `databases.main` / `databases.media` + 预留分组）。
- [x] 新增本计划 `CONFIG_PLAN.md`。

### ✅ Batch 2 — 入口页接入 config.js（已完成）
- [x] 在 15 个打开 IndexedDB 的入口页（`db.js`/`app.js`/`imgstore.js`/`storage-backup.js` 之前）注入
  `<script src="config.js?v=1.3.24"></script>`；`login/classic.html` 用相对路径 `../config.js`。
- [x] 验证：构建期确认注入位置正确、相对路径正确；运行时 `window.RT_CONFIG` 在各页可用。
- [x] **口径（收口规则）**：覆盖范围 = **所有打开 IndexedDB 的页面**（执行时共 15 个既有入口页），
  而非固定清单。新增页面建页时**必须同步注入 `config.js`**（置于 `db.js` 等数据层脚本之前，版本号与 `index.html` 一致），
  否则 `RT_DB.openDB()` 加载时读不到 `RT_CONFIG` 主库配置。本规则已在 `TODO_MODULE_PLAN.md`（阶段 6 技术要点）与
  `TODO_TASK_LIST.md`（批次 00 前置规则 / 批次 10）同步引用。

### ✅ Batch 3 — 主库收口（db.js + storage-backup.js）（已完成）
- [x] `db.js`：`DB_NAME` / `DB_VERSION_BASE` 改为读取 `RT_CONFIG.database('main')`，保留运行时自增逻辑。
- [x] `storage-backup.js`：`BASE_DB_NAME` 改为读取 `RT_CONFIG.database('main').name`。
- [x] `BASE_STORES` 维持既有 8-store 备份子集（**刻意不含** requirementTasks / taskLifecycles），仅收口库名；
  未扩大备份范围，避免影响现有备份/还原行为。
- [x] `RT_DB` / `RT_IMGSTORE` 仍导出 `DB_NAME`/`VERSION`/`IMG_STORE`/`ATT_STORE` 别名，兼容既有调用。

### ✅ Batch 4 — 媒体库收口（imgstore.js + app.js + storage-backup.js）（已完成）
- [x] 三处 `DB_NAME`/`DB_VERSION`/`IMG_STORE`/`ATT_STORE` 改为读取 `RT_CONFIG.database('media')`。
- [x] node 模拟加载顺序验证：db.js→`req-tracker`、imgstore.js→`req-tracker-pwa`、stores→`images`/`attachments`。
- [x] 全部改动文件 `node --check` 语法通过。

### ⬜ Batch 5 — 扩展其它配置（待用户提供具体内容后执行）
- [ ] 把分散的常量（如各模块 `LIMITS` 长度上限、每页条数、功能开关）逐步迁移到对应预留分组。
- [ ] 如需要可被外部工具读取，可另增 `config.json` 镜像（由发版脚本从 `config.js` 生成），但运行时仍以 `config.js` 为准。

## 四、执行约定
- 每个 Batch 独立成提交；涉及 `main` 推送按 `RULES.md` 用 `./release.sh` 升版本。
- 每完成一批先本地验证（浏览器打开 + 控制台看 `RT_CONFIG` + 关键功能冒烟），再决定是否提交。
- 改 `config.js` 的库名/版本时，必须同步更新对应模块与本文档。
