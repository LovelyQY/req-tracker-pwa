# 需求跟踪 PWA · UI 体验优化执行清单（批次 114–117 + 侧边栏状态 bug 修复）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa` ｜ 起点版本 `v1.3.52`
> 范围：4 项 UI 调整（角色管理删除一致性、权限树中英文、设置页去关于、侧边栏关于加箭头）＋ 1 项 bug 修复（侧边栏状态选择误报登录过期）
> 计划发版版本：`v1.3.53`（按 `release.sh` 自动升 patch）
> 本文档为**执行清单**，落地时每项完成后打勾；随实现一并提交至 `plans/`。

---

## 0. 受影响文件总览

| 批次 | 需求 | 文件 | 主要改动 |
|---|---|---|---|
| **114** | 角色管理：引用人员删除与角色删除按钮一致 + 删除提示 | `role.html`、`role.js` | `pdel` → `icon-btn danger`（同款垃圾桶图标）；新增 `#peopleConfirmMask` 确认弹窗 |
| **115** | 权限树中英文：中文保持现状，英文只显示 code | `permission.js` | 英文模式 `mainText = menuCode`、`subText = ''`（隐藏名称）；清理过时注释 |
| **116** | 设置页去掉「关于」入口 | `settings.html` | 删除「关于」分组（`about` 已由侧边栏进入） |
| **117** | 侧边栏「关于」加右侧箭头 | `index.html` | 补 `drawer-arrow`（同「存储与备份」） |
| **补** | 侧边栏状态选择误报「登录过期」并跳登录页（bug） | `status.html`、`users.js`、`release.sh` | `status.html` 改用 `RT_USERS.updateStatus` 异步落库；`users.js` 新增 `updateStatus`；补 `config.js`/`db.js`/`users.js` 脚本引用并登记进 `release.sh` |

---

## 1. 角色管理：引用人员删除 vs 角色删除（批次 114）✅

### 1.1 问题定位
- **角色删除**：`role.js` 按钮 `class="icon-btn danger"`（红色边框 + 垃圾桶图标 svg）→ `onclick="openConfirm(role.id)"` → `#confirmMask` 确认弹窗 → `doDelete()`。已有删除提示。✅
- **引用人员移除**：原按钮 `class="pdel"`（红色边框 + **X 关闭图标**，非垃圾桶）→ `onclick="removeUserRole(id)"` → 无确认，直接移除。
- **CSS 差异**：`.icon-btn.danger`（垃圾桶 svg）vs `.person .pdel`（X svg）图标形状与 class 不一致，视觉上不是「同一个删除按钮」。
- `removeUserRole` 仅做 `admin + 系统管理员角色` 保护（直接 toast 拦截），**无确认弹窗**。

### 1.2 修改方案（已落地）
- **按钮一致**：`role.js` 引用人员移除按钮改用 `class="icon-btn danger"`，并替换为与角色删除**完全相同的垃圾桶 svg**；`onclick` 由 `removeUserRole(id)` 改为 `openPeopleRemoveConfirm(id)`。
- **删除提示**：`role.html` 新增独立模态框 `#peopleConfirmMask`（结构与 `#confirmMask` 一致）；`role.js` 新增 `openPeopleRemoveConfirm(userId)` / `closePeopleRemoveConfirm()` / `confirmPeopleRemove()`：
  - 文案为「确定移除『姓名』的该角色引用？此操作不可撤销」（准确表达「移除角色引用」而非「删除人员」）；
  - 确认按钮调用 `removeUserRole(userId)`，保留其 `admin + 系统管理员角色` 保护逻辑；受保护项按钮本就隐藏，无需提示。
- `role.html` 中 `.person .pdel` 样式随按钮改 `icon-btn danger` 后删除，新增 `.person .icon-btn.danger{margin-left:auto}` 保持右对齐。

### 1.3 验收
- 角色卡片删除按钮 与 引用人员列表移除按钮 **外观一致**（同为红色垃圾桶 `icon-btn`）。
- 点击引用人员移除按钮 **先弹确认框**，确认后才移除；取消则不动。
- 角色删除确认行为保持不变。

---

## 2. 权限树中英文（批次 115）✅  —— 经用户最新要求改为「需功能改动」

### 2.1 现状核对（修订）
- `permission.js` `buildTreeHtml` 中 `en = lang === 'en'`，节点渲染：
  - `mainText = displayName`（名称，优先 `menuName` → 注册表中文名 → `menuCode` 兜底）；
  - `subText = menuCode`。
