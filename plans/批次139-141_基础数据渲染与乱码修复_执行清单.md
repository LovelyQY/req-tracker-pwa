# 需求追踪 PWA · 基础数据渲染与乱码修复执行清单（批次 139–141）

> 来源：https://github.com/LovelyQY/req-tracker-pwa · 起点版本 `v1.3.59`
> 范围：修复 v1.3.59 之后暴露的基础数据系列三类渲染故障（乱码 / 字典空列表 / 子页内容不展示）。
> 批次规则：**批次号自 138 之后顺延为 139 / 140 / 141**，每个独立任务一个批次号；问题 3 为单一根因类问题，5 个同因子页归并到批次 141。
> 本文档为**执行清单合集**：各批次集中于此文件，按「现象 → 根因 → 修改方案 → 验收」逐项执行并打勾，随实现一并提交至 `plans/`。
> 发版版本：随下次 `./release.sh` 升版统一处理（本清单仅规划，不单独升版），预期 `v1.3.59 → v1.3.60`。
> 验收基线：涉及脚本改动须 `node --check` 通过；新增/改动静态资源须带 `?v=` 并在 `release.sh` 注册（RULES.md）；HTML 须 UTF-8 合法（Python `decode('utf-8')` 通过，无 U+FFFD）；改动后不得引入解析期对 defer 全局的直接调用。

## 批次 → 任务 → 优先级 映射

| 批次 | 任务 | 对应问题 | 优先级 | 实测规模 |
|------|------|----------|--------|----------|
| **139** | 恢复 `basic-data.html` UTF-8 乱码 | 问题 1 | P0 | 1 个 HTML（26 个中唯一损坏，字节 3921–3922 非法续字节） |
| **140** | 修复 `dictionary.html` 字典页空列表 | 问题 2 | P0 | 1 个 HTML（删除 1 行解析期 `boot();`） |
| **141** | 修复 5 个基础数据子页解析期裸 `render()` | 问题 3 | P0 | 5 个 HTML（各删除 1 行解析期 `render();`） |

## 执行方式

- **逐批次执行**：每个批次在本文档中对应一个 `## 批次 NNN · …` 小节，按「现象 → 根因 → 修改方案 → 验收」逐项落地并打勾。
- **不升版原则**：本清单文档本身不触发改版本；实际代码落地后随下次 `./release.sh` 统一升版（或按 RULES.md 用 `[no-version-bump]` 例外提交）。
- **静态资源登记**：任何新建 JS/CSS/HTML 须带 `?v=` 并在 `release.sh` 注册（RULES.md 静态资源版本标识规则），否则 pre-push 自检会拦下。
- **验收基线**：每个批次的「验收」条目须全部满足后方可视为完成；涉及脚本改动以 `node --check` 通过为底线；HTML 以 UTF-8 合法为底线。
- **根因共因**：问题 2 与问题 3 属同一类故障——**解析期内联脚本直接调用仅由 defer 脚本定义的全局（`escapeHtml`/`toast`/`$`/`RT_*`）→ `ReferenceError` → 整段内联脚本中止 → 其后 `onPageShow`/`onVisible`/`registerAppSW` 注册永不到达 → 页面不渲染**。

---

## 批次 139 · 恢复 basic-data.html UTF-8 乱码

### 0. 概要
`basic-data.html` 在 v1.3.59 的修复性编辑中，中文多字节被损坏为 `替换字符（U+FFFD）?`，导致基础数据 hub 页描述文字乱码。该文件是 26 个 HTML 中唯一损坏者，损坏前最后有效提交为 `834da5f`（v1.3.58）。本批次从 `834da5f` 恢复 UTF-8 干净内容，并重新注入非 defer 的 `config.js` 引用（v1.3.59 已补，乱码修复后须保留，否则会退回空白页）。

### 1. 现象
- 基础数据 hub 页（`basic-data.html`）模块描述出现乱码，如 `维护总公替换字符（U+FFFD）? / 分公司层级`、`任务类替换字符（U+FFFD）? / 优先替换字符（U+FFFD）? / 任务状态），仅查看`、`模替换字符（U+FFFD）? / 页面 / 操作三级替换字符（U+FFFD）?` 等。
- 页面有内容框架但中文描述不可读（非空白，区别于 v1.3.58 的空白页）。

### 2. 根因定位（实测）
- `python3 -c "open('basic-data.html','rb').read().decode('utf-8')"` 在字节 3921–3922 抛 `UnicodeDecodeError: invalid continuation byte`；全仓 26 个 HTML 中仅此 1 个损坏。
- `git diff 834da5f..f27a5d4` 显示损坏出现在 `desc:` 中文字面量（如 `统计。`、`层级`、`联系方替换字符（U+FFFD）?`、`所属项替换字符（U+FFFD）?`、`分配人员替换字符（U+FFFD）?`、`三级替换字符（U+FFFD）?`），而非我插入的 ASCII `<script src="config.js?v=1.3.59">` 行（该行完好）。
- 损坏由 v1.3.59 的读—改—写流程未保真多字节 UTF-8 引入；`834da5f` 为损坏前最后有效版本。

