# 需求跟踪 PWA — CloudBase 后端化分析与执行方案

> 生成时间：2026-07-30
> 基于仓库版本：v1.3.71（`LovelyQY/req-tracker-pwa`）
> 分析输入：3 份执行清单（CloudBase 同步架构方案、设置中心 174–178、日历/考勤/报表/首页 180–184）+ 全量代码
> 输入状态：4 份清单已全部齐备（第 4 份「批次185_i18n」由用户上传至本地 uploads，已并入本报告）。

---

## 一、四份文件的执行顺序（含依赖关系）

| 顺序 | 文件 | 核心定位 | 关键依赖 |
|------|------|----------|----------|
| **1** | `CloudBase同步架构方案.md` | **阶段 0 · 后端地基** | 无前置；所有「真实后端能力」都依赖它 |
| **2** | `批次174-178_设置中心设计与执行清单.md` | 设置中心 hub + 账号/偏好/云同步/反馈 | 框架层（174）可与阶段 0 并行；真实数据功能（账号资料、登录设备、云同步、反馈）必须等阶段 0 就绪 |
| **3** | `批次180-184_日历考勤_统计报表_首页仪表盘_设计与执行清单.md` | 首页仪表盘 + 日历考勤 + 统计报表 | 本地优先部分（180–183 大部分）可与设置中心并行；**反馈 TAB / 当日反馈 / 团队视图**需等设置中心 178 + 阶段 0 |
| **4** | `批次185_i18n全站多语言_设计与执行清单.md` | 全站 6 语言 i18n（消费 176 的 `langchange`） | 框架(185-A) 可在 176 选择器之后启动；但 **全站 rewire(185-D) 必须等 174–184 全部页面稳定后**再做，否则会「改完又重建」。en/ko/ja(185-C) 可分步上线 |

**一句话总结**：先搭 CloudBase 后端（阶段 0），再做设置中心和日历/首页的本地框架，接着把依赖云端的功能逐个接真，最后做 i18n 收尾（且 i18n 全站 rewire 放到所有页面定稿之后）。

**更细的依赖链**：
- 阶段 0 → 设置中心 175（账号资料/安全）、176（深色/主题色/通知需 `user_settings`）、177（云同步）、178（反馈写 `feedback`）。
- 设置中心 174（hub 框架）→ 180（首页 TAB）、181–183（日历）、179（反馈 TAB，在设置文件末尾，依赖 178 反馈表单）。
- 178 反馈 → 179 反馈 TAB → 183 当日反馈聚合。
- 176 语言选择器 → **185-A 框架（消费 `langchange`）→ 185-B/C 字典 → 185-D 全站 rewire（最后）**。
- 185 内部关键顺序：**185-A（框架+zh-CN基准+1个试点页）先跑**；185-B(zh-HK/zh-TW)、185-C(en/ko/ja) 字典可并行准备；**185-D（全站逐页 rewire）放到 174–184 全部定稿后**，避免重复劳动。

**i18n 185 与 CloudBase 的关系**：语言**偏好**（`getLang()` 的值）经 `user_settings` + `RT_SYNC` 跨设备漫游；**字典文件本身是静态资源随发版打包，不走云端**。这与阶段 0 设计一致，不产生新的后端依赖。

---

## 二、整体架构现状

### 2.1 当前是纯静态 PWA，无后端

- **页面**：纯 HTML + JS + CSS，无构建步骤；`release.sh` 仅做版本号替换与 CHANGELOG 生成。
- **数据持久化**：浏览器端 **IndexedDB** + 少量 localStorage。
- **认证**：本地 SHA-256 密码哈希，存在 `users` 表；会活在 `localStorage/sessionStorage`。
- **离线**：Service Worker 缓存静态资源；数据本身就在本地，天然离线可用。

### 2.2 两个 IndexedDB 数据库、18 张表

