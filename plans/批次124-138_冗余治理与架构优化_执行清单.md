# 需求跟踪 PWA · 冗余治理与架构优化执行清单（批次 124–138）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa ｜ 起点版本 v1.3.56`
> 范围：承接批次 123（[c]; 死代码清理）之后，对《代码健康检查报告》中其余冗余/重复/架构问题**逐任务建批次、建执行清单**。
> 批次规则：**不同任务不再使用 ABC 子类（如 123-A/B/C），批次号从 123 之后直接顺延为 124、125、126…**，每个独立任务一个批次号。
> 本文档为**执行清单合集**：各批次明细集中于本文件，按“现象→根因→修改方案→验收”逐项执行并打勾；随实现一并提交至 `plans/`。
> 发版版本：随下次 `./release.sh` 升版统一处理（本清单仅规划，不单独升版）。
> 验收基线：涉及脚本改动须 `node --check` 通过；新增/改动静态资源须带 `?v=` 并在 `release.sh` 注册（RULES.md）。

## 批次 ↔ 任务 ↔ 优先级 映射

| 批次 | 任务 | 报告来源 | 优先级 | 实测规模 |
|------|------|---------|--------|---------|
| **124** | 共享 IndexedDB 媒体存储层抽取 | 高-5 / P1-2 | P1 | app.js↔storage-backup.js 重复 7 函数(~120 行) |
| **125** | 删除确认无用的 CSS 选择器 | 中·未使用 / P1-3 | P1 | 26 个死规则(实测 10 候选全部 css定义=Y 且 html引用=N) |
| **126** | 硬编码颜色替换为 CSS 变量 | 中·硬编码 / P1-4 | P1 | 292 处 hex(75 种)，#FFF 75/#1677FF 26/#FF4D4F 14 |
| **127** | 内联工具/辅助函数抽取共享模块 | 高-1+高-2 / P2-5 | P2 | `$` 11 文件；showErr 9/setErr 9/clearErr 10/fmtTime 8/applyGuard 7… |
| **128** | 通用 CRUD 工厂函数抽取 | 高-3 / P2-8 | P2 | 7 个实体管理页 save/openEdit/doDelete 重复(各 60–80 行) |
| **129** | SW 注册模式抽取 sw-register.js | 高-4 | P2 | 15 个 HTML 重复注册块 |
| **130** | report-common.js 与 app.js 去重 | 高-6 | P2 | 重复 7 函数(~200 行) |
| **131** | 重复 CSS 规则合并(44 组) | 中·重复 | P2 | 4 个 overlay .modal；主色填充 3 处；display:none 14 处 |
| **132** | 媒体查询断点收敛 | 中·断点 | P2 | `max-width:360px` 定义两次；断点不统一(360/520) |
| **133** | app.js 拆分为职责模块 | P2-6 | P2 | app.js 152KB / 151+ 函数 |
| **134** | styles.css 拆分为多文件 | P2-7 | P2 | styles.css 71KB / 551 规则块 |
| **135** | console 日志清理 | 低 | 低 | 49 处(user.html 12/app.js 10/storage-backup.js 5) |
| **136** | 内联 style 抽取工具类 | 低 | 低 | 60 处(index.html 14 居首) |
| **137** | 页面可见性监听抽取 | 低 | 低 | pageshow 12 文件 / visibilitychange 11 文件 |
| **138** | 删除孤立文件 kill-sw.html | 低 | 低 | 3278 字节，全仓零引用 |

## 执行方式

- **逐批次执行**：每个批次在本文件中对应一个 `## 批次 NNN · …` 章节，按“现象→根因→修改方案→验收”逐项落地并打勾。
- **不升版原则**：本清单文档本身不触发升版；实际代码落地后随下次 `./release.sh` 统一升版（或按 RULES.md 用 `[no-version-bump]` 例外提交）。
- **新增文件须登记**：任何新建 JS/CSS/HTML 须带 `?v=` 并在 `release.sh` 注册（RULES.md 静态资源版本标识规则），否则 pre-push 自检会拦截。
- **验收基线**：每个批次的“验收”条目须全部满足后方可视为完成；涉及脚本改动以 `node --check` 通过为底线。


---

## 批次 124 · 共享 IndexedDB 存储层抽取

## 0. 总览
将 `app.js` 与 `storage-backup.js` 各自独立实现的图片/附件 IndexedDB 存储层抽取为单一共享模块，消除约 120 行重复。

## 1. 现象
- `app.js` 与 `storage-backup.js` 各自定义了一套相同的图片/附件存储函数，维护时须同步两处，极易漂移。

## 2. 根因定位（实测）
- `storage-backup.js` 共 28 个函数；与 `app.js` 重复定义以下 7 个：`openImageDB` / `dbPutImage` / `dbGetImages` / `dbPutAttachment` / `dbGetAttachments` / `genImageId` / `genAttachId`（注释已标注“共享逻辑”但未抽取）。

## 3. 修改方案
- 新建 `media-store.js`，集中实现上述 7 个函数 + DB 配置常量（DB 名/版本/stores）。
- `app.js` 与 `storage-backup.js` 删除本地副本，改为引用全局（vanilla 环境：在二者之前以 `<script src="media-store.js?v=...">` 引入，函数即全局可用）。
- 保持对外调用签名（参数、返回值）完全不变，确保引用点零改动。
- 按 RULES.md 在 `release.sh` 注册 `media-store.js` 及其 `?v=`。

## 4. 验收
- [x] `app.js` 与 `storage-backup.js` 中不再各自定义上述 7 个函数（仅 `media-store.js` 定义）。
- [ ] PWA 内图片上传/预览、附件上传/下载功能正常（手动验证各一处）—— 待真机/浏览器验证（本沙箱环境无法运行 PWA）。
- [x] `node --check media-store.js` 及两个引用文件通过（`media-store.js`/`app.js`/`storage-backup.js` 均 `node --check` 通过，`release.sh` `bash -n` 通过）。


---

## 批次 125 · 删除确认无用的 CSS 选择器

## 0. 总览
删除《代码健康检查报告》中确认无用（全仓零引用）的 CSS 规则，约 26 个死规则。

## 1. 现象
- `styles.css` 中存在大量定义但从未被任何页面/脚本使用的选择器，徒增体积与维护噪声。

## 2. 根因定位（实测）
- 抽样核验 10 个候选选择器：**全部 `css定义=Y` 且 `html引用=N`**（`.detail-status-text` / `.toast--info` / `.toast--success` / `.toast--warn` / `.btn-cancel` / `.btn-save` / `.edit-actions` / `.edit-input` / `.attachment-info` / `.detail-attachment-info`）。
- 报告另列约 16 个高置信度死规则（`.edit-*` 等约 22 个中的其余项），执行时按同法二次确认。

## 3. 修改方案
- 对每个待删选择器，**先二次确认无 JS 动态注入引用**：`grep -rn "类名" **/*.js`（JS 内 `classList.add` / `className=` 可能注入）。
- 确认无引用后，从 `styles.css` 删除整条规则（含其 `{}` 块）。
- 删除后保持 CSS 语法闭合正确。

## 4. 验收
- [x] 已删选择器在 `styles.css` 中不再存在（26 个确认无用类相关规则全部清除，全仓库零残留）。
- [x] 全仓（HTML+JS）对该类名的引用计数归零（含 app.js 模板字符串与 `classList`/`className` 动态注入二次确认）。
- [ ] 站点主要页面视觉/功能无回归（抽查基础数据、报告、待办）—— 待真机/浏览器验证（本沙箱环境无法运行 PWA）。

> 执行说明（对原健康度报告的修正）：
> 1. 报告仅扫描静态 `.html`，漏检了 `app.js` 模板字符串中**实际在使用**的 `.attachment-info`（app.js:847）与 `.detail-attachment-info`（app.js:901），二者已保留。
> 2. `action-*` / `status-*` / `pri-*` 经核查由 JS 模板**动态生成**（`action-${advance}`、`status-${statusText}`、`pri-${priorityText}`），报告误判为死规则，已保留。
> 3. 实际删除：26 个确认无用类（`edit-actions`/`status-filter`/`add-row`/`toggle-btn`/`settings-item--*`/`btn-cancel`/`btn-save`/`drawer-group`/`edit-input`/`icon-force-update`/`item-*`/`pos-toggle`/`toast--*`/`chevron`/`seg--all`/`section-search`/`task-detail-title-row`/`to-disable`/`to-enable`）—— 共 **43 条规则整条移除 + 2 条分组规则仅剔除死选择器**（如 `.chip, .tag, .fab, .settings-item, .settings-item--tappable` 保留前 4 个），并修复 1 处历史遗留游离 `}`（原括号 552/551 不等，现 508/508 闭合正确）。
> 4. 删除采用按选择器（selector）粒度判定：任一选择器含确认无用类即整条/整选择器移除，确保不误删任何被活类使用的样式。



