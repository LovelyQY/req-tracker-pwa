# 需求跟踪 PWA · 回归修复执行清单（批次 122）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa` ｜ 起点版本 `v1.3.55`
> 范围：2 项 Bug 修复（代办页统计缺失 / 全部状态不显示；侧边栏任意入口点击跳登录）
> 本文档为**执行清单**，落地时逐项完成后打勾；随实现一并提交至 `plans/`。
> 发版版本：随下次 `./release.sh` 升版（本次未升版，避免与在途发版冲突）。

---

## 0. 受影响文件总览

| 批次 | Bug | 文件 | 主要改动 |
|---|---|---|---|
| **122-A** | 代办页：统计值缺失、「全部状态」不显示（实为空状态 chips / 统计卡片全空） | `app.js` | `TODO_STATUS_DICT` 由「顶层 IIFE 固化」改为「调用时惰性读取 `window.RT_DICT.SEED_TYPE`」；同步更新 7 处调用 `TODO_STATUS_DICT[x]` → `TODO_STATUS_DICT(x)` |
| **122-B** | 侧边栏：点任意入口（个人信息 / 账号与安全 / 基础数据 / 统计报表 / …）均跳转到登录页 | 24 个子页面 HTML（`about / basic-data / changelog / company / department / dictionary / permission / position / profile-detail / profile-edit / profile / project-version / project / report-bug / report-meeting / report-task / report-todo / report / role / security / settings / status / storage-backup / user`） | 登录闸门内联脚本由「解析时立即执行的 IIFE」包裹进 `document.addEventListener('DOMContentLoaded', …)`，确保 `auth.js`（`getSessionAccount`）已就绪 |
| **122-C** | 附带修复：侧边栏可达的 `profile.html` / `security.html` 主脚本存在预存在 `[c]; }); }` / `,2200); }` 损坏行（语法错误致整段脚本失效），随 122-B 暴露 | `profile.html` `security.html` | 删除 2 行明显损坏的死代码 |

---

## 1. 代办页统计缺失 / 全部状态不显示（批次 122-A）✅ 已落地

### 1.1 现象
- 进入「代办」视图：统计栏仅显示「总计 0」，**各状态卡片（未处理 / 处理中 / 已完成 等）不显示**。
- 状态筛选区仅显示「全部状态」chip，**具体状态选项（未处理 / 处理中 / 已完成）不显示**。

### 1.2 根因定位
- 待办状态 chips 与统计均由 `app.js` 的 `renderTodoStatusChips()` / `renderTodoStats()` 渲染，二者均通过
  `dictType = SEED && TODO_STATUS_DICT[currentTodoType]` 取得字典类型，再 `getDictByType(dictType)` 拉取状态枚举。
- `TODO_STATUS_DICT` 原实现为**顶层 IIFE**，在 `app.js` 解析执行时一次性固化 `SEED.TODO_STATUS` 等：
  ```js
  const TODO_STATUS_DICT = (function () {
    const SEED = (window.RT_DICT && window.RT_DICT.SEED_TYPE) || {};
    return { TASK_ITEM: SEED.TODO_STATUS || 'TODO_STATUS', /* … */ };
  })();
  ```
- **加载顺序缺陷**：`index.html` 中 `app.js` 是 `<body>` 末尾的**无 `defer` 内联引入**（行 567），先于 `<head>` 中带 `defer` 的 `dictionary.js` 执行。因此该 IIFE 运行时 `window.RT_DICT` 尚为 `undefined`，`SEED` 取到 `{}`，`TODO_STATUS_DICT.TASK_ITEM` 回退成英文兜底串 `'TODO_STATUS'`。
- 而 `dictionary.js` 播种进 IndexedDB 的真实字典类型是中文字串 `'代办事项状态'`（见 `dictionary.js:21` `SEED_TYPE`）。于是 `getDictByType('TODO_STATUS')` **永远查空** → 状态 chips 与统计卡片全部为空（与「全部状态不显示 / 统计值缺失」完全吻合）。
- 验证：本地无头浏览器实测，`#todo-status-chips` 仅含「全部状态」、`#todo-stats-grid` 仅含「总计」；字典本身播种正常（`getAllDict` 返回 `代办事项状态:3 / 缺陷追踪状态:5 / 会议状态:4`），确认非播种问题，而是查询用的 type 串错配。