| 库名 | 用途 | store 数量 | 关键 store |
|------|------|------------|-----------|
| `req-tracker` | 主业务数据 | 16 | `users`, `companies`, `departments`, `positions`, `projects`, `projectVersions`, `dict`, `changelog`, `requirementTasks`, `taskLifecycles`, `todos`, `todoLifecycles`, `roles`, `menus`, `role_permission`, `user_role` |
| `req-tracker-pwa` | 媒体二进制 | 2 | `images`, `attachments` |

### 2.3 两套任务数据并存（已决策：删除旧版）

1. **新版 IndexedDB 体系**：`requirementTasks` + `todos` + 生命周期表，规范化一等实体——这是 CloudBase 同步的唯一真实源。
2. **旧版 localStorage 任务看板**：`storage-backup.js` 中的 `STORE_KEY = 'req-tracker-v2-items'`，状态存中文名、开发人员为自由文本；仅由备份/恢复页引用，且数据仅为测试数据、无遗留用户数据。

> **决策**：旧看板不再冻结或迁移，而是**直接删除**（`storage-backup.js` 中移除相关代码分支，备份恢复仅保留 IndexedDB `BASE_STORES`）。见 §5.5。

### 2.4 数据层模式统一

- 各模块通过 `RT_DB.registerStore()` 注册 store 与索引（`db.js`）。
- 各模块提供 `createXxx` / `updateXxx` / `deleteXxx` / `getXxx` / `getAllXxx` / `validateXxx`。
- `crud-factory.js` 已抽取 5 个实体页（company/department/position/project/project-version）通用保存/删除生命周期，可作为同步适配层的接入点。

### 2.5 设置与配置现状

- `settings.html` 目前仅一个「中 / EN」语言切换，`settings.js` 调 `RT_CONFIG.setLang()`。
- `RT_CONFIG.ui.lang` 是内存事实源，`localStorage('rt_lang')` 持久层，仅 `permission.js` 消费了双语渲染。
- 主题色、深色模式、通知、系统权限、下载地址、云同步、登录设备、帮助反馈 **均无实现**。
- 全局样式变量集中在 `base.css`（`:root`）与 `theme.css`；主色 `--primary:#1677ff`，仍有散落硬码蓝（`#096dd9` 需求色、`#4096ff` primary-light）。

---

## 三、CloudBase 后端化改动面总览

### 3.1 核心原则（与方案一致）

> **保留 IndexedDB 作为离线缓存与快读层，CloudBase 作为唯一真实源（source of truth）。**
> 这是 PWA 离线优先的必然选择，不能改成纯云端。

### 3.2 必须新增的 CloudBase 能力

| 能力 | 必要性 | 说明 |
|------|--------|------|
| 云数据库 | 必需 | 所有业务表云端镜像 |
| 云函数 | 必需 | 自定义登录票据、登录日志、敏感操作（密码修改）、Web Push |
| 云存储 | 必需 | 图片 / 附件二进制替换 Base64 IndexedDB |
| 静态托管 | 推荐 | PWA 部署到 CloudBase 静态托管，HTTPS 域名天然满足 SW / Push |
| 安全规则 | 必需 | 按 `_owner == auth.uid` 隔离用户数据 |

### 3.3 前端必须新增的模块

| 模块 | 职责 |
|------|------|
| `cloudbase.js` | CloudBase SDK 初始化、环境配置 |
| `sync.js`（`RT_SYNC`） | 增量 pull/push、冲突解决、软删除、同步队列、watch 实时同步 |
| `cloud-auth.js` | 本地校验 → 云函数换 ticket → `tcb.auth.signInWithTicket` |
| `cloud-storage.js` | 文件上传/下载，替代 `RT_IMGSTORE` 的 IndexedDB 存储 |
| 各数据模块 `cloud` 适配层 | `users.js` / `companies.js` 等写操作后同时入同步队列 |

---

## 四、数据表同步映射（18 张本地表 → CloudBase 集合）

现有 CloudBase 方案只列了 11 个集合，**未覆盖全部 18 张表**。完整映射：

### 4.1 已在方案中明确的集合

