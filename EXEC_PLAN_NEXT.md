# 总执行计划（下一阶段）— 28 项反馈/需求归类与批次清单（含用户补充第 28 项：字典管理补全）

> 本文件是 **阶段 1（v1.3.91 起）** 的执行清单，承接 `EXEC_PLAN.md`（已截至 **v1.3.90**）。
> 来源：用户 27 条反馈/需求 + **用户补充第 28 项（字典：名称/颜色字典驱动 + 禁用字段，开发端维护、页面只读）**。每条均已 **归因 + 归类 + 排批**，并与已落地代码交叉核对，
> 标注为 **[新建]**（需从零实现）或 **[核对/补完]**（已有基础，需修正/暴露/对齐）。
>
> 维护约定同 `EXEC_PLAN.md`：每完成一个批次，在 `release.sh` 发版同一提交内更新本文件勾选与版本标注。

规划基线时间：2026-07-31（对应 v1.3.90 已上线 CloudBase）

---

## 一、27 项归类总览

> 归类原则：把"同一组件/同一页面/同一根因"的条目合并到同一批次，避免反复改同一文件。

| 类别 | 覆盖条目 | 性质 |
|------|----------|------|
| **A. 渲染与状态 Bug 修复** | #1 侧边栏当前用户优先、#6 语言切换全局生效、#9 反馈选中态+按钮样式、#17 打卡颜色统一+手动编辑、#19 统计颜色非黑、#18 请假小时单位(核对) | 修复为主 |
| **B. 设置中心 / 个人中心 重构** | #2 设置导航改为点击进入子页、#3 个人资料页布局、#4 账号安全页、#5 登录设备页 | 重构+新建 |
| **C. 深色模式 & 主题色** | #7 深色模式主题色适配+设置页默认深色、#8 主题色去默认自定义输入 | 重构 |
| **D. 图标一致性 & 完整性** | #10 设置/基础数据图标统一(白线)、#11 图标管理中文显示、#12 图标去重、#25 图标补全 | 修复+补全 |
| **E. 首页 & 日历 UX** | #13 首页去快捷项、#14 问候语昵称/账号/工号、#15 首页加天气、#16 日历周末配色、#19 日历统计颜色 | UX |
| **F. 反馈系统 & 权限** | #9(样式)、#20 反馈清单(权限+工单)、#21 我的反馈历史 | 新建+增强 |
| **G. 报表补全** | #22 日/周/综合报表暴露 | 补完 |
| **H. 新功能** | #23 工作流管理、#24 自定义流程 | 新建 |
| **I. 权限 & 字典 & 语言补全** | #26 权限管理补全、#28 字典驱动化(名称/色走字典+禁用)、#27 语言全类别补全 | 补完 |

---

## 二、逐条归因（28 项 → 根因 → 处置）

### A. 渲染与状态 Bug 修复
- **#1 侧边栏默认加载历史数据才跳当前用户** ✅ 已修复（v1.3.91 / 批次186）
  - 根因：`index.html` 抽屉(`#drawer`)首帧硬编码演示账号 `LovelyQY` 与静态标签/签名；`refreshDrawerUser()` 在 `!acc`（未登录）时直接 `return`，残留历史/演示数据；首屏会先闪一下旧内容再被异步拉取的当前用户替换。
  - 处置：抽屉静态内容改为空容器（`#drawer-name`/`#drawer-tags`/`#drawer-bio`）由 JS 填充；`refreshDrawerUser()` 未登录时渲染 `common.notLoggedIn` 占位并清空标签/签名/头像，绝不残留他人数据；当前用户始终由 `getUserAsync()`（读当前 `getSessionAccount()`）驱动。
