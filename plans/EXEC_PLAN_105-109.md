# 批次 105–109 修复清单

> 创建时间: 2026-07-24
> 基线版本: v1.3.50
> 目标版本: v1.3.51
> 批次范围: 105–109

---

## 问题总览

| # | 问题 | 根因 | 关联批次 |
|---|------|------|----------|
| 1 | 人员管理 — 角色选框选中时有蓝色阴影框 | `.role-chip` 内 checkbox 点选时浏览器默认 focus ring (`box-shadow`) 未禁用 | 105 |
| 2 | 人员管理 — 角色选择框与备注重叠 | `.field-hint` 上边距 `-4px` 向上挤压导致与 `.role-pick` 重叠 | 105 |
| 3 | 权限管理 — 权限树中英双语 + 全局语言设置 | 新建设置页面（侧边栏入口），语言切换为首页设置项；权限树双语渲染为首个消费者 | 106 |
| 4 | 合并入问题3 | — | 106 |
| 5 | 权限新增 — 无法选择已有树节点位置 | `openAdd()` 无参数，始终新建无父节点的 page 节点；树节点行缺少「新增子节点」入口 | 107 |
| 6 | 角色管理 — 人员列表无法删除角色关系 ✅ | 人员抽屉 (`peopleSheet`) 仅展示列表，无删除按钮。admin 的系统管理员角色不可删除 | 108 |
| 7 | 角色管理 — 系统管理员标签不一致 ✅ | 列表卡片标签「系统」(role.js:93) vs 编辑 meta 标签「系统管理员」(role.js:243) | 109 |

---

## 执行清单

### 批次 105 — 人员管理角色选择 UI 修复 ✅

**文件**: `user.html`（commit `5ebcf8b`，[no-version-bump]，已推送）

**问题1: 角色选框蓝色阴影** ✅
- 根因: `.role-chip input[type="checkbox"]` 在点击时浏览器默认添加 focus 环（`box-shadow` / `outline`），全局 `outline:none` 仅覆盖 outline 属性
- 修复: 在 `.role-chip input` CSS 中追加 `box-shadow:none` 和 `outline:none !important`

**问题2: 角色选择框与备注间距** ✅
- 根因: `.field-hint { margin: -4px 0 10px }` 的负上边距使备注向上侵入 4px
- 修复: 为 `.role-pick` 追加 `margin-bottom:6px`，抵消 field-hint 的 -4px 负上边距，净间距约 2px

---

### 批次 106 — 设置页面 + 语言切换 + 权限树双语 ✅

**文件**: `config.js`、`settings.html`(新)、`settings.js`(新)、`index.html`、`permission.js`

**架构 — 为全站 i18n 预留**

语言偏好以 `config.js` 的 `RT_CONFIG` 为中心、localStorage 为持久层的双层架构：

| 层 | 作用 | 实现 |
|----|------|------|
| 内存 | 全局单一事实来源 | `RT_CONFIG.ui.lang` (默认 `'zh'`) |
| 持久 | 刷新/SW更新后恢复 | `localStorage.setItem('rt_lang', lang)` |
| 未来 | 跨设备同步 / 备份 | IndexedDB 持久层（API 不变） |

**API（config.js）:**
```js
RT_CONFIG.getLang()          // → 'zh' | 'en'
RT_CONFIG.setLang(lang)      // 内存 + localStorage + langchange 事件
```

**子任务 1: config.js 语言基础设施**
- `RT_CONFIG.ui` 新增 `lang: 'zh'`
- 新增 `getLang()` / `setLang(lang)` 函数
- `setLang()` 写入 localStorage `rt_lang` + 派发 `langchange` 事件

**子任务 2: 设置页面 (settings.html + settings.js，新文件)**
- 侧边栏入口：`index.html` drawer-nav 中「存储与备份」与「关于」之间插入设置项
- 页面布局：顶部标题「设置」，分组卡片式布局
- 首项：语言切换「中 | EN」分段按钮，默认选中中文
- 切换时调用 `RT_CONFIG.setLang()` → 触发 langchange
- 页面监听 langchange 更新按钮状态（跨页同步）
- 风格对齐现有 about.html / storage-backup.html

**子任务 3: 权限树双语 — 全局跟随 + 局部覆盖（问题3+4）**

权限树作为开发/管理工具，需独立于全局语言设置：

| 场景 | 行为 |
|------|------|
| 首次加载 | 跟随全局 `RT_CONFIG.getLang()` |
| 点击局部按钮 | 覆盖为英文 → 显示 menuCode + 英文标签 |
| 再次点击 | 恢复跟随全局 |
| 离开页面 | 局部覆盖自动清除（不持久化） |

实现:
- `permission.html` 工具栏追加切换按钮 `🔤 EN/中`，默认不激活（跟随全局）
- `permission.js` 维护局部变量 `treeLang = null`，按钮点击时切换 `null ↔ 'en'`
- `buildTreeHtml` 渲染逻辑: `var lang = treeLang || RT_CONFIG.getLang();`
  - 中文 (`'zh'`)：`typeLabelMap = { module:'模块', page:'页面', op:'操作' }`，displayName 取 `(menuName || 注册表名 || menuCode).trim()`，隐藏 `.tcode`
  - 英文 (`'en'`)：类型标签用 `n.nodeType`，主名称 `menuCode`，副标题 `menuName`