- 原清单判定「无需功能改动」；但用户最新要求：**中文模式保持现有模式（主显名称、副显 code），英文模式只显示 code、不显示名称**。
- 因此本批次**需功能改动**：英文模式下隐藏名称，仅渲染 code。

### 2.2 修改方案（已落地）
- `permission.js` 渲染逻辑改为：
  ```js
  var mainText, subText;
  if (en) { mainText = n.menuCode; subText = ''; }      // 英文：只显示 code
  else    { mainText = displayName;   subText = n.menuCode; } // 中文：名称 + code
  ```
- 节点类型标签（模块/页面/操作 ↔ module/page/op）切换逻辑保持不变。
- 清理过时注释（原注释「英文 → 主显 menuCode，副标题显示名称」已与实际不符）。

### 2.3 验收
- 切换「🔤 EN」：权限树节点**仅显示 code，不显示名称**；切回中文恢复「名称 + code」。
- 节点类型标签在 模块/页面/操作 ↔ module/page/op 间变化。

---

## 3. 设置页去掉「关于」（批次 116）✅

### 3.1 问题定位
- `settings.html` 含「关于」分组（`set-group-title`「关于」+ `set-row link` → `navTo('about.html')`）。
- `about.html` 已是独立页面，且侧边栏已有「关于」入口；设置页内再放一份属重复入口。

### 3.2 修改方案（已落地）
- 删除 `settings.html` 整个「关于」分组（不残留空分组）。`about` 仍经侧边栏进入。

### 3.3 验收
- 设置页不再出现「关于」入口；`about` 可经侧边栏进入。

---

## 4. 侧边栏「关于」加右侧箭头（批次 117）✅

### 4.1 问题定位
- `index.html`「存储与备份」「设置」`drawer-item` 含 `<svg class="drawer-arrow">` 右侧箭头。
- 「关于」`drawer-item` 仅有 icon + `<span>关于</span>`，**缺 `drawer-arrow`**，与同组链接项视觉不一致。

### 4.2 修改方案（已落地）
- 在 `index.html`「关于」`<span>关于</span>` 之后追加与「存储与备份」同款箭头 `drawer-arrow`。

### 4.3 验收
- 侧边栏「关于」右侧显示箭头，与「存储与备份」等链接项视觉一致。

---

## 5. 补充修复：侧边栏状态选择误报「登录过期」（bug）✅

### 5.1 问题定位
- 侧边栏昵称下为状态入口（`index.html` → `navTo('status.html')` → 「我的状态」页）。
- `status.html` 点击处理逻辑仍调用 `auth.js` **v2 中已变为 no-op 桩函数**的 `loadAccounts()` / `saveAccounts()`：
  - `loadAccounts()` 恒返回 `[]` → 按 `account` 匹配当前用户**永远查不到** → 误报「会话已失效，请重新登录」并 `location.href = 'login/classic.html'`；
  - 即便通过，`saveAccounts()` 为空操作，**状态根本不落库**。
- 根因：账号体系已从 `localStorage rt_accounts` 迁移到 IndexedDB `users` 表（`auth.js` v2），`status.html` 未随之改造。

### 5.2 修改方案（已落地）
- `users.js` 新增 `updateStatus(account, status, operator)`：同连接内按 `account` 索引读取 `users` 记录，更新 `status`/`updatedBy`/`updatedAt` 后写回（沿用 `openDB`/`tx`/`reqToPromise` 与 `updatePerson` 一致的事务模式，避免二次 `openDB` 触发 `onblocked`），并加入 `api` 导出。
- `status.html`：
  - 头部补充 `config.js`/`db.js`/`users.js` 脚本引用（`db.js` 加载时依赖 `RT_CONFIG`，故 `config.js` 须在前；`users.js` 依赖 `RT_DB`）；
  - 点击逻辑改为 `getSessionAccount()` 校验通过后，调用 `RT_USERS.updateStatus(acc, key, op)` 异步落库；乐观高亮选中态；成功写 `rt_reopen_drawer` 并 `goBack()`；保存失败仅提示、不跳登录页；
  - 初始高亮改用 `getUserAsync()` 读取 IndexedDB 中已保存的真实状态校正（原 `getMyAccount()` 不含 `status`）。