- **#6 切换语言后未转换** ⭐ 最高优先（多数"未翻译"的根因）✅ 已修复（v1.3.91 / 批次186）
  - 根因（三层，已全部解除）：① 独立页（settings + 5 个业务管理页）**只引入了 `i18n.js` 却漏引 6 份字典**（`i18n/<lang>.js`），导致 `RT_I18N` 为空、`t()` 始终返回裸键；② `i18n.js` 未在加载时自动 `applyLang`（仅 `langchange` 才重渲染），且原兜底取语言时机过早会错误回退；③ `settings.js` 的部分静态文案与动态渲染未走 `t()`/`data-i18n`，`langchange` 监听也未重渲染子视图。
  - 处置：① `i18n.js` 加载即按当前语言 `applyLang`（修正 DCL 时机，待 `config.js`/`RT_CONFIG` 就绪后再读语言）；② 给 6 个独立页补注入 `i18n.js` + 6 份字典，并登记进 `release.sh` 的 `I18N_ENGINE_PAGES` 随发版升级；③ `settings.html` 结构文案全量 `data-i18n` 化（53 处），字典补齐 26 个 `settings.*` 键 + `common.notLoggedIn`；④ `settings.js` 的 `langchange` 监听重渲染 landing + 当前子视图与标题。
- **#9 反馈类型选中无效果 + 提交按钮样式不符** ✅ 已修复（v1.3.99 / 批次194）
  - 处置（✅ 已在 Batch 194 / v1.3.99 落地）：`settings.js` 新增 `onFbTypeClick` 并绑定 `#fbTypeRow` 单击，行内 `.lang-btn` 单选切换 `active`（修复「选中无效果」）；提交按钮原已是 `.btn-primary`（#9 样式一半已满足），本次补齐选中态交互。新增 `tests/test-batch194-feedback.js` 覆盖 #9 选中绑定契约。
- **#17 打卡颜色各地不统一（红/绿混）+ 可手动编辑时间** ✅ 已修复（v1.3.95 / 批次190）
  - 根因：上班/下班打卡使用不同语义色，散落在 `app.js`/`attendance.js`/日历多处，未收敛到 CSS 变量（首页 working 点硬编码 coral 红、日历 doing 点用蓝、done 点用绿）。
  - 处置（✅ 已在 Batch 190 / v1.3.95 落地）：① `base.css` 定义统一打卡色板 `--clock-in`（上班·蓝 `#1677ff`）/ `--clock-out`（下班·绿 `#389e0d`），并加 `html.dark` 覆盖（`#4096ff`/`#73d13d`）；`pages.css` 全站打卡元素（首页打卡点 `dot-working`/`dot-done`、日历点 `cal-dot-doing`/`cal-dot-done`、打卡面板时间格 `cal-clock-t.in`/`.out`）统一只引用这两个变量，消除红/绿混用；`app.js` 打卡面板为上班/下班时间格分别加 `in`/`out` 类。② `attendance.js` 新增 `editTime(date, {clockIn, clockOut})`（仅覆盖传入字段、刷新 `updatedAt`）；`app.js` 当日面板「考勤」分区新增「编辑时间」内联入口（`toggleClockEdit`/`saveClockEdit` + `tsToHm`/`combineDateTime` 辅助），保存经 `RT_ATTENDANCE.editTime` 写回并重渲染日历（工时经 `hoursOf` 实时派生）；下班早于上班时拦截提示。
- **#19 日历下方统计颜色为黑色** ✅ 已修复（v1.3.98 / 批次193）
  - 处置（✅ 已在 Batch 193 / v1.3.98 落地）：日历下方月度小结四个 `stat-num` 改用语义色变量（出勤天数 `var(--primary)`、实际工时 `var(--success)`、应出勤 `var(--muted)`、请假合计 `var(--warning)`），替换近黑 `--text`，与主题/深色联动。
- **#18 请假时间单位为小时**（[核对]） ✅ 已核对（v1.3.95 / 批次190）
  - 现状：`leave.js`（批次 182）已实现"按小时请假"，时长文案 `"2.5 小时"`。
  - 处置（✅ 已在 Batch 190 / v1.3.95 核对）：各请假入口时长均走小时口径——首页面板 `RT_LEAVE.fmtDuration(leaveMin)`（"X 小时"）、日历当日面板 `RT_LEAVE.fmtDuration(lv.minutes)`、统计 `RT_STATS.fmtMin(leaveMin)`（"X 时"）；`leaveDays` 为「有请假记录的天数」计数（频率指标），非时长，保留「天」属合理，与 #18「时长按小时」不冲突。新增 `test-batch190-clock-leave.js` 锁定该契约。

