# 批次173：修复独立页脚本加载顺序（profile-edit / status 初始化崩溃）

> 创建时间：2026-07-29 23:33
> 前置版本：v1.3.70
> 状态：待执行
> 触发来源：用户实测反馈 2 项问题（172 修复后仍无法编辑 + 状态选择页为空）

---

## 关键事实（已排查确认）

### 统一根因：独立页核心逻辑用裸内联脚本同步执行，依赖 defer 的 auth.js → 函数未定义崩溃

**HTML 规范语义**：`<head>` 中以 `defer` 加载的 `auth.js`，在**文档解析完成后、DOMContentLoaded 之前**才执行；而 `<body>` 末尾的裸内联 `<script>` 在**解析到它时立即执行**（早于 defer 脚本）。因此内联脚本先于 `auth.js` 运行，`getSessionAccount()`/`getMyAccount()` 等 auth.js 导出的全局函数尚未定义 → `ReferenceError` → 脚本中断，页面空白 / 无法编辑。

`index.html` 因把核心逻辑包在 `DOMContentLoaded` 中幸免；但 `profile-edit.html` / `status.html` 两个独立页未做此包裹，逐个踩坑。

### 问题1：个人信息「还是无法编辑」
- **主因 A（脚本顺序）**：`profile-edit.html` 第131–249行内联 `init()` 在 `auth.js`（defer，第84行）前执行 → 第170行 `getSessionAccount()` 未定义 → `ReferenceError` → init 中断，输入框始终 `display:none`。**172-B 的修复（显示逻辑前置）不彻底**：init 第一行仍是 `getSessionAccount()`，auth.js 未就绪即崩。
- **次因 B（权限守卫）**：保存按钮 `data-perm="op_profile_edit"`（第127行）。普通用户 `roleIds=[]`（users.js `createPerson` 不分配角色）→ 有效权限集为空 → `RT_PERM.guard`（permissions.js:1028-1055）将保存按钮 `display:none` 隐藏。即便修好 A，B 仍会隐藏保存按钮。

### 问题2：侧边栏「状态选择」页（status.html）显示为空
- **根因（脚本顺序，与问题1主因同源）**：`status.html` 第90–167行裸内联渲染脚本在 `auth.js`（defer，第60行）前执行 → 第107行 `getMyAccount()` 未定义 → `ReferenceError` → 第110–117行 `listEl.innerHTML` 从未执行 → `status-list` 恒为空。
- **数据源本身无问题**：`STATUS_LIST` 是硬编码常量（10 项完整），不是数据加载问题。只要脚本跑到第111行就有内容。

---

## 问题总览

| # | 问题 | 严重度 | 涉及文件 | 根因 |
|---|------|--------|---------|------|
| 1 | 个人信息仍无法编辑 | **高** | profile-edit.html | 内联 init 早于 auth.js 崩溃 + 保存按钮被权限守卫隐藏 |
| 2 | 状态选择页为空 | **高** | status.html | 内联渲染脚本早于 auth.js 崩溃 |

---

## 批次173 修复清单

### 173-A `profile-edit.html`（脚本包裹 + 保存权限）
1. **核心脚本包 `DOMContentLoaded`**：将第131–249行（`var FIELDS = {...}` 起至 `init(); RT_PERM.guard(...)` 止）整体包进 `document.addEventListener('DOMContentLoaded', function(){ ... })`，与第92–100行登录闸门一致，确保 `auth.js` 已就绪后再执行。
2. **保存按钮权限放行**：移除保存按钮的 `data-perm="op_profile_edit"`（第127行）。「编辑本人资料」是登录用户固有权利（非编辑他人），不应受角色权限限制；保存逻辑 `saveField()` 内已通过 `getSessionAccount()` 校验身份后 `updateProfile`，安全性由身份校验保证。

### 173-B `status.html`（脚本包裹）
1. **核心脚本包 `DOMContentLoaded`**：将第90–167行（渲染逻辑 + 点击事件 + pageshow 监听）整体包进 `DOMContentLoaded`，与第66–74行登录闸门一致，确保 `auth.js` 已就绪、`getMyAccount()`/`RT_USERS` 可用后再渲染。

---

## 版本与推送策略
- 建议走 `[no-version-bump]` 先提交，验证无误后统一发版。

## 风险与注意
- 173-A.1 / 173-B.1 纯包裹改动（加 DOMContentLoaded 边界），不改变逻辑；auth.js 在 DOMContentLoaded 前必已执行（defer 语义），`getSessionAccount`/`getMyAccount` 一定可用。
- 173-A.2 移除 `data-perm` 后，保存按钮对所有登录用户可见——符合「本人编辑本人资料」语义；跨用户编辑风险已由 `saveField()` 的身份校验（只用当前会话账号更新）阻断。
- 修复后可一并验证：个人资料页能显示输入框并能保存；状态页列出 10 个状态且可切换。
