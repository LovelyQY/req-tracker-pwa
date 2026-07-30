# 需求任务追踪 PWA（req-tracker-pwa）

移动端需求 / 任务跟踪 PWA，支持离线使用、本地持久化，并可连接腾讯云开发 CloudBase 进行云端同步。

## 线上地址

- https://pwa-20260724-d2g883p981e75c948-1301944898.tcloudbaseapp.com

> 未绑定自定义域名：CloudBase 自定义域名需升级服务套餐，当前使用默认域名即可。

手机浏览器打开后，可通过「添加到主屏幕」安装为 App，支持离线使用。

## CloudBase 环境

- 环境 ID：`pwa-20260724-d2g883p981e75c948`
- 地域：ap-shanghai
- 连接配置：`config.js` 中的 `RT_CONFIG.sync.cloudbase.envId`
- Web SDK：v3 ESM（`@cloudbase/js-sdk@3.6.6`），在 `index.html` 引入并挂载 `window.cloudbase`
- 登录方式：控制台已开启「匿名登录」

## 部署

使用 CloudBase CLI 直接上传静态文件（纯静态站点，无需构建）：

```bash
tcb hosting deploy . -e pwa-20260724-d2g883p981e75c948
```

> 注意：部署目录不要包含 `.git`（其中含 GitHub 令牌，切勿上传到公开托管）。

## 数据库初始化（集合 + 安全规则）

Stage 0 的 0.2 / 0.3 / 0.4 / 0.5 已完成：创建 20 个集合 + 配置安全规则（校验 20/20）+ 客户端数据播种（匿名登录上传本地 IDB）+ 双向同步引擎（pull/push/软删除/LWW + outbox 队列）。

- 集合定义与规则模板：`cloudbase/collections.schema.json`
- 初始化脚本（幂等，可安全重跑）：`cloudbase/init-db.py`

```bash
# 登录（使用具备云开发 TCB 权限的账号密钥）
tcb login --apiKeyId <SecretId> --apiKey <SecretKey> -e pwa-20260724-d2g883p981e75c948
# 建 20 个集合 + 设安全规则
python3 cloudbase/init-db.py
# 仅检查当前集合 / 规则状态（不改写）
python3 cloudbase/init-db.py --check
```

规则分类：

| 类别 | 数量 | 集合 | 安全规则 |
|------|------|------|----------|
| 用户隔离 | 16 | `users` / `requirements` / `projects` / `project_versions` / `task_lifecycles` / `todo_lifecycles` / `attachments` / `login_logs` / `user_settings` / `sync_logs` / `user_push_subs` / `feedback` / `help_docs` / `companies` / `depts` / `positions` | CUSTOM：`read/write = auth.uid == doc._owner`（匿名登录 uid 隔离，**手机端可直接读写，含 0.4 重新归类的组织架构**） |
| 组织共享只读 | 4 | `roles` / `menus` / `role_permission` / `user_role` | ADMINWRITE：`read:true, write:false`（仅云函数 / 管理员可写） |

> 所有文档统一附加元数据字段：`_owner` / `_createdAt` / `_updatedAt` / `_updatedBy` / `_deleted`（软删除标记）。
>
> **0.4 数据播种**：客户端模块 `cloudbase-seed.js` 在「设置 → 云端同步 → 首次数据播种」触发。匿名登录拿 `uid` 后，逐集合读取本地 IndexedDB（`users`/`requirementTasks`/`projects`/`projectVersions`/`taskLifecycles`/`todoLifecycles`/`companies`/`departments`/`positions` + 媒体库 `attachments`），每条补 `_owner=uid` 与元数据，用 `doc(id).set()` 幂等 upsert 到云端（`_id` 取本地主键 `id`，重跑只覆盖本人数据，绝不覆盖他人）。`attachments` 仅传元数据，二进制 `dataUrl` 留待 0.6 走云存储。播种结果写入 `sync_logs`。
>
> **0.5 双向同步引擎**：客户端模块 `RT_SYNC.js`（`crud-factory.js` 的 `crudSave`/`crudDelete` 在本地写成功后调用 `RT_SYNC.enqueue` 入 outbox 队列）。机制：① 写先入 `localStorage` 队列，联网自动 `flush`（1.2s 防抖 + `online` 事件触发），离线不丢；② push 用 `doc(id).set()` upsert（`_owner=uid`/`_updatedAt`/`_updatedBy`），删走软删 `update({_deleted:true})`，云端无文档则建最小墓碑；③ pull 按 `_owner==uid && _updatedAt > lastSyncTs` 分页拉取，记录级 LWW（`云端 _updatedAt` 大于本地 `updatedAt` 才覆盖）合并，遇 `_deleted:true` 则软删本地；④ 检查点 `lastSyncTs` 在 pull 后、flush 后再各推进一次，避免自我回环。当前接入集合：`companies`/`depts`/`positions`/`projects`/`project_versions`（5 个管理页）；其余模块（`users`/`requirements`/`todos`…）的写接入与媒体云存储属 0.6。设置页「立即同步」手动触发 `pull → 推进检查点 → push → 再推进`。

## 自定义域名

未绑定：CloudBase 自定义域名需升级服务套餐，当前使用默认域名访问（见上「线上地址」）。