- `release.sh`：将 `status.html` 登记进 `PROFILE_PAGES`（覆盖 `db.js`/`users.js`）与 `CONFIG_PAGES`（覆盖 `config.js`），确保其 `?v=` 随发版同步、通过漂移自检。

### 5.3 验收
- 侧边栏点击状态 → 选「我的状态」→ 选择任一状态 → **不再误报登录过期**，状态正确保存并落库。
- 返回首页后侧边栏状态文本更新为所选状态；再次进入「我的状态」时该状态正确高亮。
- 回归测试 `tests/test-batch115-status.js` 校验 `updateStatus` 落库/回读、不影响其它字段、空账号与不存在账号均拒绝。

---

## 6. 落地通用规范（来自仓库 RULES.md）

1. **版本号**：每次推 `main` 须经 `./release.sh` 升版本（本次 `v1.3.53`）。发版需在 `CHANGELOG.md` 写非空说明，`pre-push` hook 会强制校验。
2. **缓存破坏 `?v=`**：`release.sh` 自动同步所有已引用文件的 `?v=`，末尾「全站 `?v=` 漂移自检」会报错阻断。
3. **编码 UTF-8**：所有改动文件保持 UTF-8，不引入 `U+FFFD`（`pre-commit` hook 会扫描拦截）。
4. **点按高亮 / focus**：按 RULES 去除移动端点按蓝色高亮，保留键盘 `:focus-visible` 焦点环。
5. **返回按钮**：一律 `goBack()` / `navTo()`，不硬编码 `location.href`。
6. **计划/清单入库**：执行清单随实现提交至 `plans/`（本文件）。
7. **提交信息批次**：批次114 `feat(批次114): …`、批次115 `feat(批次115): …`、批次116 `fix(批次116): …`、批次117 `fix(批次117): …`、bug 修复 `fix(侧边栏状态): …`；发版提交由 `release.sh` 生成 `chore(release): vX.Y.Z`。

---

## 7. 建议执行顺序与验证（已执行）

**顺序（对应批次）**
1. 批次 114（角色管理删除一致性 + 确认）
2. 批次 115（权限树中英文：英文只显示 code）
3. 批次 116（设置页去关于）
4. 批次 117（侧边栏关于加箭头）
5. 补充 bug 修复（侧边栏状态选择登录过期）

**验证**
- 本地起静态服务（`python3 -m http.server`）逐页核对上述验收点；移动端视口（375/390 宽）重点验证删除按钮一致、确认弹窗、箭头对齐、英文模式 code 显示、状态选择不再跳登录。
- 跑回归：`npm test`（含新增 `tests/test-batch115-status.js`）全部通过（170 + 4）。
- 发版前 `./release.sh` 自动校验版本号递增、CHANGELOG 非空、全站 `?v=` 漂移自检通过。

---

## 8. 决策已确认（锁定）

- **批次 114**：引用人员移除按钮复用角色删除的 `icon-btn danger` 外观（同款垃圾桶图标）+ 独立确认弹窗；确认文案为「移除角色引用」而非「删除人员」。✅
- **批次 115**：经用户最新要求改为**功能改动**——中文保持现状，英文只显示 code、隐藏名称。✅
- **批次 116 / 117**：按上述删除 / 补充，保持与既有入口一致。✅
- **补充 bug**：根因为 `status.html` 误用 `auth.js` v2 的 no-op `loadAccounts`/`saveAccounts`；改为 `RT_USERS.updateStatus` 异步落库。✅

---

## 9. 落地进度追踪

| 批次 | 需求 | 状态 | 提交 |
|---|---|---|---|
| 114 | 角色管理：引用人员删除与角色删除按钮一致 + 删除提示 | ✅ 已完成 | `v1.3.53` |
| 115 | 权限树中英文：中文保持现状，英文只显示 code | ✅ 已完成（功能改动） | `v1.3.53` |
| 116 | 设置页去掉「关于」入口 | ✅ 已完成 | `v1.3.53` |
| 117 | 侧边栏「关于」加右侧箭头 | ✅ 已完成 | `v1.3.53` |
| 补 | 侧边栏状态选择误报「登录过期」并跳登录页 | ✅ 已完成 | `v1.3.53` |

> 本清单按 **批次 114 / 115 / 116 / 117 + 侧边栏状态 bug** 规划并全部落地，走 `release.sh` 发版 `v1.3.53` 并推 `main`。
