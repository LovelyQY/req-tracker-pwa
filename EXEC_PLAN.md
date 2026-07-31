# 总执行清单（按批次执行）— 仓库权威副本

> **本文件是执行状态的唯一权威来源。** 源自用户提供的《总执行清单_按批次执行.md》，
> 差异在于：**勾选状态与代码实际落地情况严格对齐**，并为每个已完成项标注落地版本号，
> 可与 `CHANGELOG.md` / `git log` 交叉核对。
>
> **维护约定**：每完成一个批次，在 `release.sh` 发版的同一个提交里更新本文件的勾选与版本标注。
> 顺序原则：先搭 CloudBase 后端（阶段 0）→ 做设置中心与首页/日历的本地框架 → 把依赖云端的功能逐个接真 → 最后做 i18n 收尾。

最后更新：2026-07-31，对应 **v1.3.87**

---

## 进度总览

| 顺序 | 批次 / 阶段 | 核心交付 | 状态 | 落地版本 |
|------|------------|----------|------|---------|
| 0 | 阶段 0（CloudBase 后端地基） | 环境 + 集合 schema + 认证桥接 + 同步引擎 + 安全规则 | 🟡 部分（0.6 待做，已按指令排最后） | 1.3.70–1.3.73 |
| 1 | 批次 174 设置中心 hub 框架 | settings.html landing+hash 容器、图标、6 语言骨架 | ✅ 完成 | 1.3.74 |
| 2 | 批次 175 账号分组 | 资料 / 安全 / 登录设备 | ✅ 完成 | 1.3.76 |
| 3 | 批次 176 界面与展示 + 通知 | 深色模式 / 主题色 / 语言选择器 / 通知 | ✅ 完成 | 1.3.77 |
| 4 | 批次 177 系统权限 + 下载 + 云同步 | 权限引导 / 下载记忆 / 云同步页 | ✅ 完成 | 1.3.78 |
| 5 | 批次 178 帮助与反馈 | 帮助文档查看器 / 反馈表单→`feedback` | ✅ 完成 | 1.3.79 |
| 6 | 批次 180 首页仪表盘 + TAB 栏重构 | 5 TAB（首页/任务/待办/日历/反馈）+ 首页落地 | ✅ 完成 | 1.3.80 |
| 7 | 批次 179 主页「反馈」TAB | 反馈视图渲染与表单入口 | ✅ 完成 | 1.3.81 |
| 8 | 批次 181 日历框架 + 打卡 + 节假日 | 月历 / 上下班打卡 / 节假日 / 手动调休 | ✅ 完成 | **1.3.82** |
| 9 | 批次 182 按小时请假 | 请假事实表leave.js + 工时扣减公式 + 当日面板 + 请假增删 + 日历标记 | ✅ 完成 | **1.3.83** |
| 10 | 批次 183 当日详情聚合 | 当日 任务/待办/反馈 三栏 + 多时间点命中 + 权限过滤 | ✅ 完成 | **1.3.84** |
| 11 | 批次 184 统计报表 | 日 / 周 / 综合 统计 + 工时条形图 + 状态分布 | ✅ 完成 | **1.3.85** |
| 12 | 批次 185 i18n（A·B 完成；C/D 待做） | 全站 6 语言（框架 + zh-CN/en/zh-HK/zh-TW 已落地） | 🔶 A·B 完成 / C·D 待做 | 1.3.87 |
| 末 | 阶段 0.6 各模块 cloud 适配层 | 写接入同步队列 + 媒体云存储 | ⬜ 待做（用户指令：排所有批次之后；**当前下一个**） | — |

**当前进度：12 / 13 主项完成（185-A·B 已落地，C/D 全站翻译待做；按用户指令，下一阶段为 0.6）。**

> TAB 栏最终顺序：**首页 / 任务 / 待办 / 日历 / 反馈**（首页置最左，反馈置日历右侧）。已于 180 落地。

---

## 阶段 0：CloudBase 后端地基

