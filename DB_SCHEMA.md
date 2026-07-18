# IndexedDB 数据结构说明

本项目使用 **IndexedDB** 做本地持久化，但分属 **两个相互独立的数据库**。

- **`req-tracker`**：由 `db.js` 统一管理，存放「基础主数据」（公司 / 职位 / 部门 / 项目 / 项目版本 / 字典）。各数据模块通过 `RT_DB.registerStore()` 注册自己的 store 与索引。
- **`req-tracker-pwa`**：由 `app.js` 独立管理（不经 `db.js`），专门存放**图片与附件**（Base64 dataURL），以规避 localStorage ~5MB 配额。

> 任务/需求主记录本身**不在** IndexedDB 中（一般是 localStorage）。`images` / `attachments` 两张表通过 `taskId` 外键关联到任务主体。

---

## 一、数据库 `req-tracker`

- 库名：`req-tracker`
- 版本：`DB_VERSION_BASE = 3`（运行时实际版本取 `max(base, 探测到的已有版本)`，跨页面懒注册缺失 store 时还会自增）
- 统一主键：`keyPath: 'id'`
- ID 生成：`RT_DB.genId()` —— 16 字节随机数 → **32 位十六进制小写串**
- 共有 **6 张表（object store）**

### 1. `companies`（公司表）— companies.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（公司ID，唯一） |
| `companyName` | string | 公司名称，1–50 位 |
| `companyType` | string | `总公司` \| `分公司` |
| `companyCode` | string | 公司编码，1–10 位 |
| `parentId` | string | 所属公司ID；分公司必填（指向总公司 id），总公司为空 |
| `createdBy` / `createdAt` | string / number | 审计字段（创建人 / 创建时间戳） |
| `updatedBy` / `updatedAt` | string / number | 审计字段（更新人 / 更新时间戳） |

- **索引**：`companyType`、`parentId`、`companyCode`、`updatedAt`
- **升级规则**：`onUpgrade` 中 `oldVersion < 3` 时 `os.clear()`（清掉含旧 `branchName` 字段的数据）
- **约束**：分公司 `parentId` 必须指向存在的「总公司」且不能为自身；被降为分公司的总公司不得仍有下属分公司；删除前须先删下级分公司。

### 2. `positions`（职位表）— positions.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（职位ID，唯一） |
| `positionName` | string | 职位名称，1–50 位（必填） |
| `positionCode` | string | 职位编码，1–10 位（必填） |
| `positionLevel` | string | 职级，≤10 位（选填，如 初级/中级/高级） |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`positionCode`、`positionLevel`、`updatedAt`
- 扁平主数据，无层级关系。

### 3. `departments`（部门表）— departments.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（部门ID，唯一） |
| `deptName` | string | 部门名称，1–50 位 |
| `deptCode` | string | 部门编号，1–10 位 |
| `companyId` | string | 所属公司ID，必填（→ `companies`，总公司/分公司均可） |
| `parentId` | string | 上级部门ID，可选（同公司内自引用邻接表，支持多级；顶级为空） |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`deptCode`、`companyId`、`parentId`、`updatedAt`
- **约束**：部门必须归属某公司；上级部门必须同公司；防环（上级不能是自身或自身的下级）；删除前须先删下级部门。

### 4. `projects`（项目表）— projects.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（项目ID，唯一） |
| `projectName` | string | 项目名称，1–50 位 |
| `projectDesc` | string | 项目描述，0–200 位（选填） |
| `deptId` | string | 所属部门ID，必填（→ `departments`，部门再归属公司） |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`deptId`、`projectName`、`updatedAt`
- 删除项目无需清理下级（当前无引用项目的子表）。

### 5. `projectVersions`（项目版本表）— project-versions.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（版本ID，唯一） |
| `versionName` | string | 版本名称，1–50 位 |
| `versionDesc` | string | 版本描述，0–200 位（选填） |
| `projectId` | string | 所属项目ID，必填（→ `projects`，项目再归属部门、公司） |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`projectId`、`versionName`、`updatedAt`
- 删除版本无需清理下级。

### 6. `dict`（字典表）— dictionary.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID |
| `code` | string | 编码，字母/数字组成，类型内唯一（机器可读标识） |
| `type` | string | 字典分类：`任务类型` / `优先级` / `任务状态` |
| `name` | string | 名称，展示文案（中文） |
| `createdBy` | string | 创建人（种子数据填 `system`） |
| `createdAt` | number | 创建时间戳 |

- **索引**：`type`、`code`、`name`、`createdAt`
- **只读参考数据**：模块只负责「自动播种」系统枚举（`seedDict`），页面仅查看，无增删改。播种幂等——仅当 store 为空时写入。
- **种子枚举**：
  - 任务类型：`REQ` 需求 / `ONLINE_BUG` 线上BUG / `COMMON_BUG` 普通BUG
  - 优先级：`HIGH` 高 / `MEDIUM` 中 / `LOW` 低
  - 任务状态：`TODO` 待开发 / `SUBMITTED` 已提测 / `TESTING` 测试中 / `TESTED` 已测完 / `ONLINE` 已上线

---

## 二、数据库 `req-tracker-pwa`

- 库名：`req-tracker-pwa`
- 版本：`DB_VERSION = 4`
- 管理位置：`app.js`（`openImageDB()`，不经 `db.js`）
- 统一主键：`keyPath: 'id'`
- 共有 **2 张表（object store）**：`images`、`attachments`

### 7. `images`（图片表）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 主键，格式 `img-<time36>-<rand>`（`genImageId()` 生成） |
| `dataUrl` | string | 图片 Base64 dataURL |
| `taskId` | string | 关联任务 ID（外键，任务主体存于别处） |

- 写入入口：`dbPutImage({ id, dataUrl, taskId })`

### 8. `attachments`（附件表）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 主键，格式 `att-<time36>-<rand>`（`genAttachId()` 生成） |
| `name` | string | 文件名 |
| `type` | string | MIME 类型（如 `image/png`） |
| `size` | number | 字节大小 |
| `dataUrl` | string | 附件 Base64 dataURL |
| `taskId` | string | 关联任务 ID（外键） |

- 写入入口：`dbPutAttachment({ id, name, type, size, dataUrl, taskId })`

---

## 三、总览

| 数据库 | 版本 | 表（store） | 数量 |
|---|---|---|---|
| `req-tracker` | 3（base，可自增） | `companies`、`positions`、`departments`、`projects`、`projectVersions`、`dict` | 6 |
| `req-tracker-pwa` | 4 | `images`、`attachments` | 2 |
| **合计** | — | — | **8 张表 / 2 个库** |

### 排查提示

- 「表没建出来 / 版本冲突」根因通常两处：`db.js` 探测已有版本后抬高 `DB_VERSION`；或 `app.js` 的 `req-tracker-pwa` v4 与老库不兼容（`onupgradeneeded` 会按 store 缺失情况补齐）。
- `members` 目前并不存在——若后续要加「用户/成员」相关表，应遵循 `db.js` 的 `registerStore` 注册模式，或在 `app.js` 的 `onupgradeneeded` 中显式 `createObjectStore`。
