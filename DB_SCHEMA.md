# IndexedDB 数据结构说明

本项目使用 **IndexedDB** 做本地持久化，但分属 **两个相互独立的数据库**。

- **`req-tracker`**：由 `db.js` 统一管理，存放「基础主数据」（公司 / 职位 / 部门 / 人员 / 项目 / 项目版本 / 字典）与「更新日志」（`changelog`）。各数据模块通过 `RT_DB.registerStore()` 注册自己的 store 与索引。
- **`req-tracker-pwa`**：由 `app.js` 独立管理（不经 `db.js`），专门存放**图片与附件**（Base64 dataURL），以规避 localStorage ~5MB 配额。

> 任务/需求主记录本身**不在** IndexedDB 中（一般是 localStorage）。`images` / `attachments` 两张表通过 `taskId` 外键关联到任务主体。

---

## 一、数据库 `req-tracker`

- 库名：`req-tracker`
- 版本：`DB_VERSION_BASE = 3`（运行时实际版本取 `max(base, 探测到的已有版本)`，跨页面懒注册缺失 store 时还会自增）
- 统一主键：`keyPath: 'id'`
- ID 生成：`RT_DB.genId()` —— 16 字节随机数 → **32 位十六进制小写串**
- 共有 **8 张表（object store）**

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
| `deptCode` | string | 部门编码，1–10 位 |
| `companyId` | string | 所属公司ID，必填（→ `companies`，总公司/分公司均可） |
| `parentId` | string | 上级部门ID，可选（同公司内自引用邻接表，支持多级；顶级为空） |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`deptCode`、`companyId`、`parentId`、`updatedAt`
- **约束**：部门必须归属某公司；上级部门必须同公司；防环（上级不能是自身或自身的下级）；删除前须先删下级部门。

### 4. `users`（人员表）— users.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（人员ID，唯一） |
| `account` | string | 账号，4–20 位，仅英文(大小写)/数字/. _ - @（必填，唯一）。**人员管理新建时 `account` 自动取「工号」** |
| `employeeNo` | string | 工号，≤30 位（人员管理必填；也是登录标识之一） |
| `nickname` | string | 昵称，1–10 位（必填，展示用） |
| `name` | string | 姓名（人员管理必填） |
| `password` | string | 密码，必填；统一存储 SHA-256 哈希，不存明文。人员管理新建时默认 `sha256("123")` |
| `departmentId` | string | 部门ID，必填（→ `departments`，由「人员管理」维护） |
| `positionId` | string | 职位ID，选填（→ `positions`，由「人员管理」维护） |
| `personStatusCode` | string | 人员状态 code，默认 `REGULAR`（正式员工）；取值见字典表 `人员状态` 类型（`REGULAR` 正式员工 / `PROBATION` 试用期 / `INTERN` 实习生 / `OUTSOURCE` 外包 / `LEFT` 离职）。**实体只存 code，展示文案取自字典** |
| `phone` | string | 手机，选填，11 位中国大陆手机号（由「个人信息」维护） |
| `email` | string | 邮箱，必填（由「个人信息」维护） |
| `tags` | string | 标签，选填（由「个人信息」维护） |
| `signature` | string | 个性签名，选填（由「个人信息」维护） |
| `avatar` | string | 头像引用（**仅存 `images` 表的短 id**，约 40 字符；历史数据可能为 dataURL，向后兼容）。大体积头像字节统一存于 `req-tracker-pwa` 库的 `images` 表，由 `imgstore.js`（`RT_IMGSTORE`）读写，显示时按 id 解析为 dataURL。这样 `users` 记录始终保持「轻」，详见下方「二、图像存储」。（由「个人信息」维护） |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`account`、`employeeNo`、`email`、`departmentId`、`positionId`、`nickname`、`updatedAt`
- **职责拆分（两页共建同一张表）**：
  - **「人员管理」页**（`user.html`，`createPerson` / `updatePerson` / `validatePerson`）：只管理人 ↔ 部门 / 职位关系与基础身份，仅维护 `employeeNo`、`name`、`departmentId`、`positionId` 四个字段。新建人员时 `account` 自动取工号、默认密码 `sha256("123")`、`nickname` 取姓名，其余资料留空。
  - **「个人信息」页**（`profile.html` / `profile-edit.html`，`updateProfile` / `validateProfile`）：维护其余资料 `account`(只读，绑定工号)、`nickname`、`password`、`phone`、`email`、`tags`、`signature`、`avatar`。
  - `updateProfile` 采用「按需更新」：仅覆盖传入的字段，未提供的字段保持原值（单字段编辑不会清空其它资料）。
