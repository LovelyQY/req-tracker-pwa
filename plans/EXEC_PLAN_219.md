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
| 221 | v1.4.26→v1.4.33 | 首页头部：应用名/通知/城市（+ 后续修正与最终 UI 打磨） | 3+ |
| 222 | v1.4.27 | 首页问候/天气/短语 | 3 |
| 223 | v1.4.28 | 首页空状态统一（初版细线，已被 224 彩色填充取代） | 2 |
| 224 | v1.4.29 | 空状态图标彩色填充（已被 225 emoji 取代） | 11 |
| 225 | v1.4.30 | 空状态图标统一回退为邮箱 emoji 📭 + 可配置（图标管理） | 8 |
| 226 | v1.4.36 | 日历与考勤（上）：清理/周末假期/打卡分上下午 | 4 |
| 227 | v1.4.37 | 日历与考勤（下）：颜色统一/事件类型/云端时间 | 5 |
| 228 | v1.4.38 | 设置清理与个人信息 | 4 |
| 229 | v1.4.39 | 设置展示与反馈 | 5 |
| 230 | v1.4.40 | 导出（本地/邮箱/腾讯文档）与初始化示例入口 | 5 |
| 231 | v1.4.41 | 表单模板增强 | 5 |
| 232 | v1.4.42 | 工作流增强：职位审批 + 直接生成工作流 | 2 |
| 233 | v1.4.43 | 日历与流程关联 | 2 |
| 234 | v1.4.34 | 首页短语可配置 + 铃铛融入问候 + 字典页 bug 修复（插入批次，占用 v1.4.34） | 3 |
| 235 | v1.4.35 | 用户反馈热修：字典页「t is not a function」、铃铛恢复白色圆形（问候行内）、首页短语轮播支持小时级与「一天一条」按日模式 | 3 |

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

## 六、Batch 221（v1.4.26 / 后续修正 v1.4.31 / 全量省市区补全 v1.4.32 / 最终 UI 打磨 v1.4.33）— 首页头部：应用名 / 通知 / 城市 ✅ 已完成并部署
1. 应用名「需求任务追踪」→「微枢」：`index.html` title、`manifest.json`、i18n `app.title` / `app.shortName`、关于页、设置页、分享文案全量替换（grep `需求任务追踪`）。
2. 通知图标改为非 emoji，置于城市选择器同行右侧。
3. 城市选择省市区对应修复：补全缺失的市 / 区，校验省市区三级映射。
- 应用名：`index.html` / `index-nosw.html` / `login/classic.html` 的 title 与 h1、`manifest.json` 的 name/short_name、`report-task.html` 打印标题、`settings.js` 帮助文档、`app.js` 注释，以及 i18n 6 语言的 `app.title`（中文「微枢」、繁中「微樞」、en `Weishu`、ko `미추`、ja `ミシュ`）全量替换；`about.html` 经 `app.title` 动态渲染无需硬编码。
- 通知图标：原 header 内 emoji 🔔 铃铛改为 SVG 铃铛，按钮从 header 移至 `homeWeatherCity` 同行右侧（蓝渐变问候卡内白色半透明圆角，风格与城市按钮一致）；`pages.css` 新增 `.home-weather .bell-btn` 适配。
- 城市数据：`RT_CITY_TREE`（省→市）由每省 1–2 市补全为覆盖 32 省级行政区、每省含省会及主要地级市（约 250 市）；`RT_CITY_DISTRICTS`（市→区）由 12 市扩至约 40 个主要城市的区；三级映射经 `test-batch221-city-tree.js` 校验（热门城市覆盖 / 无孤儿区 / 无重复 / 直辖市有区 / 省会覆盖）。
- 测试：tests/test-batch221-app-rename.js（3 项）、test-batch221-notify-icon.js（3 项）、test-batch221-city-tree.js（6 项），共 12 项全过。
- 发版：v1.4.26，已 `git push` + CloudBase 部署，云端 version.json 校验一致。

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

## Batch 234（v1.4.34）— 首页短语可配置 + 铃铛融入问候 + 字典页 bug 修复 ✅ 已完成并部署
针对消息 2 的 7 个子问题逐项处理（省市区 / 今日短语入字典两项经用户确认**不需**扩字典数据模型：城市·区县保持内置，短语走设置页可配置）：