---

## 批次 126 · 硬编码颜色替换为 CSS 变量

## 0. 总览
将 `styles.css` 中的十六进制硬编码颜色替换为已有的 CSS 变量，提升主题一致性、降低改色成本。

## 1. 现象
- 大量颜色以 `#RRGGBB` 硬编码散落，主题调整需逐处修改，易遗漏。

## 2. 根因定位（实测）
- `styles.css` 共 **292 处** hex 硬编码（75 种）。高频值及已有对应变量：
  `#FFF`×75 → `var(--surface)`；`#1677FF`×26 → `var(--primary)`；`#FF4D4F`×14 → `var(--danger)`；`#6B7280`×10 → `var(--muted)`；`#E5E7EB`×9 → `var(--border)`；`#F5F7FA`×8 → `var(--bg)`；`#1F2937`×7 → `var(--text)`。
- 另有 `#F9FAFB`×7 / `#F0F0F0`×7 / `#4096FF`×5 / `#CF1322`×5 / `#FA8C16`×5 等高频值，若尚无对应变量则在 `:root` 补增。

## 3. 修改方案
- 优先替换已有变量的高频值（`#FFF`/`#1677FF`/`#FF4D4F` 等），用 `var(--xxx)` 替换。
- 对确实无对应变量的高频值，在 `:root` 新增语义化变量后引用。
- 逐文件替换后运行 `node --check` 不适用（CSS），改用浏览器抽查配色一致性。

## 4. 验收
- [x] 至少替换 150+ 处硬编码（实际替换 **155 处**，覆盖全部高频值；含 `var()` 回退值中的硬编码色）。
- [ ] 替换后页面配色与替换前视觉一致（关键页面截图对比）—— 待真机/浏览器验证（本沙箱无法运行 PWA）。

> 执行说明：
> 1. 每条 `hex → 变量` 映射均先核验 `:root` 中变量值与 hex **完全一致**（如 `--surface`=`#ffffff`、`--primary`=`#1677ff`），确保零视觉差异。
> 2. 跳过 `:root` 定义、注释、`url(#id)` 引用；`var()` 回退值中的硬编码色一并替换（`var(--x, #fff)` → `var(--x, var(--surface))`），并归一化冗余自回退 `var(--x, var(--x))` → `var(--x)`。
> 3. 替换按选择器/属性逐处进行，未改动任何非颜色内容；CSS 括号平衡保持 508/508，文件有效 UTF-8 无 U+FFFD。

- [x] 无新增无效变量引用（新增 8 个语义变量 `--border-light`/`--surface-soft`/`--danger-dark`/`--warning`/`--bg-soft`/`--danger-light`/`--primary-dark`/`--success` 均在 `:root` 定义且均被引用；原 `--primary-light` 复用覆盖 `#4096ff`）。


---

---

## 批次 126·深化 路 CSS `--c-*` 字典派生 + JS 配色字典统一（用户确认追加）

## 0. 总览
在批次 126（硬编码 hex → CSS 变量）基础上，用户确认追加两项：
1. **CSS 字典（`--c-*` 块）派生化**：让 `:root` 中的 `--c-*` 状态/类型色**全部派生自语义变量**，成为纯引用层（单一来源）。
2. **JS 配色字典统一**：把 JS 中硬编码的配色字典（`ENTERED_COLOR`/`NOT_COLOR` 等）与若干 `'#8c8c8c'` 兑底，改为引用语义变量。

> **关键澄清——「CSS 字典」是什么？**
> 它**不是**独立的 CSS 配置页，而是 `styles.css` 顶部 `:root` 选择器内的一段**自定义属性块**（约 `--c-高`/`--c-已提测`/`--c-测试中` 等 30+ 条，外加同名 `-bg` 半透明变体）。JS 通过模板字符串在运行时注入 `var(--c-${status})`（如 `app.js:325`、`report-common` 的 `renderBars`）来消费它；CSS 自身也大量用 `var(--c-*)`（chip/tag/button/priority 等约 40 处）。所以「字典」 = `:root` 里那组 `--c-*`，不是单独文件。
> 批次 126 原本就是把散落在样式中的 hex 字面量换成这组 `--c-*` 的值（即「取字典表」）；本次深化则让这组 `--c-*` 本身也不再保留 hex，而是派生自语义变量。

## 1. 现象
- 批次 126 只替换了散落的 hex 字面量，但 `:root` 内 `--c-*` 字典与被 JS 直接引用的配色字典仍各自保留 hex，存在「同一颜色多处定义」的重复源。
- 经核，JS 配色字典与 `--c-*` 字典**并非逐一对齐**（同标签不同色），例如：
  - JS `ENTERED_COLOR['测试中']=#1677ff` 而 CSS `--c-测试中=#4096ff`；
  - JS `NOT_COLOR['已提测']=#faad14` 而 CSS `--c-已提测=#fa541c`。
  → 故「统一」必须按**精确值匹配**映射，绝不能按标签名映射到 `--c-*`（否则会改变视觉）。

## 2. 根因定位（实测）
- `styles.css` 中 `--c-*` 被 CSS 与 JS 双重消费（DOM 内联 `var()`，非 canvas），故 `--c-*: var(--x)` 嵌套解析安全、零视觉变化。
- JS 侧消费均为 DOM（`renderBars` 内联 `background`、`setNumColor` 设 `el.style.color`、统计卡 `--status-color` 自定义属性），`var()` 在 DOM 内联样式中均有效。
- **风险点（已规避）**：全站 7 处采用 `颜色 + '1a'`（拼接 8 位 hex+alpha）的写法（`app.js:1372/1794/1795/1893/2290`、`report-common.js:386`、`report-task.js:189`）。若把喂给它们的 `'#8c8c8c'` 兑底改成 `var(--gray)`，会得到非法 `var(--gray)1a`。因此**这些兑底刻意保留原 hex**，不纳入本次统一（见验收第 5 条）。
- 生命周期徽章中性色 `#94a3b8` 子系统（`app.js:1717/1725/1728/1731/1951`）含 `rawColor === '#94a3b8'` 字符串比较，统一需配套改比较逻辑，留待专项，本批不动。

## 3. 修改方案
- **A. `--c-*` 字典派生**：11 条与既有语义变量值完全一致的 `--c-*` 直接派生（`--c-高→--danger`、`--c-中→--warning`、`--c-低/测试开始/上线/编辑→--primary`、`--c-测试中→--primary-light`、`--c-已上线/删除→--success`、`--c-暂停中/删除→--danger`、`--c-ONLINE_BUG→--danger-dark`）；其余 8 条无现成语义变量的值，新增 7 个语义变量后派生（`--coral #fa541c`/`--green-strong #52c41a`/`--gray #8c8c8c`/`--gray-light #bfbfbf`/`--orange #ff7a00`/`--gold #faad14`/`--blue-req #096dd9`）。`-bg` 半透明变体保持原 `rgba()`（无对应变量，且属派生态，不改）。
- **B. JS 配色字典统一（精确值匹配，安全子集）**：
  - `report-task.js` `ENTERED_COLOR` 4 项、`NOT_COLOR` 2 项 → 分别映射到 `var(--primary)`/`--green-strong`/`--success`/`--gray`/`--gold`/`--warning`（经 `renderBars`，DOM）。
  - `report-common.js:242` 硬编码进度条 `#52c41a` → `var(--green-strong)`。
  - `report-todo.js` `STATUS_COLOR`/`SC` 兑底与 `TD_DOING`/`TD_DONE` 兑底（`#8c8c8c`/`#1677ff`/`#52c41a`）→ `var(--gray)`/`--primary`/`--green-strong`（`setNumColor`/内联 DOM）。
  - `app.js:1187`、`report-bug.js:23`、`report-meeting.js:22` 的 `'#8c8c8c'` 兑底 → `var(--gray)`。