- **约束**：`account` 唯一（按账号登录时精确匹配）；`employeeNo` 唯一（按工号登录时精确匹配）；`departmentId` 必填且须指向存在的部门；`password` 始终为 SHA-256 哈希。
- **登录识别**：`login/classic.html` 解析登录标识时依次尝试「人员表按账号」→「人员表按工号」，命中且密码哈希一致即登录成功。因此**账号或工号均可登录**。
- **迁移**：首次打开「人员管理」页时，`migrateAccounts()` 把 `localStorage` 的 `rt_accounts`（旧版账号库）一次性导入本表，密码沿用原 `pwdHash`，`departmentId` 留空待在人员管理页补全；迁移幂等，仅执行一次。
- **v1.2.82**：已移除 `rt_accounts` 双库同步机制，所有数据统一由 IndexedDB users 表管理。

### 5. `projects`（项目表）— projects.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（项目ID，唯一） |
| `projectName` | string | 项目名称，1–50 位 |
| `projectDesc` | string | 项目描述，0–200 位（选填） |
| `deptId` | string | 所属部门ID，必填（→ `departments`，部门再归属公司） |
| `statusCode` | string | 项目状态 code，默认 `ACTIVE`（进行中）；取值见字典表 `项目状态` 类型（`ACTIVE` 进行中 / `ARCHIVED` 已归档）。**实体只存 code，展示文案取自字典** |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`deptId`、`projectName`、`updatedAt`
- 删除项目无需清理下级（当前无引用项目的子表）。

### 6. `projectVersions`（项目版本表）— project-versions.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（版本ID，唯一） |
| `versionName` | string | 版本名称，1–50 位 |
| `versionDesc` | string | 版本描述，0–200 位（选填） |
| `projectId` | string | 所属项目ID，必填（→ `projects`，项目再归属部门、公司） |
| `statusCode` | string | 版本状态 code，默认 `ACTIVE`（进行中）；取值见字典表 `项目状态` 类型（`ACTIVE` 进行中 / `ARCHIVED` 已归档）。**实体只存 code，展示文案取自字典** |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`projectId`、`versionName`、`updatedAt`
- 删除版本无需清理下级。

### 7. `dict`（字典表）— dictionary.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID |
| `code` | string | 编码，字母/数字组成，类型内唯一（机器可读标识） |
| `type` | string | 字典分类：`任务类型` / `优先级` / `任务状态` / `项目状态` / `人员状态` |
| `name` | string | 名称，展示文案（中文） |
| `createdBy` | string | 创建人（种子数据填 `system`） |
| `createdAt` | number | 创建时间戳 |