| CloudBase 集合 | 本地 store | 同步策略 | 安全规则建议 |
|----------------|------------|----------|--------------|
| `users` | `users` | 双向同步，密码逐步迁 CloudBase Auth | `auth.uid == doc._owner` |
| `depts` | `departments` | 组织共享：登录可读，仅云函数/管理员可写 | `read: auth != null` |
| `positions` | `positions` | 同上 | `read: auth != null` |
| `requirements` | `requirementTasks` | 双向同步 | `auth.uid == doc._owner` |
| `attachments` | `attachments`（元数据） | 元数据同步，**本体迁云存储** | `auth.uid == doc._owner` |
| `login_logs` | 新增 | 云函数登录时写 | `auth.uid == doc._owner` |
| `user_settings` | 新增 | 双向同步（偏好漫游） | `auth.uid == doc._owner` |
| `sync_logs` | 新增 | 同步记录审计 | `auth.uid == doc._owner` |
| `user_push_subs` | 新增 | Web Push 订阅体 | `auth.uid == doc._owner` |
| `feedback` | 新增 | 用户提交 → 云端；官方回复 → 云端 | `auth.uid == doc._owner` |
| `help_docs` | 新增 | 管理员写，全员读 | `read: auth != null` |

### 4.2 方案中缺失、必须补充的集合

| 本地 store | 是否上云 | CloudBase 集合 | 说明 |
|------------|----------|----------------|------|
| `companies` | 是 | `companies` | 组织架构基础，与 `depts` 同享只读 |
| `projectVersions` | 是 | `project_versions` | 需求任务外键依赖 |
| `projects` | 是 | `projects` | 需求任务/待办外键依赖 |
| `dict` | 可选 | `dict`（只读镜像） | 字典本地种子，可保持本地；云端部署一份用于多设备校准 |
| `changelog` | 否 | — | 由本地 `CHANGELOG.md` 解析生成，保持本地 |
| `taskLifecycles` | 是 | `task_lifecycles` | 审计流水，append-only |
| `todoLifecycles` | 是 | `todo_lifecycles` | 审计流水，append-only |
| `roles` | 是 | `roles` | RBAC 核心，组织共享 |
| `menus` | 是 | `menus` | 权限树节点，组织共享 |
| `role_permission` | 是 | `role_permission` | 权限分配历史 |
| `user_role` | 是 | `user_role` | 人员角色分配历史 |
| `images` | 是（迁云存储） | `attachments` 元数据 + 云存储文件 | 图片不再存 Base64，改存云存储 URL |

### 4.3 统一同步元数据字段

每个 CloudBase 文档需附加：

```js
{
  _owner: 'cloudbase-auth-uid',   // 用户隔离
  _createdAt: 1785364814000,      // 创建时间
  _updatedAt: 1785364814000,      // 更新时间（冲突判定）
  _updatedBy: 'account-or-uid',   // 最后修改者
  _deleted: false                 // 软删除标记
}
```

> **软删除必做**：硬删除无法同步到已离线设备，会导致「死而复生」。需在 `crudDelete` / 各 `deleteXxx` 改为写 `_deleted:true` 后再入同步队列。

---

## 五、关键改动与优化点详解

### 5.1 认证桥接（最核心、最优先）

- 当前：`登录页 → 本地 users 表查密码哈希 → 写 rt_session → 完成`
- CloudBase 后：`登录页 → 本地 users 校验哈希 → 调云函数 getLoginTicket → tcb.auth.signInWithTicket → 拿到 uid → 写 rt_session + 记录 login_logs`

**优化点**：
- 密码最终交给 CloudBase Auth 管理，本地不再存 SHA-256 哈希。
- 过渡期需支持「本地哈希 → 首次登录迁移到 CloudBase Auth」平滑升级。
- `auth.js` 的 `getSessionAccount()` 需扩展：返回 account + uid，供数据写入 `_owner`。

### 5.2 同步引擎 `RT_SYNC`

| 能力 | 起步实现 | 后续优化 |
|------|----------|----------|
| 增量拉取 | 按 `_updatedAt > lastSyncTs && _owner == uid` | 游标分页、断点续传 |
| 增量推送 | 本地写入先入队，联网 flush | 批量合并、失败重试 |
| 冲突解决 | `_updatedAt` 后写覆盖（LWW） | 字段级合并、版本向量 |
| 软删除 | `_deleted: true` | 定期垃圾回收 |
| 实时同步 | `db.collection().watch()` | 多标签页秒级同步 |
| 离线队列 | IndexedDB 队列表 | 队列持久化、幂等去重 |

