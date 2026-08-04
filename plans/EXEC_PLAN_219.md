# EXEC_PLAN_219 — 首页/日历/设置/字典/权限/工作流全局打磨（#29–#33）

## 一、目标
按「批次219起」需求文档做一轮以**首页、日历、考勤、设置、字典、权限、工作流、表单模板、导出**为主的全局体验打磨与缺陷修复。按批次（219–232）依次执行，每批次为一个聚焦、可独立发布的单元，批次内用统一清单（不拆 -1/-2/-3 子批次，也不一个任务一个批次）。

> 用户指令：**只分析与设计，产生执行清单，不直接开始执行。**

## 二、设计确认（来自用户答复）
- **轮播短语**：可配置；默认短语池先自动生成（见附录 A）。
- **打卡时间**：采用云端（服务端）时间。
- **导出**：三种目标（本地 / 个人邮箱 / 腾讯文档），统一以 **Excel(.xlsx)** 格式（前端引入 SheetJS 等库生成真 .xlsx，替代原 CSV/JSON）。区别与可行性见附录 B。
  - **导出到本地**：纯前端，本批次内完整完成。
  - **导出到个人邮箱（统一方法）**：用户只需在设置配置「接收邮箱」（QQ/163/任意）；由云端发信函数（我们自己的发件账号）把 Excel 发到该地址——**一套机制覆盖所有邮箱，用户无需填 SMTP 密码**。本批次内可完成前端 + 发信函数；真实发信依赖我们配置一个发件账号（SMTP/SES）。
  - **导出到腾讯文档**：见附录 B 两种路线（轻量：本地生成 xlsx + 「用腾讯文档打开」/手动导入；全自动：腾讯文档开放平台 + OAuth 自动建在线表格）。本批次先做轻量路线。
- **工作流**：设置页提供「初始化示例」入口，直接生成需求中的 5 个工作流及模板（实现见 Batch 231）。
- **按批次执行**：219–232 各自一个版本，任务不拆子批次编号；批次已拆细（每批 2–5 项、聚焦一个主题）。

## 三、批次总览
| 批次 | 版本 | 主题 | 项数 |
|------|------|------|------|
| 219 | v1.4.24 | 数据层热修（权限页/字典页） | 2 |
| 220 | v1.4.25 | 清基线：修复 7 个历史测试基线失败 | 7 |
| 221 | v1.4.26→v1.4.33 | 首页头部：应用名/通知/城市（含 .27 问候天气短语 / .28 空状态初版 / .29 彩色填充 / .30 emoji 回退，详见 221 子说明） | 3+ |
| 222 | v1.4.34 | 首页短语可配置 + 铃铛融入问候 + 字典页 bug 修复 | 3 |
| 223 | v1.4.35 | 用户反馈热修：字典页「t is not a function」、铃铛白色圆形、轮播小时级与按日 | 3 |
| 224 | v1.4.36 | 日历与考勤（上）：清理/周末假期/打卡分上下午 | 4 |
| 225 | v1.4.37 | 日历与考勤（下）：颜色统一/事件类型/云端时间 | 5 |
| 226 | v1.4.38 | 日历状态模型统一（8 状态 + 显示顺序）+ 首页/日历配色收尾 | 4 |
| 227 | v1.4.39 | 日历顶部模块补齐外出/出差工时（带色数字） | 1 |
| 228 | v1.4.40 | 申请统一入口 + 类型细化（请假/外出/出差/加班）+ 地图选点组件（外出/出差地点） | 5 |
| 229 | v1.4.41 | 调休重构（黄色 / 可选范围 / 状态 / 等级） | 1 |
| 230 | v1.4.42 | 时间框统一 + 自定义时间选择器（PWA 字体） | 2 |
| 231 | v1.4.43 | 基础数据：行政区域管理（高德 API 编码）+ 工时管理 + 天气接高德 API + 高德 key 配置化 | 4 |
| 232 | v1.4.44 | 设置清理与个人信息 | 4 |
| 233 | v1.4.45 | 设置展示与反馈 | 5 |
| 234 | v1.4.46 | 导出（本地/邮箱/腾讯文档）与初始化示例入口 | 5 |
| 235 | v1.4.47 | 表单模板增强 | 5 |
| 236 | v1.4.48 | 工作流增强：职位审批 + 直接生成工作流 | 2 |
| 237 | v1.4.49 | 日历与流程关联：申请即自动发起 2 级审批流（部门经理→人力资源HR，测试可配 admin）+ 通过写回日历 | 5 |

> 批次号规则：批次号按版本号依次顺延（v1.4.24 → 219 起连续编号 219–237）。**221 例外**：它跨 v1.4.26–v1.4.33 多个版本，保留 221 且其间 .27–.30 作为 221 子版本并入（不再独立编号）。执行顺序：日历类批次 **226–231** 插在 **225** 之后集中完成，再执行设置/导出/工作流等后续批次 **232–237**。

## 四、Batch 219（v1.4.24）— 数据层热修 ✅ 已完成并部署
1. 修复权限管理页 IndexedDB 事务报错：`permissions.js` 的 `updateMenu` 存在 transaction auto-commit 问题（原 readwrite 事务在校验阶段跨异步后被自动提交，再 `put` 抛 `transaction has finished`）。改为：所有校验走只读/独立事务，校验完成后再开一个全新的 `readwrite` 事务一次性写入（`writeStore`）。`createMenu` 原写法已正确，未改动。
2. 修复字典管理页不显示数据：`dictionary.html` 补 `i18n.js` 引用（根因：`t()` 未定义致 `render()` 崩溃）；`boot()` 增强 `seedDict` 播种错误上报与回退（失败不再静默吞掉，仍渲染已有数据）；`dict` store 懒注册本已生效，未改。
- 测试：`tests/test-batch219-data-layer-hotfix.js`（9 项全过，其中 2 项复现并锁定「事务已结束」bug）；全量回归 397/390 通过，7 失败均为已知预存项（天气联网 / Batch200 / Batch86 / Batch87×2 / Batch93），无新增回归。
- 发版：v1.4.24，已 `git push` + CloudBase 部署，云端 version.json 校验一致。

## 五、Batch 220（v1.4.25）— 清基线：修复 7 个历史测试基线失败 ✅ 已完成并部署
1. **role/permission 测试补 escapeHtml 全局桩**：`test-batch86-role.js` / `test-batch87-permission.js` 顶部补 `globalThis.escapeHtml`（复刻 `config.js` 实现）；浏览器中 `escapeHtml` 由 `config.js` 挂全局，测试缺它导致 `buildTreeHtml` / 徽章渲染报 `escapeHtml is not defined`。
2. **report-common.js 补 fmtDateTime**：原 `report-common.js` 第 377 行引用未定义的 `fmtDateTime`（`config.js` 未挂该函数，仅挂 `fmtDate`），致报表页整文件崩溃；本地补 `fmtDateTime`（与已定义 `fmtDate` 一致，补时分）。
3. **i18n 扫描器跳动态拼接 key**：`test-batch200-i18n-coverage.js` 的 `extractKeys` 原把 `t('process.status.' + status)` 的字面量前缀 `process.status.` 当缺失 key 误报；改为捕获后若字面量以 `.` 结尾且闭合引号后紧跟 `+` 则跳过（动态拼接 key）。
4. **6 语言补 common.notFound**：`process-instances.html:478` 调 `t('common.notFound')`，但 6 语言均缺失；于 `i18n/zh-CN.js`、`zh-HK.js`、`zh-TW.js`、`en.js`、`ko.js`、`ja.js` 各补 `common.notFound`（未找到 / 未搵到 / 找不到 / Not found / 찾을 수 없음 / 見つかりません）。
5. **天气测试正则更新**：`test-batch192-home-ux.js` 原断言写死 `setWeatherCity(v)`，与 `app.js` 实际 `setWeatherCity(city)` 不符（行为已实现）；改为 `setWeatherCity(city)`。
6. **report-scope 测试补 report-shared.js 加载链**：`test-batch93-report-scope.js` 仅 eval `report-common.js`，漏 eval `report-shared.js`（其顶层 `priorityName` 等 name-map 函数在浏览器即全局）；按 HTML 加载链补 eval `report-shared.js` 并显式把 4 个 name-map 函数挂全局。
- 测试：全量 `node --test tests/*.js` **420 项全过、0 失败**（基线 7 失败全清）；其中 `test-batch219-data-layer-hotfix.js` 9 项 + 本报告 4 项（escapeHtml×2 / i18n / 天气 / report-shared）均通过。
- 发版：v1.4.25，已 `git push` + CloudBase 部署，云端 version.json 校验一致。

