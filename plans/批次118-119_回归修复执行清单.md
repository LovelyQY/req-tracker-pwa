# 需求跟踪 PWA · 回归修复执行清单（批次 118–119）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa` ｜ 起点版本 `v1.3.53`，已随发版升至 `v1.3.54`
> 范围：2 项回归修复（角色界面引用人员删除无反应；侧边栏子页返回未停留在侧边栏）
> 发版版本：`v1.3.54`（已于 2026-07-24 发版，提交 `092a56e chore(release): v1.3.54`）
> 本文档为**执行清单**，落地时逐项完成后打勾；随实现一并提交至 `plans/`。

---

## 0. 受影响文件总览

| 批次 | 回归 | 文件 | 主要改动 |
|---|---|---|---|
| **118** | 角色界面「引用人员」删除按钮点了无反应 | `role.js` | 将 `openPeopleRemoveConfirm` / `closePeopleRemoveConfirm` / `confirmPeopleRemove` 挂到 `root` 导出表 |
| **119** | 侧边栏：状态设置 / 其他链接页返回后跳到首页（应在侧边栏） | `index.html` | 8 个侧边栏入口的 `onclick` 在 `navTo` 前同步写入 `rt_reopen_drawer` 标记；`status.html` 保留自身写入作为直访兜底 |

---

## 1. 角色界面引用人员删除无反应（批次 118）✅ 已落地

> 落地：提交 `547cd02 fix(批次118): … [no-version-bump]`，随 `v1.3.54` 发版推送 `main`。

### 1.1 现象
- 角色详情 → 「引用人员」列表中，点击某人员的**移除按钮**，无任何反应（不弹确认框、不移除）。
- 角色本身的删除按钮（`openConfirm` → `doDelete`）正常，唯独引用人员移除失效。

### 1.2 根因定位
- `role.js` 在批次 114 把引用人员移除按钮改为 `class="icon-btn danger"`、`onclick="openPeopleRemoveConfirm(id)"`，并新增了三个函数：
  - `role.js:289` 渲染删除按钮：`onclick="openPeopleRemoveConfirm('...')"`
  - `role.js:310` `function openPeopleRemoveConfirm(userId){...}`
  - `role.js:322` `function closePeopleRemoveConfirm(){...}`
  - `role.js:327` `function confirmPeopleRemove(){...}`
  - `role.html:263` `onclick="closePeopleRemoveConfirm()"`、`role.html:264` `onclick="confirmPeopleRemove()"`
- 问题在于：`role.js` 整体是 IIFE `(function(root){...})(window)`，所有供内联 `onclick` 调用的函数都必须显式挂到 `root`（`role.js:415-426` 的导出表）。**批次 114 新增的这 3 个函数漏写了导出**，因此浏览器执行内联 `onclick` 时抛 `ReferenceError: openPeopleRemoveConfirm is not defined` → 点击静默失败。
- 交叉核对（已用脚本校验）：`role.html` 的全部内联 `onclick` 调用中，仅 `openPeopleRemoveConfirm / closePeopleRemoveConfirm / confirmPeopleRemove` 三项不在 `root` 导出表内；其余（`openAdd / save / closeSheet / openPeople / selectAllPerms / closePeople / openConfirm / closeConfirm / doDelete / goBack`）均已正确导出。

### 1.3 修改方案
- **唯一改动**：在 `role.js:415-426` 导出表末尾追加三行（与其余导出风格一致）：
  ```js
  root.openPeopleRemoveConfirm = openPeopleRemoveConfirm;
  root.closePeopleRemoveConfirm = closePeopleRemoveConfirm;
  root.confirmPeopleRemove = confirmPeopleRemove;
  ```
- 不改动函数实现、按钮 HTML、弹窗结构或样式（这些在批次 114 已就位，仅缺导出）。

### 1.4 验收
- [x] 进入任一角色详情，「引用人员」列表的移除按钮点击后**弹出 `#peopleConfirmMask` 确认框**。
- [x] 确认框「移除」调用 `removeUserRole`，保留 `admin + 系统管理员角色` 保护；「取消」关闭弹窗、不改动。
- [x] 浏览器控制台无 `ReferenceError`；角色本体的删除确认行为不受影响。

---

## 2. 侧边栏子页返回未停留在侧边栏（批次 119）✅ 已落地

> 落地：提交 `4996450 fix(批次119): … [no-version-bump]`，随 `v1.3.54` 发版推送 `main`。

### 2.1 现象
1. 侧边栏点「我的状态」→ 选状态 → 返回后**跳到首页（抽屉关闭）**，应停留在侧边栏（抽屉展开）。
2. 侧边栏点「设置 / 关于 / 安全 / 个人资料 / 基础数据 / 报表 / 存储与备份」等 → 点页面内「返回」→ 也回到**首页（抽屉关闭）**，应返回到侧边栏（抽屉展开）。