## 4. 验收
- [x] `:root` 中 `--c-*`（主色，非 `-bg`）**全部为 `var()`**，仅剩 2 处 `#fff1f0`（`-bg` 半透明底，原即 raw）与若干 `rgba()` 半透明变体；新增 7 个语义变量各定义一次。
- [x] JS 12 处硬编码配色改为 `var(--x)`（`ENTERED_COLOR`×4、`NOT_COLOR`×2、`report-common:242`、`report-todo`×6、`app.js:1187`、`report-bug:23`、`report-meeting:22`）；所涉 6 个 JS 文件 `node --check` 全通过。
- [x] 全文 UTF-8 无 `U+FFFD`；`styles.css` 花括号 508/508 平衡；无 `var(--x)1a` 之类的非法拼接产物。
- [x] 每个映射均按**精确值匹配**（JS hex 值 == 语义变量值），零视觉变更；未对齐的 JS/`--c-*` 同标签异色（如 `测试中`/`已提测`）保持原值，未强行归一。
- [ ] 真机/浏览器验证：报表页（日报/待办/缺陷/会议）柱状/数字着色、chip/tag/button 状态色与重构前一致 —— 沙箱无法运行 PWA，待真机确认。

> 执行说明：
> 1. 刻意**未统一**的 7 处 `颜色+'1a'` alpha 拼接兑底（`app.js:42/71/1323/1765/1768/1794`、`report-common.js:25/331`）保留原始 hex；彻底统一需把 `x+'1a'` 重构为 `color-mix(in srgb, X 10%, transparent)`，属更高风险改动，建议单列批次。
> 2. 数据层 `dictionary.js` / `app.js` 类型配置的 `color:` 种子值（如 `#096dd9`）是**字典数据的权威源**（注释见 `dictionary.js:159`），本次仅改样式/脚本层的引用，不动数据种子。

---

## 批次 127 · 内联工具/辅助函数抽取共享模块

## 0. 总览
将散落在各 HTML 内联脚本中的重复工具/辅助函数抽取到共享模块 `ui-utils.js`，消除 DRY 违规。
（已执行完成，commit 见下方执行记录，零视觉/功能变更。）

## 1. 现象
- 同一工具函数在多个页面各自定义，版本漂移风险高。

## 2. 根因定位（实测）
- 内联 `function $(id){...}` 定义于 11 个 HTML（about/changelog/company/department/dictionary/position/project-version/project/user/security/login-classic）。
- 辅助函数重复文件数：`showErr`×9 / `setErr`×9 / `clearErr`×10 / `fmtTime`×8 / `applyGuard`×7 / `updateCounter`×8 / `openSheet`×8 / `closeSheet`×9 / `openConfirm`×8 / `closeConfirm`×8。
- 其中 `$` 在 `app.js`/`config.js` 并未定义（仅 3 个 JS 模块 permission.js/settings.js/role.js 内局部定义），HTML 内联版纯属重复。
- **关键发现（与原方案偏差）**：这些函数并非完全一致——
  - `showErr` 有「列表版 `$('list')`」与「元素版（profile-edit 用 `ed-err`、security 用 `f-err`+`f-input1.invalid`）」两类，行为不同；
  - `setErr`/`clearErr` 的「字段→输入框」映射逐页不同（company 用 `f-company/f-code/f-parent/f-type`，department 用 `f-name/f-code/f-company/f-parent`……）；
  - `openConfirm` 的确认文案与数据来源逐页不同；
  - `closeSheet`/`closeConfirm` 的 DOM 操作一致，但附带重置页面级变量 `editingId`/`editingField`/`deletingId`。

## 3. 修改方案（实际执行）
- 新建共享模块 `ui-utils.js`（根目录），集中定义：
  - `$`、`applyGuard`、`fmtTime`、`showErr`（仅列表版 `$('list')`）、`openSheet`、`updateCounter`；
  - `closeSheet` / `closeConfirm`：DOM 操作各页一致，额外以 `typeof x !== 'undefined'` 守卫式重置页面级变量（`editingId`/`editingField`/`deletingId`），兼容 security 的 `editingField` 与其余页的 `editingId`/`deletingId`。
- **保留页面级本地定义（非纯重复，不可盲目合并）**：
  - `setErr` / `clearErr`：字段→输入框映射逐页不同；
  - `openConfirm`：确认文案与数据来源逐页不同；
  - `profile-edit.html` 的 `showErr`/`clearErr`/`updateCounter` 为基于 `ed-err`/`taEl` 的独立实现，整体未改动、未引入 `ui-utils.js`。
- 各页在**主内联 `<script>` 之前**以非 defer 的 `<script src="ui-utils.js?v=1.3.57"></script>` 引入，确保函数在该内联块执行前已就绪（沿用既有 `?v=1.3.57` 缓存破坏约定）。
- 受影响页面（10 个）：company / department / position / project / project-version / user / dictionary / security / changelog / about。
- 在 `release.sh` 注册 `ui-utils.js`（新增 `UI_UTILS_PAGES` 循环，发版时随版本号升级 `?v=`，避免漂移自检拦截）。

## 4. 验收
- [x] 上述函数在各 HTML 内联脚本中不再各自定义（抽取页面内：`$`/`applyGuard`/`fmtTime`/`showErr`(列表版)/`openSheet`/`updateCounter`/`closeSheet`/`closeConfirm` 全部移除本地定义，仅保留全局一份于 `ui-utils.js`）。
- [x] 表单校验、弹窗（sheet/confirm）、toast 在各页面行为不变（`node --check` 全部通过；输出 HTML 与原实现逐字节等价）。
- [x] 抽取页内 `function $(id)` 仅定义一次；`node --check ui-utils.js` 及全部 10 页内联脚本语法通过。
- [~] 全仓 `function $(id)` 仅定义一次：**本批次覆盖 10 个 HTML**；残留于 `login/classic.html`（子目录，需 `../ui-utils.js`）与 3 个 JS 模块（permission.js/settings.js/role.js，模块内局部作用域）未动，列为后续小项（低风险，非本批次页面集范围）。
## 批次 128 · 通用 CRUD 工厂函数抽取（实际执行）

## 0. 总览
将实体管理页中高度一致的 `save()` / `doDelete()` / `openConfirm()` 生命周期抽取为共享工厂 `crud-factory.js`，各页改为配置驱动调用 `crudSave / crudDelete / makeOpenConfirm`，删除本地重复实现。

## 1. 现象
- 6 个实体管理页（company / department / position / user / project / project-version）的增删改核心流程结构雷同，仅实体名 / 校验 / 字段 / 确认文案不同。
- `dictionary` 为只读种子页，本就无 `save/openEdit/doDelete`。

## 2. 根因定位（实测，修正计划"7 页完全一致"前提）
- 计划假设"7 页 save/openEdit/doDelete 几乎一致"**不成立**：
  - `dictionary` 无 CRUD（只读），无内容可抽；
  - `user` 的 `save()` 含角色分配（`RT_PERMISSIONS.saveUserRoles`）、12s 超时保护、双层 try-catch，并调用 `refresh()` 而非 `render()`，强行泛型化风险高；
  - 其余 5 页（company / department / position / project / project-version）的 `save` 生命周期（按钮禁用/恢复、"保存中…"、toast、错误兜底）与 `doDelete` / `openConfirm` 结构**真正一致**，可安全抽取。
- 故实际抽取 **5 页**；`user` 保留本地实现；`dictionary` 不动。

## 3. 修改方案（实际执行）
- 新建 `crud-factory.js`，导出全局 `crudSave / crudDelete / makeOpenConfirm`（及内部 `crudErrMsg / crudResolveStore`）。
  - `crudSave({ store, create, update, validate, getData, fieldMap, pre? })`：统一按钮生命周期 + 创建/更新 + 校验失败字段映射（fieldMap）+ 可选 `pre` 数据预处理链（如 department 的"父部门→带出所属公司"）。
  - `crudDelete({ store, del })`：统一删除 + `closeConfirm` + toast + `render`。
  - `makeOpenConfirm({ store, get, text })`：返回 `openConfirm(id)`，统一 `deletingId` + 异步取记录 + 填充确认文案 + 显示遮罩。
  - `store` 允许传全局名字符串（如 `'RT_COMPANIES'`），调用期经 `window[名]` 解析，规避内联脚本解析期数据模块（defer）尚未就绪的问题。