### B. 设置中心 / 个人中心 重构
- **#2 设置栏应点击进入各页面，而非全部显示在下方** ✅ 已修复（v1.3.93 / 批次188）
  - 现状：`settings.html` 已有 `subview`（account-profile/security/devices…）但通过 `location.hash` 内嵌切换，条目偏多显拥挤。
  - 处置（✅ 已在 Batch 188 / v1.3.93 落地）：账号类条目（个人资料 / 账号安全）改为整页跳转独立子页 `profile.html` / `security.html`（点击经 `navTo()`，返回键稳定回 settings）；`settings.html` 移除 `#account-profileView` / `#account-securityView` 内嵌子视图与共享编辑浮层（`#acSheet`），其编辑逻辑已随对应独立页落地；hub 仅保留分组入口 + 图标，「登录设备」仍保留为页内 `#account-devices` 子视图（独立设备页为 Batch 189 #5）。
- **#3 个人资料页布局** ✅ 已修复（v1.3.93 / 批次188）
  - 基本信息：头像、账号、昵称、标签、个性签名。
  - 组织信息：公司、部门、职位、工号、姓名。
  - 处置（✅ 已在 Batch 188 / v1.3.93 落地）：重构 `profile.html` 为两段式卡片（基本信息卡 `.pcard` + 组织信息卡 `.pcard`）；组织信息（姓名 / 工号 / 公司 / 部门 / 职位）由 `RT_USERS` 当前用户经 `RT_DEPTS`/`RT_COMPANIES`/`RT_POSITIONS` 外键只读解析（`profile.html` 新增 departments/companies/positions 脚本引入，并在 `release.sh` 的 `PROFILE_ORG_PAGES` 登记随发版升级）。注：profile.html 文案当前为硬编码中文，全量多语言收口见 Batch 200（#27）。
- **#4 账号安全页** ✅ 已修复（v1.3.94 / 批次189）
  - 账号、密码、手机、邮箱（字段可编辑 + 校验）。
  - 处置（✅ 已在 Batch 189 / v1.3.94 落地）：`security.html` 作为独立「账号与安全」页（Batch 188 已将设置 hub「账号安全」条目改 `nav: 'security.html'` 跳转）；页面含 `sv-account`/`sv-password`/`sv-phone`/`sv-email` 四字段，`openEdit()`/`saveField()` 经 `RT_USERS.updateProfile` 写回，校验正则 `RE_ACCOUNT`/`RE_PW_CHARSET`/`RE_PHONE`/`RE_EMAIL`，保存按钮 `data-perm="op_security_edit"` 受权限门控。
- **#5 登录设备页** ✅ 已修复（v1.3.94 / 批次189）
  - 当前设备（设备 / 登录方式 / 登录时间）+ 其他设备列表（同字段 + "禁用设备"操作，写回设备记录）。
  - 处置（✅ 已在 Batch 189 / v1.3.94 落地）：新建独立 `devices.html`（当前设备 UA 解析 `prettyUA()` + 当前账号 + "本机会话"登录方式；「其他设备」为占位区，标注「历史登录设备列表与登出其他设备需云端后端支持」）；设置 hub「登录设备」条目由页内 `#account-devices` 子视图改为 `nav: 'devices.html'` 跳转，`settings.js` 移除内嵌 `renderDevices`/`prettyUA`/`guardPerm` 及 `account-devicesView` 子视图，`release.sh` 新增 `DEVICES_PAGE="devices.html"` 登记 auth/config/theme-bootstrap/ui-utils/permissions-registry/permissions/sw-register 随发版升级。注：「其他设备」列表与「登出其他设备」属后端能力，本批仅占位，待云同步后端落地后对接（见 Batch 198 权限 / 云端同步相关批次）。

### C. 深色模式 & 主题色
- **#7 深色模式主题色换成深色（蓝色太突兀）；深色模式下设置页需默认深色，要先切深色才能换回浅色** ✅ 已修复（v1.3.92 / 批次187）
  - 根因：深色模式仅切背景，主色仍用亮色蓝，且设置页初始不读深色态。
  - 处置（✅ 已在 Batch 187 / v1.3.92 落地）：① `theme-bootstrap.js` 新增 `darkSeriesColor(hex)=mix(hex,'#2b3242',0.4)`，深色模式下主色改为低饱和深色系（如 `#1677ff`→`#1e5bb3`），与浅色亮蓝完全解耦；② `resolveDark(prefs)` 显式布尔优先、否则跟随 `window.matchMedia('(prefers-color-scheme: dark)')`，启动即判定并把 `root.classList.add('dark')`；设置页 `renderUI()` 初始即用 `resolveDark` 落位深色态，深浅切换双向可用。