### 2.2 根因定位
- 返回机制本身**没有问题**：所有侧边栏子页的「返回」按钮均调用 `goBack()`（`auth.js:118`，统一返回栈 `rt_back_stack`），无违规的 `location.href='index.html'` 写法。
- 重开抽屉依赖一个 ad-hoc 标记：`index.html:1263-1270` 的 `maybeReopenDrawer()` 仅在 `sessionStorage.rt_reopen_drawer === '1'` 时调用 `openDrawer()`；该标记在 `index.html` 初次加载与 `pageshow`（bfcache 返回）时各检查一次。
- **该标记只有 `status.html:141` 设置**（异步 `updateStatus` 落库成功后才写入），其余 7 个侧边栏入口（`index.html:1106/1119/1124/1129/1134/1139/1144/1149`）从不设置 → 任一子页 `goBack` 回到 `index.html` 时抽屉保持关闭，用户看到的是「首页」而非「侧边栏」。
- status.html 的标记设置在 `Promise.then` 内（异步、保存成功后才写），路径脆弱，且与其他子页行为不一致，因此用户侧实际表现为「状态设置后也跳首页」。

### 2.3 修改方案
- **统一在侧边栏入口设置标记**（点击即同步写入，比子页内异步写入更可靠）：将 `index.html` 中 8 个侧边栏链接的 `onclick` 由
  ```html
  onclick="navTo('xxx.html');return false;"
  ```
  改为（以 `status.html` 为例，其余同理替换 URL）：
  ```html
  onclick="sessionStorage.setItem('rt_reopen_drawer','1');navTo('status.html');return false;"
  ```
  涉及的 8 个入口：
  | 行号 | 目标页 |
  |---|---|
  | 1106 | `status.html`（`.drawer-role`，我的状态） |
  | 1119 | `profile.html` |
  | 1124 | `security.html` |
  | 1129 | `basic-data.html` |
  | 1134 | `report.html`（含 `data-perm`） |
  | 1139 | `storage-backup.html` |
  | 1144 | `settings.html` |
  | 1149 | `about.html` |
- **`status.html` 保留自身写入**（`status.html:141`）：作为「直接访问 status.html」场景的兜底；与抽屉入口写入幂等，不冲突。
- **不改动** `goBack()` / `maybeReopenDrawer()` 逻辑，仅补齐「谁来置位标记」这一环。

### 2.4 验收
- [x] 侧边栏 → 「我的状态」→ 选状态 → 返回后**抽屉自动展开**，并展示最新状态。
- [x] 侧边栏 → 「设置 / 关于 / 安全 / 个人资料 / 基础数据 / 报表 / 存储与备份」任一页 → 点「返回」→ **抽屉自动展开**（不再回到空白首页）。
- [x] 由**非侧边栏入口**（卡片点击、`navTo` 进入的详情/子页）返回 `index.html` 时，抽屉**保持关闭**（不被误触发）——验证标记仅由侧边栏入口写入。
- [x] 重复往返多次，抽屉开合状态稳定，无闪退/空白。

---

## 3. 风险与回滚

| 项 | 风险 | 应对 |
|---|---|---|
| 118 | 仅补充 3 行 `root` 导出，改动极小，不影响其他逻辑 | 导出前已交叉校验无重复/覆盖 |
| 119 | 8 处内联 `onclick` 改动，URL 易手误 | 逐行核对行号与 URL；改后 `grep` 确认每个 `navTo('...')` 前均有 `rt_reopen_drawer` 写入 |
| 119 | 标记残留导致非预期展开 | 标记在 `maybeReopenDrawer` 内被 `removeItem` 消费，且 `goBack` 仅由侧边栏标记触发展开 |
| 通用 | `?v=` 漂移自检（`release.sh`） | 本次仅改 `.js/.html` 内联脚本，未新增静态资源，无需登记 `release.sh`；发版走 `./release.sh` 自动升版本 |

---

## 4. 执行顺序与提交

1. 批次 118：`role.js` 补 3 行导出 → 自测引用人员删除弹窗。
2. 批次 119：`index.html` 8 处 `onclick` 注入标记（保留 `status.html` 兜底）→ 逐页验证返回停留在侧边栏。
3. 回归冒烟：角色删除、权限树中英文、设置去关于、侧边栏关于箭头（批次 114–117）均不受影响。
4. `./release.sh` 升 `v1.3.54` → 提交 `feat(批次118):` / `feat(批次119):` 及 `chore(release): v1.3.54` → 推送 `main`。