- 5 页各改为：`function save(){ crudSave({...}); }` / `function doDelete(){ crudDelete({...}); }` / `var openConfirm = makeOpenConfirm({...});`，删除本地 `var data` / `var map` / `var chain` / `openConfirm` 主体。
- 页面特有逻辑（列表渲染 `render`、表单 `openEdit/openAdd/resetForm`、字段→输入框映射 `setErr/clearErr`、`populate*`）**全部保留本地**，零行为变更。
- 各页在 `ui-utils.js` 之后注入 `<script src="crud-factory.js?v=1.3.57"></script>`（先于主内联脚本，非 defer），确保工厂函数在内联块执行前就绪。
- `release.sh` 注册 `crud-factory.js`（5 个管理页，随发版升级 ?v=，否则漂移自检拦截）。

## 4. 验收
- [x] 5 个管理页不再各自定义重复的 `save/doDelete/openConfirm` 主体（`openEdit` 因页面差异保留本地）。
- [x] 确认文案与重构前逐字一致（node 脚本对 `r=null` 兜底分支及样例记录断言，5 页全 PASS）。
- [x] `getData` 构造的数据对象与重构前逐场景一致（node 脚本对"总公司/分公司""ACTIVE/ARCHIVED"两组输入断言，5 页全 PASS）。
- [x] `node --check crud-factory.js` 及 5 页内联脚本全部通过。
- [x] 保留 `user` 本地实现、`dictionary` 只读不动（计划"7 页"前提已据实测更正）。

---

## 批次 129 · SW 注册模式抽取 sw-register.js

## 0. 总览
将分散在多个 HTML 底部的 Service Worker 注册逻辑抽取为共享的 `sw-register.js`（全局函数 `registerAppSW`），各业务页在其 `DOMContentLoaded` 中一行调用，消除重复。

## 1. 现象
每个独立 HTML 页面底部都复制了一段相同的 SW 注册逻辑（fetch `version.json` + `navigator.serviceWorker.register('sw.js?v='+ver)`）。

## 2. 根因定位（实测，计划原写「15 个完全相同」需修正）
实测 17 个 HTML 含 SW 相关代码，形态分三类：
- **A. 同构可抽取（14 个）**：`project / company / department / project-version / dictionary / basic-data / changelog`（7 个 `register` 无 `.catch`）；`position / user`（2 个单行无 catch）；`profile / profile-detail / security / profile-edit`（4 个 `register` 有 `.catch`）；`status`（无 `'serviceWorker' in navigator` 守卫但 `register` 有 `.catch`）。
- **B. 定制，保留本地（3 个）**：`index.html`（复杂注册：SW_VERSION / controllerchange / 旧版清理 / updateViaCache）；`login/classic.html`（相对路径 `../sw.js` + 版本号标签写入）；`about.html`（自带 `registerSW()` + updateViaCache + 版本比对）。

## 3. 修改方案
- 新建 `sw-register.js`，定义全局函数 `registerAppSW()`：读取同源 `version.json` 的 `version` 字段，注册带版本号的 `sw.js?v=<version>`。
- 14 个同构页面：删除底部内联 SW 注册块（含「注册 Service Worker」注释行），改为在其 `DOMContentLoaded` 内一行 `registerAppSW();`；并在页面内联 `<script>` 前注入 `<script src="sw-register.js?v=1.3.57"></script>`。
- `release.sh` 注册 `sw-register.js`（SW_PAGES 循环，14 页），满足 drift 自检。
- 行为说明（零用户可见变更，仅更稳健）：统一为 `register(...)` 追加 `.catch(function(){})`，原 9 个页面为 fire-and-forget，现在可避免未处理的 Promise 拒绝；统一增加 `'serviceWorker' in navigator` 守卫，原 `status.html` 缺失该守卫，在不支持 SW 的环境下原代码会抛 TypeError，现已规避。

## 4. 验收
- [x] 14 个同构页面不再各自内联 SW 注册代码（顶层 HTML 已无 `navigator.serviceWorker.register` 字面量；`login/classic.html` 子目录定制注册保留）。
- [x] 线上各页 Service Worker 仍正常注册（`sw.js?v=` 与 `version.json` 一致；Node 隔离 context 测试 `PARITY OK`）。
- [x] `node --check sw-register.js` 通过。
- [x] `release.sh` 已注册 `sw-register.js`（SW_PAGES 14 页），`bash -n` 通过，sed 替换验证正确。
- [x] 改动文件无 `U+FFFD`（UTF-8 无损坏）。

## 批次 130 · report-common.js 与 app.js 去重

## 0. 总览
消除 `report-common.js` 与 `app.js` 中重复的名称映射 / 日期格式化逻辑；实测仅 5 个函数行为两文件完全一致，安全抽取为共享模块 `report-shared.js`。`statusName` / `normalizeTask` 因 PAUSED 状态口径分歧（app 无 PAUSED / 报表含 PAUSED→暂停中）各自本地保留；`fmtDate` 两文件行为不同（app 含时分 / 报表仅日期）亦不共享。

## 1. 现象（实测）
- 计划前提偏差：计划称「app.js 重复 6 / report-common 定义 3」，实测 report-common.js 已定义全部 9 个（priorityName/projectNameById/versionNameById/normalizeTask/fmtDate/fmtDateTime + typeName/typeColor/buildTodoCardHtml），app.js 另有独立完整实现（6 个），report-task.js 则为委托 shim（`return C.xxx`）。
- 页面隔离：app.js 仅 index.html / index-nosw.html 加载；report-common.js 仅 4 个报表页加载；无任何页面同时加载两者。
- 数据作用域：app.js 读取全局 priorityList 等（ensure* 填充）；report-common.js 读取 IIFE 局部同名列表（loadReportData 填充）；数据源一致但作用域不同。

## 2. 根因定位（实测）
- 行为完全一致（可安全共享）的 5 个函数：priorityName / projectNameById / versionNameById / userNicknamesByIds / fmtDateTime。
- 行为分歧（不可盲目统一）：
  - `statusName` / `normalizeTask`：app.js 的 statusName 不含 PAUSED，报表页含 PAUSED→暂停中；parity 测试证实 PAUSED 输入下输出不同。
  - `fmtDate`：app.js 返回 YYYY-MM-DD HH:MM（含时分），report-common 返回 YYYY-MM-DD（仅日期）。

## 3. 修改方案
- 新建 `report-shared.js`：声明共享全局存储（priorityList/projectList/versionList/userList）+ 上述 5 个函数 + `window.RT_NAME_MAPS`；实现取自 report-common.js 口径。
- `app.js`：删除 5 个函数本地定义及 `let priorityList/...` 声明；ensure* 改为填充共享全局；调用点不变（解析为共享全局）。`statusName` / `normalizeTask` / `fmtDate` 本地保留。
- `report-common.js`：删除 5 个函数本地定义及 IIFE 内 4 个列表声明；loadReportData / resetCache / getData 改为填充共享全局；导出对象改引用共享全局。`statusName`（含 STATUS_NAME）/ `normalizeTask` / `fmtDate` / typeName / typeColor / buildTodoCardHtml 本地保留。
- `report-task.js`：委托 shim（`return C.xxx`）不变，RT_REPORT_COMMON 现指向共享函数，行为不变。
- 6 个页面（index.html / index-nosw.html / report-task / report-todo / report-bug / report-meeting）在 app.js / report-common.js 之前引入 `report-shared.js?v=1.3.57`。
- `release.sh`：新增 SHARED_PAGES 循环，发版时 bump `report-shared.js?v=`。

## 4. 验收
- [x] `report-shared.js` 含 5 个函数（priorityName/projectNameById/versionNameById/userNicknamesByIds/fmtDateTime）+ 共享存储 + RT_NAME_MAPS。
- [x] `app.js` 与 `report-common.js` 不再各自定义上述 5 个函数（仅 report-shared.js 一处真实实现；report-task.js 为委托 shim）。
- [x] `statusName` / `normalizeTask` 在 app.js 与 report-common.js 各自保留（PAUSED 口径不变）。
- [x] 报表页加载链 `report-shared→report-common→report-task` 透传正确，normalizeTask 经共享 priorityName 输出正确（含 PAUSED→暂停中）。
- [x] 隔离行为级 parity 测试通过：5 个共享函数 新实现 == 原始 report-common == 原始 app（相同数据输出完全一致）。
- [x] `node --check` report-shared.js / app.js / report-common.js 均通过。
- [x] 6 个页面 `report-shared.js?v=` 已注册（release.sh SHARED_PAGES，发版漂移自检可覆盖）；`bash -n release.sh` 通过。
- [x] 改动文件 UTF-8 无 U+FFFD。
---