**改动面**：
- 所有 `createXxx` / `updateXxx` / `deleteXxx` 在执行本地 IDB 写入后，需同时把操作（或结果快照）推入 `RT_SYNC` 队列。
- 读操作优先读本地 IDB，后台触发 `pull()` 更新本地缓存。
- 建议以 `crud-factory.js` 的 `crudSave` / `crudDelete` 为统一接入点，避免逐页改。

### 5.3 媒体存储改造（优化重点）

- 当前：`images` / `attachments` 存 Base64 dataURL，占 IndexedDB 空间，无法跨设备同步。
- CloudBase 后：文件本体上传到**云存储**，返回 `fileID` / CDN URL；IndexedDB 仅保留元数据 + URL，离线时回退本地缓存。
- `RT_IMGSTORE.resolveAvatar(id)` 需改造：先查本地缓存，再查云存储，最后回退默认头像。

### 5.4 设置中心改造

| 设置项 | 改动量 | 后端依赖 |
|--------|--------|----------|
| 个人资料 | 中 | `users` 集合 |
| 账号安全 | 中 | `users` + CloudBase Auth |
| 登录设备 | 大 | `login_logs` + 云函数 |
| 通知开关/声音/震动 | 小 | `user_settings` |
| 深色模式 | 中 | `user_settings` + CSS 变量 |
| 主题颜色 | 中 | `user_settings` + `--primary` 变量化 |
| 语言 6 选项 | 中 | `user_settings` + `i18n/` 字典（见 §5.7 / 阶段 3） |
| 系统权限 | 小 | `user_settings`（状态漫游） |
| 下载地址 | 小 | `user_settings`（标签漫游） |
| 云同步 | 大 | `RT_SYNC` + `sync_logs` |
| 帮助文档查看器 | 中 | `help_docs` |
| 反馈表单/列表 | 中 | `feedback` |

**优化点**：
- `settings.html` 需从单页语言切换改造成「landing + hash 子视图」hub，参考 `storage-backup.html`。
- 主题色必须全站收敛到 `var(--primary)` 系列；当前 `base.css` 仍有 `#1677ff` / `#096dd9` / `#4096ff` 硬编码，需审计收敛。

### 5.5 旧版 localStorage 任务看板（已决策：直接删除，测试数据）

`storage-backup.js` 的 `STORE_KEY='req-tracker-v2-items'` 旧看板与 `requirementTasks` 并存（见 `DB_SCHEMA.md`）。经确认该旧看板**仅为测试数据、无遗留用户数据**，**决策：直接删除，不冻结、不迁移、不保留。**
- 阶段 0 前从 `storage-backup.js`（及任何引用处）彻底移除旧看板代码：`STORE_KEY` / `SETTINGS_KEY` / `loadItems()` / `saveItems()` / `items` / `settings` 分支，以及 `downloadBackup()` / `applyBackup()` 中与旧看板相关的嵌入与恢复逻辑。
- 移除后，备份/恢复仅保留 IndexedDB `BASE_STORES`（含 `requirementTasks` 等）作为唯一真实源，杜绝双数据源。
- 旧看板入口（若有）一并删除或指向新版需求任务，不再提示「旧版」。

### 5.6 权限（RBAC）的云端化

`roles` / `menus` / `role_permission` / `user_role` 4 张表是组织共享的权限数据：
- 组织共享：登录可读（`read: auth != null`），仅管理员/云函数可写。
- `menus` 由 `seedMenusFromRegistry()` 幂等播种，云端同样需一份种子，保证新设备首次登录即有权限树。

### 5.7 i18n 全站多语言（批次 185）— 最大单项工程