- **索引**：`type`、`code`、`name`、`createdAt`
- **只读参考数据**：模块只负责「自动播种」系统枚举（`seedDict`），页面仅查看，无增删改。播种幂等——按 `(type, code)` 去重，**仅补充缺失枚举**（即使 store 已有数据，也会补齐新增类型如 `项目状态`），不会重复写入。
- **种子枚举**：
  - 任务类型：`REQ` 需求 / `ONLINE_BUG` 线上BUG / `COMMON_BUG` 普通BUG
  - 优先级：`HIGH` 高 / `MEDIUM` 中 / `LOW` 低
  - 任务状态：`TODO` 待开发 / `SUBMITTED` 已提测 / `TESTING` 测试中 / `TESTED` 已测完 / `ONLINE` 已上线
  - 项目状态：`ACTIVE` 进行中 / `ARCHIVED` 已归档（项目 / 项目版本共用；实体只存 code，文案取自本类型）
  - 人员状态：`REGULAR` 正式员工 / `PROBATION` 试用期 / `INTERN` 实习生 / `OUTSOURCE` 外包 / `LEFT` 离职（人员管理；实体只存 code，文案取自本类型）

### 8. `changelog`（更新日志表）— changelog.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（`RT_DB.genId()` 生成） |
| `version` | string | 版本号，如 `1.2.54`（按版本去重，唯一） |
| `description` | string | 更新说明（取自 `CHANGELOG.md` 对应条目正文） |
| `updateTime` | number | 更新时间（毫秒时间戳，由 `CHANGELOG.md` 条目标题日期解析；解析失败回退当前时间） |
| `source` | string | **修改来源**：固定 `'changelog'`，表示由 `CHANGELOG.md` 解析自动填充（含首次历史回填与每次发版后自动写入） |

- **索引**：`version`、`updateTime`、`source`
- **自动填充机制**：`seedFromChangelog()` 读取同源 `CHANGELOG.md`（与设置页「更新日志」弹窗同一数据源），解析全部 `## vX.Y.Z (日期)` 带版本号记录，按 `version` 去重写入缺失项。
- **历史回填**：首次运行即从 `CHANGELOG.md` 导入全部历史版本（当前约 187 条）。
- **每次更新自动写入**：因 `CHANGELOG.md` 在每次发版时由 `release.sh` 自动追加新条目，故 App 每次打开检测到表中缺失的新版本即自动写入——实现「每次更新产生的更新日志自动填充进数据表」。
- **幂等**：已存在的 `version` 不会重复插入。

---

## 二、数据库 `req-tracker-pwa`

- 库名：`req-tracker-pwa`
- 版本：`DB_VERSION = 4`
- 管理位置：`app.js`（`openImageDB()`，不经 `db.js`）
- 统一主键：`keyPath: 'id'`
- 共有 **2 张表（object store）**：`images`、`attachments`

### 8. `images`（图片表）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 主键，格式 `img-<time36>-<rand>`（`genImageId()` 生成）；头像使用固定 id `avatar-<userId>`（每用户一个头像槽，覆盖即更新） |
| `dataUrl` | string | 图片 Base64 dataURL |
| `taskId` | string | 关联任务 ID（外键，任务主体存于别处）；头像固定为 `'avatar'` |

- 写入入口：`dbPutImage({ id, dataUrl, taskId })`（由 `app.js` 与 `imgstore.js` 共用同一底层）
- **头像也存于此表**：`users.avatar` 仅存短 id 引用，显示时 `RT_IMGSTORE.resolveAvatar(id)` 解析为 dataURL；历史 dataURL 直接返回，向后兼容。

### 9. `attachments`（附件表）

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
| `req-tracker` | 3（base，可自增） | `companies`、`positions`、`departments`、`users`、`projects`、`projectVersions`、`dict`、`changelog` | 8 |
| `req-tracker-pwa` | 4 | `images`、`attachments` | 2 |
| **合计** | — | — | **10 张表 / 2 个库** |

### 排查提示

- 「表没建出来 / 版本冲突」根因通常两处：`db.js` 探测已有版本后抬高 `DB_VERSION`；或 `app.js` 的 `req-tracker-pwa` v4 与老库不兼容（`onupgradeneeded` 会按 store 缺失情况补齐）。
- `members` 曾为预留的「用户/成员」表设想，现已落地为 `users` store（见上文第 4 节），遵循 `db.js` 的 `registerStore` 注册模式，由 `users.js` 维护。