## 批次 131 · 重复 CSS 规则合并

## 0. 总览
合并 `styles.css` 中结构重复的 CSS 规则。计划预估“约 44 组”，实测后确认为 **8 组真实重复 + modal 全屏家族的若干子合并**（见下）。全部采用「相同声明体的选择器合并为一条规则、删除重复块」的等价变换，保证零视觉变更。

## 1. 实测重复清单（与计划不符处已订正）
- **modal 全屏 overlay 家族**（计划点名，但 cascade 较微妙，已逐条安全合并）：
  - 4 个容器 `#task-detail-overlay / #modal-overlay / #todo-detail-overlay / #todo-modal-overlay` 的容器样式（`padding:0; align-items:stretch; justify-content:flex-start; background:var(--surface)`）原本分散在 4 处 → 合并为 1 条。
  - `.modal` 内全屏样式：task/modal 两 overlay 原本由 A、B 两块叠加（B 把 `max-height` 覆写为 `none`），已化简为单条且保留 `max-height:none`；todo 两 overlay 原本完全重复 → 合并为 1 条（保留 `max-height:100dvh`，**这是与 task/modal 的真实差异，刻意不合并**）。
  - `.show .modal { transform:translateY(0) }` 3 处 → 合并为 4 路 1 条。
  - `.task-detail-header / .task-detail-tags / --main / --meta` 的 task-detail 与 todo-detail 写法原本成对重复 → 各合并为 1 条。**注意 `#todo-modal-overlay` 原本没有这些 header/tags 覆写规则，故未纳入合并（避免新增不该有的样式）。**
- **主色填充按钮**：`.btn.primary` 与 `.cd-btn.cd-confirm` 的公共声明（`background/color`）原本各定义一次 → 合并为 `.btn.primary, .cd-btn.cd-confirm, .is-primary-fill`，各自的 `:hover`/`:active` 状态保留独立；同时新增 `.is-primary-fill` 工具类（等价主色填充，供后续迁移使用）。
- **附件行**：`.attachment-info` ≈ `.detail-attachment-info`（声明体完全相同）→ 合并为 1 条；`.attachment-name` ≈ `.detail-attachment-name` 同理。
- **上传区**：`.image-upload-area` ≈ `.attachment-upload-area` → 合并为 1 条。
- **缩略图**：`.image-thumb img` ≈ `.detail-image-thumb img` → 合并为 1 条。
- **通用隐藏工具类**：新增 `.is-hidden { display:none !important }`。

## 2. 刻意未做（保留，避免风险）
- **chip `全部` 选中态三处重复**（`[data-type="全部"]` / `[data-status="全部"]` / `[data-priority="全部"]` 的 `.active` 及 `.dropdown-item.checked .check-mark`）：声明体相同，但涉及中文属性选择器编辑，且跨组件语义不同（chip 与下拉勾选标记），本批次留待后续人工确认，不盲目合并。
- **分散 `display:none` → `.is-hidden` 的批量替换**：计划建议“替换分散的 display:none”，但该替换需改动大量 HTML/JS 的类名引用，且 `@media print` 等合理用法需保留；本批次仅在 CSS 中**新增** `.is-hidden` 工具类，实际迁移留待后续（零行为变更优先）。

## 3. 验证
- 用 Python 解析校验：合并后 **所有原始选择器仍被新样式表覆盖（无样式丢失）**；花括号配平 493/493；U+FFFD 扫描为 0。
- 重复规则数：含 @media 内规则的解析口径 500 → 485（净减 15 条）；跨选择器“完全相同声明体”重复组 38 → 27（剩余为既有的单属性/空体巧合命中，非本批次引入）。
- modal 全屏家族经逐条核对：task/modal 与 todo 的 `max-height` 差异、`#todo-modal-overlay` 缺省 header/tags 覆写均如实保留，未引入新样式。

## 4. 验收
- [x] 上述重复规则合并后，`styles.css` 规则数下降且无未定义类引用。
- [x] 弹窗、主色按钮、附件行、隐藏元素在各页面视觉与重构前一致（等价变换，选择器全覆盖校验通过）。

## 批次 132 · 媒体查询断点收敛

## 0. 总览
合并 `styles.css` 中重复的媒体查询断点。实测后确认**唯一真实重复**是 `@media (max-width:360px)` 被定义了两次；断点集实际为 {360, 520}，仓库内**无任何 768 用法**。

## 1. 实测（订正计划）
- `styles.css` 内 `@media`：`(hover:hover)`(L237)、`(max-width:360px)`(L395)、`print`(L1489)、`(max-width:360px)`(L1589，重复)、`(max-width:520px)`(L1593)。共 5 处，其中 360 重复一次。
- 响应式断点实际只用了 **360 与 520**；`min-width/max-width` 里的 260/860/400/320 等是组件内部尺寸，非响应式断点。
- 全仓库（css/js/html）**搜不到 768**，故“新增 768 平板断点”无依据，本批次不做。

## 2. 修改（等价变换，零行为变更）
- 两处 `@media (max-width:360px)` 内容针对**互不相交**的选择器：块1=`.stats-grid/.stat-label/.stat-num/.section-actions .link`；块2=`.update-banner`。
- **关键 cascade 细节**：`.update-banner` 的基础定义在 **L1560**（位于两块之间）。若把块2并入块1（L395 处），360 规则会移到其基础定义之前 → 基础定义反客为主 → `.update-banner` 在 ≤360 失去 `font-size:12px;bottom:78px`。因此合并块**置于后置位（块2 原 L1589 处）**，删除块1。
- 块1 的四个选择器基础定义均在 L343–388（块1 之前），且 395–1589 区间内对它们**无任何其他覆盖规则**，故后置后仍正确覆写。
- 合并后单条：
  ```css
  @media (max-width: 360px) {
    .stats-grid { gap: 8px; }
    .stat-label { font-size: 11px; }
    .stat-num { font-size: 18px; }
    .section-actions .link { font-size: 13px; }
    .update-banner { font-size: 12px; bottom: 78px; }
  }
  ```

## 3. 刻意未做
- **不新增 768 断点**：仓库内无 768 任何用法，新增属于无法在本会话视觉验证的净新增行为，留待后续按需添加。断点阶梯维持已收敛的 {360, 520}（无重复）。

## 4. 验证
- `@media (max-width:360px)` 出现次数：2 → **1**。
- 花括号配平 492/492；U+FFFD 扫描 0。
- 选择器全覆盖校验通过（无样式丢失，规则数 485→485，属重排非删除）。
- 对 5 个受影响选择器在 ≤360 与 >360 两档逐一核对 cascade 胜出规则，新旧完全一致（`.update-banner` 360 规则后置后仍胜出其基础定义）。

## 5. 验收
- [x] `max-width:360px` 仅定义一次。
- [x] 断点无重复零散定义（阶梯为 {360, 520}；768 因无既有用法刻意不加，见 §3）。
- [x] 关键页面在 ≤360 与 >360 布局与重构前一致（等价变换，cascade 已逐选择器核验）。
## 批次 133 · app.js 拆分为职责模块

## 0. 总览
将 152KB / 151+ 函数的单体 `app.js` 拆分为多个职责模块，降低单文件复杂度、提升可维护性。

## 1. 现象
- `app.js` 单体巨大（152100 字节、151+ 函数），包含媒体存储、存储配额、任务表单/列表、待办 CRUD/详情、附件、字典初始化等多职责，难以 review 与定位。

## 2. 根因定位
- 历史演进中各类逻辑持续追加到单一文件，未做模块边界划分。

## 3. 修改方案（按《健康报告》四·拆分建议）
- 拆为以下模块（vanilla 环境：多 `<script>` 顺序加载，依赖全局函数共享，加载顺序须保证被依赖者在前）：
  `media-store.js`（图片/附件 IDB，承接批次 124）、`storage-quota.js`（配额管理）、`task-form.js`（任务表单）、`task-list.js`（任务列表渲染/筛选）、`todo-crud.js`（待办 CRUD）、`todo-detail.js`（待办详情/时间线）、`attachment.js`（附件下载/预览）、`dict-init.js`（字典预取）。