- **#8 主题色：去掉默认自定义颜色输入，改为可选 + 点"恢复默认"才出现** ✅ 已修复（v1.3.92 / 批次187）
  - 处置（✅ 已在 Batch 187 / v1.3.92 落地）：默认仅展示预设色板；`#themeCustomRow`（含 `#themeCustom` 颜色输入）默认 `display:none`，点击「自定义颜色」(`RT_SETTINGS_PAGE.toggleCustomColor()`) 或「恢复默认」(`resetTheme()` 反显该行) 后才按需出现。

### D. 图标一致性 & 完整性
- **#10 设置页图标与基础数据页图标不一致，内部非白色线条** ✅ 已修复（v1.3.96 / 批次191）
  - 处置（✅ 已在 Batch 191 / v1.3.96 落地）：统一图标来源为 `RT_PAGE_ICONS`（白线 SVG），设置页（`settings.js` 经 `iconSvg()`→`RT_PAGE_ICONS.get()`）与基础数据页（`basic-data.html` 经 `MODULES`→`RT_PAGE_ICONS.get()`）共用同一套渲染。验证：`page-icons.js` 默认注册表 33 个默认 SVG 全部为 `stroke="currentColor"` 白线、无填充色；`settings.html`/`basic-data.html`/`icon-manager.html` 内联 SVG 亦全部白线（新增 test-batch191-icons.js 静态断言覆盖）。
- **#11 图标管理新增图标非中文显示** ✅ 已修复（v1.3.96 / 批次191）
  - 处置（✅ 已在 Batch 191 / v1.3.96 落地）：`icon-manager.js` `KEY_LABELS` 补全全部 33 个注册 key 的中文标签（settings/account/security/device/general/notification/theme/download/cloud-sync/help 等，外加 workflow/process/weather/ticket 前向兼容标签），图标管理列表与预览均显示中文名。
- **#12 图标管理部分图标一致，需重构只保留一个，每个图标都要不一样** ✅ 已修复（v1.3.96 / 批次191）
  - 处置（✅ 已在 Batch 191 / v1.3.96 落地）：`page-icons.js` 默认 SVG 去重——`department`（组织图，一上二下）、`user`（单人）、`report-meeting`（会议桌+四人首）、`account`（人形圆）各自语义化，互不相同；`icon-manager`（四宫格）与 `theme`（太阳带光芒）去重。仅品牌 logo 三角 `index`/`login`/`pwa` 刻意复用同一品牌字形、字节相同，作为文档化例外保留；运行时断言确认除该例外外无任何两个默认 SVG 字节相同。
- **#25 图标管理补上所有图标** ✅ 已补全（v1.3.96 / 批次191）
  - 处置（✅ 已在 Batch 191 / v1.3.96 落地）：补齐前向兼容默认图标 `workflow`（流程连线）/ `process`（图层）/ `weather`（云雨）/ `ticket`（工单），注册进默认注册表并配中文标签；全工程 `RT_PAGE_ICONS.get(KEY)` 引用扫描确认所有被引用 key 均命中已注册默认 key（无空白渲染）。

### E. 首页 & 日历 UX
- **#13 首页去掉日历下的几个快捷项（与顶部 TAB 效果一致，冗余）** ✅ 已修复（v1.3.97 / 批次192）
  - 处置（✅ 已在 Batch 192 / v1.3.97 落地）：`index.html` 移除首页 `.home-quick` 中与顶部 TAB 效果重复的冗余快捷项「新建任务/代办/日历/反馈」（均仅 `switchView` 到对应 TAB），仅保留无对应 TAB 的「统计」入口（其为统计报表唯一进入路径）；保持单一信息架构。