> **执行顺序调整（2026-07-30，用户指令）**：0.6（各数据模块 cloud 适配层）放到**所有批次的最后**执行。0.6 完成时需提醒用户。

- [ ] **0.0 前置清理**：删除旧版 localStorage 任务看板（`storage-backup.js` 中 `STORE_KEY='req-tracker-v2-items'` 及相关 `loadItems/saveItems/downloadBackup/applyBackup` 分支、旧看板入口），消除双数据源。
- [x] **0.1 环境确认**：`pwa-20260724-d2g883p981e75c948`、匿名登录已开、站点已上线。
- [x] **0.2 建集合 schema** — 实际建 **20 个集合**（16 张本地 store + `attachments` 元数据 + `login_logs`/`user_settings`/`sync_logs`/`user_push_subs`/`feedback`/`help_docs`）。每文档统一附加 `_owner / _createdAt / _updatedAt / _updatedBy / _deleted`。脚本见 `cloudbase/init-db.py` + `cloudbase/collections.schema.json`。
  - 不纳入云端：`dict`（本地种子）、`changelog`（本地解析）、`images`（本体迁云存储）。
- [x] **0.3 安全规则**（校验 20/20）：13 个用户隔离集合 → CUSTOM `read/write: auth.uid == doc._owner`；4 个组织共享集合（`roles`/`menus`/`role_permission`/`user_role`）→ ADMINWRITE。
  - **CLI 登录（已验证）**：`tcb login --apiKeyId <SecretId> --apiKey <SecretKey>`（注意：`login` 子命令不支持 `-e`）。子账号需主账号挂 `QcloudAccessForTCBRole` 策略。重跑：`python3 cloudbase/init-db.py`。
- [x] **0.4 数据播种**：采用**匿名登录**。客户端模块 `cloudbase-seed.js`，在「设置 → 云端同步 → 首次数据播种」触发，逐集合读取本地 IDB，补 `_owner=uid`，`doc(id).set()` 幂等 upsert。结果写 `sync_logs`。
  - 规则调整：`companies`/`depts`/`positions` 由「组织共享只读」改为**用户隔离**，可由匿名客户端直接播种读写。
  - 自定义登录云函数 `getLoginTicket`：**未做**（采用匿名登录，符合既有决策）。
- [x] **0.5 同步引擎 `RT_SYNC`**：`pull`（`_updatedAt>lastSyncTs && _owner==uid` 分页 + 记录级 LWW）、`push`（localStorage outbox 队列 + 1.2s 防抖 flush + `online` 事件，离线不丢）、软删除 `_deleted:true`（云端无文档建墓碑）、冲突 LWW。接入点为 `crud-factory.js` 的 `crudSave/crudDelete`。当前接入 5 个管理页集合。
- [ ] **0.6 各数据模块 cloud 适配层**：`users.js/companies.js/...` 写操作后入同步队列；媒体改走云存储（`RT_IMGSTORE.resolveAvatar` 先查本地缓存→云存储→默认头像）。**（排在所有批次最后）**

---

## 批次 174：设置中心 hub 框架 ✅ v1.3.74

- [x] `settings.html` 改造为「landing 分组列表 + 隐藏 hash 子视图」单文件多视图（`landingView/subViews`、`MODULES/GROUPS`、`handleRoute()` + `hashchange`、`setPageBack()`）。
- [x] 新增 CSS：分组卡片、子视图容器、返回栏。
- [x] `page-icons.js` 补 10 个 key；`release.sh` 已把 `settings.html` 登记进 `PAGE_ICONS_PAGES`。
- [x] `#gen-ui` 预留 6 语言选择结构。
- [x] `#gen-sync` 迁入 0.4/0.5 的播种 + 立即同步（功能完整）。

---

## 批次 175：账号分组 ✅ v1.3.76