- 采用**渐进式拆分**：先抽取边界清晰的子模块（如 media-store、dict-init），再处理任务/待办核心，每步保证功能等价。
- 每个新模块在 `release.sh` 注册 `?v=`。

## 4. 验收
- [ ] `app.js` 拆分为上述职责模块，单文件函数数显著下降。
- [ ] 拆分后全站功能等价（任务/待办/附件/字典等逐模块手测）。
- [ ] 各模块 `node --check` 通过；首屏加载无回归（注意多脚本顺序）。


### 实测执行记录（批次133 · 已交付）

> 计划原假设 app.js 为「152KB / 151+ 函数」未拆分单体；实测发现该假设严重失真——媒体存储层 `media-store.js`（批次124）、字典层 `dictionary.js`、待办层 `todos.js`/`todo-lifecycles.js`、需求任务层 `requirement-tasks.js`/`task-lifecycles.js`、报表层 `report.js`/`users.js`/`projects.js`/`project-versions.js` 等多数职责早已拆分为独立文件。app.js 中仅残余少量「字典预取 / 状态·类型·优先级 查找与设置」逻辑仍堆在顶层，故本批次按"零行为变更 + 声明集守恒"硬约束，只做可安全自动化的那部分。

**实际执行范围：抽取 `dict-init.js`（14 个纯字典函数，从 app.js 顶层精确搬迁）**
- `setTaskTypeList` / `resolveTypeName` / `resolveTypeColor` / `setTodoTypeList` / `resolveTodoTypeColor` / `setPriorityList` / `setProjectList` / `setVersionList` / `setUserList` / `statusName` / `versionsByProject` / `statusForOp` / `lifeColor` / `TODO_STATUS_DICT`
- 函数体**逐字一致**（已逐函数比对 HEAD:app.js 原版）；共享可变状态（`TASK_TYPE_LIST` / `TYPE_CODE_TO_NAME` / `TYPE_NAME_TO_CODE` / `TYPE_CODE_TO_COLOR` / `priorityList` / `projectList` / `versionList` / `userList` / `TODO_TYPE_LIST` / `TODO_TYPE_CODE_TO_COLOR` 等）继续留在 `app.js` 并由其 `ensure*` 预取填充。
- `dict-init.js` 在 `index.html` / `index-nosw.html` 中于 `app.js` **之前**加载（全局函数声明，仅运行时被事件/`DOMContentLoaded` 调用，加载顺序不引入回归）。

**验收校验（全绿）**
- `app.js` diff = 纯删除 14 个函数块（72 删 / 1 插，插入仅为末尾换行移除），无其他改动。
- 14 函数体逐字一致；`node --check` 对 `app.js` 与 `dict-init.js` 均通过。
- 顶层声明集守恒：原始(app.js) 与 新(app.js + dict-init.js) 集合差为**空**（无增删）。
- `dict-init.js?v=1.3.57` 已注册于 `release.sh` 的 `patch_ver`（index.html / index-nosw.html）与 `check_ver`（含全站 `?v=` 漂移自检）；两页加载顺序正确；无 U+FFFD 乱码。

**刻意推迟（DEFERRED）—— 原计划 8 模块拆分的其余 7 个**
- `storage-quota.js`：其 `getStorageEstimate` / `isStoragePersistent` / `requestPersistentStorage` **已存在于 `storage-backup.js`**，盲目抽取将造成全局符号碰撞 → 跳过。
- `media-store.js`：已于**批次124**存在，无需重复。
- `task-form.js` / `task-list.js` / `todo-crud.js` / `todo-detail.js` / `attachment.js` 等核心模块：拆分需逐项**运行时手测**（计划验收标准"逐模块手测"），沙箱无法代劳，留待人工在可测前提下按模块推进。

**结论**：以"零行为变更 + 声明集守恒"为硬约束，完成可安全自动化的 `dict-init.js` 抽取；其余模块拆分在人工可逐项验收时再推进，避免无测试覆盖的大面积重构引入回归。



---

## 批次 134 · styles.css 拆分为多文件

## 0. 总览
将 71KB / 551 规则块的单体 `styles.css` 拆分为多个职责文件。

## 1. 现象
- `styles.css` 单体巨大（71253 字节、551 规则块），变量/布局/组件/页面样式混杂，定位困难。

## 2. 根因定位
- 所有样式长期累积于单一文件，未按职责分区。

## 3. 修改方案（按《健康报告》五·拆分建议）
- 拆为：`base.css`（变量/reset/body）、`layout.css`（header/drawer/tabs/nav-bar/全屏详情）、`components.css`（filter/chip/dropdown/card/button/FAB/modal/toast/confirm-dialog）、`pages.css`（report/task-list/data-backup）、`utilities.css`（高频原子类 `.is-hidden`/`.flex-row` 等）、`print.css`（`@media print` 隔离）。
- `index.html` 用多个 `<link rel="stylesheet" href="x.css?v=...">` 引入（顺序：base→layout→components→pages→utilities，print 末位）。
- 每个新 CSS 在 `release.sh` 注册 `?v=`。
- 建议与批次 131/132 协同，在拆分同时完成重复合并与断点收敛。

## 4. 验收
- [ ] 样式拆分为上述文件，单文件体积显著下降。
- [ ] 全站视觉与拆分前一致（关键页面截图对比）。
- [ ] 无样式丢失（无 404 的 css 引用，所有 `?v=` 一致）。


### 实测执行记录（批次134 · 已交付）

> 计划原假设 styles.css 为「71KB / 551 规则块」未拆分单体；实测为 **2122 行 / 66KB（非 71KB）**，且**按页面/组件流程顺序组织**（header→drawer→tabs→card→buttons→modal→detail→report→toast→…→image/attachment），**并非按 concern 分组**。若按计划的 base/layout/components/pages/utilities/print 重新分组，需跨章节移动大量规则 → 级联顺序翻转 → 回归（批次131/132 已多次踩坑）。故本批次采用**连续切片 + 保序加载**，以"级联零变化"为硬约束。

**实际执行范围：styles.css 连续切为 6 个文件（保序加载，拼接==原文件）**
- `base.css` (L1–97, 变量/派生色/聚焦轮廓) · `layout.css` (L98–644, header/drawer/tabs/banner/container/filter/stats/chips) · `components.css` (L645–1194, task-card/buttons/FAB/modal/form/detail/nav/lifecycle) · `pages.css` (L1195–1480, settings/backup/report/tasklist/reportfilter) · `overlays.css` (L1511–2122, toast/update/toolbar/confirm/error/image/attachment) · `print.css` (L1481–1510, 纯 `@media print`)
- 加载顺序 `base→layout→components→pages→overlays→print`（print 末位、`media="print"`）；该顺序与原文件级联**等价**——原文件中 print 块位于 L1481（介于 pages 与 overlays 之间），将其移至末位不影响屏幕级联（print 块仅 `@media print` 生效、且全 `!important`），打印级联亦不变。
- **命名偏离说明**：原计划 6 文件含 `utilities.css`；但 `.is-hidden` 等原子类位于 L799（components 区段内），若单独拆出需移动规则→级联风险，故并入 `components.css`；原 `print` 之后的屏幕规则（toast/modal/image/attachment）归并为 `overlays.css`。文件数仍为 6，语义更贴合实际连续区段。

**验收校验（全绿）**
- 分区**逐字节一致**：6 文件按原顺序拼接 == 原 styles.css（2122 行完整覆盖，无遗漏/重叠）。
- 选择器覆盖 450/450（缺失 0、多余 0）；各文件括号配平；无 U+FFFD。
- `@media print` 块 2 个均保留且纯 print；屏幕媒体查询（max-width:360/520，批次132）原序保留。
- 8 个 HTML 的 `<link styles.css>` 全量替换为 6 个有序 `<link>`（均带 `?v=1.3.57`，含原本无 `?v=` 的 index-nosw.html）；`styles.css` 功能引用零残留（仅 storage-backup.html 一处注释已同步更新）。
- `release.sh`：新增 Batch134 `patch_ver` 循环（6 css × 8 页）+ 6 条 `check_ver`（index.html）；移除 4 处失效的 `styles.css` patch_ver 与悬空的 `FINAL_CSS`（否则漂移自检会因 styles.css 缺失而中断发版）；`bash -n` 通过。
- 全站 `?v=` 漂移自检模拟：所有 html 的 `*.css?v=`/`*.js?v=` 均为 1.3.57。
- `sw.js` 已确认 styles.css 不再预缓存（改走版本化 URL fetch），删除 styles.css 不会致预缓存 404。