- **#14 首页问候语旁显示 昵称 → 无则账号 → 无则工号** ✅ 已修复（v1.3.97 / 批次192）
  - 处置（✅ 已在 Batch 192 / v1.3.97 落地）：`app.js` `homeUserName()` 改为按 `u.nickname || u.account || u.employeeNo || 会话账号` 兜底，不再回退真实姓名（`u.name`），实现「昵称 → 账号 → 工号」展示优先级。
- **#15 首页问候右侧空白区加天气（当天+明天，可选城区）** ✅ 已补全（v1.3.97 / 批次192）
  - 处置（✅ 已在 Batch 192 / v1.3.97 落地）：问候卡（`.home-greeting`）右侧新增 `.home-weather` 天气小组件，展示今明两天（图标 + 最低/最高温），城区经「📍」按钮 prompt 录入并写入 `localStorage`（默认「北京」）；数据源为 open-meteo（无需 API Key），离线 / 无 fetch / 请求失败均静默降级为占位文案（「天气（离线）」/「天气暂不可用」），不阻塞首页渲染。注：天气文案目前为中文硬编码，6 语言收口留待 Batch 200（#27）。
- **#16 日历周六日与工作日颜色区分** ✅ 已修复（v1.3.98 / 批次193）
  - 处置（✅ 已在 Batch 193 / v1.3.98 落地）：`base.css` 新增周末语义色变量 `--weekend-fg`（浅 `#fa541c` / 深 `#ff7a45`）与 `--weekend-bg`（浅 `rgba(250,84,28,.06)` / 深 `rgba(255,122,69,.12)`）；`pages.css` 全量日历 `.cal-cell.is-weekend`（底色 + 日期字色）与首页迷你日历 `.home-cal-cell.is-weekend`（字色）套用周末配色，并新增 `.cal-dot-weekend` 图例；`app.js` `renderCalendar`/`renderHomeCalendar` 均按 `new Date(y,m,d).getDay()===0||6` 标记 `is-weekend`（今日/休息/打卡等后续规则优先级更高，确保高优先状态不被覆盖）。
- **#19 日历下方统计颜色为黑色** ✅ 已修复（v1.3.98 / 批次193）
  - 处置（✅ 已在 Batch 193 / v1.3.98 落地）：`app.js` 日历下方月度小结（`.cal-summary.cal-summary-4`）四个 `stat-num` 改用语义色变量——出勤天数 `var(--primary)`、实际工时 `var(--success)`、应出勤 `var(--muted)`、请假合计 `var(--warning)`，替换原先继承的近黑 `--text`，与主题/深色模式联动（所用变量均在 base.css 定义且深色下有效）。

### F. 反馈系统 & 权限
- **#9**（见 A）✅ 已在 Batch 194 / v1.3.99 落地（反馈类型 chip 单选修复）。
- **#20 反馈页面：显示所有反馈清单（有权限），可处理反馈工单** ✅ 已落地（v1.3.99 / 批次194）
  - 现状：`report-bug.js` 已有 `feedbackBy`/`feedbackTime` 工单字段（schema 具备）。
  - 处置（✅ 已在 Batch 194 / v1.3.99 落地）：① `permissions-registry.js` 新增 `mod_feedback` 模块（`page_feedback`：view/list/reply → 叶子码 `op_feedback_view`/`op_feedback_list`/`op_feedback_reply`）；② `app.js` `renderFeedbackTab()` 经 `RT_PERM.can(acct, 'op_feedback_list')` 判定「处理模式」——有权限者显示全部反馈 + 每条可改状态（pending/replied/resolved）/指派处理人/回复，经新增 `updateFeedback(id, patch)` 写回 IDB `/feedback` store；无权限者仅看本人（`_owner` 过滤）；③ `fbItemHtml(r, canHandle)` 增处理控件并补 `.fb-handle` 等 CSS（pages.css）。新增 `tests/test-batch194-feedback.js` 覆盖 #20 权限码注册 + 处理写回契约。