- [x] `#account-profile`：头像（复用 `RT_IMGSTORE`）、公司（部门推断只读）、部门/职位（只读）、工号/姓名/账号（只读）、昵称（编辑）、登录设备入口跳转。
- [x] `#account-security`：密码/手机/邮箱编辑（复用 `RE_*` 校验 + `RT_USERS.updateProfile`），保存按钮 `data-perm="op_security_edit"`。
- [x] `#account-devices`：`login_logs` 列表 + 登出其他设备。

---

## 批次 176：界面与展示 + 通知 ✅ v1.3.77

- [x] `#gen-ui` 深色模式：`base.css` 暗色变量集 + `body.dark` 切换 + 持久化 + `theme-color` meta 同步。
- [x] `#gen-ui` 统一主题色：选色器输出主色覆盖 `--primary/--primary-dark/--primary-hover/--link`；硬编码蓝收敛为变量；预设色板 + 自定义取色器。
- [x] `#gen-ui` 语言：接 `RT_CONFIG.setLang`，6 语言选择器 UI + 持久化 + 触发 `langchange`（全站翻译见 185）。
- [x] `#gen-notify`：消息通知总开关、声音与震动、消息提示音（本地持久化，待云端就绪后漫游）。

---

## 批次 177：系统权限 + 下载地址 + 云同步 ✅ v1.3.78

- [x] `#gen-perm`：相机/麦克风/存储权限状态查询（`navigator.permissions.query`）+ 引导；已授权状态本地缓存并预留漫游。
- [x] `#gen-download`：默认文件名前缀/导出格式/记住上次选项偏好（半真：浏览器无法指定 OS 下载目录）。
- [x] `#gen-sync`：UI 框架 + `RT_SYNC` 驱动（已于批次 174 完成）。

---

## 批次 178：帮助与反馈 ✅ v1.3.79

- [x] **帮助（文档查看器）**：`#help` 内分类列表 + 快速搜索框 + 内容区；7 篇起步文档含分类标签与实时搜索。
- [x] **反馈（表单→数据表）**：`#help` 内反馈表单（类型 bug/建议/其他；内容；联系方式可选），本地 IDB 存 `feedback`（`status` 初值 pending），roam 钩子预留。

---

## 批次 180：首页仪表盘 + TAB 栏重构 ✅ v1.3.80

> 与 179 协同：**180 建 5-TAB 骨架（含反馈按钮 + 空容器），179 只填反馈视图**，避免二次修改同一处。

- [x] `index.html`：TAB 栏最左新增「首页」(`data-view="home"`)；补齐「反馈」(`data-view="feedback"`) 按钮 + `<div class="view" id="view-feedback">` 空容器。
- [x] `app.js` 启动默认 `switchView('home')`，首页渲染不依赖任务列表数据。
- [x] **首页仪表盘**：问候 + 今日日期 + 快捷打卡；指标卡（今日打卡状态/今日工时/本周工时/待办数/今日任务数/请假状态）；迷你月历（标记今日/打卡状态）；快捷入口跳转各 TAB。
- [x] 新增 `attendance.js`（本地考勤最小事实表，`window.RT_ATTENDANCE`），已登记进 `release.sh`。

---

## 批次 179：主页「反馈」TAB ✅ v1.3.81

> 依赖 178（反馈表单已存在）+ 180（TAB 结构与容器已建）。**只填内容，不加按钮。**

- [x] `app.js`：`switchView(view)` 挂钩；新增 `renderFeedbackTab()` 渲染反馈列表（读本地 `feedback` store，展示 内容/提交时间/类型/状态/联系方式/官方回复），全字段经 `escapeHtml` 转义。
- [x] 「我要反馈」入口：按钮 `navTo('settings.html#help')` 跳设置反馈区，与 178 表单共用 `feedback` 数据表。
- [x] `pages.css` 新增反馈卡片样式（`.fb-*`、`.tag-warn`/`.tag-ok`）。
- [x] 注：`代办` 为「待办」笔误，保留不强行改文案。

---

## 批次 181：日历 TAB 框架 + 上下班打卡 + 节假日/补假 + 手动调休 ✅ v1.3.82

