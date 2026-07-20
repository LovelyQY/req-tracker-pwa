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

## 页面点击高亮与焦点轮廓规范

所有页面（含**新建页面**）必须去除移动端点击时浏览器默认的**蓝色高亮块**（`-webkit-tap-highlight-color`）与**聚焦时的默认蓝色轮廓环**，同时保留键盘 `Tab` 导航的焦点可见（无障碍）。

统一在页面 `<style>` 的根部 reset 处加入以下规则（**不可只写在个别按钮上**）：

```css
/* 去除移动端点击高亮（华为/夸克等浏览器点击出现的蓝色方块） */
*, *::before, *::after { -webkit-tap-highlight-color: transparent; }
/* 去除鼠标/触摸聚焦的默认蓝色轮廓，保留键盘 :focus-visible 轮廓 */
button, a, input, select, textarea, [onclick] { outline: none; }
button:focus:not(:focus-visible),
a:focus:not(:focus-visible),
[onclick]:focus:not(:focus-visible),
input:focus:not(:focus-visible),
select:focus:not(:focus-visible),
textarea:focus:not(:focus-visible) { outline: none; }
```

要点：
- **必须全局生效**：这些纯内联样式页没有引入 `styles.css`，若只给某个按钮加 `tap-highlight-color: transparent`，其它可点击元素（返回按钮、列表行、图标按钮、`[onclick]` 卡片）仍会露蓝框。务必在 `*` 上声明。
- **不要删输入框的自定义聚焦高亮**：输入框聚焦用 `box-shadow`（如 `0 0 0 3px rgba(22,119,255,.12)`）提示，与 `outline` 是两回事，勿动。
- **保留键盘可访问性**：用 `:focus:not(:focus-visible)` 而非无差别 `outline:none`，确保键盘 `Tab` 仍有可见焦点。

## 返回按钮规范

所有页面的「返回」按钮（顶部 `nav-back`）必须返回**上一页**，不得硬编码跳回首页或某个固定父页。

- **下钻入口统一用 `navTo(url)`**（定义在 `auth.js`，全局可用，所有页面均已引入）：
  - `navTo()` 在跳转前把「当前页」压入 sessionStorage 返回栈（`rt_back_stack`），`goBack()` 据此才能稳定回到真正的上一页。
  - **所有带「返回」按钮的下钻链接都必须用 `navTo()` 而非 `location.href='...'`**，否则该页 `goBack()` 会失去返回栈来源、在部分浏览器下落到兜底首页。例如：基础数据→公司/部门/职位等、侧边栏→各页、个人信息→编辑/详情、关于→更新日志等。
- **返回按钮统一调用 `goBack()`**（定义在 `auth.js`）：
  - `goBack()` 优先从返回栈弹出「来源页」并 `location.href` 跳回真正的上一页（如 基础数据→公司 返回基础数据）；**不再依赖 `history.go(-1)`**——实测华为自带浏览器等 `go(-1)` 行为不稳定，会漏回真正的上一页而落到兜底首页；也**不依赖 `document.referrer`**（PWA 内跳转 referrer 可能为空）。
  - 返回栈为空（直接打开 / 冷启动 / 站外来源）→ 兜底 `history.go(-1)`；仍无历史 → 回 `index.html`，避免点返回直接离开应用。
- **禁止**在页面里写 `onclick="location.href='index.html'"` 之类硬编码返回首页/固定父页的写法。
- 任何「返回上一页」语义的逻辑（如表单取消、保存后返回）也统一用 `goBack()`。
- **新增页面**：返回按钮一律 `onclick="goBack()"`；下钻进入新页的入口一律 `navTo(url)`；若需在返回前确认，在调用 `goBack()` 前处理即可。
- 登录成功视为新会话起点，`auth.js` 的 `clearBackStack()` 会清空返回栈，避免带着登录前的旧链路「返回」。

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