- **#21 我的反馈记录：在 设置-意见与反馈 中查看历史反馈及处理情况** ✅ 已落地（v1.3.99 / 批次194）
  - 处置（✅ 已在 Batch 194 / v1.3.99 落地）：`settings.html` 反馈表单下新增「我的反馈记录」`#myFeedbackList` 容器；`settings.js` 新增 `readFeedbackAll()` + `renderMyFeedback()`（按当前用户 `_owner` 过滤，复用 `.set-row`/`.help-item-tag`/`.empty-tip` 内联类渲染类型/状态/时间/回复进度），在 `renderHelp()` 进入时刷新并导出 `RT_SETTINGS_PAGE`。6 语言字典补齐 `settings.myFeedback`。

### G. 报表补全
- **#22 统计报表缺少 日统计 / 周统计 / 综合报表**（[核对/暴露]）
  - 现状：`stats.js`（批次 184）已按 日/周/综合 三种粒度聚合，但缺少统一可访问的报表 hub/TAB。
  - 处置：新增报表中心（或 `report.html` 扩展 TAB：日统计/周统计/综合），入口挂设置/抽屉，权限门控 `op_report_*_view`。

### H. 新功能
- **#23 工作流管理（基础数据子项）**
  - 处置：在 `basic-data.html` 新增"工作流管理"子项；数据模型（工作流定义：节点/流转规则/关联对象）；CRUD 页面 + 同步接入（cloud-adapter 已具备 8 模块写→同步队，可扩展）。
- **#24 自定义流程（基础数据子项：流程管理）**
  - 处置：新增"流程管理"子项：可添加主页面 TAB 项；页面信息从**已有提供项中选择**（不允许自建）；关联 #23 工作流；动态注册 TAB 与路由。

### I. 权限 & 字典 & 语言补全
- **#26 权限管理补全所有权限**
  - 处置：`permissions-registry.js` / `permission.html` 补齐所有页面与操作权限（含新功能 工作流/流程/反馈工单/天气设置等）。
- **#28 字典管理：名称/颜色以字典为唯一真相源 + 禁用字段（开发端）** ⭐ 用户补充 + 复核定稿
  - 现状：`dictionary.html` 当前为 **只读** 页，仅做 13 类系统枚举（`SEED_TYPE`）幂等播种；字段含 `code/type/name/order/color`。但**名称/颜色尚未完全由字典驱动**：`dict-init.js` 的 `statusName()` 用硬编码 `const s = { TODO:'待开发', ... }` 写死状态名（不读字典）；`app.js` 的 `ensureTaskTypes/ensureTodoTypes` 虽读字典，但失败兜底用硬编码 `FALLBACK_*` 数组——导致"改字典名/色后代码侧仍要同步改"的双份维护。
  - 处置（**页面不做 CRUD；名称/颜色走字典；禁用在开发端**）：
    1. **名称/颜色字典驱动化**：移除 `statusName()` 的硬编码 `const s` 映射、收敛 `app.js` 中与字典重复的 `FALLBACK_*` 同名/同色兜底；状态名、类型名、各色统一从 `dict` store 读取，做到"改字典即全站生效、只改字典不必改代码"。仅保留"字典加载失败"的极简兜底（不再与字典重复维护）。
    2. **禁用字段（开发端维护）**：字典条目新增 `disabled`（默认 `false`）；种子数据由开发端填写，**不在字典页提供启用/禁用按钮（不做页面控制）**。
    3. **禁用默认不展示**：消费侧（`getDictByType` / `ensure*` / 各下拉与列表渲染）默认过滤 `disabled !== true`；被禁用条目不再出现在选择项、标签、统计中。
    4. **字典页仍为只读参考**：`dictionary.html` 展示全部条目（禁用项以"已禁用"灰显标记，仅供查阅、无操作按钮）；`basic-data.html` 描述维持"系统枚举/仅查看"。
    5. **不接入云同步写**：本能力为开发端种子维护，无需扩展 `cloud-adapter` 的 `WRITE_MAP`；i18n 仅补页面外壳（#27），字典 `name` 属展示数据、不纳入 6 语言 key。
    6. **非功能类子项"新增即展现"（免改代码）**：将"展示型"分类（如 职级 / 人员状态 / 项目状态 等不参与逻辑分支者）的消费 UI 改为**纯从 `dict` store 动态渲染**（`getDictByType(category)` 直接遍历，不写死列表/兜底）；开发端在种子新增该分类子项后页面自动出现，无需改其他代码。参与逻辑分支的"功能类"分类（`code` 被 `lifecycles.js` / `statusName()` / 操作映射引用者，如 任务类型/各状态/待办类型与状态/操作）除外——其新增需同步改代码，属"关联代码"范围，不在此列。实施时建议给 `SEED_TYPE` 增加 `functional` 标记显式区分两类。