- [x] `app.js`：实现 `renderCalendar()`（挂钩 `switchView('calendar')`）；月份状态模块级保持，切走再切回不重置。
- [x] **月历渲染**：网格月视图，日期 + 打卡状态点（已完成绿 `cal-dot-done` / 工作中蓝 `cal-dot-doing`）+ 图例 + 月度小结（出勤天数/累计工时/应出勤）。
- [x] **顶部打卡区**：当日上班/下班打卡按钮（禁用态由状态推导），显示上下班时间与实时工时；与首页共享 `RT_ATTENDANCE` 同一张事实表，打卡后前台视图即时刷新。
- [x] **节假日/补假**：新建 `holidays.js`（`window.RT_HOLIDAY` 推断层，只读）+ `holidays-2026.json`（源自国办发明电〔2025〕7号）；角标 休/班；缺年度数据自动降级为仅周末推断；已登记 `release.sh`。
- [x] **手动调休**：点击某天三态循环 null→休息→上班→恢复自动（`attendance.override`，`setOverride/cycleOverride`），角标「调」，优先级最高。
- [x] 附带修复：`index.html` 内联 script 块中 `escapeHtml` 重构残留的孤儿行 `[c])); }` 导致整个 450 行块（SW 注册/版本检测/更新日志）语法错误未执行——自 1.0.27 起潜伏，本批清除。

---

## 批次 182：按小时请假 ✅ v1.3.83

- [x] **`leave.js` 新建**（`window.RT_LEAVE`）：IndexedDB `req-tracker-leave/records`；4 种类型（事假/病假/年假/其他）；起止时间（HH:MM）→ 分钟数 → **时长自动算**；`save()` 校验结束>开始 + 同日重叠拒绝（半开区间）；`remove()` 软删除。
- [x] **有效工时公式**（单一真相源）：`effectiveHours(attRec, leaves)` = 出勤段 ∩ 请假段取交集扣减，不扣除出勤范围外的请假时长。已单元测试 25/25 通过。
- [x] **日历当日面板**：点击日期 → 展开 `cal-day-card`（日期+星期+工作日标签 / 考勤行 / 手动调休三按钮：休息·上班·自动 / 请假列表 / +添加按钮）。替代原 181 的三态循环手势，为 183 预留空间。
- [x] **请假弹窗**：类型 chip 选择器 / 起止时间输入 / 时长只读自动显示 / 原因文本框 / 提交按钮；编辑时回填已有数据；删除需二次确认。
- [x] **日历集成**：打卡栏扩展为 4 格（上班/下班/请假/实际工时），月度小结扩展为 4 卡（出勤天数/实际工时/应出勤/请假合计）；有请假的日期格显示紫色圆点 `cal-dot-leave`。
- [x] 端到端验证（Playwright）：打卡 9h→加假 2h→实际 7h ✓ / 重叠拒绝 toast ✓ / 第二条非重叠→6h ✓ / 调休切换角标 ✓ / 删除恢复 ✓。

---

## 批次 183：当日详情聚合 ✅ v1.3.84

- [x] **`dayfacts.js` 新建**（`window.RT_DAYFACTS`）：当日事实聚合层，纯函数 + 无 DOM，便于单元测试。**多时间点命中**：任务 5 个里程碑（创建/提测/开始测试/测完/上线）、待办按类型分派（TASK_ITEM·BUG·MEETING 各有专属时间点）、反馈（提交+回复）。一条记录在多个日期的当日详情里各自出现，标注对应动作标签。
- [x] **权限范围过滤**：基于 `RT_PERM.getVisibleDeptIds()`，管理员全量；否则「本人相关 OR 关联人在可见部门内」；无关联人字段的历史数据兜底放行（宁可多看，不可白屏）。已单元测试 41/41 通过。
- [x] **UI 三栏 tab**：任务 / 待办 / 反馈，tab 带计数角标（0 灰色），切换不重新查库（`calDayFactsCache` 缓存）。点击任务卡 → `openTaskDetail()` 弹出详情；点击待办卡 → `openTodoDetail()` 弹出详情；反馈只读展示含回复。
- [x] **动作标签颜色**：创建灰、提测/开始/反馈橙、测完/完成绿、上线紫、会议青、回复绿——一眼区分当天做了什么。
- [x] **缓存联动**：`refreshTaskList()` 和 `renderTodoList()` 执行时自动清除 `calDayFactsCache`，保证数据一致性。
- [x] 端到端验证（Playwright）：造数 2 任务 + 2 待办 + 1 反馈 → 三栏计数正确 ✓、多时间点命中 ✓、倒序排列 ✓、跨日切换 ✓、点击跳转详情弹窗 ✓。