### 1.3 修改方案
- 将 `TODO_STATUS_DICT` 由「顶层固化」改为「**调用时惰性读取**」，与脚本加载顺序彻底解耦（无论 app.js 何时执行都能拿到正确 `SEED_TYPE`）：
  ```js
  function TODO_STATUS_DICT(code) {
    const SEED = (window.RT_DICT && window.RT_DICT.SEED_TYPE) || {};
    const MAP = {
      TASK_ITEM: SEED.TODO_STATUS || 'TODO_STATUS',
      BUG: SEED.BUG_STATUS || 'BUG_STATUS',
      MEETING: SEED.MEETING_STATUS || 'MEETING_STATUS'
    };
    return MAP[code] || 'TODO_STATUS';
  }
  ```
- 同步将 7 处方括号取值改为函数调用（`sed` 批量，已 `node --check` 复核）：
  `TODO_STATUS_DICT[currentTodoType]` → `TODO_STATUS_DICT(currentTodoType)`（3 处）
  `TODO_STATUS_DICT[typeCode]` → `TODO_STATUS_DICT(typeCode)`（2 处）
  `TODO_STATUS_DICT[todo.typeCode]` → `TODO_STATUS_DICT(todo.typeCode)`（2 处）
- `app.js` 顶层其余 `RT_DICT` 引用均在 `init()`（`DOMContentLoaded` 内）或各渲染函数内发生，彼时 `dictionary.js` 已就绪，无需改动。

### 1.4 验收
- [x] 进入「代办」视图，「全部状态 / 未处理 / 处理中 / 已完成」chip 全部显示（以「任务事项」类型为例）。
- [x] 统计栏显示「总计」+ 各状态卡片及数量（无数据时数量为 0，符合预期）。
- [x] 切换「任务事项 / 缺陷追踪 / 会议」类型，状态 chips 与统计随对应字典刷新。
- [x] `node --check app.js` 通过；浏览器控制台无相关报错。

---

## 2. 侧边栏任意入口点击跳登录（批次 122-B）✅ 已落地

### 2.1 现象
- 首页点右上角菜单（☰）展开侧边栏，点击**任意**入口（个人信息、账号与安全、基础数据、统计报表、存储与备份、设置、关于）→ 均跳转到 `login/classic.html`。
- 首页本身（`index.html`）正常，登录态有效——即「已登录却被闸门踢回登录页」。

### 2.2 根因定位
- 各子页面登录闸门写在 `<head>` 的**无 `defer` 内联脚本**中，形如：
  ```html
  <script>
    (function () {
      try { if (!getSessionAccount()) location.replace('login/classic.html'); }
      catch (e) { location.replace('login/classic.html'); }
    })();
  </script>
  ```
- 内联脚本在 HTML **解析时立即执行**；而 `auth.js`（`getSessionAccount` 的定义方）在 `<head>` 中带 `defer`，要等解析完成后才执行。因此内联闸门执行时 `getSessionAccount` **尚未定义** → `!getSessionAccount()` 中 `getSessionAccount` 为 `undefined`，`!undefined === true` → **无条件 `location.replace('login/classic.html')`**。
- `index.html` 的闸门则包在 `document.addEventListener('DOMContentLoaded', …)` 内（行 37），延迟到 `auth.js`（defer）之后执行，故首页正常——这正解释了「仅子页面跳登录」的差异。
- 验证：本地无头浏览器实测，登录后直访 `profile.html` 被重定向到 `login/classic.html`，但此时 `localStorage.rt_session` 有效、`getSessionAccount()` 返回 `'admin'`——证明是闸门时序问题而非会话丢失。

### 2.3 修改方案
- **统一闸门时机**：将 24 个子页面的登录闸门内联脚本包裹进 `DOMContentLoaded`，与 `index.html` 既有写法对齐，确保执行时 `auth.js` 已就绪：
  ```html
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      try { if (!getSessionAccount()) location.replace('login/classic.html'); }
      catch (e) { location.replace('login/classic.html'); }
    });
  </script>
  ```
- 原 `<script defer>`（status.html 等）上的 `defer` 对行内脚本无效，包裹时一并去除，避免误解。
- **不改动** `auth.js` 加载方式、`getSessionAccount` 实现或子页面业务逻辑；仅调整闸门触发时机。
- 排除项：`index.html`（已为 `DOMContentLoaded`）、`login/classic.html`（登录页本身无闸门）、`index-nosw.html` / `kill-sw.html`（工具页）。