- **#27 语言补上所有类别语言**
  - 处置：为所有**新增页面与功能**（工作流/流程/反馈工单/天气/报表中心/设备禁用/字典管理等）补齐 6 语言 key（zh-CN/zh-HK/zh-TW/en/ko/ja），确保 `data-i18n` 全量覆盖、无遗漏硬编码。

---

## 三、批次执行清单（建议批次号 186–200）

> 优先级：P0=阻塞体验/多数页面受影响；P1=明确缺陷/重要功能；P2=增强/补全。
> 依赖：#23 先于 #24；i18n 收口(#27)贯穿各批、最后统一校验。

| 批次 | 标题 | 覆盖条目 | 性质 | 优先级 | 预计版本 |
|------|------|----------|------|--------|---------|
| **186** | i18n 引擎修复 + 侧边栏当前用户优先 | #6, #1 | 修复 | **P0** | v1.3.91 ✅ 已发布（i18n.js+6字典全站注入/自动applyLang、settings 53处data-i18n化、6字典各+27键、侧边栏当前用户优先+未登录占位） |
| **187** | 深色模式 & 主题色重构 | #7, #8 | 重构 | P1 | v1.3.92 ✅ 已发布（theme-bootstrap.js 深色系主色与浅色解耦、跟随系统 prefers-color-scheme；自定义颜色输入默认隐藏、点「自定义颜色」/「恢复默认」才出现；7 项主题单测全过） |
| **188** | 个人中心：设置导航重构 + 个人资料页 | #2, #3 | 重构 | P1 | v1.3.93 ✅ 已发布（#2 账号类改跳独立子页 profile.html/security.html、移除内嵌子视图与编辑浮层；#3 profile.html 重构为基本信息卡+组织信息卡两段式；6 项结构测试全过） |
| **189** | 账号安全页 + 登录设备页 | #4, #5 | 新建 | P1 | v1.3.94 ✅ 已发布（#4 security.html 独立账号安全页字段可编辑+校验+保存；#5 新建 devices.html 独立登录设备页，settings「登录设备」改 nav 跳转并移除页内子视图与内嵌渲染逻辑，release.sh 登记 DEVICES_PAGE；5 项结构测试全过） |
| **190** | 打卡颜色统一 + 手动编辑时间 + 请假小时核对 | #17, #18 | 修复 | P1 | v1.3.95 ✅ 已发布（#17 定义 --clock-in/--clock-out 变量全站统一引用、移除红/绿混、当日面板新增「编辑时间」内联入口写回并重算工时；#18 核对各请假入口均按小时展示，leaveDays 为天数计数非时长；9 项结构测试全过） |
| **191** | 图标重构与补全 | #10, #11, #12, #25 | 修复+补全 | P1 | v1.3.96 ✅ 已发布（#10 全站图标统一经 RT_PAGE_ICONS 白线 SVG，默认注册表 33 个 + 页面内联均白线；#11 icon-manager KEY_LABELS 补全全部 33 个注册 key 中文标签；#12 默认 SVG 去重 department/user/report-meeting/account 各自语义化、icon-manager 与 theme 去重，仅品牌 logo 三角 index/login/pwa 字节相同为文档化例外；#25 补齐 workflow/process/weather/ticket 前向兼容默认图标且引用键均可解析；新增 test-batch191-icons.js 8/8 通过，全量 220 测仅 14 基线失败无回归） |
| **192** | 首页 UX 精简 + 问候 + 天气 | #13, #14, #15 | UX | P1 | v1.3.97 ✅ 已发布（#13 移除首页日历下与顶部 TAB 重复的冗余快捷项「新建任务/代办/日历/反馈」，仅保留无对应 TAB 的「统计」入口；#14 问候名按「昵称→账号→工号」兜底（不再回退真实姓名）；#15 问候右侧新增天气小组件，open-meteo 轻量数据源、今明两天+可选城区、离线/失败降级占位；新增 test-batch192-home-ux.js 4/4 通过，全量 224 测仅 14 基线失败无回归） |
| **193** | 日历周末配色 + 统计颜色 | #16, #19 | UX | P2 | v1.3.98 ✅ 已发布（#16 日历周末（周六/周日）与工作日区分：base.css 新增 --weekend-fg/--weekend-bg（浅+深覆盖），全量日历与首页迷你日历套用周末配色并补「周末」图例，app.js 按 getDay()==0||6 标记 is-weekend；#19 日历下方月度小结统计改用语义色变量（出勤天数 var(--primary)、实际工时 var(--success)、应出勤 var(--muted)、请假合计 var(--warning)）非纯黑且与主题/深色联动；新增 test-batch193-calendar-stats.js 4/4 通过，全量 228 测仅 14 基线失败无回归） |
| **194** | 反馈系统增强（清单+工单+我的反馈+样式） | #9, #20, #21 | 新建+增强 | P1 | v1.3.99 ✅ 已发布（#9 修复反馈类型 chip 单选 `onFbTypeClick` 绑定 `#fbTypeRow`；#20 新增反馈「处理模式」：`op_feedback_list` 权限门控 + 状态/处理人/回复经 `updateFeedback` 写回 IDB，无权限者仅看本人；#21 设置页「我的反馈记录」`#myFeedbackList`，按 `_owner` 过滤复用内联类渲染；新增 `tests/test-batch194-feedback.js` 6/6 通过，全量 254 测 14 基线失败无回归） |
| **195** | 报表中心暴露（日/周/综合） | #22 | 补完 | P2 | v1.4.00 ✅ 已发布（#22 考勤工时统计（日/周/综合）接入报表中心 hub：report-stats.html 独立子页 + 权限门控 op_report_stats_view/export + stats-view.js 共享渲染层（app.js 委托、单一真相源）+ 6 项结构测试全过） |
| **196** | 工作流管理 | #23 | 新建 | P1 | v1.4.01 |
| **197** | 自定义流程（流程管理+TAB+关联工作流） | #24 | 新建 | P1 | v1.4.02 |
| **198** | 权限管理补全 | #26 | 补完 | P2 | v1.4.03 |
| **199** | 字典驱动化改造（名称/色走字典 + 禁用字段·默认不展示 + 非功能子项新增即展现，开发端维护，页面只读） | #28 | 改造 | P1 | v1.4.04 |
| **200** | i18n 全类别收口（6 语言 key 全量覆盖） | #27 | 补完 | P0(贯穿) | v1.4.05 |