- **现状**：`RT_CONFIG.setLang` 仅骨架，全站中文为硬编码；设置中心 176 只做「选择器+持久化+触发 `langchange`」，真正全站切换由 185 补全。
- **框架**：全局 `t(key, vars?)` 翻译函数；字典 `i18n/{zh-CN,zh-HK,zh-TW,en,ko,ja}.json` 按语言懒加载；监听 `langchange` 重渲染当前页；**key 缺失回退 zh-CN 防白屏**；启动即 `applyLang(savedLang)`。
- **接入方式**：静态文案用 `data-i18n="key"` 批量填充；动态/JS 生成文案（含 `toast(t('...'))`、确认框、校验错误）改调 `t()`。
- **覆盖范围**：所有 HTML 标题/按钮/标签/占位符/空状态 + toast/确认框/错误 + 状态与类型名 + 设置/日历/首页/帮助/反馈全部文案（见 §3 文件覆盖范围）。
- **与后端**：语言偏好漫游走 `user_settings`+`RT_SYNC`；字典为静态资源**不上云**。
- **分批**：185-A 框架+zh-CN基准+1试点页 → 185-B zh-HK/zh-TW → 185-C en/ko/ja → 185-D 全站 rewire（最后，等 174–184 定稿）。

---

## 六、分阶段执行方案（含四文件顺序）

### 阶段 0（文件 1：CloudBase 同步架构方案）— 最高优先级

1. 开通 CloudBase 环境（云数据库 + 云函数 + 云存储 + 静态托管）。
2. 建集合 schema（含 §4.2 补充的全部集合）与统一元数据字段。
3. 认证桥接：云函数 `getLoginTicket`（自定义登录）+ `login_logs` 写入 + 数据播种（首次上传本地 IDB）。
4. 同步引擎 `RT_SYNC` 雏形（pull/push/冲突/安全规则）。
5. 安全规则（用户隔离 + 组织共享只读）。
6. **未就绪则一切真实后端功能无法落地**。

### 阶段 1（文件 2：设置中心 174–178）

- **174 hub 框架**：可与阶段 0 并行启动（纯前端结构）。
- **175 账号分组 / 176 界面与展示+通知 / 177 系统权限+下载+云同步 / 178 帮助+反馈**：真实数据功能必须等阶段 0 就绪后逐个接真。
- 注意 179（反馈 TAB）虽写在设置文件内，但依赖 178 反馈表单 + 首页 TAB 改造（文件 3）。

### 阶段 2（文件 3：日历/考勤/报表/首页 180–184）

- **本地优先部分**：180 首页仪表盘、181 日历+打卡+节假日、182 请假、183 日历当日详情、184 统计报表 —— 均可本地先实现。
- **依赖云端的部分**：179 反馈 TAB（需 178）、183 当日反馈聚合（需 `feedback`）、团队/管理视图（需阶段 0 权限与共享数据）。
- TAB 栏最终顺序：`首页 / 任务 / 待办 / 日历 / 反馈`（180 首页置最左，179 反馈置日历右侧）。

### 阶段 3（文件 4：i18n 185）— 收尾（消费 176 的 `langchange`）

185 是本项目**最大单项工程**（全站文案抽 key + 6 语言翻译），且与 176 解耦：176 只做「选择器+持久化+触发 `langchange`」，185 消费该事件做全站重渲染。

- **185-A 框架 + zh-CN 基准 + 试点**：实现 `t(key, vars?)` / 字典懒加载 / `langchange` 重渲染 / **key 缺失回退 zh-CN（防白屏）** / 启动时 `applyLang(savedLang)`。以当前全站中文为 `zh-CN.json` 基准（扫描全部 `*.html`+`*.js` 抽中文为 key），选 **1 个稳定页面**（建议 settings hub 或首页）端到端 rewire，验证 `data-i18n` + `t()` + `langchange` 闭环。
- **185-B zh-HK / zh-TW 字典**：基于 zh-CN 生成两份繁体字典，按中国香港/中国台湾用词差异校译（繁简 + 术语，如「账户/帳戶」「软件/軟體」）。
- **185-C en / ko / ja 字典**：英/韩/日全译，关键流程文案需母语/专业校对（可借翻译资源）。
- **185-D 全站 rewire（必须最后）**：批量将剩余所有页面/JS 的中文替换为 `t('key')` / `data-i18n`；逐页走查确保目标语言下无残留中文。**务必等 174–184 全部定稿后执行**，否则刚 rewire 的页面又被重构。
- **与 CloudBase 关系**：语言偏好存 `user_settings` 经 `RT_SYNC` 漫游；字典本身是静态资源随发版打包，**不走云端**。
- **发版注意**：新增 `i18n/*.json` 需在 `release.sh` 登记引用（参照批次169 教训），避免发版自检漂移失败。