1. **字典页标题显示裸键 `dict.title`**：根因为 `dictionary.html` 底部脚本漏引 6 份语言包（`i18n/zh-CN.js`…`i18n/ja.js`），`RT_I18N` 为空致 `t()` 回退裸键。修复：补齐 6 语言包引用（随发版升版 ?v=，release.sh 字典块同步登记，否则 ?v= 漂移自检拦截）。
2. **字典页打开不显示内容**：根因为 `boot()` 在 parse 阶段内联立即执行，早于全部 defer 脚本（dictionary.js / i18n.js / config.js 等），`RT_DICT` 未定义致 `render()` 早退空白。修复：将 `boot()` / `onPageShow` / `onVisible` / `registerAppSW` 包裹进 `initDictionaryPage()` 并在 `DOMContentLoaded` 后执行（defer 脚本已就绪）。
3. **今日短语轮播太快、要可配置**：原 `startHomePhraseCarousel()` 写死 `setInterval(tick, 4000)`。修复：间隔改为读取 `rt_ui_prefs.homePhraseInterval`（默认 8000ms，较原 4s 更舒缓），提供 4/6/8/10/15 秒档位；短语池改为读取 `rt_ui_prefs.homePhrases`，空则回退 `RT_CONFIG.homePhrasesDefault`（config.js 单一事实来源，12 条）。
4. **短语池可编辑（设置页「界面与展示」）**：新增「首页今日短语」分组——轮播间隔下拉 + 短语池文本框（每行一条，最多 30 条）+ 保存 / 恢复默认。`settings.js` 增 `renderHomePhrase / saveHomePhrase / resetHomePhrase`，落 `rt_ui_prefs` 并派发 `rt-ui-prefs-change`；首页监听该事件实时重启轮播。
5. **通知铃铛融入问候行**：原铃铛在蓝渐变天气卡内、与城市按钮同行，用户反馈「左侧突兀」。按确认方案移入 `.home-greet-main`、置于「早上好」(#homeGreeting) 之前，改为与问候同色、无背景的弱存在感小图标（`pages.css` 以 `.home-greeting .bell-btn` 替换原 `.home-weather .bell-btn` 作用域规则）；角标 `[data-badge="notify"]` 随按钮迁移，JS 绑定按 id 不变。
- 省市区 / 今日短语**未**入字典：经用户确认，城市·区县保持内置（已完成全量补全），短语走设置页可配置，字典数据模型与播种逻辑无需改动（仅修上述两个展示 / 渲染 bug）。
- **测试**：新增 `tests/test-batch234-home-phrase-dict.js`（9 项：字典 6 语言包 / DCL 初始化 / zh-CN 含 dict.title、homePhrasesDefault 12 条、getHomePhrases 读 prefs 优先级、轮播间隔默认 8000、设置页控件、settings.js 接线与恢复默认写回）；`test-batch221-notify-icon.js` 重写为铃铛融入问候行的断言；`test-batch222-home-greeting-weather.js` 补 `readHomePrefs` 桩。全量 `node --test tests/*.js` **469 项全过、0 失败**（基线 460 + 本次 9）。
- 发版 / 部署：`release.sh 1.4.34` → `git push origin main` → `deploy-cloudbase.sh` 上传 116 文件，云端校验 `version.json` = 本地 = `1.4.34`。线上抽查：字典页 6 语言包与 `initDictionaryPage` 生效、设置页含 `hpInterval/hpPool`、首页铃铛位于问候行且天气卡内不再含铃铛。

## Batch 235（v1.4.35）— 用户反馈热修：字典 t 报错 / 铃铛白色圆形 / 轮播小时级与按日 ✅ 已完成并部署
针对消息 3 的 3 项反馈逐项处理：

1. **字典页内容显示「t is not a function」**：根因并非 i18n 时序（Batch 234 已把 `boot()` 延到 `DOMContentLoaded`，`window.t` 在 DCL 前已就绪，jsdom / 真实 chromium 均已验证）。真正根因在 `dictionary.html` 的 `render()` 内 `typeKeys.forEach(function(t){ ... t('dict.itemCount', ...) ... })`——循环变量 `t` 遮蔽了全局翻译函数 `t`，非空列表分支把「分类名字符串」当函数调用 → `TypeError: t is not a function`（被 `render` 的 `.catch` 吞掉并展示为「读取失败：t is not a function」）。修复：循环变量改名 `typeKey`，`t` 恢复指向全局翻译函数。真实 chromium 复现确认：修复前 `#list` 显示「读取失败：t is not a function」、修复后正常渲染「任务类型 / 3 项」等真实条目。
2. **通知铃铛恢复白色圆形（按用户澄清，不改位置）**：用户指出「不是白色铃铛、没有圆形背景，和之前在城市边上的不一样」，并澄清——**并非要求把铃铛移回城市旁，而是要恢复之前那种白色圆形的观感**（「在城市边上」是在描述旧效果长什么样）。故**保持铃铛在问候行（`.home-greet-main`、#homeGreeting 之前，位置不变）**，仅将样式由 Batch 234 的「弱存在感（无背景、与问候同色）」改回「白色圆形」：`pages.css` 以 `.home-greeting .bell-btn { background: rgba(255,255,255,.16); color:#fff; border-radius:999px }` 替换弱存在感规则。问候行本身是蓝渐变头部（`linear-gradient(135deg, var(--primary), var(--primary-dark))`），白色圆形铃铛落在其上即与旧版「城市边上」同款观感，且无需改动位置。
3. **首页短语轮播间隔太短 → 支持小时级与「一天一条」按日模式**：`settings.html` 的 `hpInterval` 在原 4/6/8/10/15 秒基础上新增 `1 小时(3600000)` / `2 小时(7200000)` / `4 小时(14400000)` / `一天一条（按日）(daily)`；`settings.js` 的 `saveHomePhrase` / `renderHomePhrase` 支持把 `daily` 以**字符串**原样读写 `rt_ui_prefs.homePhraseInterval`（不再误转 `Number` 得 `NaN`）；`app.js` 的 `startHomePhraseCarousel` 识别 `homePhraseInterval === 'daily'` 时，按 `dayIndex = Math.floor(Date.now()/86400000)` 确定性选取 `phrases[dayIndex % len]`，**整日不变、不轮播**，并每分钟检查跨日自动切换（长时间停留页面也不会滞留旧日短语）。固定间隔分支保持原逻辑（默认 8000ms，支持秒级与小时级）。
- **测试**：`tests/test-batch234-home-phrase-dict.js` 增 4 项（轮播新增小时级与 daily 选项、app.js 识别 daily 并按日序号确定性选取 + 跨日切换、settings.js 将 daily 原样写回、字典 render 循环变量不得遮蔽全局 t 的回归断言）；`tests/test-batch221-notify-icon.js` 第 4 项由「弱存在感」改为断言「白色圆形（透明背景 + 白色 + 圆角 999px）」。全量 `node --test tests/*.js` **473 项全过、0 失败**（基线 469 + 本次 4）。
- 发版 / 部署：`release.sh 1.4.35` → `git push origin main` → `deploy-cloudbase.sh` 上传，云端校验 `version.json` = 本地 = `1.4.35`。真实 chromium 验证：铃铛 computed style 为 `rgba(255,255,255,0.16)` / `border-radius:999px` / `color:rgb(255,255,255)`、位于 `.home-greeting` 内且 `#homeGreeting` 之前、不在 `.home-weather` 内；按日模式文案等于 `phrases[dayIndex % len]` 且 300ms 内不轮播；字典列表正常渲染无「t is not a function」。

## 七、Batch 222（v1.4.27）— 首页问候 / 天气 / 短语 ✅ 已完成并部署
1. **天气精准优化**：新增 `weatherQueryCity(raw)`，把天气城市聚合到地级市再查——「城市·区县」取「·」前地级市；裸区县名经 `RT_DISTRICT_TO_CITY`（由 `RT_CITY_DISTRICTS` 反查构建）上卷。原 `renderHomeWeather` 改以聚合后的地级市做地理编码与缓存键（按钮显示聚合城市），避免拿「市辖区/县」直接查 open-meteo 查不到；原 30 分钟天气缓存保留。
2. **问候/昵称/时间字号统一**：`pages.css` 中 `.home-greet-hi`（20px/700）、`.home-greet-name`（15px/600）、`.home-date`（13px/500）统一为「主→次→辅助」一致层级（一致字重与行高节奏）。
3. **时间下方短语轮播**：`home-greet-left` 的 `home-date` 下方新增 `#homePhrase`（带 `home.phrase-label` 标签）；`app.js` 新增 `RT_HOME_PHRASES_DEFAULT`（附录 A 12 条）与 `getHomePhrases()`（优先 `RT_CONFIG.homePhrases`，为空回退默认池）及 `startHomePhraseCarousel()`（每 4s 带淡入切换，重入先清旧定时器）；`renderHome` 调用启动；6 语言补 `home.phraseLabel`（今日短语 / 今日短語 / Today's phrase / 오늘의 문구 / 今日のひとこと）。
- 测试：`tests/test-batch222-home-greeting-weather.js`（11 项：天气区县聚合「城市·区县」与裸区县上卷、默认 12 条短语池、配置优先/空回退/空白过滤、短语元素与 i18n 键存在、字号与轮播样式存在）；全量 `node --test tests/*.js` **443 项全过、0 失败**（较 v1.4.26 的 432 +11）。
- 发版：v1.4.27，已 `git push` + CloudBase 部署，云端 version.json 校验一致（1.4.27）。
- 已知数据边角：`西湖区` 在 `RT_CITY_DISTRICTS` 同时归属杭州与南昌，裸区县名聚合取迭代末位（南昌）；但城市选择器存的是「城市·区县」格式，走「·」拆分路径总能正确命中地级市，故实际 UI 不受影响。

## 八、Batch 223（v1.4.28）— 首页空状态统一（初版细线，✅ 已完成，已被 Batch 224 彩色填充取代）
1. 提取「代办暂无」图标为 empty-state 组件 / 样式类，应用到任务、代办、Bug、会议、流程等所有创建页。
2. 空状态文案统一「暂无 xxx」，图标风格统一（同一套插画/线条风格，各场景可略有差异）。

### 完成说明（v1.4.28）
- **统一组件（report-shared.js）**：新增 `RT_EMPTY_ICONS`（box / task / bug / meeting / process 五套 Feather 同款线条 path，`stroke-width="1.5"`、`currentColor`）、`rtEmptyIcon(variant)`、`rtEmptyState(text, variant)`，并暴露 `window.RT_EMPTY_STATE`。放置于跨页共享层 report-shared.js（index.html 与全部 report-*.html 均加载，且早于 app.js / report-*.js 执行），无需新增脚本标签、不触碰 release.sh 资产清单；`escapeHtml` 全局可用并自带兜底。
- **去 emoji 📭**：替换 app.js（首页任务 3738/3750、代办 2604/2628、流程首页 1106）+ report-todo/task/meeting/bug.js 全部 `📭` 渲染点为 `rtEmptyState(...)`，源码已无任何 📭 渲染（仅注释提及）。
- **各场景差异**：task/todo→剪贴板勾、bug→甲虫、meeting→日历、process→分支、通用回退→收件箱（box）；全部线条风格一致。
- **CSS（overlays.css）**：`.empty-icon` 由 `font-size:48px` 改为 SVG 容器（56px、居中、`var(--muted)`、`opacity:.5`）；新增 `.empty > svg` 兼容 role.js / process.html 等既有内嵌 SVG 写法，使其尺寸风格一并统一；`.empty` 补 `line-height:1.7`。
- **代办补图标**：原「暂无代办」为无图标 `.empty-tip`，本次改用 `rtEmptyState('暂无代办','task')` 带统一图标（符合「提取『代办暂无』图标」意图）。
- **流程首页补图标**：app.js:1106 `.pi-home-empty` 由纯文本改为内嵌 `rtEmptyIcon('process')` + 文案；pages.css 新增 `.pi-home-empty > svg` 样式。
- **单测**：新增 `tests/test-batch223-empty-state.js`（7 项）——helper 存在性、统一结构无 📭、variant 映射差异与回退、转义防御、app.js / report-*.js 渲染点切换、CSS 类与尺寸；全量 `node --test` 430/0 通过。
- **发版 / 部署**：release.sh 1.4.28（47 文件）→ git push（f1697d8..6f3dcee）→ deploy-cloudbase.sh 上传 116 文件，云端校验版本 = 本地 = 1.4.28。
- 注：process.html:304 流程定义列表原已是 SVG 建筑图标（同线条风格），保持不动；`rm-empty` 等子区块非创建页主空态，未纳入本期范围。
- **被 Batch 224 取代**：用户反馈初版细线描边图标「没有原来的邮箱 📭 好看」，要求改回彩色填充（有颜色、实心填充，类似原 emoji 观感）。Batch 224 将 `RT_EMPTY_ICONS` 升级为彩色填充、扩展至全部页面，并改写对应单测。本批次（223）的细线实现已不再使用，仅保留历史记录。

## 九、Batch 224（v1.4.29）— 空状态图标彩色填充 + 全页扩展 ✅ 已完成（已被 Batch 225 emoji 取代）
> 用户反馈（223 发版后）：初版细线描边图标「没有原来的邮箱 📭 好看」，要求改回彩色填充（有颜色、实心填充，类似原 emoji 观感）；且不止首页，基础数据 / 通知 / 反馈 / 考勤 / 统计 / 流程等所有页面都要显示，风格一致，每个页面图案稍有区别。

1. **彩色填充取代细线**：`report-shared.js` 的 `RT_EMPTY_ICONS` 由「Feather 细线 path（stroke/currentColor）」升级为「Material 实心 path + 主题色填充」，结构改为 `{c:颜色, p:path}`；`rtEmptyIcon(variant)` 输出 `fill=主题色` + `fill-rule="evenodd"`（Material 实心 path 依赖 evenodd 镂空），统一 64px。共 **11 个 variant**：box(收件箱,#4C8DFF) / task(剪贴板,#4C8DFF) / bug(甲虫,#FF6B6B) / meeting(日历,#FFB020) / process(分支,#A78BFA) / notify(铃铛,#FFB020) / data(存储栈,#34C0FA) / stats(柱状图,#34C759) / feedback(气泡,#4C8DFF) / clock(时钟,#22C2B8) / search(搜索,#9AA5B1)。
2. **全页扩展**：已加载 `report-shared.js` 的页面（app.js / report-*.js）改用 `rtEmptyIcon(variant)` / `rtEmptyState(text, variant)` 传对应 variant；**不加载** `report-shared.js` 的基础数据 / 流程 / 统计等独立页，直接**内联同款彩色填充 SVG（同款 path / 颜色 / 属性）**，零依赖、风格一致。
   - app.js：首页任务 / 代办→`task`、流程首页→`process`、通知→`notify`、反馈→`feedback`、请假→`clock`、打卡聚合→`clock`。
   - 基础数据页（company / department / project / project-version / position / user / dictionary / role.js / permission.html）→ 内联 `data`（#34C0FA 存储栈）。
   - process.html / workflow.html → 内联 `process`（#A78BFA 分支）。
   - stats-view.js → 内联 `stats`（#34C759 柱状图）。
3. **CSS（overlays.css / pages.css）**：`.empty-icon` / `.empty > svg` / `.pi-home-empty > svg` 尺寸由 56px 放大为 **64px**，去除 `.empty-icon` 的 `opacity:.5`、`color:var(--muted)` 限制（彩色填充本身已具辨识度）；新增 `.notify-empty / .fb-empty / .lv-empty / .dayf-empty / .task-detail-empty / .changelog-empty / .home-weather-empty / .city-picker-empty > svg` 统一 64px 尺寸规则。
4. **去 emoji 📭**：全部空态渲染点源码已无 📭（仅注释提及）；彩色填充观感对标原 emoji。

### 完成说明（v1.4.29）
- 改动文件（16）：report-shared.js、overlays.css、pages.css、app.js、company / department / project / project-version / position / user / dictionary.html、role.js、permission.html、process.html、workflow.html、stats-view.js。
- 单测：`tests/test-batch223-empty-state.js` 由 7 项重写为 **11 项**（覆盖彩色填充结构 / 无描边 / 11 variant 主题色板 / 全页内联 SVG 路径与共享 variant 完全一致 / app.js 的 notify·feedback·clock·process 渲染点 / 64px 且无半透明等）；全量 `node --test tests/test-batch*.js` **433 项全过、0 失败**。
- 发版 / 部署：release.sh 1.4.29 → git push（GitHub TLS 抖动用 `for i in 1 2 3` 重试，不加 proxy）→ deploy-cloudbase.sh 上传，云端校验版本 = 本地 = 1.4.29。
- **被 Batch 225 取代**：用户再次要求统一回退为「邮箱 emoji 📭」并可在图标管理页配置（可替换图标），彩色填充实现（`RT_EMPTY_ICONS`）已不再使用，仅保留历史记录。

## 十、Batch 225（v1.4.30）— 空状态图标统一回退为邮箱 emoji 📭 + 可配置（图标管理）✅ 已完成并部署
> 用户再次逆转方向（224 彩色填充发版后）：不管彩色填充，要求**统一替换成之前的邮箱 emoji 📭**，做成**可配置项**（可替换图标）、**可在图标管理页显示与配置**，且**全局统一**（不按页面区分 variant）。

1. **注册 `empty` 默认 key**：`page-icons.js` 的 `defaults` 新增 `'empty' = <svg viewBox="0 0 24 24"><text>📭</text></svg>`（邮箱 emoji 内嵌 SVG，viewBox 24×24、可随容器缩放）；该 key 自动出现在「图标管理」列表，标签为「空状态图标」（`icon-manager.js` 的 `KEY_LABELS` 补 `'empty': '空状态图标'`）。
2. **全局统一渲染**：`config.js` 新增 `RT_EMPTY_ICON_DEFAULT`（📭 SVG 常量）与 `root.getEmptyIconHtml()`——优先返回 `RT_PAGE_ICONS.get('empty')`（含图标管理覆盖层），缺失回退默认 emoji；**忽略 variant**。
3. **回退 report-shared.js**：`rtEmptyIcon(variant)` / `rtEmptyState(text, variant)` 改为调用 `getEmptyIconHtml()`（忽略 variant），删除 `RT_EMPTY_ICONS` 彩色填充定义与 `RT_EMPTY_STATE.ICONS`；app.js / report-*.js 调用点不变。
4. **内联空态页改用 getEmptyIconHtml()**：company / department / project / project-version / position / user / dictionary.html、role.js、permission.html（静态占位 + `permission.js` 填充）、process.html、workflow.html、stats-view.js 移除硬编码彩色填充 SVG，统一走 `getEmptyIconHtml()`。
5. **覆盖层全页生效**：`page-icons.js` 模块加载即自动 `init()`（DOMContentLoaded，幂等）载入 IDB 覆盖层；给此前未引入本模块的 17 个空态页（index / index-nosw / 基础数据各页 / permission / role / workflow / 5 个 report 页）补 `<script src="page-icons.js">`，使「图标管理」对空状态图标的修改在**所有页面**生效；并在 `release.sh` 的 `PAGE_ICONS_PAGES` 登记这些页（缓存破坏随发版升级）。

### 完成说明（v1.4.30）
- 改动文件（21）：page-icons.js、icon-manager.js、config.js、report-shared.js、app.js（调用点复用、无需改）、company / department / project / project-version / position / user / dictionary.html、role.js、permission.html / permission.js、process.html、workflow.html、stats-view.js、index.html / index-nosw.html、report-todo / task / meeting / bug / stats.html、release.sh（`PAGE_ICONS_PAGES` 登记）。
- 单测：`tests/test-batch223-empty-state.js` 重写为断言 emoji 📭 + 全局统一（忽略 variant）+ 可配置（set 覆盖 / reset 回默认）+ 内联页无彩色 fill + `KEY_LABELS` 含 empty；`tests/test-batch191-icons.js` #10 对 `empty` 加 `EMOJI_EXCEPTION` 豁免白线断言。全量 `node --test` **453 项全过、0 失败**。
- 发版 / 部署：release.sh 1.4.30 → git push → deploy-cloudbase.sh 上传，云端校验版本 = 本地 = 1.4.30。

## 十一、Batch 226（v1.4.33）— 日历与考勤（上）：清理 / 周末假期 / 打卡分上下午
1. 首页日历下方移除「统计」「待我审批」入口（与 TAB 重复）。
2. 今日考勤区域识别周末 / 假期，显示「周末」或「假期」。
3. 周末点颜色改为绿色（当前为灰色）。
4. 打卡状态分上下午：整天正常 → 已打卡；上午迟到 → 上午红点；下午早退 → 下午红点；迟到 + 早退 → 显示一个红点；请假同理（一眼看出上午或下午有问题）。

## 十二、Batch 227（v1.4.34）— 日历与考勤（下）：颜色统一 / 事件类型 / 云端时间
1. 首页迷你日历与日历 TAB 颜色提示统一（周末绿、打卡状态色、请假 / 外出 / 出差色）。
2. 考勤相关颜色统一走 `CLOCK_STATUS` / `STATS_COLOR` 字典（已存在，检查消费侧是否全部使用）。
3. 日历新增事件类型：外出（黄色）、出差（紫色）；正常打卡用系统色；日历页面上下班打卡时间无颜色时默认系统色。
4. 日历周末淡红色背景改为淡绿色。
5. 打卡时间采用云端（服务端）时间：设计上优先取服务端时间，本地 NTP 兜底；需后端 / CloudBase 函数支持，或先做 NTP 估算。

## 十三、Batch 228（v1.4.35）— 设置清理与个人信息
1. 设置主页移除底部 12 模块内容预览，仅保留子菜单入口。
2. 以下子页只展示自身模块内容，移除不属于本页的模块：通知、界面与展示、系统权限、下载地址、云同步、使用说明、意见反馈。
3. 个人信息页「基本信息」「组织信息」从卡片框内移出，像登录设备页一样直接展示（统一卡片风格）。
4. 登录设备记录每次登录信息（UA、时间、近似 IP），至少按账号展示历史登录列表；设计设备指纹 / 会话标识，登录时写入 `login_devices` store。

## 十四、Batch 229（v1.4.36）— 设置展示与反馈
1. 修复基础数据页（职位管理等读取字典的下拉 / 列表）使用系统默认字体问题，强制 PWA 统一字体。
2. 「界面与展示」新增字体选择：默认字体、通用无版权字体列表、手机系统字体；持久化到 `RT_CONFIG`，通过 `body` class / style 切换 `--font-base`。
3. 「界面与展示」新增「宽屏适配」开关（默认关闭），在 `<html>` / `<body>` 挂 `data-layout="wide" / "phone"` 类，Pad 端用 media query + 该 class 切换布局，为后续 WEB 后台留接口。
4. 修复意见反馈提交失败：读取 `feedback.js` / 对应子页，定位必填校验、`feedback` store 注册、网络接口、i18n key 未定义导致的抛错。
5. 意见反馈页显示图标；流程管理、流程审批页图标保持一致。

## 十五、Batch 230（v1.4.37）— 导出（本地/邮箱/腾讯文档）与初始化示例入口
1. **导出弹框（改交互）**：阻止默认自动下载，导出时先弹框让用户三选一——「导出到本地」「导出到个人邮箱」「导出到腾讯文档」（区别见附录 B）；本期三种目标均落地（见下 2–4）。
2. **统一 Excel 格式（SheetJS）**：前端引入 SheetJS 等库，所有导出统一生成真 `.xlsx`（带表头、多 Sheet 可选），替代原 CSV/JSON；本批次内完整完成，作为三个目标的共用产出。
3. **导出到个人邮箱（统一方法）**：设置页「账号与安全」新增「接收邮箱」配置（QQ/163/任意）；云端发信函数用**我们自己的发件账号**统一发信、把 Excel 作为附件发到该地址——一套机制覆盖所有邮箱，用户**无需填 SMTP 密码**（避开 QQ 授权码等差异化）。本批次完成前端 + 发信函数骨架；真实发信依赖我们配置发件账号（SMTP/SES），凭证未就绪时按钮提示「邮箱服务未配置」。
4. **导出到腾讯文档（Excel，轻量路线）**：本地用 SheetJS 生成 `.xlsx` 后提供「用腾讯文档打开」入口（拉起 `docs.qq.com` 并引导手动导入/上传），本期不走 OAuth 全自动建表（全自动路线留待后续）。实现「生成文件 → 一键跳转腾讯文档」闭环。
5. **设置页「初始化示例」入口**：新增入口（触发 Batch 232 直接生成 5 个工作流及模板；入口文案见 i18n `settings.initExamples`），仅做入口与调用，工作流与模板的真实生成逻辑在 Batch 232。

## 十六、Batch 231（v1.4.38）— 表单模板增强
1. 表单模板字段类型增加「单选框」。
2. 字段占位提示（placeholder）含义明确化：配置侧显示「输入框未填写时的灰色提示文案」。
3. 流程图标选择改为图案展示，不再显示文字。
4. 默认图案库：研发流程、请假流程、项目申请、出差申请、外出申请等。
5. 根据流程名称关键字自动生成默认图标（可配置映射表）。

## 十七、Batch 232（v1.4.39）— 工作流增强：职位审批 + 直接生成工作流
1. 工作流节点审批人支持「职位」维度：节点 `approver` 字段扩展为对象 `{type:'user'|'position', value}`，字符串向后兼容按 `user`；审批时按申请人所属分公司 / 部门解析到职位上的人员（如「分公司经理」）；多人支持或签（会签预留）。
2. 实现「初始化示例」：直接生成需求中 5 个工作流（请假、外出、出差、项目申请、研发流程）+ 对应表单模板。

## 十八、Batch 233（v1.4.40）— 日历与流程关联
1. 流程实例增加 `calendarEvent` 字段（类型、起止时间、标题、颜色）。
2. 审批通过后由审批引擎把流程实例转换为日历事件写入 `calendar_events`；日历 TAB 读取并展示请假 / 外出 / 出差结果，颜色与事件类型字典对齐（本期做设计 + 基础写入 / 读取，复杂联动后续批次）。

## 十九、全局贯穿项（随批次落实）
1. 标签栏与菜单栏名称一致性：每改一个页面顺手核对，不一致则改为与菜单栏名称一致。
2. 更新日志补批次号：本次各批次条目写入批次号，并补全历史缺失批次号的条目。
3. 宽屏选择接口预埋（见 Batch 229 第 3 项）。

## 二十、改动概览

### i18n（六语言对称）
- `app.title` / `app.shortName` → 改为「微枢」。
- `home.greeting.*`、`home.phrase.*`（轮播短语，含开关与默认池 key）。
- `home.todayStatus.weekend`、`home.todayStatus.holiday`、`home.clock.amLate`、`home.clock.pmEarly` 等。
- `calendar.type.outing`、`calendar.type.businessTrip`。
- `settings.font.*`、`settings.wideScreen.*`、`settings.initExamples`。
- `export.toLocal`、`export.toEmail`、`export.toTencentDocs`、`export.emailNotConfigured`。
- `feedback.submitFailed`、`feedback.submitSuccess`。
- 现有 `dict.*`、`perm.*` 补充错误提示 key。

### 数据层（可能新增 / 扩展 store）
- `login_devices`（登录设备记录）。
- `calendar_events`（日历事件，或扩展现有日历结构）。
- `feedback`（若当前没有）。
- `workflows` / `processes` 扩展：审批人职位、表单单选框、图标。

### 权限注册表
- 新增 / 登记 `data-perm`：导出弹框权限、职位审批权限、日历事件查看权限等（按具体设计补）。

### release.sh
- 每新增 / 修改的 html/js/css 在对应块补 `patch_ver`；`check_ver` 漂移扫描兜底。
- 字典页若新增 `i18n.js` 引用，需在对应页面块登记。

## 二十一、测试计划
| 类型 | 内容 |
|------|------|
| 单元测试 | 各批次新增 `tests/test-batch219-*.js` 等：权限事务、字典播种、日历状态、设置过滤、导出状态机、工作流职位解析、表单单选框。 |
| 全量回归 | 每批次 `node --test tests/`；当前基线 408 项 / 7 失败（预存 / 环境），目标不新增失败。 |
| 真机验证 | 华为浏览器 / Chrome：首页通知与城市选择、字典页、权限页、日历颜色、设置子页、导出弹框。 |
| 版本一致性 | `release.sh` 后 `version.json` / 云端 `version.json` / `index.html` APP_VERSION 一致。 |

## 二十二、风险与依赖
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