### 3. 修改方案
1. 从最后有效提交恢复 UTF-8 内容（纯字节恢复，不经任何重编辑，避免二次损坏）：
   ```bash
   git show 834da5f:basic-data.html > basic-data.html
   ```
2. 在 `sw-register.js` 引用行**之前**重新插入非 defer、纯 ASCII 的 `config.js` 引用（版本号随本次发版填 `v1.3.60`）：
   ```html
   <script src="config.js?v=1.3.60"></script>
   ```
   - 保留原解析期 `render();`：因 `config.js` 为非 defer，`escapeHtml` 在解析期已可用，`render()` 能正常渲染（这正是 v1.3.59 修复空白页的关键，不可删除）。
3. **不得**对该文件做中文内容的二次手改，所有中文以 `834da5f` 字节为准。

### 4. 验收
- [ ] `python3 -c "import glob;[open(f,'rb').read().decode('utf-8') for f in glob.glob('*.html')];print('ALL HTML UTF-8 OK')"` 全绿（含 `basic-data.html`）。
- [ ] `grep -n "config.js" basic-data.html` 确认存在**非 defer** 的 `config.js?v=1.3.60` 引用，且位于 `sw-register.js` 之前。
- [ ] 文件中不再出现 `替换字符（U+FFFD）` 或 `?` 替代的多字节缺损（人工/脚本核对 `desc:` 字段完整）。
- [ ] 该文件无 `node --check` 需求（纯 HTML）；其余被改 JS（如无）跳过。

---

## 批次 140 · 修复 dictionary.html 字典页空列表

### 0. 概要
`dictionary.html` 内联脚本在解析期直接调用 `boot()`，而 `boot()` 调用 `toast()`（`config.js` 为 defer，解析期未定义）→ `ReferenceError` → 整段内联脚本中止 → `onPageShow`/`onVisible`/`registerAppSW` 注册永不到达 → 字典列表永久为空（且因未走到 `showErr`，无任何报错提示）。本批次删除解析期 `boot();`，改由已注册的 `onPageShow`（defer 脚本就绪后由 `pageshow` 触发）完成首屏与可见性重渲染。

### 1. 现象
- 字典管理页（`dictionary.html`）类型下拉框与字典列表均为空。
- 控制台无显式报错（脚本在到达 `showErr` 前已因 `toast` 未定义而整体中止）。

### 2. 根因定位（实测）
- `dictionary.html` 脚本标签：`config.js` 为 `<script src="config.js?v=1.3.59" defer></script>`（第 103 行）→ 解析期内联脚本执行时 `toast`/`escapeHtml` 尚未定义。
- 第 189 行解析期 `boot();`；`boot()`（178–187）首行 `if (typeof RT_DICT === 'undefined') { toast('字典模块未加载'); render(); return; }` → `toast` 未定义 → `ReferenceError` → 内联脚本整体中止。
- 第 190–193 行 `onPageShow(function(){ renderTypeSelect(); render(); })`、`onVisible(...)`、`registerAppSW();` 因前序中止**永不执行**；`RT_DICT` 后续经 defer 就绪，但无监听器触发 `render()` → 列表恒空。

### 3. 修改方案
- 删除第 189 行解析期直接调用 `boot();`。
- **保留**第 190–193 行：`onPageShow(function(){ renderTypeSelect(); render(); })`、`onVisible(function(){ renderTypeSelect(); render(); })`、`registerAppSW();`。
- 原理：`onPageShow` = `window.addEventListener('pageshow', fn)`，`pageshow` 在首次加载也会触发（晚于 defer 脚本），故删除解析期 `boot()` 后，首屏仍由 `pageshow` 正常渲染，且与 `onVisible` 共同保证可见性切换时重渲染。

### 4. 验收
- [ ] `sed -n '178,193p' dictionary.html` 确认 `boot();` 已删除，`onPageShow`/`onVisible`/`registerAppSW` 三行仍在。
- [ ] `grep -nE "^\s*boot\(\);\s*$" dictionary.html` 无输出（解析期裸 `boot()` 已清零）。
- [ ] 该文件无 `node --check` 需求（纯 HTML 行级删除）。

---

## 批次 141 · 修复 5 个基础数据子页解析期裸 render()

### 0. 概要
`company / department / position / project / project-version` 五个子页在批次 137 迁移中已加上 `onPageShow(render)` / `onVisible(render)`，但**遗漏删除**原先的解析期直接调用 `render();`。解析期 `render()` 进入 `if (typeof RT_X === 'undefined') { showErr(...) }` → `showErr` 内部调用 `escapeHtml()`（`config.js` 为 defer，解析期未定义）→ `ReferenceError` → 内联脚本中止 → 后续 `onPageShow`/`onVisible`/`registerAppSW` 注册永不到达 → 页面内容不展示。本批次仅删除各页解析期那一行裸 `render();`，保留监听器注册。

