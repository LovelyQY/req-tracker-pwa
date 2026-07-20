# 发版规则

## 核心规则

**每次推送到 `main` 都必须升级版本号。**

除非明确告知「本次不需升级版本」，否则任何推送都要 bump 版本号。这是硬性规则，由 `pre-push` hook 强制（见下文），不是建议。

## 如何升级版本

统一使用发版脚本，它会一次性完成：7 处版本号同步、生成 `CHANGELOG.md`、自动提交。

```bash
./release.sh             # 自动计算下一版本（修订号 +1；到 99 进位 minor，如 1.0.99 → 1.1.0）
./release.sh 1.2.0 "说明"  # 手动指定版本与更新说明
```

## 例外（不升级版本）

仅当明确说明「本次不需升级版本」时才允许放行，两种方式：

1. 提交信息中包含 `[no-version-bump]` 标记；
2. 推送时 `git push --no-verify` 跳过本地 hook。

除上述例外外，任何推送都必须升级版本号，否则 `pre-push` hook 会拒绝推送。

## 强制机制：pre-push hook

`.githooks/pre-push` 会在每次 `git push` 时校验：

- 推送到 `main` 时，新提交的 `APP_VERSION` 必须**严格大于** `origin/main` 当前版本；
- 否则拒绝推送（exit 1），并提示如何升级或如何合法放行。

### 启用（克隆后一次性执行）

```bash
git config core.hooksPath .githooks
```

启用后，忘记升级版本号的推送会在本地被拦下，不会误推到远端。

## 数据表与 ID 规范

所有数据表的 ID（主键）统一为 **32 位十六进制字符串**，由 `db.js` 的 `RT_DB.genId()` 生成（16 字节随机数 → 每字节 2 位十六进制，定长 32 位）。建新表、加新实体时必须遵守：

- **ID 一律用 `genId()` 生成**：新增记录的 `id` 字段写 `id: root.RT_DB.genId()`（各模块也可走 `RT_XXX.genId()`，它内部同样委托 `RT_DB.genId()`）。不要用 `Date.now()`、`crypto.randomUUID()`、自增整数或人工输入的编号当主键。
- **ID 是 32 位、且永不变长**：不要修改 `genId()` 输出长度。若将来改算法，必须同步更新下方所有长度上限，并保证取值 ≥ 实际 ID 长度。
- **ID 字段的长度校验要用专用上限，禁止套用工号等人工字段的限制**：曾因职位 ID 误用 `EMPLOYEE_NO_MAX`（30）而被 32 位系统 ID 触发「职位ID 过长」、导致保存无反应（已在 v1.2.91 修复，改为 `POSITION_ID_MAX: 64`）。任何 ID 类字段若需长度校验，单独定义 `*_ID_MAX`（取值 ≥ 32，建议 64）放入 `users.js` 的 `LIMITS`，**不得**复用 `EMPLOYEE_NO_MAX` / `ACCOUNT_MAX` 等人工输入字段的上限。
- **外键同理**：引用其它表 ID 的字段（如 `departmentId`、`positionId`、`projectId`、`companyId` 等）存的也是 32 位 ID，其校验与显示逻辑一律按「ID」处理，不要按人工字段限长。

## 更新日志

发版脚本每次都会把更新日志写入同源本地 `CHANGELOG.md`（含版本号 + 日期 + 说明），前端直接读取，离线可用，不再依赖 GitHub API。

### 同步升级行格式规则（固定，勿改）

每条更新日志记录自动追加一行「同步升级说明」，格式固定为：

```
- 同步升级到 vX.Y.Z
```

- 只写**目标版本号**，不罗列具体常量名（不要写 `SW_VERSION / APP_VERSION / CACHE` 等）；
- 版本号统一带 `v` 前缀（`到 v1.1.7`，不是 `到 1.1.7`）；
- 设置页「文档」与「更新日志」弹窗共用同一数据源（当前版本在 `CHANGELOG.md` 中的条目），两处显示内容必须一致；
- 每条记录底部**一定有一行**「同步升级到 vX.Y.Z」（规则生成，必显示，不依赖正文是否已含版本号）。
- 渲染前先过滤正文中「独立成行」的同步行 / 纯版本号行（如残留的 `- 同步升级到 v1.1.8` 或孤行的 `v1.1.8`），避免重复或残留；再统一追加一条规则生成的同步行。
- 正文**内联提及**的版本号（夹在句子里、非独立成行）一律保留，不过滤。

## 发布后：缓存与验证

GitHub Pages 部署存在构建 / CDN 边缘节点滞后（通常 1–10 分钟）。推送发版后：

- **以仓库为准判定版本**：`git`、`raw.githubusercontent.com`、本地文件才是真相来源；浏览器里看到的版本徽标可能因缓存滞后而短暂显示旧版本，不能作为「发版是否成功」的依据。验证时优先用 `git log` 或拉取 raw 文件确认 `APP_VERSION`。
- **验证新版本的步骤**：发版后先等 Pages 重建（观察边缘节点 `age` 刷新），再在浏览器**硬刷新**（`Cmd/Ctrl + Shift + R`）确认徽标已更新到新版本。
- **强刷时机（关键）**：SW 拉取 HTML 已改为 `fetch(req, { cache: 'no-store' })`，新 SW 安装后会始终取最新 HTML；但**首次切换到新 SW 之前**，若曾 Kill SW 或仅普通刷新，浏览器 HTTP 缓存（`max-age=600`）仍可能返回旧 `index.html`，此时必须硬刷新一次，或 DevTools → Application → Clear storage 后重载。
- **已知限制**：GitHub Pages 不支持在仓库内自定义 HTML 的 `Cache-Control` 响应头，故无法从响应头缩短缓存；SW `no-store` 是仓库可控范围内最彻底的解法，覆盖已安装 PWA 的主场景。
- **`version.json` 读取必须带缓存破坏**：任何页面通过 `fetch` 读取 `version.json`（如登录页右下角版本号）都必须带 `?_t=Date.now()` 时间戳并设 `cache: 'no-store'`（与主页 `index.html` 的更新检测一致）。否则 SW 的 stale-while-revalidate 会先返回**缓存里的旧值**、后台才更新，导致版本号显示滞后、与页面不同步（曾出现页面已是新效果、版本号却停在旧版的问题）。**勿回退此写法。**
- **登录会话必须带过期时间、按所选时长免登**：`rt_session` 存为 `JSON { a: 账号, exp: 过期时间戳 }`（localStorage）。登录页提供「登录时长」单选：24 小时（默认）/ 7 天 / 30 天，`exp = now + 天数×24h`；不勾选即 24 小时。首页 `index.html` 与个人信息页 `profile.html` 的登录闸门必须调用 `getSessionAccount()` 校验 `exp`，**过期则清除会话并跳登录页**；手动退出登录（`logout()`）立即清除。统一封装 `getSessionAccount()` 供闸门与侧边栏/个人信息读取复用，**勿在页面里直接读 `localStorage/sessionStorage` 的 `rt_session` 原始值**（旧格式纯账号串兼容返回，但新写入一律带 `exp`）。