---

## 四、执行顺序建议与关键依赖

1. **先做 186（i18n 修复）**：它解除"切换语言不翻译"的全局根因，后续所有页面的中文文案都能正确走 `t()`/`data-i18n`，避免反复返工。
2. **187 深色/主题** 与 **188–189 个人中心** 可紧随，属于"设置中心体验"主线。
3. **190–193** 为打卡/图标/首页/日历的散点 UX 修复，互相独立，可并行排期。
4. **194 反馈系统** 依赖权限门控（#26 可后置收口，但需在 194 前预留权限点）。
5. **196 工作流 → 197 自定义流程** 强依赖，必须顺序。
6. **198 权限 / 199 字典驱动化改造 / 200 i18n 收口** 作为压轴：#28 把名称/颜色收敛为字典单一真相源（消费侧重构），禁用在开发端、页面只读，不接入云同步写、不需编辑权限点；最后由 #200 统一补页面外壳多语言。

---

## 五、验收口径（通用）

- 每条修复类：在对应页面复现原问题 → 修复 → 截图/自动化验证无回归。
- 每批增发版：沿用 `release.sh`（`patch_ver` + `check_ver` 自检，所有 `<script src>` 必须登记 `?v=`）。
- 部署：本批完成后 `git push origin main` → `bash deploy-cloudbase.sh`，并核对 `version.json` 本地==云端。
- i18n：每批新增/修改的文案统一补 6 语言；200 批做全量扫描（无遗漏 `data-i18n` 缺失、无硬编码中文残留）。
- 测试：复用既有 `tests/`（`node:test` + `fake-indexeddb` 单测；Playwright e2e），新功能补对应单测/ e2e。