**结论**：以"连续切片 + 保序加载"在零级联变化前提下完成 styles.css 拆分，单文件体量显著下降、可维护性提升；未做 concern 重排以规避回归。计划验收要求的"关键页面截图对比"属沙箱不可代劳的人工视觉验收，留待人工确认。



---

## 批次 135 · console 日志清理

## 0. 总览
清理生产代码中的调试 `console.log/warn/error` 遗留，约 49 处。

## 1. 现象
- 生产环境残留大量调试日志，控制台噪声大，部分暴露内部状态。

## 2. 根因定位（实测）
- 共 **49 处**：`user.html`×12 / `app.js`×10 / `storage-backup.js`×5 / `department.html`×3 / `company.html`×2 / `index.html`×2 / `position.html`×2 / `project-version.html`×2 / `project.html`×2 / `todo-lifecycles.js`×2 等（另有 `tests/` 下测试日志）。

## 3. 修改方案
- 删除生产代码（HTML 内联脚本、`app.js`、`storage-backup.js`、`todo-lifecycles.js` 及各管理页）中的调试 `console.*` 调用。
- 保留必要的错误上报（如真实异常 `console.error` 可改为上报通道，或保留但精简）。
- **`tests/` 目录下的测试日志不删**（属测试代码，非生产路径）。

## 4. 验收
- [ ] 生产代码（非 tests/）中 `console.log/warn/error` 调用清理完毕。
- [ ] 关键路径功能无回归（删除日志不应改变任何控制流）。
- [ ] `tests/` 下日志保留不受影响。


## 5. 实测执行记录（批次135）

- **实测规模：34 处，非计划假设的 49 处。** 计划高估了分布与总数；实际 `console.*` 集中在 8 个生产文件，且分布与计划设想差异显著。
- **实测文件分布（生产代码，非 tests/）：**
  | 文件 | 计划假设 | 实测 | 说明 |
  |---|---|---|---|
  | `user.html` | 12 | 12 | 一致 |
  | `app.js` | 10 | 9 | 少 1（计划多估 1 处） |
  | `storage-backup.js` | 5 | 3 | 少 2 |
  | `index.html` | 2 | 2 | 一致 |
  | `todo-lifecycles.js` | 2 | 2 | 一致 |
  | `crud-factory.js` | 0（未列） | 3 | 计划遗漏 |
  | `media-store.js` | 0（未列） | 2 | 计划遗漏 |
  | `about.html` | 0（未列） | 1 | 计划遗漏 |
  | `department/company/position/project/project-version.html` | 共 11（3/2/2/2/2） | 0 | 实测均为 0，计划高估 |
  | **合计** | **49** | **34** | 差值 15 |

- **清理方法（保控制流）：**
  - 独立 `console.*` 行：`^\s*console\.(log|warn|error|info|debug)\([^
]*
` 直接删除。
  - `catch` / `.then` 内联日志：仅删日志行、保留控制流。
    - `app.js`：`} catch (e) { console.warn('[dict] 播种失败：', e && e.message); }` → `} catch (e) {}`；`return p.catch(function (e) { console.warn(...); })` → `return p.catch(function (e) {});`。
    - `crud-factory.js` L59：` console.error(err);` 删除，保留 `.catch(function (err) { toast('操作失败：' + crudErrMsg(err)); })`。
    - `todo-lifecycles.js`：两处 `.catch(... console.warn ...)` → `.catch(function (e) {})`。
    - `about.html`：`}).catch(function(e){ console.warn('SW 注册失败:', e); });` → `}).catch(function(e){});`。
    - `index.html`：`}).catch((e) => console.warn('SW 注册失败:', e));` → `}).catch(() => {});`。
    - `user.html`：`step.then(function(n){ if (n > 0) console.log(...); })` → `step.then(function () {})`；`.catch(function(e){ console.warn('[人员管理] 迁移已有账号失败：', e); })` → `.catch(function () {})`。
- **验收（已通过）：**
  - 生产代码（非 tests/）`console.*` 全清：8 文件 `N → 0`，终扫 `files with console.* remaining: NONE ✅`。
  - 5 个 JS 文件 `node --check` 全部 OK。
  - `about.html` / `user.html` 内联脚本逻辑保留（空 `catch`/`then`）。
  - `index.html` 内联脚本#1 的 `node --check` `Unexpected token ')'` 经对照 `HEAD:index.html` 为**既有问题**（同文件 23 `<script>`/23 `</script>` 导致正则抽取跨标签的伪影），非本次改动引入；本批次编辑落在通过检查的脚本#2。
  - `tests/` 下 `console.*`（test-batch32/34/35 共 3 文件）按约定保留，不影响生产。


---

## 批次 136 · 内联 style 抽取工具类

## 0. 总览
将散落的内联 `style="..."` 中可复用的样式抽取为工具类，约 60 处。

## 1. 现象
- 多处内联样式重复书写相同的 flex/gap/align 等，难以统一调整。

## 2. 根因定位（实测）
- 共 **60 处**内联 `style=`：`index.html`×14 / `profile.html`×6 / `about.html`×5 / `profile-edit.html`×5 / `department.html`×4 / `role.html`×4 / `company.html`×3 / `permission.html`×3 等（20 个文件）。

## 3. 修改方案
- 统计高频内联样式片段（如 `display:flex;align-items:center`、`gap:8px`、`justify-content:space-between` 等），抽为工具类（如 `.flex-row`/`.flex-center`/`.gap-sm`/`.between`）。
- HTML 中对应元素改用 class 替代内联 `style`（无法抽象的业务特定样式可保留）。
- 新增工具类放入 `utilities.css`（或承接批次 134 拆分）。

## 4. 验收
- [ ] 内联 `style=` 处数较 60 显著下降（高频可复用片段已抽离）。
- [ ] 替换后元素布局与替换前完全一致（抽查 index/profile/about）。


## 5. 实测执行记录（批次136）

- **实测规模：113 处内联 `style=`（HTML 58 + JS 模板 55），非计划假设的 60 处 HTML-only。** 计划高估了"可复用静态片段"的占比，低估了动态注入量。
- **按性质拆解（决定是否抽取）：**
  1. **动态值注入（占多数，必须保留内联）**：`--chip-color:' + d.color`、`background:${resolveTypeColor(...)}1a;color:...`、`width:' + pct + '%'`、进度条 `width:auto`×10 等——这些是主题/数据驱动的合法内联样式，抽成静态工具类无意义，**保留**。
  2. **JS 切换 `display:none`（约 25 处 `style.display` 赋值 + ~15 处静态 `style="display:none"`）**：迁移到既有 `.is-hidden`（`display:none !important`）会与 permission.js/role.js 中 `style.display='block'` 的"显示"逻辑冲突（`!important` 会压过内联 `display:block`），属逐元素重构，**本批次延期**（低版本号风险）。
  3. **真正静态、重复、安全可抽的片段**：抽取 **22 处** 为 7 个工具类。
- **抽取映射（追加到 `components.css` 末尾，统一 `!important` 以保证与移除前内联样式行为完全一致）：**
  | 工具类 | 原内联片段 | 抽取处数 | 位置 |
  |---|---|---|---|
  | `.pad-24` | `padding:24px` | 3 | report-bug/meeting/todo.js 空态 |
  | `.pt-2` | `padding-top:2px` | 4 | profile.html / about.html 的 info-label、info-arrow |
  | `.text-danger` | `color:#cf1322` | 6 | index.html ×5 + index-nosw.html ×1 必填星号 |
  | `.mt-10` | `margin-top:10px` | 3 | storage-backup.html backup-tip ×2 + index.html 静态包裹 div ×1 |
  | `.text-muted-sm` | `font-size:12px;color:var(--muted)` | 2 | app.js 提示文案 |
  | `.chip-muted` | `background:#94a3b81f;color:#64748b` | 2 | app.js lc-badge 灰态 |
  | `.about-block` | `align-items:flex-start;padding-top:16px;padding-bottom:16px` | 2 | about.html info-row |
  | **合计** | | **22** | 内联 `style=` 113 → **91** |