### 1. 现象
- 基础数据下各子页（公司 / 部门 / 职位 / 项目 / 项目版本）部分或全部已有内容不展示，列表为空或残缺。
- 控制台无显式报错（脚本在 `showErr`→`escapeHtml` 处已整体中止）。

### 2. 根因定位（实测）
- 五页 `config.js` 均为 defer（company 214 / department 208 / position 184 / project 211 / project-version 211）。
- 各页 `render()` 首行形如 `if (typeof RT_COMPANIES === 'undefined') { showErr('…未加载'); return; }`；解析期 `RT_X` 未定义 → 走 `showErr`。
- `showErr`（ui-utils.js 非 defer）内部 `$('list').innerHTML = '…' + escapeHtml(msg) + '…'`；`$` 可用，但 `escapeHtml` 来自 defer 的 `config.js` → 解析期未定义 → `ReferenceError` → 脚本中止。
- 中止导致其后的 `onPageShow(render); onVisible(render); registerAppSW();` 永不注册；`RT_X` 经 defer 就绪后无监听器触发 `render()` → 内容恒不展示。
- `project.html` / `project-version.html` 的 `.catch(function(){ render(); })` 为 Promise 回调（defer 之后执行，安全），**不删**；仅删解析期那一行（project 431 / project-version 435）。

### 3. 修改方案（逐文件删除解析期裸 `render();`）

| 文件 | 删除行 | 保留（不删） |
|------|--------|--------------|
| `company.html` | 375 `render();` | 376–379（`onPageShow`/`onVisible`/`registerAppSW`） |
| `department.html` | 423 `render();` | 424–427 |
| `position.html` | 356 `render();` | 357–359 |
| `project.html` | 431 `render();` | 433–436（`.catch` 内 `render()` 不动） |
| `project-version.html` | 435 `render();` | 437–440（同上） |

- 每个文件仅删除解析期那一行；其后紧邻的 `onPageShow(render); onVisible(render); registerAppSW();` 一律保留。
- 原理同批次 140：`onPageShow` 由 `pageshow`（首次加载亦触发）驱动，`render()` 在 defer 全局就绪后执行，首屏与可见性重渲染均正常。

### 4. 验收
- [ ] `grep -rnE "^\s*(render|boot)\(\);\s*$" *.html` 输出中**不再**出现上述 5 行（及批次 140 的 `dictionary.html:189`），仅剩受控安全的 `basic-data.html:115`（已带非 defer config.js）、`changelog.html:184`、`profile-detail.html:97`、`security.html:258`。
- [ ] 五页 `grep -n "onPageShow\|onVisible\|registerAppSW" <file>` 均确认监听器仍在。
- [ ] `python3 -c "import glob;[open(f,'rb').read().decode('utf-8') for f in glob.glob('*.html')];print('ALL HTML UTF-8 OK')"` 全绿（本次未改中文，应本就合法）。
- [ ] 该批次无 JS 改动，仅需行级 HTML 删除，无需 `node --check`。

---

## 附：已排查安全（不在本清单修复范围）

- `changelog.html:184`：v1.3.59 已补**非 defer** `config.js` → `escapeHtml` 解析期可用 → 正常。
- `profile-detail.html:97` / `security.html:258`：`config.js` 虽为 defer，但其 `render()` 内 `RT_*` 全部 `typeof` 守卫、不调用 `escapeHtml`/`toast` → 解析期不抛错 → 安全。
- `role.html` / `permission.html`：渲染逻辑委托 `role.js` / `permission.js`（defer，自注册 `onPageShow`）→ 安全。
- `user.html`：使用 `refresh` 而非 `render`，且 `onPageShow(refresh)` 已注册 → 安全。
- `basic-data.html` 修复后：`config.js` 非 defer + 保留解析期 `render()` → 正常。

## 后续发布步骤（执行确认后执行）

1. 升版 `v1.3.59 → v1.3.60`：`bash release.sh "修复基础数据系列渲染：批次139 恢复 basic-data.html UTF-8 乱码；批次140 删除字典页解析期 boot()；批次141 删除 5 个子页解析期裸 render()，恢复 onPageShow/onVisible 监听器注册"`。
2. `release.sh` 内置 `node --check` 与 `?v=` 漂移自检（任何 `*.js?v=`/`*.css?v=` ≠ 新版本号即中止）→ 须全绿。
3. 确认 `CHANGELOG.md` 已含 v1.3.60 条目（批次 139/140/141 说明）。
4. PAT 推送 + 重置远端（既定模式）：注入 token 推送 `main` → 重置 remote URL。
5. 回归验证命令（见各批次验收 + 全仓 UTF-8 校验）。