> 关键风险（来自 185 文件）：toast / `customConfirm` 等提示散落在各调用点最易漏；动态业务数据（用户名、需求标题、反馈内容）**不翻译**，仅 UI 框架文案翻译；6 份字典 key 必须对齐（脚本校验缺失 key）。

---

## 七、风险与注意事项

1. **阶段 0 优先级最高**：无 `uid` 则安全规则不生效，同步无从谈起。
2. **别拆 IndexedDB**：离线优先，CloudBase 仅作真实源与同步层。
3. **软删除必做**：硬删无法同步，历史会「复活」。
4. **冲突起步用 LWW**：字段级合并是后续优化，不必一开始就上。
5. **主题色变量化**：散落硬编码蓝必须收敛到 `var(--primary)`，否则换色不彻底。
6. **6 语言是翻译工程**：开关 UI 易，全站词条字典是持续投入。
7. **推送最重**：Web Push 链路（VAPID + 云函数）独立成工程，避免阻塞设置中心主流程。
8. **旧任务看板包袱（已决策删除）**：旧版 `req-tracker-v2-items` 仅为测试数据，阶段 0 前直接从 `storage-backup.js` 等引用处删除，消除双数据源与维护负担。
9. **权限树种子**：`menus` 云端需保留种子，保证新设备权限树完整。
10. **数据播种幂等**：首次同步上传本地 IDB 须幂等，避免重复或覆盖他人数据。

---

## 八、里程碑与验收标准（建议）

| 里程碑 | 交付物 | 验收 |
|--------|--------|------|
| M0 后端就绪 | CloudBase 环境 + 全集合 schema + 安全规则 + 认证桥接 + 数据播种 | 首次同步能把本地 IDB 上传云端，且 `auth.uid` 可用 |
| M1 双向同步 | `RT_SYNC` pull/push/冲突/软删 | 断网改数据 → 联网后跨设备一致 |
| M2 设置中心真实化 | 云同步/登录设备/资料/偏好漫游/6语言/主题色 | 换设备登录后偏好与资料一致 |
| M3 首页+日历+报表 | 5 TAB 落地、打卡/请假/统计/反馈 | 本地可用，反馈写入 `feedback` |
| M4 全站 i18n | 6 语言切换无遗漏 | 任意语言下全站无硬编码中文残留 |

---

## 九、第 4 份文件（批次185 i18n）已并入

批次 185 已由用户上传并入本文，主要补全/修正了以下内容：

- **分批颗粒度**：185-A（框架+zh-CN基准+1试点页）/ 185-B（zh-HK/zh-TW）/ 185-C（en/ko/ja）/ 185-D（全站 rewire，最后）。
- **关键顺序修正**：185-D 全站 rewire 必须等 174–184 全部定稿后再做，避免「改完又重建」。
- **框架 API**：`t(key, vars?)` + `data-i18n` + `langchange` 重渲染 + **key 缺失回退 zh-CN（防白屏）**。
- **与 176 解耦**：176 只做选择器+持久化+触发事件；185 消费事件做全站重渲染。
- **与 CloudBase 关系**：偏好走 `user_settings`+`RT_SYNC` 漫游，字典静态资源不上云。
- **发版注意**：`i18n/*.json` 需在 `release.sh` 登记引用。

> 全文四份清单现已全部纳入：第一章（执行顺序）、第三章（架构现状）、第四章（同步映射）、第五章（改动点，含 §5.7 i18n）、第六章（阶段 3 完整批次）、第八章（M4 验收）、本章（并入说明）。