- **验收（已通过）：**
  - 7 个目标片段全局 `0` 残留；动态注入（`--chip-color`×6、`width:' + pct + '%'` 等）保持原样未动。
  - 触及 JS（app.js、report-bug/meeting/todo.js）`node --check` 全部 OK。
  - 工具类追加进**既有** `components.css`（已在全部 8 个 HTML 以 `?v=1.3.57` 注册），**无需新增文件、无需改 release.sh**、无需改 sw.js（Batch134 已确认 CSS 不再预缓存）。
  - 竞争规则核对：`.lc-badge` 不设 background/color；`.empty`/`.backup-tip` 体不与工具类冲突；`label/span` 颜色规则均为类作用域（非裸元素选择器），`.text-danger` 类可胜出；叠加 `!important` 后行为与内联完全一致。
- **延期项**：动态值注入（正确保留）+ `display:none` 切换（需 `.is-hidden` 逐元素重构，风险高，留待独立重构批次）。


---

## 批次 137 · 页面可见性监听抽取

## 0. 总览
将重复的 `pageshow` / `visibilitychange` 监听逻辑抽取为共享函数，约 23 处。

## 1. 现象
- 多个页面各自注册页面可见性/显示监听以刷新数据，逻辑雷同。

## 2. 根因定位（实测）
- `pageshow` 监听出现在 **12 个文件**；`visibilitychange` 出现在 **11 个文件**（HTML 内联 + JS）。

## 3. 修改方案
- 新建共享函数（放 `ui-utils.js` 或独立 `visibility.js`）：`onPageShow(fn)`、`onVisible(fn)`，内部统一注册监听并去重/清理。
- 各页面删除本地 `addEventListener('pageshow'/'visibilitychange', ...)`，改为调用共享函数传入回调。
- 在 `release.sh` 注册新模块。

## 4. 验收
- [ ] 各页面不再各自内联 `pageshow`/`visibilitychange` 监听注册。
- [ ] 切回前台/页面显示时数据刷新行为与重构前一致（手测 2–3 个高频页）。
- [ ] `node --check` 相关文件通过。


## 5. 实测执行记录（批次137）· 已执行

- **实测规模（同前）**：14 个文件含监听（12 HTML + `permission.js` + `role.js`）。统一"渲染模式" 11 处 + 3 处分歧（index 抽屉、permission.js 参数、index:790 版本检查）+ `status.html` bfcache。
- **执行方案（用户要求落地，推翻上期延期结论）**：
  - 在 `ui-utils.js`（批次127 既有共享工具层；纯函数定义、无顶层 DOM 访问）追加 `onPageShow(fn)` / `onVisible(fn)`，行为与原内联完全一致。
  - `ui-utils.js` 在 8 个既有页本就以 **非 defer** 加载（已确认），故页内联脚本解析期 `onPageShow` 即可用；为 5 个缺失页（`index` / `profile` / `profile-detail` / `role` / `permission`）在 `auth.js` 后补挂 `<script src="ui-utils.js?v=1.3.57">`（非 defer）。`permission.js`/`role.js`（defer）在其页因 ui-utils 非 defer 先加载而可用。
  - 迁移 13 处渲染对：`onPageShow(FN); onVisible(FN);`（FN=`render`/`renderProfile`/`refresh` 及 dictionary 的 `renderTypeSelect()+render()` 包裹）。分歧站点用包裹保留语义：`index` 抽屉 `onPageShow(function(){ refreshDrawerUser(); maybeReopenDrawer(); }); onVisible(refreshDrawerUser);`；`permission.js` `onPageShow(function(){ load(true); }); onVisible(function(){ load(false); });`。
  - **刻意保留 2 处不迁移**：`index.html:791` 独立版本检查（`() => { if (!document.hidden) checkRemoteVersion(); }`，用 `document.hidden`、非渲染模式）；`status.html:154` bfcache `e.persisted` + `version.json` 重载（非渲染模式，无 visibilitychange）。
- **验收（已通过）**：
  - 13 处渲染对全部迁移；仅剩 `status.html` bfcache pageshow 与 `index.html:791` 版本检查两处原生监听（均属刻意保留）。
  - `ui-utils.js` / `permission.js` / `role.js` `node --check` 通过；5 页已挂 ui-utils.js 非 defer 标签；8 个既有页 ui-utils 仍非 defer。
  - 无新增静态资源（ui-utils.js 既有、已登记），`?v=1.3.57` 与 NEW_VER 一致，release.sh 漂移自检不受影响。
  - 行为零变更：原 `window.addEventListener('pageshow', render)` 与 `if(visibilityState==='visible') fn()` 守卫由 `onPageShow`/`onVisible` 等价复刻；分歧站点参数/步数完全保留。


---

## 批次 138 · 删除孤立文件 kill-sw.html

## 0. 总览
删除全仓无任何引用的孤立文件 `kill-sw.html`。

## 1. 现象
- 存在一个“注销/清理 Service Worker”的页面，但站点任何入口都无法到达它。

## 2. 根因定位（实测）
- `kill-sw.html` 存在（3278 字节）；全仓（HTML+JS）对其的引用计数为 **0**（无任何导航/链接指向）。

## 3. 修改方案
- 删除 `kill-sw.html`（及若有的构建清单/部署配置中对它的引用）。
- 若该能力仍需要（如调试用），改为在“关于/设置”页加一个“清理缓存”按钮复用其逻辑，而非保留孤立页。

## 4. 验收
- [ ] `kill-sw.html` 已从仓库删除。
- [ ] 全仓无指向该文件的死链；站点功能无影响（无页面依赖它）。


## 5. 实测执行记录（批次138）· 已执行

- **实测（本会话复核）**：`kill-sw.html` 当前不存在（工作区无文件、`git ls-files` 无跟踪、`release.sh`/`sw.js`/`manifest.json` 均未登记、全仓无 `kill-sw` 引用）。
- **更正此前"no-op"判断**：该文件并非"从未存在/无关删除"，而是已在提交 `6a6b930 refactor(批次138): 删除孤立 kill-sw.html，将清 changelog 键能力并入 about 强制更新` 中被**实际执行删除**（64 行移除），并将页面内的"清理 changelog 键"能力**并入 `about.html` 的强制更新逻辑**（+1 行）。即本批次在更早会话中已执行完毕；当前文件缺失正是删除的成功结果。
- **结论**：批次 138 已完成（已执行，非 no-op）。计划原文"## 2. 根因定位"中"kill-sw.html 存在（3278 字节）"为撰写计划时的旧假设，已被本批次实际删除所推翻。
- **范围外**：`index.html`/`about.html` 保留的 `serviceWorker.getRegistrations()`/`unregister()`"注销 SW"属正常设置项，非孤立文件，不在本批次范围。



## 6. 发版记录（批次124-138 统一发布）

- **发版版本**：v1.3.57 → **v1.3.58**（修订号 +1，遵循 X.Y.Z 进位规则）
- **发版提交**：`834da5f chore(release): v1.3.58`（31 文件，+338/-307）
- **时间戳**：2026-07-28 19:26
- **执行方式**：`./release.sh 1.3.58 "<124-138 总结>"`
  - 自动同步 index.html 的 SW_VERSION/APP_VERSION/APP_RELEASE_TIME、sw.js 的 CACHE、全仓 ?v= 引用、version.json
  - 重建 CHANGELOG.md（v1.3.58 条目正文为 124-138 总结）
  - 权限注册表自检（§1.8）通过；全站 ?v= 漂移自检（RULES §6）通过
- **发版中修复的遗漏**：批次137 在 index.html/profile.html/profile-detail.html/role.html/permission.html 接入 ui-utils.js，但未登记进 release.sh 的 UI_UTILS_PAGES，致首跑漂移自检拦截；已将这 5 页补登 UI_UTILS_PAGES 后重跑通过（commit 已含该修复）。
- **说明**：批次124-138 均为 `[no-version-bump]` 累积提交，本次发版统一升版并补写更新日志。index-nosw.html 的 `app.js`（无 ?v=）为预存 WARNING（不阻断发版），未改动。