### 2.4 验收
- [x] 登录后依次点击侧边栏全部入口（个人信息 / 账号与安全 / 基础数据 / 统计报表 / 存储与备份 / 设置 / 关于），**均停留在对应页面，不再跳登录**。
- [x] 退出登录入口仍正常清除会话并跳登录页。
- [x] 各子页面登录态内的功能正常渲染（如「个人信息」正确显示当前账号昵称）。

---

## 3. 附带发现：仓库级 `[c]` 损坏（预存在，建议另起一轮清理）

> 修复 122-B 过程中暴露：当前 `main` 分支存在**跨多文件的预存在损坏**，表现为内联/主脚本中出现 `[c];` / `[c]); }` / `,2200); }` 等明显非法的残留行（疑似某次全局替换把 `setTimeout(..., 2200)` 之类函数体误删为 `[c]`）。与本次两个 Bug 无因果关系，属独立历史问题。

- 受影响的疑似文件（已排查，不含 `config.js:110` 的合法转义映射 `return (...)[c];`）：
  `index.html`（SW/更新内联脚本，`[c])); }`，良性——首页功能正常但控制台有 `Unexpected token ')'`）、
  `about.html` `basic-data.html` `changelog.html` `company.html` `department.html` `dictionary.html` `project.html` `project-version.html`（单行 `[c];`，多位于 init 包装被截断处）、
  `user.html` `position.html`（两行 `,2200); }` 版本）。
- 影响：`profile.html` / `security.html` 因本次修复变得可达，其主脚本损坏会导致整页失效——已在本批次（122-C）**顺手删除损坏行**使其恢复正常（实测「个人信息」正确渲染账号信息）。
- 其余文件（含 `index.html` 的良性 SW 脚本报错）**本次未改动**，建议单独排期批量还原原始逻辑，**避免在本修复批次中夹带大范围未知意图的重构**。

---

## 4. 风险与回滚

| 项 | 风险 | 应对 |
|---|---|---|
| 122-A | `TODO_STATUS_DICT` 改函数，需同步 7 处调用 | 已 `sed` 批量替换并 `node --check`；实测三种代办类型状态均正确渲染 |
| 122-A | 是否还有其他顶层固化 `RT_DICT` 的取值 | 全文件排查：`RT_DICT` 的顶层引用仅此一处（IIFE），其余均在 `init`/渲染函数内（defer 后执行），无遗漏 |
| 122-B | 24 处闸门包裹，可能误伤含其他逻辑的脚本 | 脚本仅含闸门逻辑；已用脚本仅对「首个含闸门的行内脚本」包裹，并跳过已包裹者；`index.html` 等排除项未动 |
| 122-B | `DOMContentLoaded` 晚于 `auth.js` 的保证 | `auth.js` 为 `defer`，规范保证 defer 脚本在 `DOMContentLoaded` 前执行完毕 |
| 122-C | 删除 `profile/security` 损坏行可能移除非关键逻辑 | 损坏行为明显非法的死代码（语法错误），删除仅恢复解析；实测页面功能正常 |
| 通用 | 静态资源 `?v=` 漂移 | 本次仅改 `.js` 内联逻辑 / `.html` 内联脚本，未新增静态资源，无需登记 `release.sh` |

---

## 5. 执行顺序与提交

1. **122-A**：`app.js` 改 `TODO_STATUS_DICT` 为惰性函数 + 7 处调用 → 浏览器验证代办统计与状态 chips 正常。
2. **122-B**：24 个子页面 HTML 闸门包裹进 `DOMContentLoaded` → 逐一点击侧边栏入口验证不再跳登录。
3. **122-C**：`profile.html` / `security.html` 删除 `[c]` 损坏行 → 验证「个人信息 / 账号与安全」正常渲染。
4. 回归冒烟：任务视图、报表、基础数据下钻、权限守卫（`data-perm`）均不受影响。
5. 随下次 `./release.sh` 升版 → 提交 `fix(批次122-A):` / `fix(批次122-B):` / `fix(批次122-C):` 及 `chore(release):` → 推送 `main`。
