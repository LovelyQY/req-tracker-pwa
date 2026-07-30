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

Stage 0 的 0.2 / 0.3 已完成：在 CloudBase 文档型数据库创建 20 个集合并配置安全规则（已校验 20/20）。

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
| 用户隔离 | 13 | `users` / `requirements` / `projects` / `project_versions` / `task_lifecycles` / `todo_lifecycles` / `attachments` / `login_logs` / `user_settings` / `sync_logs` / `user_push_subs` / `feedback` / `help_docs` | CUSTOM：`read/write = auth.uid == doc._owner`（匿名登录 uid 隔离） |
| 组织共享只读 | 7 | `depts` / `positions` / `companies` / `roles` / `menus` / `role_permission` / `user_role` | ADMINWRITE：`read:true, write:false`（仅云函数 / 管理员可写） |

> 所有文档统一附加元数据字段：`_owner` / `_createdAt` / `_updatedAt` / `_updatedBy` / `_deleted`（软删除标记）。

## 自定义域名

未绑定：CloudBase 自定义域名需升级服务套餐，当前使用默认域名访问（见上「线上地址」）。