---

## 批次 184：统计报表 ✅ v1.3.85

- [x] **`stats.js` 新建**（`window.RT_STATS`）：统计报表聚合层，纯逻辑 + 无 DOM，可 node 直跑单测。**严格复用已有单一真相源**：工时口径 → `RT_LEAVE.effectiveHours`（182 交集扣减公式）；应出勤判定 → `RT_HOLIDAY.dayType`（181 节假日推断）；业务计数 → `RT_DAYFACTS.collect`（183 多时间点命中）。任何口径变化只改上游，不会两处打架。
- [x] **三模式视图**：日统计（当天考勤行+迟到/早退/缺勤/请假标记+工时卡片+业务动态）、周统计（7 柱纯 CSS 条形图+汇总工时/日均/出勤率/缺勤天数+异常标记）、综合统计（月度总工时/出勤率比率条+迟到早退缺勤请假合计+任务状态分布堆叠条+完成率）。
- [x] **迟到 / 早退 / 缺勤判定**：基于可配置作息基准（默认 09:00–18:00，支持弹性宽限分钟）；请假覆盖到该时点不算异常；休息日不判定；缺勤 = 工作日无打卡无请假。
- [x] **任务状态分布去重**：同一任务在多天有多次动态（创建→提测→上线），分布按任务 ID 去重计数（回答「盘子里有多少活」），动态次数另计（回答「做了多少事」）。完成率基于去重数。
- [x] **首页快捷入口**：「◫ 统计」按钮进入统计视图（非 TAB 视图，TAB 栏不高亮、FAB 隐藏），含返回按钮。日期导航（上一期/下一期/今天），三种模式共享同一套数据源。
- [x] **`attendance.js` / `leave.js` 新增 `getRange(from, to)`**：任意日期区间查询，复用 IDBKeyRange.bound 一次游标扫完，避免逐日 get 的 N 次往返。
- [x] 单元测试 58/58 通过 + 端到端验证全通过。

---

## 批次 185：i18n 全站多语言（最大单项工程）🔶 A·B 完成（v1.3.87）/ C·D 待做

> 与 176 解耦：176 只做「选择器+持久化+触发 `langchange`」；本批消费该事件做全站重渲染。**字典为静态资源随发版打包，不走云端；仅语言偏好走 `user_settings`+`RT_SYNC` 漫游。**
> 字典采用 `i18n/<lang>.js`（IIFE 注入 `window.RT_I18N[lang]`，浏览器/Node 通用，离线可用），而非原计划 `.json`——更稳、免 fetch、无需担心 file:///SW 离线问题；`release.sh` 已登记全部 5 份字典 + 引擎的 `?v=`。