- 监听全局 `langchange` 事件 → 仅当 `treeLang === null` 时重渲染
- sheet 表单 select option 同步切换中/英文

---

**已完成（commit `[no-version-bump]`，已推送）**：
- 子任务1: config.js 新增 `ui.lang:'zh'` + `getLang()/setLang()`（localStorage `rt_lang` 持久化 + `langchange` 事件广播）
- 子任务2: 新建 settings.html / settings.js；index.html 侧边栏「存储与备份」与「关于」之间插入「设置」入口，语言分段按钮「中 / EN」默认中文
- 子任务3: permission.html 工具栏加 `🔤 EN/中` 局部切换按钮；permission.js `buildTreeHtml` 双语渲染（中文只显名称含类型标签、英文主显 menuCode 副显名称）；`treeLang` 局部覆盖 + 监听全局 `langchange` 仅当未覆盖时跟随；表单类型/父节点下拉同步双语
### 批次 107 — 权限新增支持选择已有树节点 ✅

**文件**: `permission.html`、`permission.js`

**问题5: 无法选择已有权限树位置**
- 当前 `openAdd()` 无参数，始终创建无父节点的新 page 节点
- 根节点列表中每个行仅有编辑/删除按钮，无「新增子节点」入口

**已完成（commit `[no-version-bump]`，已推送）**:
1. 改造 `openAdd(type, parentCode)` 接受参数：type=默认节点类型, parentCode=预设父节点；无参时默认 page 且清空父节点
2. 每行非叶子树节点（module/page）追加蓝色「＋」按钮（op 类型不显示，因 op 无子节点）
3. 点击行级「＋」→ module 下新增 page、page 下新增 op，并自动选中父节点
4. 顶部「＋ 新增」按钮保持原有行为（无父节点的页面）；section-desc 同步说明

---

### 批次 108 — 角色管理删除人员角色关系 ✅

**文件**: `role.html`、`role.js`

**问题6: 人员列表无法删除角色关系**
- 人员抽屉 (`peopleSheet`) 仅在 `role.js:272-293` 渲染展示列表
- 每个人项无删除按钮，无 `removeUserRole()` 调用

修复:
1. 人员列表每一项追加 `×` 删除按钮（`role.html` peopleSheet 区，`.pdel` 样式）
2. 点击删除时调用 `RT_PERMISSIONS.saveUserRoles(userId, roles[])` 覆盖写 `users.roleIds` 移除该角色（等价 `updateUserRoles`）
3. admin + 系统管理员角色组合不可删除（`openPeopleById` 先取真实角色数据判定 `isSystemAdmin`，前端隐藏按钮 + `removeUserRole` 拦截并 toast）
4. 删除后刷新人员列表（`openPeople`）与卡片引用计数（`render` → 重算 `usersByRole`）

完成说明: 已在 `role.html` 增 `.person .pdel` 样式；`role.js` 的 `openPeople()` 按人渲染删除按钮、`openPeopleById()` 先读角色数据、`removeUserRole()` 执行移除并刷新；自测 6/6 通过（普通角色三按钮、系统角色 admin 受保护隐藏、bob 移除、admin 系统角色拦截）。

---

### 批次 109 — 系统管理员标签统一 ✅

**文件**: `role.js`

**问题7: 标签文字不一致**
- 列表卡片 (`role.js:93`): `<span class="badge-sys">系统</span>` — 2 字
- 编辑 meta (`role.js:243`): `<span class="badge-sys">系统管理员</span>` — 5 字
- 编辑标题 (`role.js:244`): `'系统管理员角色'`

修复: 统一为 `系统管理员`（5 字），列表卡片和编辑视图保持一致
- `role.js:93`: `系统` → `系统管理员`
- 编辑标题和 meta 已为 `系统管理员`，无需改动

完成说明: `role.js:93` 卡片徽标由 `<span class="badge-sys">系统</span>` 改为 `<span class="badge-sys">系统管理员</span>`，与编辑视图（line 243/244）完全一致；`node --check` 通过、无 U+FFFD。

---

## 决策记录

| 决策 | 内容 |
|------|------|
| D1 | 批次 105 合并问题1+2 — 同一文件 user.html，互不依赖 |
| D2 | 批次 106 一步到位：新建设置页面（侧边栏入口）+ 权限树局部覆盖开关（全局中文下可单独切换英文查看编码），全局/局部两级语言体系 |
| D3 | 批次 107 独立处理 — 涉及新增逻辑改造，影响面较大 |
| D4 | 批次 108 独立处理 — 涉及删除数据层操作，需谨慎 |
| D5 | 批次 109 独立处理 — 纯文字替换，极简改动 |
| D6 | 设置页面位于侧边栏「存储与备份」与「关于」之间，后续可在该页面追加更多设置项（如主题、通知等），排序可调整 |