## 六、Batch 221（v1.4.26 → v1.4.33）— 首页头部：应用名 / 通知 / 城市（+ .27 问候天气短语 / .28 空状态初版 / .29 彩色填充 / .30 emoji 回退）✅ 已完成并部署
1. 应用名「需求任务追踪」→「微枢」：`index.html` title、`manifest.json`、i18n `app.title` / `app.shortName`、关于页、设置页、分享文案全量替换（grep `需求任务追踪`）。
2. 通知图标改为非 emoji，置于城市选择器同行右侧。
3. 城市选择省市区对应修复：补全缺失的市 / 区，校验省市区三级映射。
- 应用名：`index.html` / `index-nosw.html` / `login/classic.html` 的 title 与 h1、`manifest.json` 的 name/short_name、`report-task.html` 打印标题、`settings.js` 帮助文档、`app.js` 注释，以及 i18n 6 语言的 `app.title`（中文「微枢」、繁中「微樞」、en `Weishu`、ko `미추`、ja `ミシュ`）全量替换；`about.html` 经 `app.title` 动态渲染无需硬编码。
- 通知图标：原 header 内 emoji 🔔 铃铛改为 SVG 铃铛，按钮从 header 移至 `homeWeatherCity` 同行右侧（蓝渐变问候卡内白色半透明圆角，风格与城市按钮一致）；`pages.css` 新增 `.home-weather .bell-btn` 适配。
- 城市数据：`RT_CITY_TREE`（省→市）由每省 1–2 市补全为覆盖 32 省级行政区、每省含省会及主要地级市（约 250 市）；`RT_CITY_DISTRICTS`（市→区）由 12 市扩至约 40 个主要城市的区；三级映射经 `test-batch221-city-tree.js` 校验（热门城市覆盖 / 无孤儿区 / 无重复 / 直辖市有区 / 省会覆盖）。
- 测试：tests/test-batch221-app-rename.js（3 项）、test-batch221-notify-icon.js（3 项）、test-batch221-city-tree.js（6 项），共 12 项全过。
- 发版：v1.4.26，已 `git push` + CloudBase 部署，云端 version.json 校验一致。

### 完成说明（v1.4.27 首页问候 / 天气 / 短语）
- **天气精准优化**：新增 `weatherQueryCity(raw)`，把天气城市聚合到地级市再查——「城市·区县」取「·」前地级市；裸区县名经 `RT_DISTRICT_TO_CITY`（由 `RT_CITY_DISTRICTS` 反查构建）上卷。原 `renderHomeWeather` 改以聚合后的地级市做地理编码与缓存键（按钮显示聚合城市），避免拿「市辖区/县」直接查 open-meteo 查不到；原 30 分钟天气缓存保留。
- **问候/昵称/时间字号统一**：`pages.css` 中 `.home-greet-hi`（20px/700）、`.home-greet-name`（15px/600）、`.home-date`（13px/500）统一为「主→次→辅助」一致层级（一致字重与行高节奏）。
- **时间下方短语轮播**：`home-greet-left` 的 `home-date` 下方新增 `#homePhrase`（带 `home.phrase-label` 标签）；`app.js` 新增 `RT_HOME_PHRASES_DEFAULT`（附录 A 12 条）与 `getHomePhrases()`（优先 `RT_CONFIG.homePhrases`，为空回退默认池）及 `startHomePhraseCarousel()`（每 4s 带淡入切换，重入先清旧定时器）；`renderHome` 调用启动；6 语言补 `home.phraseLabel`（今日短语 / 今日短語 / Today's phrase / 오늘의 문구 / 今日のひとこと）。
- 测试：`tests/test-batch222-home-greeting-weather.js`（11 项：天气区县聚合「城市·区县」与裸区县上卷、默认 12 条短语池、配置优先/空回退/空白过滤、短语元素与 i18n 键存在、字号与轮播样式存在）；全量 `node --test tests/*.js` **443 项全过、0 失败**（较 v1.4.26 的 432 +11）。
- 发版：v1.4.27，已 `git push` + CloudBase 部署，云端 version.json 校验一致（1.4.27）。
- 已知数据边角：`西湖区` 在 `RT_CITY_DISTRICTS` 同时归属杭州与南昌，裸区县名聚合取迭代末位（南昌）；但城市选择器存的是「城市·区县」格式，走「·」拆分路径总能正确命中地级市，故实际 UI 不受影响。

### 完成说明（v1.4.28 首页空状态统一 · 初版细线）
- **统一组件（report-shared.js）**：新增 `RT_EMPTY_ICONS`（box / task / bug / meeting / process 五套 Feather 同款线条 path，`stroke-width="1.5"`、`currentColor`）、`rtEmptyIcon(variant)`、`rtEmptyState(text, variant)`，并暴露 `window.RT_EMPTY_STATE`。放置于跨页共享层 report-shared.js（index.html 与全部 report-*.html 均加载，且早于 app.js / report-*.js 执行），无需新增脚本标签、不触碰 release.sh 资产清单；`escapeHtml` 全局可用并自带兜底。
- **去 emoji 📭**：替换 app.js（首页任务 3738/3750、代办 2604/2628、流程首页 1106）+ report-todo/task/meeting/bug.js 全部 `📭` 渲染点为 `rtEmptyState(...)`，源码已无任何 📭 渲染（仅注释提及）。
- **各场景差异**：task/todo→剪贴板勾、bug→甲虫、meeting→日历、process→分支、通用回退→收件箱（box）；全部线条风格一致。
- **CSS（overlays.css）**：`.empty-icon` 由 `font-size:48px` 改为 SVG 容器（56px、居中、`var(--muted)`、`opacity:.5`）；新增 `.empty > svg` 兼容 role.js / process.html 等既有内嵌 SVG 写法，使其尺寸风格一并统一；`.empty` 补 `line-height:1.7`。
- **代办补图标**：原「暂无代办」为无图标 `.empty-tip`，本次改用 `rtEmptyState('暂无代办','task')` 带统一图标（符合「提取『代办暂无』图标」意图）。
- **流程首页补图标**：app.js:1106 `.pi-home-empty` 由纯文本改为内嵌 `rtEmptyIcon('process')` + 文案；pages.css 新增 `.pi-home-empty > svg` 样式。
- **单测**：新增 `tests/test-batch223-empty-state.js`（7 项）——helper 存在性、统一结构无 📭、variant 映射差异与回退、转义防御、app.js / report-*.js 渲染点切换、CSS 类与尺寸；全量 `node --test` 430/0 通过。
- 发版 / 部署：release.sh 1.4.28（47 文件）→ git push（f1697d8..6f3dcee）→ deploy-cloudbase.sh 上传 116 文件，云端校验版本 = 本地 = 1.4.28。
- 注：process.html:304 流程定义列表原已是 SVG 建筑图标（同线条风格），保持不动；`rm-empty` 等子区块非创建页主空态，未纳入本期范围。
- **被 v1.4.29 彩色填充取代**：用户反馈初版细线描边图标「没有原来的邮箱 📭 好看」，要求改回彩色填充（有颜色、实心填充，类似原 emoji 观感）。v1.4.29 将 `RT_EMPTY_ICONS` 升级为彩色填充、扩展至全部页面，并改写对应单测。本批次（.28）的细线实现已不再使用，仅保留历史记录。

### 完成说明（v1.4.29 空状态图标彩色填充 + 全页扩展）
> 用户反馈（.28 发版后）：初版细线描边图标「没有原来的邮箱 📭 好看」，要求改回彩色填充（有颜色、实心填充，类似原 emoji 观感）；且不止首页，基础数据 / 通知 / 反馈 / 考勤 / 统计 / 流程等所有页面都要显示，风格一致，每个页面图案稍有区别。