- [x] **185-A 框架 + zh-CN 基准 + 试点（v1.3.86）**：
  - `i18n.js`（`window.RT_I18N_API` + 全局 `t()`）：`t(key, vars?)` 优先当前语言→缺失回退 `zh-CN`→仍缺失返回 key（**绝不空白/白屏**）；`applyLang(lang)` 设 `<html lang>` + 填充 `[data-i18n]`/`[data-i18n-ph]`/`[data-i18n-aria]`；监听 `RT_CONFIG.setLang` 派发的 `langchange` 自动重渲染；`RT_APP.onLangChange` 钩子重渲染动态视图。
  - `config.js` 升级 `getLang/setLang/initLang` 支持 **zh-CN/zh-HK/zh-TW/en/ko/ja** 六码（旧 `zh`/`en` 兼容映射）。
  - `i18n/zh-CN.js` 基准字典（首页 chrome + 常用 UI 术语，single source of truth）；`i18n/en.js` 试点子集（验证切语言闭环）。
  - 首页 chrome 试点接入：`<title>`/`h1`、底部 5 个 TAB、首页快捷入口、FAB `aria-label`、侧边栏导航项，全部 `data-i18n`；两处 `toast` 改为 `t()`。
  - `settings.js` 语言选择升级：直接 `setLang(code)`，字典未就绪才提示「筹备中」并落到 zh-CN 兜底。
  - **验证**：单测 17/17（t/回退/占位符/applyLang/renderI18n）；e2e 通过——默认中文、切英文全 chrome 切换、切缺字典语言 zh-HK 回退中文不空白、切回稳定、无 JS 报错。
- [x] **185-B zh-HK / zh-TW 繁体字典（v1.3.87）**：
  - 基于 zh-CN 基准（60 key）逐条转繁体，按香港/台湾用词习惯校译。
  - **术语差异**（对空对照）：日曆 ↔ 行事曆、反饋 ↔ 意見回饋、今日 ↔ 今天、暫無數據 ↔ 暫無資料、提交 ↔ 送出、個人資料 ↔ 個人檔案、基礎數據 ↔ 基礎資料。
  - 两份字典 key 与 zh-CN 全量对齐（脚本校验 0 缺失），单测覆盖 key 对齐 + 全部差异项（44/44）。
  - e2e 验证：zh-HK 切换 chrome 全繁、切换 zh-TW 全繁且术语差异正确（行事曆/意見回饋/資料/送出）、切回 zh-CN 稳定、缺 key 回退不白屏、无 JS 报错。
  - index.html 新增两处 `<script defer>` 引用；`release.sh` `patch_ver`+`check_ver` 已注册两文件版本号（防自检漂移）；settings.js 语言选择器直接可用此两语言码。
- [ ] **185-C en / ko / ja 字典**：英/韩/日全译（en 已由 185-A 试点子集起步，扩为全量）。
- [ ] **185-D 全站 rewire（必须最后）**：批量替换为 `t('key')`/`data-i18n`；逐页走查无残留中文。**务必等 174–184 全部定稿后执行**（现已定稿）。6 份字典 key 必须对齐；动态业务数据（用户名、需求标题、反馈内容）**不翻译**；toast / `customConfirm` 等提示散落调用点须全量替换。

---

## 长期注意事项

1. **节假日数据运维**：`holidays-YYYY.json` 需每年更新一份；补班/补假以官方发布为准，建议后续留 `holidays` 集合管理入口。
2. **发版登记**：新增 `page-icons` key、`i18n/*.js`（5 份字典 zh-CN/en/zh-HK/zh-TW + 引擎，批次185-A/B）、`cloud-storage.js`/`cloud-adapter.js`（0.6 适配层，已在 index.html 加载但写入同步待 0.6 完成 activate）、任何带 `?v=` 的新资源都必须在 `release.sh` 登记，否则发版自检「漂移」失败（批次 169 / 180 教训）。
3. **主题色变量化**：散落硬编码蓝必须收敛到 `var(--primary)`，否则换色不彻底。
4. **软删除必做**：所有 `deleteXxx` 改为写 `_deleted:true` 再入同步队列，否则删除无法同步、历史会「复活」。
5. **数据播种幂等**：首次同步上传本地 IDB 须幂等，避免重复或覆盖他人数据。
6. **Web Push 真实推送**：开关/声音/震动可真（存 `user_settings`），真实推送需自建 VAPID + 云函数链路，独立大工程，不阻塞主流程。
7. **部署顺序铁律**：先 git 后云端，见 `RULES.md`。`deploy-cloudbase.sh` 有规则闸强制校验。