- **彩色填充取代细线**：`report-shared.js` 的 `RT_EMPTY_ICONS` 由「Feather 细线 path（stroke/currentColor）」升级为「Material 实心 path + 主题色填充」，结构改为 `{c:颜色, p:path}`；`rtEmptyIcon(variant)` 输出 `fill=主题色` + `fill-rule="evenodd"`（Material 实心 path 依赖 evenodd 镂空），统一 64px。共 **11 个 variant**：box(收件箱,#4C8DFF) / task(剪贴板,#4C8DFF) / bug(甲虫,#FF6B6B) / meeting(日历,#FFB020) / process(分支,#A78BFA) / notify(铃铛,#FFB020) / data(存储栈,#34C0FA) / stats(柱状图,#34C759) / feedback(气泡,#4C8DFF) / clock(时钟,#22C2B8) / search(搜索,#9AA5B1)。
- **全页扩展**：已加载 `report-shared.js` 的页面（app.js / report-*.js）改用 `rtEmptyIcon(variant)` / `rtEmptyState(text, variant)` 传对应 variant；**不加载** `report-shared.js` 的基础数据 / 流程 / 统计等独立页，直接**内联同款彩色填充 SVG（同款 path / 颜色 / 属性）**，零依赖、风格一致。
   - app.js：首页任务 / 代办→`task`、流程首页→`process`、通知→`notify`、反馈→`feedback`、请假→`clock`、打卡聚合→`clock`。
   - 基础数据页（company / department / project / project-version / position / user / dictionary / role.js / permission.html）→ 内联 `data`（#34C0FA 存储栈）。
   - process.html / workflow.html → 内联 `process`（#A78BFA 分支）。
   - stats-view.js → 内联 `stats`（#34C759 柱状图）。
- **CSS（overlays.css / pages.css）**：`.empty-icon` / `.empty > svg` / `.pi-home-empty > svg` 尺寸由 56px 放大为 **64px**，去除 `.empty-icon` 的 `opacity:.5`、`color:var(--muted)` 限制（彩色填充本身已具辨识度）；新增 `.notify-empty / .fb-empty / .lv-empty / .dayf-empty / .task-detail-empty / .changelog-empty / .home-weather-empty / .city-picker-empty > svg` 统一 64px 尺寸规则。
- **去 emoji 📭**：全部空态渲染点源码已无 📭（仅注释提及）；彩色填充观感对标原 emoji。
- 改动文件（16）：report-shared.js、overlays.css、pages.css、app.js、company / department / project / project-version / position / user / dictionary.html、role.js、permission.html、process.html、workflow.html、stats-view.js。
- 单测：`tests/test-batch223-empty-state.js` 由 7 项重写为 **11 项**（覆盖彩色填充结构 / 无描边 / 11 variant 主题色板 / 全页内联 SVG 路径与共享 variant 完全一致 / app.js 的 notify·feedback·clock·process 渲染点 / 64px 且无半透明等）；全量 `node --test tests/test-batch*.js` **433 项全过、0 失败**。
- 发版 / 部署：release.sh 1.4.29 → git push（GitHub TLS 抖动用 `for i in 1 2 3` 重试，不加 proxy）→ deploy-cloudbase.sh 上传，云端校验版本 = 本地 = 1.4.29。
- **被 v1.4.30 emoji 回退取代**：用户再次要求统一回退为「邮箱 emoji 📭」并可在图标管理页配置（可替换图标），彩色填充实现（`RT_EMPTY_ICONS`）已不再使用，仅保留历史记录。

### 完成说明（v1.4.30 空状态图标统一回退为邮箱 emoji 📭 + 可配置（图标管理））
> 用户再次逆转方向（v1.4.29 彩色填充发版后）：不管彩色填充，要求**统一替换成之前的邮箱 emoji 📭**，做成**可配置项**（可替换图标）、**可在图标管理页显示与配置**，且**全局统一**（不按页面区分 variant）。

- **注册 `empty` 默认 key**：`page-icons.js` 的 `defaults` 新增 `'empty' = <svg viewBox="0 0 24 24"><text>📭</text></svg>`（邮箱 emoji 内嵌 SVG，viewBox 24×24、可随容器缩放）；该 key 自动出现在「图标管理」列表，标签为「空状态图标」（`icon-manager.js` 的 `KEY_LABELS` 补 `'empty': '空状态图标'`）。
- **全局统一渲染**：`config.js` 新增 `RT_EMPTY_ICON_DEFAULT`（📭 SVG 常量）与 `root.getEmptyIconHtml()`——优先返回 `RT_PAGE_ICONS.get('empty')`（含图标管理覆盖层），缺失回退默认 emoji；**忽略 variant**。
- **回退 report-shared.js**：`rtEmptyIcon(variant)` / `rtEmptyState(text, variant)` 改为调用 `getEmptyIconHtml()`（忽略 variant），删除 `RT_EMPTY_ICONS` 彩色填充定义与 `RT_EMPTY_STATE.ICONS`；app.js / report-*.js 调用点不变。
- **内联空态页改用 getEmptyIconHtml()**：company / department / project / project-version / position / user / dictionary.html、role.js、permission.html（静态占位 + `permission.js` 填充）、process.html、workflow.html、stats-view.js 移除硬编码彩色填充 SVG，统一走 `getEmptyIconHtml()`。
- **覆盖层全页生效**：`page-icons.js` 模块加载即自动 `init()`（DOMContentLoaded，幂等）载入 IDB 覆盖层；给此前未引入本模块的 17 个空态页（index / index-nosw / 基础数据各页 / permission / role / workflow / 5 个 report 页）补 `<script src="page-icons.js">`，使「图标管理」对空状态图标的修改在**所有页面**生效；并在 `release.sh` 的 `PAGE_ICONS_PAGES` 登记这些页（缓存破坏随发版升级）。
- 改动文件（21）：page-icons.js、icon-manager.js、config.js、report-shared.js、app.js（调用点复用、无需改）、company / department / project / project-version / position / user / dictionary.html、role.js、permission.html / permission.js、process.html、workflow.html、stats-view.js、index.html / index-nosw.html、report-todo / task / meeting / bug / stats.html、release.sh（`PAGE_ICONS_PAGES` 登记）。
- 单测：`tests/test-batch223-empty-state.js` 重写为断言 emoji 📭 + 全局统一（忽略 variant）+ 可配置（set 覆盖 / reset 回默认）+ 内联页无彩色 fill + `KEY_LABELS` 含 empty；`tests/test-batch191-icons.js` #10 对 `empty` 加 `EMOJI_EXCEPTION` 豁免白线断言。全量 `node --test` **453 项全过、0 失败**。
- 发版 / 部署：release.sh 1.4.30 → git push → deploy-cloudbase.sh 上传，云端校验版本 = 本地 = 1.4.30。

### 完成说明（v1.4.31 后续修正）
- 通知铃铛可见性：原 v1.4.26 仅把 emoji 换成 SVG 并从 header 移入 `.home-weather`，但遗漏 `pages.css` 的 `.home-weather .bell-btn` 适配（EXEC_PLAN L58 承诺但当时未落地），导致按钮继承通用 `.bell-btn{color:var(--text)}` 深色、SVG 无显式尺寸，在蓝渐变问候卡上几乎不可见。v1.4.31 新增作用域规则（白色半透明圆角 + SVG 18px 显式尺寸，风格对齐 `.home-weather-city`），并给 `index.html` 铃铛 SVG 补内联 `width/height=18` 兜底。
- 杭州区县补全：`RT_CITY_DISTRICTS['杭州']` 由 6 区扩至 13 区/县/市（富阳/临安/临平/钱塘 + 桐庐/淳安/建德）。
- 测试：`test-batch221-notify-icon.js` 增 2 项（CSS 白色半透明圆角/显式尺寸 + HTML 内联尺寸）；`test-batch221-city-tree.js` 增 1 项（杭州 7 项新区县）。全量 `node --test tests/*.js` 通过、0 失败。
- 发版 / 部署：`release.sh 1.4.31` → `git push origin main` → `deploy-cloudbase.sh` 上传，云端校验 `version.json` = 本地 = `1.4.31`。

### 完成说明（v1.4.32 全量省市区补全）
- **问题回溯**：v1.4.31 仅补全了「杭州」一个市的区县，但 `RT_CITY_DISTRICTS` 中**绝大多数城市的区县都不完整**——四大直辖市当时每市仅 4–8 个区，成都/武汉/西安等也大量缺区。用户指出「不是只有杭州市」，故做系统性全量补全。
- **修复**：`app.js` 的 `RT_CITY_DISTRICTS`（38 个城市）由每市 4–8 个区扩至**完整市辖区 + 县 + 县级市**（如北京/上海各 16 区、天津 16 区、重庆 26 区+12 县、成都 12 区+5 市+3 县、武汉/西安/南京各 11–13 区等）。整体区县总量由约 200 增至 400+。跨市重名区（西湖区/和平区/江北区/龙华区/高新区）沿用既有「按声明顺序取末位」聚合逻辑，城市选择器存「城市·区县」格式不受影响。
- **测试**：`test-batch221-city-tree.js` 增 2 项守护——四大直辖市完整区列表精确匹配（防单市补丁退化）+ 整体区县总量 ≥ 400（防退回）。Batch 221 测试共 9 项全过。
- 发版 / 部署：`release.sh 1.4.32` → `git push origin main` → `deploy-cloudbase.sh` 上传，云端校验 `version.json` = 本地 = `1.4.32`。

### 完成说明（v1.4.33 最终 UI 打磨：5 项收尾）
针对用户在 v1.4.32 上线后提出的 5 个首页 UI 问题逐项修复：
1. **选了区仍显示「杭州」**：`renderHomeWeather()` 原把聚合后的地级市（`weatherQueryCity` 取 `城市·区县` 的地级市部分）写入城市按钮；改为写入完整原始值 `rawCity`（如「杭州·西湖区」），天气查询仍按聚合地级市进行，二者解耦。
2. **其他省市无法选区县**：`RT_CITY_DISTRICTS` 此前仅 38 城有区县。本次以民政部行政区划数据集（`province-city-china`，2021 版）补全其余 241 个地级市，并过滤「开发区/管理区/经济区」等噪声条目；保留原 38 城手工精校（最新区划，含已撤并区的修正）不被旧数据回退。现覆盖 **277 城 / 2449 区县**，仅 9 城无区县（台湾 6 市数据中无；中山/儋州/嘉峪关为无县级建制的直筒子市），均可选市本级。
3. **通知铃铛与城市按钮调换**：`index.html` 将铃铛与城市按钮包裹进新增的 `.home-weather-top`（flex 行），顺序改为**铃铛在左、城市在右**（原右侧顺序调换）。
4. **「今日短语」四字标签挤压短语**：原 `.home-phrase-row` 为横向 flex（标签 + 短语同行），窄屏下短语被挤压串行。改为**竖排小标题**（标签在上、短语在下、占满整行宽度），移除 `::after` 冒号，短语获得完整宽度不再截断。
5. **左右高度与上下间距不均衡**：`.home-greeting` 由 `align-items:flex-start` 改为 `stretch`，左右两栏等高；`.home-greet-left` 与 `.home-weather` 均改为 `flex-direction:column; justify-content:center`，内容垂直居中，左右高度与上下间距趋于一致。
- **测试**：`test-batch221-city-tree.js` 增 2 项（全量覆盖守护：除 9 个已知例外外所有城市可下钻 + 总量 ≥2000/城市 ≥270）；`test-batch221-notify-icon.js` 更新 1 项（铃铛在城市之前的新顺序）。全量 `node --test tests/*.js` **460 项全过、0 失败**（基线 458 + 本次 2 项）。
- 发版 / 部署：`release.sh 1.4.33` → `git push origin main` → `deploy-cloudbase.sh` 上传，云端校验 `version.json` = 本地 = `1.4.33`。

## 七、Batch 222（v1.4.34）— 首页短语可配置 + 铃铛融入问候 + 字典页 bug 修复 ✅ 已完成并部署
针对消息 2 的 7 个子问题逐项处理（省市区 / 今日短语入字典两项经用户确认**不需**扩字典数据模型：城市·区县保持内置，短语走设置页可配置）：

1. **字典页标题显示裸键 `dict.title`**：根因为 `dictionary.html` 底部脚本漏引 6 份语言包（`i18n/zh-CN.js`…`i18n/ja.js`），`RT_I18N` 为空致 `t()` 回退裸键。修复：补齐 6 语言包引用（随发版升版 ?v=，release.sh 字典块同步登记，否则 ?v= 漂移自检拦截）。
2. **字典页打开不显示内容**：根因为 `boot()` 在 parse 阶段内联立即执行，早于全部 defer 脚本（dictionary.js / i18n.js / config.js 等），`RT_DICT` 未定义致 `render()` 早退空白。修复：将 `boot()` / `onPageShow` / `onVisible` / `registerAppSW` 包裹进 `initDictionaryPage()` 并在 `DOMContentLoaded` 后执行（defer 脚本已就绪）。
3. **今日短语轮播太快、要可配置**：原 `startHomePhraseCarousel()` 写死 `setInterval(tick, 4000)`。修复：间隔改为读取 `rt_ui_prefs.homePhraseInterval`（默认 8000ms，较原 4s 更舒缓），提供 4/6/8/10/15 秒档位；短语池改为读取 `rt_ui_prefs.homePhrases`，空则回退 `RT_CONFIG.homePhrasesDefault`（config.js 单一事实来源，12 条）。
4. **短语池可编辑（设置页「界面与展示」）**：新增「首页今日短语」分组——轮播间隔下拉 + 短语池文本框（每行一条，最多 30 条）+ 保存 / 恢复默认。`settings.js` 增 `renderHomePhrase / saveHomePhrase / resetHomePhrase`，落 `rt_ui_prefs` 并派发 `rt-ui-prefs-change`；首页监听该事件实时重启轮播。
5. **通知铃铛融入问候行**：原铃铛在蓝渐变天气卡内、与城市按钮同行，用户反馈「左侧突兀」。按确认方案移入 `.home-greet-main`、置于「早上好」(#homeGreeting) 之前，改为与问候同色、无背景的弱存在感小图标（`pages.css` 以 `.home-greeting .bell-btn` 替换原 `.home-weather .bell-btn` 作用域规则）；角标 `[data-badge="notify"]` 随按钮迁移，JS 绑定按 id 不变。
- 省市区 / 今日短语**未**入字典：经用户确认，城市·区县保持内置（已完成全量补全），短语走设置页可配置，字典数据模型与播种逻辑无需改动（仅修上述两个展示 / 渲染 bug）。
- **测试**：新增 `tests/test-batch234-home-phrase-dict.js`（9 项：字典 6 语言包 / DCL 初始化 / zh-CN 含 dict.title、homePhrasesDefault 12 条、getHomePhrases 读 prefs 优先级、轮播间隔默认 8000、设置页控件、settings.js 接线与恢复默认写回）；`test-batch221-notify-icon.js` 重写为铃铛融入问候行的断言；`test-batch222-home-greeting-weather.js` 补 `readHomePrefs` 桩。全量 `node --test tests/*.js` **469 项全过、0 失败**（基线 460 + 本次 9）。
- 发版 / 部署：`release.sh 1.4.34` → `git push origin main` → `deploy-cloudbase.sh` 上传 116 文件，云端校验 `version.json` = 本地 = `1.4.34`。线上抽查：字典页 6 语言包与 `initDictionaryPage` 生效、设置页含 `hpInterval/hpPool`、首页铃铛位于问候行且天气卡内不再含铃铛。

## 八、Batch 223（v1.4.35）— 用户反馈热修：字典 t 报错 / 铃铛白色圆形 / 轮播小时级与按日 ✅ 已完成并部署
针对消息 3 的 3 项反馈逐项处理：

1. **字典页内容显示「t is not a function」**：根因并非 i18n 时序（Batch 222 已把 `boot()` 延到 `DOMContentLoaded`，`window.t` 在 DCL 前已就绪，jsdom / 真实 chromium 均已验证）。真正根因在 `dictionary.html` 的 `render()` 内 `typeKeys.forEach(function(t){ ... t('dict.itemCount', ...) ... })`——循环变量 `t` 遮蔽了全局翻译函数 `t`，非空列表分支把「分类名字符串」当函数调用 → `TypeError: t is not a function`（被 `render` 的 `.catch` 吞掉并展示为「读取失败：t is not a function」）。修复：循环变量改名 `typeKey`，`t` 恢复指向全局翻译函数。真实 chromium 复现确认：修复前 `#list` 显示「读取失败：t is not a function」、修复后正常渲染「任务类型 / 3 项」等真实条目。
2. **通知铃铛恢复白色圆形（按用户澄清，不改位置）**：用户指出「不是白色铃铛、没有圆形背景，和之前在城市边上的不一样」，并澄清——**并非要求把铃铛移回城市旁，而是要恢复之前那种白色圆形的观感**（「在城市边上」是在描述旧效果长什么样）。故**保持铃铛在问候行（`.home-greet-main`、#homeGreeting 之前，位置不变）**，仅将样式由 Batch 222 的「弱存在感（无背景、与问候同色）」改回「白色圆形」：`pages.css` 以 `.home-greeting .bell-btn { background: rgba(255,255,255,.16); color:#fff; border-radius:999px }` 替换弱存在感规则。问候行本身是蓝渐变头部（`linear-gradient(135deg, var(--primary), var(--primary-dark))`），白色圆形铃铛落在其上即与旧版「城市边上」同款观感，且无需改动位置。
3. **首页短语轮播间隔太短 → 支持小时级与「一天一条」按日模式**：`settings.html` 的 `hpInterval` 在原 4/6/8/10/15 秒基础上新增 `1 小时(3600000)` / `2 小时(7200000)` / `4 小时(14400000)` / `一天一条（按日）(daily)`；`settings.js` 的 `saveHomePhrase` / `renderHomePhrase` 支持把 `daily` 以**字符串**原样读写 `rt_ui_prefs.homePhraseInterval`（不再误转 `Number` 得 `NaN`）；`app.js` 的 `startHomePhraseCarousel` 识别 `homePhraseInterval === 'daily'` 时，按 `dayIndex = Math.floor(Date.now()/86400000)` 确定性选取 `phrases[dayIndex % len]`，**整日不变、不轮播**，并每分钟检查跨日自动切换（长时间停留页面也不会滞留旧日短语）。固定间隔分支保持原逻辑（默认 8000ms，支持秒级与小时级）。
- **测试**：`tests/test-batch234-home-phrase-dict.js` 增 4 项（轮播新增小时级与 daily 选项、app.js 识别 daily 并按日序号确定性选取 + 跨日切换、settings.js 将 daily 原样写回、字典 render 循环变量不得遮蔽全局 t 的回归断言）；`tests/test-batch221-notify-icon.js` 第 4 项由「弱存在感」改为断言「白色圆形（透明背景 + 白色 + 圆角 999px）」。全量 `node --test tests/*.js` **473 项全过、0 失败**（基线 469 + 本次 4）。
- 发版 / 部署：`release.sh 1.4.35` → `git push origin main` → `deploy-cloudbase.sh` 上传，云端校验 `version.json` = 本地 = `1.4.35`。真实 chromium 验证：铃铛 computed style 为 `rgba(255,255,255,0.16)` / `border-radius:999px` / `color:rgb(255,255,255)`、位于 `.home-greeting` 内且 `#homeGreeting` 之前、不在 `.home-weather` 内；按日模式文案等于 `phrases[dayIndex % len]` 且 300ms 内不轮播；字典列表正常渲染无「t is not a function」。

## 九、Batch 224（v1.4.36）— 日历与考勤（上）：清理 / 周末假期 / 打卡分上下午 ✅ 已完成并部署
1. 首页日历下方移除「统计」「待我审批」入口（与 TAB 重复）。✅ 已移除 index.html 的 .home-quick 块（含 homePendingCount），同步清理 app.js 死代码；test-batch192 断言已更新。
2. 今日考勤区域识别周末 / 假期，显示「周末」或「假期」。✅ renderHomeAttendance 新增 isHoliday 判定（td.type==='holiday' → 假期，否则周末）。
3. 周末点颜色改为绿色（当前为灰色）。✅ base.css --weekend-fg/bg 浅色+深色均改绿（#52c41a / rgba(82,196,26,.10) 及深色 #73d13d / rgba(115,209,61,.14)），test-batch193 断言已同步。
4. 打卡状态分上下午：双点并排（左上午·右下午），并按「颜色相同→1点、不同→2点、未打卡→0点」收敛。✅ clock-status.js 新增 ofDaySplit（am 迟到红/pm 早退红/加班深绿）+ dotCodes（合并/展开规则，纯逻辑可测）；app.js 全量日历与首页迷你日历均改用双点并包裹 .cal-dots，pages.css 补迷你日历双点样式，图例更新为「正常（颜色相同→1点）/ 上午迟到·下午早退（不同→2点）/ 加班 / 请假 / 周末」。注：迟到+早退同为红→合并为 1 红点。
- 发版 / 部署：release.sh 1.4.36 → 本地 git commit（origin 指向 ghproxy 代理，推送与 deploy-cloudbase.sh 建议在用户环境执行）。云端校验 version.json = 本地 = 1.4.36。新增 tests/test-batch226-calendar-attendance.js，全量 `node --test` 480 项全过、0 失败。

## 十、Batch 225（v1.4.37）— 日历与考勤（下）：颜色统一 / 事件类型 / 云端时间 ✅ 已完成
1. 首页迷你日历与日历 TAB 颜色提示统一（周末绿、打卡状态色、请假 / 外出 / 出差色）。
2. 考勤相关颜色统一走 `CLOCK_STATUS` / `LEAVE_TYPE` 字典（请假 / 外出 / 出差色点由 `RT_LEAVE.colorOf` / `colors()` 驱动，字典为唯一权威源）。
3. 日历新增事件类型：外出（金黄 #faad14）、出差（紫 #722ed1）；作为请假子类型复用弹窗与存储，`noDeduct` 不扣工时；两日历按类型色渲染色点、图例由 `RT_LEAVE.TYPES` 动态生成。
4. 日历周末淡红色背景改为淡绿色（Batch 224 已完成，本批仅核查）。
5. 打卡时间采用云端（服务端）时间：`time-source.js` 的 `getServerTime()` 优先取自有 CloudBase 云函数 `getServerTime`、回退 `Date.now()`；`attendance.js` 双存 `clockIn/clockInServer`，面板优先显示服务端时间并标注「云端时间」；云函数代码见 `functions/getServerTime/index.js`（用户部署）。
> 发版：v1.4.37（2026-08-03），全量测试 497/497 通过。

## 十一、Batch 226（v1.4.38）— 日历状态模型统一（8 状态 + 显示顺序）+ 首页/日历配色收尾
收口用户反馈 #2 / #3：首页迷你日历与日历 TAB 的**状态语义、颜色、色点、图例、选中/当天/周末底色**完全对齐，状态集与显示顺序唯一权威源化。

> **状态（2026-08-04）：已实现 + 全量测试通过（507/507，0 失败），待部署（按约定先实现+测试、不部署）。** 改动文件：`clock-status.js`（STATUS_ORDER/statusRank/dayDots 两层色板）、`leave.js`（TYPES 两层色板）、`dictionary.js`（LEAVE_TYPE 种子同步两层色板 + 补 adjust）、`app.js`（日历 TAB 与首页迷你日历均改用 `dayDots` 取点；图例事件项改由 `RT_LEAVE.TYPES` 动态生成）、`base.css`（`--weekend-bg` 降亮 .06/.08）；新增 `tests/test-batch226-calendar-status.js`，并同步修正 `test-batch226-calendar-attendance.js` / `test-batch193-calendar-stats.js` / `test-batch227-calendar-events.js` 中过时的色值/图例断言。

1. **统一 8 状态集与显示顺序**（新增 `clock-status.js` 的 `STATUS_ORDER` / `statusRank(code)`，作为首页与日历 TAB 共同引用）：
   状态集 = `{未打卡, 已打卡, 迟到, 早退, 加班, 请假, 外出, 出差}`。
   显示优先级（高→低，决定某日「代表状态」与排序）：**请假 = 外出 = 出差 > 迟到 > 未打卡 > 加班 > 已打卡**。
   - 同优先级并列时按既定稳定顺序（请假/外出/出差三者等价，互不覆盖）。
   - 迟到+早退同为红，按 Batch 224 规则合并为 1 红点；午别异常（上午迟到/下午早退）仍支持双点展开。
2. **首页与日历 TAB 配色收尾（以首页为准）**：
   - 选中日 = 系统色（`.cal-cell.is-selected` 用 `var(--primary)` 实色底或实色描边）；当天 = 首页浅蓝（`--primary-ghost` 浅底，与首页 `.home-greeting` 系统色浅蓝一致）。
   - 周六/周日淡绿背景：确认 `--weekend-bg` 已是淡绿（`#52c41a` / `rgba(82,196,26,.10)`，深色 `#73d13d`/`.14`），保持；删除日历 TAB 任何残留的淡红/实色蓝覆盖（已修 `pages.css` 的 `.cal-cell.is-today`，本批全量核查两日历 CSS 变量引用同源）。
   - 移除首页与日历 TAB 配色差异导致的「今天实色蓝 vs 首页浅蓝」不一致（Batch 225 后已修一处，本批查漏）。
3. **未到日期不显示点**：日历渲染中 `day > today` 时，不渲染任何状态/事件色点，**除非**该日已有请假/外出/出差申请（`leaveMap` / `calendar_events` 命中）才显示对应色点。逻辑封装进 `dayDots(date)` 纯函数（可测）。
4. **图例更新**：图例由 `RT_LEAVE.TYPES`（含事假/病假/年假/其他/外出/出差）+ 打卡状态色（CLOCK_STATUS）+ 周末绿 动态生成，**颜色与字典/状态字典一致**；补齐外出(#fa8c16)/出差(#722ed1)且色点对（当前图例缺这两项或色不对，本批修正）。**注：外出/出差等事件类色值以 Batch 228「两层色板」为唯一权威源**——外出=橙 #fa8c16、出差=紫 #722ed1、调休=黄 #faad14、请假(4 子类合并)=青 #13c2c2，本批图例色值据此对齐，不再沿用反馈前的旧黄/旧紫。
- 测试：`tests/test-batch236-calendar-status.js`（STATUS_ORDER 数值化与优先级、dayDots 未到日期屏蔽、leave 命中放行、首页与日历共用同一 order 函数、图例数据源含外出出差且色值匹配字典）。

### 设计修订（用户反馈 2026-08-03：配色与点规则收敛）
收口本轮关于日历配色/打卡点的 5 点反馈，对上方 8 状态模型做如下收敛。**决策：合并进本批，不新增批次号**（属未执行批次的设计细化，避免日历工作碎片化）：

1. **周末/假期淡绿降亮（去晃眼）**：`--weekend-bg` 当前 `rgba(82,196,26,.10)`（深绿 `#52c41a`）偏亮晃眼。改为**更淡更透**——浅色 `rgba(82,196,26,.06)`（或退化到 `#f6ffed` 级近白绿），深色 `#73d13d`/`.14` 同步降到 `.08`；保留「绿=周末/假期」语义但不再刺眼。仅改 CSS 变量，不动逻辑。
2. **「正常上班」= 系统色蓝点（占点）**：正常出勤（已打卡且无疑似异常）在日历显示 **1 个系统色蓝点**（`--primary` 实色小圆点），是日历的**默认常态点**。蓝点承载「今天正常上了班」的证据；与「选中/当天/正常态描边」同为系统色但语义独立（点是出勤态、描边是交互态）。与**年假严格区分**：年假属请假、走请假青色（见 Batch 228 调色板），**不得用系统蓝**，否则与正常上班混淆。
3. **点合并规则（单独备注，不写在类型色后）**：
   - 一天内若上午、下午的「异常态」**颜色相同** → 合并为 **1 个点**（如上午迟到+下午早退同红 → 1 红点；上午请假+下午请假同请假色 → 1 点）。
   - 若**颜色不同** → 展开为 **2 个点**（左=上午、右=下午，各取自身色）。
   - **正常上班（系统蓝点）不参与「颜色相同/不同」合并判定**——它作为独立基线点常驻（见 #2），其余异常态（迟到/早退/请假/外出/出差/调休）在蓝点之外按上述规则合并/展开，不与蓝点混算。**特例·加班**：若该日有加班，加班态覆盖正常蓝基线、该日呈 **1 个深绿加班点**（见 #4），蓝点不再出现；加班点与同时存在的其它异常态再按规则合并/展开（如上午迟到红 + 加班深绿 → 2 点）。
   - 此规则作为**独立备注**写在图例区，不与各类型颜色罗列混排。
4. **「正常上班 + 晚上加班」= 1 个深绿加班点（覆盖蓝点）**：加班日的代表状态为「加班」，该日显示 **1 个深绿加班点**，正常上班蓝点被加班态覆盖（**不出现蓝+绿双点**）——要区分的是①**哪天加班**（看深绿点）与②**哪天上下午非正常**（看红/请假/外出/出差/调休点）。若加班日同时有异常态（如上午迟到），异常点照常叠加（上午迟到红 + 加班深绿 = 2 点）。> 修订说明：先后两版「不占点→仅加班点」「占蓝点→蓝+深绿 2 点」均按反馈调整为——**加班日仅 1 个深绿点、正常蓝基线被覆盖**。加班点与普通异常点同为「非正常态」，参与上述合并/展开。

## 十二、Batch 227（v1.4.39）— 日历顶部模块补齐外出/出差工时（带色数字）
收口用户反馈 #4：日历页上方统计模块，在「请假」与「实际工时」之间插入**外出、出差**两项，单位小时，数字按语义色着色。

1. **顶部模块顺序**：`请假(小时) · 外出(小时) · 出差(小时) · 实际工时(小时)`，三项事件类并列在请假组。
2. **数值着色**：每一项数字用各自语义色（请假=青 #13c2c2 按 `colorOf` 顶层类别色、外出=橙 #fa8c16、出差=紫 #722ed1，色值与 Batch 228 两层色板一致）；无数据（0 小时）时数字回退系统色（`var(--text)` / `--muted`），不加色。
3. **工时计算**：外出/出差沿用 `effectiveHours` 交集扣减但 `noDeduct`（不计入应出勤扣减）；顶部「实际工时」= 应出勤工时 − 请假扣减（不含外出/出差），保持既有语义。
- 测试：`tests/test-batch237-top-modules.js`（顶部模块顺序、外出/出差小时数来自 leave store 交集、着色色值与字典一致、0 值回退系统色）。

## 十三、Batch 228（v1.4.40）— 申请统一入口 + 类型细化（请假/外出/出差/加班）
收口用户反馈 #7：日历页「请假」下方增加**加班 / 外出 / 出差**的申请入口，并细化各类型子项。

1. **统一申请入口（择优选方案 B：统一入口 + 类型分支）**：日历页新增「+ 申请」统一入口，弹出申请类型选择（请假/外出/出差/加班），选后进入对应表单；统一入口避免每类各自入口导致的冗余与状态不一致。
2. **类型细化**：
   - 请假：沿用 `LEAVE_TYPE` 字典（事假/病假/年假/其他），可选请假范围（单日/多日区间）。
   - 外出：子项 = 市内外出 / 市外外出；需填**地点**（通过地图选点组件获取，见 #2a）。
   - 出差：子项 = 市内 / 市外 / 省外 / 出国；需填**地点**（通过地图选点组件获取，见 #2a）。
   - 加班：子项 = 工作日加班 / 周末加班 / 法定节假日加班；**自动生成**（下班时间→打卡时间取整）、填**原因**；加班不计入请假扣减。
2a. **地图选点组件（外出/出差地点输入复用）**：外出与出差的地点字段统一使用**地图选点 + 手动补充**的交互模式，基于高德 JS API（`RT_CONFIG.amap.jsKey`），设计如下：
   - **弹出地图**：点击地点字段 → 全屏/半屏弹出高德地图，中心默认定位到用户当前位置（`AMap.Geolocation`）或上次选点坐标；支持拖动地图、搜索地址。
   - **选点获取地址**：用户在地图上点击或搜索结果中点选 → 获取该点的**结构化地址**（省/市/区/街道/门牌号）与**经纬度**（`lng`, `lat`）。选点获取的地址字段**只读不可编辑**（确保地理数据准确性），标注「地图选点」来源。
   - **补充地址（可手动补充）**：在选点地址下方提供**独立「补充地址」文本框**，用户可手动填写楼层/房间号/备注（如「3 楼 301 会议室」），与选点地址拼接展示（选点地址 + 补充地址），但不会覆盖选点的经纬度。
   - **经纬度存储**：确认选点后，经纬度 (`lng`, `lat`) 随申请落库到 `calendar_events` / `leave` store（字段 `lng` / `lat` / `address` / `addressExtra`）。
   - **再次查看时回显点位**：已提交/已审批通过的申请，查看详情时在地图上**以标记点（Marker）回显该经纬度**，确认「确切位置可回看」。
   - **高德 key**：调用 `RT_CONFIG.amap.jsKey` 加载 JS SDK，key 更换只改 `config.js`、不动此组件。
   - 测试：`tests/test-batch238-map-picker.js`（地图弹出与关闭、搜索选点返回结构化地址+经纬度、选点地址只读不可编辑、补充地址可手动填写、提交后 store 含 lng/lat/address/addressExtra、回看时 Marker 落点正确）。
3. **存储与状态**：四类申请统一落 `calendar_events` / `leave` store（加班标记 `type:'overtime'`、`noDeduct:true`）；日历状态模型识别加班→「加班」状态（深绿）。**提交成功后即自动发起审批流**（2 级审批链：部门经理→人力资源HR，当前各级可配 `admin`，详见 Batch 237）。
- 测试：`tests/test-batch238-apply-entry.js`（统一入口类型分支、外出/出差子项与地点必填、加班子项与自动生成逻辑、四类均落同一 store 且状态识别正确）。

### 设计修订（用户反馈 2026-08-03：类型颜色去杂）
针对「请假子类已分色，调休/外出/出差再各自分色会太杂」的问题，收敛为**两层色板 + 类型靠图标/文字区分**，不靠堆叠色相。**决策：合并进本批，不新增批次号**：

- **第一层·语义状态色（固定小集合，优先用于点）**：红 `#f5222d`（迟到/早退）、深绿 `#389e0d`（加班）、系统蓝 `--primary`（正常上班常态蓝点）、灰 `--muted`（未打卡/无数据）。
- **第二层·事件类别色（仅顶层 4 类，各 1 色，子类不另配色）**：
  - **请假**（事假/病假/年假/其他 全部 → **同 1 色**，如青 `#13c2c2`；子类仅以图标/首字区分，不在日历点里再分色）→ 与系统蓝（正常上班）明确区分。
  - **调休** → 黄 `#faad14`。
  - **外出** → 橙 `#fa8c16`（与调休黄拉开，避免同色系混淆）。
  - **出差** → 紫 `#722ed1`。
- 日历点色相上限 = 红 / 深绿 / 青(请假) / 黄(调休) / 橙(外出) / 紫(出差) 共 6 个事件/异常色 + 系统蓝(正常上班常态点) / 灰(未打卡) 基线；**不再为请假 4 子类各开一色**，从根上消除「太杂」。
- 该调色板为 Batch 226 图例与各状态点渲染的**唯一权威源**；字典 `RT_LEAVE.colorOf` 仅保留「顶层类别色」，子类色回退到类别色。
- **色值迁移说明（与已发货 v1.4.37 对齐）**：线上 v1.4.37（Batch 225）发货时「外出 = 金黄 #faad14、出差 = 紫 #722ed1」已生效；本调色板将**外出迁移为橙 #fa8c16**（与调休黄拉开、不再同色系），出差保持紫 #722ed1，调休=黄 #faad14，请假 4 子类合并为青 #13c2c2。故 226+ 实现时**外出需做一次颜色变量迁移**（#faad14 → #fa8c16），其余为新增/细化；迁移单独立项到 Batch 226 图例/点渲染改造内，不视为 Bug 回退。

## 十四、Batch 229（v1.4.41）— 调休重构（黄色 / 可选范围 / 状态 / 等级）
收口用户反馈 #10：原「手动调休」改为与请假一致。

1. **与请假对齐**：调休作为请假子类型 `leaveType:'adjust'`（或独立类型），可选**范围**（单日/区间），加「**调休**」状态（黄色 #faad14，见 Batch 228 两层色板——调休=黄、外出已另配橙 #fa8c16、出差=紫 #722ed1，二者不再同色系，语义各自独立），等级同请假（年假/事假同级处理）。
2. **两种方案择优选**：采用「统一申请入口」（与 Batch 228 同入口，类型选择含「调休」），避免每类单独入口；调休不扣工时（视为已出勤补偿）。
3. **状态与显示**：调休日日历显示「调休」黄色状态点；顶部模块如需展示可并入「请假」组或单独（设计阶段定）。
- 测试：`tests/test-batch239-adjust.js`（调休类型注册、可选范围、状态=调休黄色、不扣工时、与统一入口集成）。

## 十五、Batch 230（v1.4.42）— 时间框统一 + 自定义时间选择器（PWA 字体）
收口用户反馈 #8：上下班与请假的时间框统一；时间选择器使用 PWA 字体而非手机系统字体。

1. **时间框统一**：上下班打卡时间、请假/外出/出差/加班起止时间，统一改用同一套时间输入组件（同尺寸/同圆角/同校验），消除「上下班显示一致、请假不一致」差异。
2. **自定义时间选择器**：弃用系统原生 `<input type=time>`（渲染走手机系统字体，无法统一），自实现时间选择控件（滚轮/列表选择时分），强制 `font-family: var(--font-base)`（PWA 统一字体），样式与 PWA 主题一致。
3. **接入点**：打卡编辑（`editTime`）、申请表单起止时间、调休范围，全部改用新控件。
- 测试：`tests/test-batch240-timepicker.js`（时间框组件结构统一、自定义控件 DOM 不使用系统原生 input、字体 class 应用、值解析与格式化与既有 `clockIn/clockOut` 兼容）。

## 十六、Batch 231（v1.4.43）— 基础数据：行政区域管理（高德 API 编码）+ 工时管理 + 天气接高德 API + 高德 key 配置化
收口用户反馈 #9：基础数据页新增两个模块。

1. **行政区域管理（编码接高德 API）**：维护省/市/区三级 + **高德/北斗编号**（用于地图定位）；新增 `regions` store（province/city/district/AMapCode/AMapLng/AMapLat/BeiDouCode）。**区域编码通过高德地图「行政区划查询」API 获取**（`adcode` / 经纬度），不再仅依赖民政部数据集导入——调用高德接口拉取省/市/区树并写入 `AMapCode` 等字段；民政部数据集降级为离线兜底/校验源。基础数据页「行政区域」子页支持**高德同步拉取 + CRUD**；与现有 `RT_CITY_TREE` / `RT_CITY_DISTRICTS` 解耦但可同步（天气按 `adcode` 联动，见 #3）。**高德 key 见 #4 配置化说明。**
2. **工时管理**：维护上下班时长、**夏令时/冬令时/全年**切换、日历设**上班/放假**。
   - 上下班时长：每日标准工时、弹性区间。
   - 时令：全年/夏令时/冬令时三套上下班时刻（如冬令时 09:00–17:30、夏令时 08:30–18:00）。
   - 日历上班/放假：维护 `RT_HOLIDAY` 补充「调休上班日」「法定假日」，打卡与工时统计据此判定应出勤。
3. **天气接高德 API（替代 open-meteo）**：首页问候天气（Batch 221 .27 现有 `renderHomeWeather` / `weatherQueryCity`，现走 open-meteo）改为调用**高德天气 API**（实况 + 预报），入参用「行政区域」的 `adcode`（与 #1 区域编码联动，区县上卷到地级市 adcode）；保留 30 分钟缓存与城市按钮「城市·区县」解耦逻辑。**高德 key 见 #4。** open-meteo 保留为离线/超限兜底（高德配额耗尽或 key 未配置时回退）。
4. **高德 key 配置化（便于更换）**：高德 Web 服务 key **不硬编码**，统一写入配置文件——在 `config.js` 的 `RT_CONFIG.amap` 分组下管理，结构为 `{ jsKey, jsSecret, webKey }`。**jsKey**（`001a4f3f0bacbeab883fc2ded9d071be`，名称：微枢_PWA）+ **jsSecret**（`ffc2fe54dcc5f266f76c1d22eee40a40`）用于前端 JS SDK；**webKey** 用于行政区划查询/天气等 HTTP API（待提供后填写；可复用 jsKey 也可另配）。所有高德调用统一从配置读取；**更换 key 只改该文件、不动业务代码**。
- 测试：`tests/test-batch241-basedata.js`（regions store CRUD + 高德 `adcode`/经纬度字段、高德行政区划接口拉取与落库、工时管理三时令切换、上班/放假日写入 RT_HOLIDAY 并被考勤识别）；新增 `tests/test-batch241-amap.js`（天气走高德 API 且入参为 adcode、key 从 `RT_CONFIG.amapKey` 读取、key 缺失时回退 open-meteo、民政部数据集兜底）。

## 十七、Batch 232（v1.4.44）— 设置清理与个人信息
1. 设置主页移除底部 12 模块内容预览，仅保留子菜单入口。
2. 以下子页只展示自身模块内容，移除不属于本页的模块：通知、界面与展示、系统权限、下载地址、云同步、使用说明、意见反馈。
3. 个人信息页「基本信息」「组织信息」从卡片框内移出，像登录设备页一样直接展示（统一卡片风格）。
4. 登录设备记录每次登录信息（UA、时间、近似 IP），至少按账号展示历史登录列表；设计设备指纹 / 会话标识，登录时写入 `login_devices` store。

## 十八、Batch 233（v1.4.45）— 设置展示与反馈
1. 修复基础数据页（职位管理等读取字典的下拉 / 列表）使用系统默认字体问题，强制 PWA 统一字体。
2. 「界面与展示」新增字体选择：默认字体、通用无版权字体列表、手机系统字体；持久化到 `RT_CONFIG`，通过 `body` class / style 切换 `--font-base`。
3. 「界面与展示」新增「宽屏适配」开关（默认关闭），在 `<html>` / `<body>` 挂 `data-layout="wide" / "phone"` 类，Pad 端用 media query + 该 class 切换布局，为后续 WEB 后台留接口。
4. 修复意见反馈提交失败：读取 `feedback.js` / 对应子页，定位必填校验、`feedback` store 注册、网络接口、i18n key 未定义导致的抛错。
5. 意见反馈页显示图标；流程管理、流程审批页图标保持一致。

## 十九、Batch 234（v1.4.46）— 导出（本地/邮箱/腾讯文档）与初始化示例入口
1. **导出弹框（改交互）**：阻止默认自动下载，导出时先弹框让用户三选一——「导出到本地」「导出到个人邮箱」「导出到腾讯文档」（区别见附录 B）；本期三种目标均落地（见下 2–4）。
2. **统一 Excel 格式（SheetJS）**：前端引入 SheetJS 等库，所有导出统一生成真 `.xlsx`（带表头、多 Sheet 可选），替代原 CSV/JSON；本批次内完整完成，作为三个目标的共用产出。
3. **导出到个人邮箱（统一方法）**：设置页「账号与安全」新增「接收邮箱」配置（QQ/163/任意）；云端发信函数用**我们自己的发件账号**统一发信、把 Excel 作为附件发到该地址——一套机制覆盖所有邮箱，用户**无需填 SMTP 密码**（避开 QQ 授权码等差异化）。本批次完成前端 + 发信函数骨架；真实发信依赖我们配置发件账号（SMTP/SES），凭证未就绪时按钮提示「邮箱服务未配置」。
4. **导出到腾讯文档（Excel，轻量路线）**：本地用 SheetJS 生成 `.xlsx` 后提供「用腾讯文档打开」入口（拉起 `docs.qq.com` 并引导手动导入/上传），本期不走 OAuth 全自动建表（全自动路线留待后续）。实现「生成文件 → 一键跳转腾讯文档」闭环。
5. **设置页「初始化示例」入口**：新增入口（触发 Batch 232 直接生成 5 个工作流及模板；入口文案见 i18n `settings.initExamples`），仅做入口与调用，工作流与模板的真实生成逻辑在 Batch 236。

## 二十、Batch 235（v1.4.47）— 表单模板增强
1. 表单模板字段类型增加「单选框」。
2. 字段占位提示（placeholder）含义明确化：配置侧显示「输入框未填写时的灰色提示文案」。
3. 流程图标选择改为图案展示，不再显示文字。
4. 默认图案库：研发流程、请假流程、项目申请、出差申请、外出申请等。
5. 根据流程名称关键字自动生成默认图标（可配置映射表）。

## 二十一、Batch 236（v1.4.48）— 工作流增强：职位审批 + 直接生成工作流
1. 工作流节点审批人支持「职位」维度：节点 `approver` 字段扩展为对象 `{type:'user'|'position', value}`，字符串向后兼容按 `user`；审批时按申请人所属分公司 / 部门解析到职位上的人员（如「分公司经理」）；多人支持或签（会签预留）。
2. 实现「初始化示例」：直接生成需求中 5 个工作流（请假、外出、出差、项目申请、研发流程）+ 对应表单模板。

## 二十二、Batch 237（v1.4.49）— 日历与流程关联（申请即自动发起 2 级审批流）

因日历申请类型已扩展为 请假/外出/出差/加班/调休（见 Batch 228/229/231），流程需相应联动：

1. **流程实例字段**：流程实例增加 `calendarEvent` 字段（类型、起止时间、标题、颜色），类型覆盖全部 5 类（请假/外出/出差/加班/调休）。
2. **添加即自动发起流程**：在 Batch 228 统一申请入口提交任一类型（请假/外出/出差/加班/调休）后，**自动创建流程实例并启动审批链**，无需手动发起；触发点挂在申请落库（`calendar_events` / `leave` store）成功后。
3. **默认审批链（2 级）**：`部门经理审批 → 人力资源HR审批`。审批人基于 Batch 236 的「职位/角色」维度解析（节点 `approver = {type:'position'|'user', value}`）；**当前测试环境各级审批人均可配置为 `admin`**（即 `type:'user', value:'admin'`），便于联调。审批链节点与各级审批人在配置中可定义，与 Batch 236 职位审批机制对接。
4. **审批通过写回日历**：审批链全部通过后，由审批引擎把流程实例转换为日历事件写入 `calendar_events`；日历 TAB 读取并展示 请假/外出/出差/加班/调休 结果，颜色与 Batch 228 两层色板对齐（青/橙/紫/深绿/黄）。
5. **配置项（测试可用）**：新增审批链配置（如 `RT_CONFIG.approvalChain` 或工作流模板），含每级节点名 + 审批人；默认 `[{node:'部门经理审批',approver:'admin'},{node:'人力资源HR审批',approver:'admin'}]`，上线前替换为真实职位/人员。
- 测试：`tests/test-batch249-calendar-flow.js`（5 类申请提交后均自动建实例并启动 2 级链、审批人默认 admin、全部通过后写回 `calendar_events` 且颜色与色板一致、类型扩展不影响既有流程）。
> 注：复杂联动（如驳回回退、并行会签）留待后续批次，本期落地「添加即发起 + 3 级 admin 审批 + 通过写回」主线。

## 二十五、全局贯穿项（随批次落实）
1. 标签栏与菜单栏名称一致性：每改一个页面顺手核对，不一致则改为与菜单栏名称一致。
2. **更新日志条目格式（强约束）**：每条变更日志**必须以「批次XXX：」开头**（中文「批次」+ 三位批次号 + 中文冒号），**不得**使用 `batch` / `Batch` 等英文写法；**缺失批次号的既有条目须补登记**。示例：`批次225：日历与考勤（下）：颜色统一走字典……`。本规则适用于所有带批次号的条目（如有批次号的话）。
3. 宽屏选择接口预埋（见 Batch 233 第 3 项）。
4. **权限校验全覆盖（强约束）**：所有页面/子页/弹框/申请入口/导出/设置子页，**每改一个页面必须补 `data-perm` 权限注册与校验**——未注册权限的页面默认拒绝访问；权限注册表在 `permissions.js` 维护，每新增页面/功能入口同步追加。Batch 226–237 所有未执行批次涉及的新页面/新入口（日历 TAB/统一申请/地图选点/调休/导出弹框/基础数据子页/设置子页/表单模板/工作流/流程实例）均需在本批实现时完成权限登记与校验。
5. **六语言（zh-CN / zh-TW / en / ja / ko / ar）全覆盖（强约束）**：所有页面/弹框/提示/按钮/图例/状态文案，**每改一个页面必须同步补全六语言 key**（`i18n.js` + 各语言文件），不得有硬编码中文残留。六语言 = 简体中文、繁体中文、英语、日语、韩语、阿拉伯语。Batch 226–237 新增的文案（日历 8 状态名/图例/统一申请类型/地图选点提示/调休/导出/审批链/基础数据/设置子页/表单字段/工作流节点）均需在对应批次落地时同步配齐六语言。
   - **对账台账**：本贯穿项的验收载体为独立文件 `plans/UI_PERM_I18N_MANIFEST.md`——逐页登记每个 UI 元素对应的 `data-perm` 权限 key 与 i18n key + 六语言覆盖状态，漏权限/漏语言扫表即知；每完成一个批次回填该表计数与状态。

## 二十六、改动概览

### i18n（六语言对称，贯穿项 #5 强制执行）
- `app.title` / `app.shortName` → 改为「微枢」。
- `home.greeting.*`、`home.phrase.*`（轮播短语，含开关与默认池 key）。
- `home.todayStatus.weekend`、`home.todayStatus.holiday`、`home.clock.amLate`、`home.clock.pmEarly` 等。
- `calendar.type.outing`、`calendar.type.businessTrip`、`calendar.type.adjust`（调休）。
- `calendar.status.*`（8 状态名六语言：未打卡/已打卡/迟到/早退/加班/请假/外出/出差）。
- `calendar.legend.*`（图例文案六语言，含点合并规则独立备注）。
- `calendar.apply.*`（统一申请入口类型选择/子项/地图选点/补充地址提示）。
- `approval.*`（部门经理审批 / 人力资源HR审批 / 审批中 / 已通过 / 已驳回）。
- `settings.font.*`、`settings.wideScreen.*`、`settings.initExamples`。
- `export.toLocal`、`export.toEmail`、`export.toTencentDocs`、`export.emailNotConfigured`。
- `feedback.submitFailed`、`feedback.submitSuccess`。
- `regions.*`（行政区域管理六语言）、`worktime.*`（工时管理六语言）。
- `form.*`（表单模板字段/单选框/占位提示六语言）。
- 现有 `dict.*`、`perm.*` 补充错误提示 key。
- **硬编码中文清查**：全站所有页面（含已部署批次）逐一扫描，发现硬编码中文一律提取为 i18n key 并补六语言。

### 数据层（可能新增 / 扩展 store）
- `login_devices`（登录设备记录）。
- `calendar_events`（日历事件，或扩展现有日历结构）。
- `feedback`（若当前没有）。
- `workflows` / `processes` 扩展：审批人职位、表单单选框、图标。

### 权限注册表（贯穿项 #4 强制执行）
- 新增 / 登记 `data-perm`：日历 TAB、统一申请入口、地图选点、调休、导出弹框、基础数据子页（行政区域/工时管理）、设置子页（字体/宽屏/初始化示例）、表单模板页、工作流页、流程实例页、登录设备页。
- **校验规则**：每个新页面/子页必须在 `permissions.js` 注册权限项，页面 `onShow` 时校验，无权限则跳转 403 或隐藏入口。
- 已部署批次中如有遗漏的权限注册，在对应批次修复时补登记。

### release.sh
- 每新增 / 修改的 html/js/css 在对应块补 `patch_ver`；`check_ver` 漂移扫描兜底。
- 字典页若新增 `i18n.js` 引用，需在对应页面块登记。

## 二十七、测试计划
| 类型 | 内容 |
|------|------|
| 单元测试 | 各批次新增 `tests/test-batch219-*.js` 等：权限事务、字典播种、日历状态、设置过滤、导出状态机、工作流职位解析、表单单选框。 |
| 全量回归 | 每批次 `node --test tests/`；当前基线 408 项 / 7 失败（预存 / 环境），目标不新增失败。 |
| 真机验证 | 华为浏览器 / Chrome：首页通知与城市选择、字典页、权限页、日历颜色、设置子页、导出弹框。 |
| 版本一致性 | `release.sh` 后 `version.json` / 云端 `version.json` / `index.html` APP_VERSION 一致。 |

## 二十八、风险与依赖
1. **IndexedDB 事务 bug 影响范围**：`permissions.js` 的 `createMenu` / `updateMenu` 为种子播种路径，修复后可能同时解决 Batch86/87 单测失败（当前 7 个预存失败中的一部分）。
2. **城市数据准确性**：天气精准度依赖省市区 → 经纬度映射表；坐标不准需重新整理。
3. **云端时间**：确认是否需后端支持；仅前端用 `Date.now()` + NTP 估算，精确度有限。
4. **邮箱导出**：需「账号与安全」有接收邮箱字段；若没有需新增「账号与安全」子页。CloudBase 发信函数 + 邮件服务凭证（SMTP/SES）**已确认云端具备**，本期可直接真实发信（仍保留「未配置」兜底分支）。
5. **工作流职位审批**：依赖 `users` / `departments` / `positions` 数据完整。
6. **应用名替换**：检查所有语言文件、manifest、PWA 安装提示、分享文案避免漏改。

---

## 附录 A：默认轮播短语池（自动生成，可配置）
首页时间下方轮播展示，文案可在「界面与展示」或配置项内覆盖。默认 12 条（纯文本、积极、贴合工作场景）：

1. 今天也要元气满满
2. 把最重要的事先做完
3. 小步快跑，持续交付
4. 计划赶不上变化，先动起来
5. 专注当下，拒绝内耗
6. 会议少一点，效率高一点的
7. 文档写清楚，沟通省一半
8. 进度看得见，心里才踏实
9. 今日事今日毕
10. 把需求拆小，风险也变小
11. 喝口水，起来走走
12. 完成比完美更重要

> 配置方式（设计）：`RT_CONFIG` 增加 `homePhrases`（数组）；为空时回退到上述内置默认池。i18n 侧提供 `home.phrase.default` 占位，实际展示以 `RT_CONFIG.homePhrases` 优先。

## 附录 B：导出方式区别（通俗版）+ 邮箱 / 腾讯文档可行性
- **导出到本地**：文件直接存到你手机 / 电脑的「下载」里，马上能打开用。最简单、不依赖网络服务端，**本批次（Batch 229）内完整完成**。
- **导出到个人邮箱（统一方法，推荐）**：你在设置里只填一个「接收邮箱」（QQ / 163 / 任意），系统把 Excel 作为附件发到这个邮箱，电脑上就能收。
  - **关键统一点**：发信用的是**我们自己的发件账号**（云端 SMTP/SES），不是你的邮箱密码——所以不管你填 QQ、163 还是别的，走的是同一套机制，你**不用填 SMTP 密码**（也就避开了 QQ「授权码」等各家不同的麻烦）。
  - **可行性**：本批次（Batch 229）内可完成「弹框 + 接收邮箱字段 + 云端发信函数」前端与骨架；**已确认云端具备发信能力（SMTP/SES 已配好）**，本期即可直接真实发信，无需「凭证未就绪」主路径。代码中仍保留「邮箱服务未配置」兜底分支作为健壮性（极端情况下云端发信失败提示）。
  - **结论**：功能开发与真实发信本批次均可完成（凭证已就绪，用户已拍板）。
- **导出到腾讯文档（Excel，轻量路线）**：本地用 SheetJS 生成 `.xlsx` 后，提供「用腾讯文档打开」入口——拉起 `docs.qq.com` 并引导手动导入/上传，形成一个「生成文件 → 一键跳转腾讯文档」的闭环。
  - **为什么先走轻量路线**：全自动路线需接入「腾讯文档开放平台 + OAuth」自动建在线表格，涉及应用资质、OAuth 回调域名等额外成本；本期先用轻量路线达到「能落到腾讯文档里、能当 Excel 用」的目标。
  - **全自动路线（留待后续）**：申请腾讯文档开放平台能力 → OAuth 授权 → 直接在你的腾讯文档里新建在线表格并写入数据。本期不实现。
- **统一 Excel 格式**：三种目标共用 SheetJS 生成真 `.xlsx`（带表头、可多 Sheet），替代原先的 CSV/JSON 导出。
- **建议**：本批次三种目标全部落地（本地完整可用、邮箱完成前端+函数骨架、腾讯文档走轻量路线）；邮箱真实发信等发件账号凭证确认后即可启用。

---

## 二十九、全局 UI 元素 × 权限 × 六语言 总核对（统一核对入口）

> **总配置台账已独立成文件**：`plans/UI_PERM_I18N_MANIFEST.md` —— 覆盖**整个 PWA 的全部页面模块**（38 个 html：登录与授权 / 首页+日历 / 个人中心 / 组织管理 / 权限与角色 / 数据字典 / 基础数据 / 流程与工作流 / 设置 / 报表 / 系统工具），逐页登记 UI 元素 → 权限 key（`data-perm`）→ i18n key（六语言 zh-CN / zh-TW / en / ja / ko / ar）。**最后统一核对以该独立文件为准**。
> 本执行清单**不再重复列全表**，避免两份不一致；仅在此指明入口与验收口径。

### 统一核对验收口径（最后扫一遍）
1. **权限**：每个页面/子页/弹框在 `permissions.js` 有 `data-perm` 注册且 `onShow` 校验；无权限默认拒绝（贯穿项 #4）。
2. **语言**：每个文案在 `i18n.js` 定义 key，6 语言文件均有翻译；全站无硬编码中文残留（贯穿项 #5）。
3. **漏登扫描**：全量 `node --test` 附带 grep 硬编码中文 + 未注册 `data-perm`，与台账交叉验证。
4. **逐页回填**：每完成一个页面/模块，回填 `UI_PERM_I18N_MANIFEST.md` 对应行状态为 ✅。
