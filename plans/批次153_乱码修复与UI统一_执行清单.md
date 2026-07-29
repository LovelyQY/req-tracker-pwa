# 批次153-159：乱码修复、图标统一、存储备份改造、PWA图标缓存、编码检查、图标可配置化、字典规范化

> 创建时间：2026-07-29 12:54
> 更新时间：2026-07-29（157 拆为 157 编码检查 / 158 图标可配置化 / 159 字典规范化 三个独立批次）
> 状态：待执行
> 前置版本：v1.3.62

---

## 问题总览

| # | 问题 | 严重度 | 根因 | 对应批次 |
|---|------|--------|------|---------|
| 1 | 基础数据页中文乱码（菱形问号 �?） | **高** | `basic-data.html` 有 15 处 UTF-8 损坏字节（每个汉字第3字节被改写为 `0x3F`） | 153 |
| 2 | 图标管理页图标浅蓝底+蓝线 vs 深蓝底+白线 | 中 | `icon-manager.html` 的 `.pv` 容器 CSS 与 basic-data.html `.module-icon` 不同 | 154 |
| 3 | 存储与备份页需改为基础数据式双入口 | 中 | 当前单页两区块平铺 | 155 |
| 4 | PWA 本地应用图标未更新 | 中 | `manifest.json` 图标 src 无版本号；平台层缓存未失效 | 156 |
| 5 | 图标视觉未统一管理（配色散落，无法一键替换） | 中 | 5 类图标各自独立定义配色 | 158 |
| 6 | 全项目编码一致性 | 高（前置） | 修复乱码后需全量验证，防引入新损坏 | 157 |
| 7 | 字典管理数据源缺乏规范化注释 | 低 | `dictionary.js` SEED_TYPE/SEED 已是集中源，但无明确约定 | 159 |

---

## 批次153：修复 basic-data.html UTF-8 乱码

### 问题描述
基础数据页所有中文文字出现菱形问号乱码（如「维护总公�?」「部�?」「职�?」等）。页面标题正常（"基础数据"），但模块列表 `name`/`desc` 字段全部乱码。

### 根因分析
- 文件无 BOM（前3字节 = `3c 21 44` = `<!`），`<meta charset="UTF-8">` 声明正确
- 存在 **15 处损坏的 3 字节 UTF-8 汉字**：每个损坏汉字前 2 字节完好，第 3 字节被改写为 `0x3F`（ASCII `?`）
- 例如：「司」`E5 8F B8` → 损坏 `E5 8F 3F`
- 二进制字节被意外覆写，非编码转换问题

### 修复方案
Python 二进制替换修复全部 15 处损坏字节：
```python
src = open('basic-data.html', 'rb').read()
replacements = [
    (b'\xe3\x80\x3f</p>', b'\xe3\x80\x82</p>'),   # 。 (句号)
    (b'\xe3\x80\x3f)',        b'\xe3\x80\x89)'),     # ）(右括号全角)
    (b'\xef\xbc\x3f)',        b'\xef\xbc\x89)'),     # ）(右括号半角)
    (b'\xe5\x8f\x3f',         b'\xe5\x8f\xb8'),       # 司
    (b'\xe9\x97\x3f',         b'\xe9\x97\xa8'),       # 门
    (b'\xe5\xbc\x3f',         b'\xe5\xbc\x8f'),       # 式
    (b'\xe7\x9b\x3f',         b'\xe7\x9b\xae'),       # 目
    (b'\xe5\x9d\x3f',         b'\xe5\x9d\x97'),       # 块
    (b'\xe5\x9e\x3f',         b'\xe5\x9e\x8b'),       # 型
    (b'\xe7\xba\x3f',         b'\xe7\xba\xa7'),       # 级
    (b'\xe4\xb8\x3f',         b'\xe4\xb8\xaa'),       # 个
    (b'\xe8\x81\x3f',         b'\xe8\x81\x94'),       # 联
    (b'\xe5\xad\x3f',         b'\xe5\xad\x97'),       # 符
]
for old, new in replacements:
    src = src.replace(old, new)
open('basic-data.html', 'wb').write(src)
```

### 验收
- `python3 -c "open('basic-data.html','rb').read().decode('utf-8')"` 不报错
- 浏览器打开所有中文正常：标题「基础数据」、说明「集中维护各类基础数据，便于任务归类与统计。」、模块名称与描述全部正确

### 涉及文件
- `basic-data.html`（唯一修改）

---

## 批次154：图标管理页图标样式统一为深蓝底+白线

### 问题描述
图标管理页图标显示为浅蓝底+蓝线（线框），基础数据页为深蓝渐变底+白线（填充 chip），视觉不一致。两页用**同一套 SVG 源**（`page-icons.js` 全为 `stroke` 风格），差异在**容器 CSS**。

| 页面 | 容器 class | background | color |
|------|-----------|------------|-------|
| 基础数据页 | `.module-icon` | `linear-gradient(135deg,#1677ff,#4096ff)` | `#fff` |
| 图标管理页 | `.icon-item .pv` | `#f1f6ff` | `var(--primary)` |

### 修复方案（icon-manager.html 两处 CSS）

**① 列表项图标容器**（51–52 行）：
```css
/* 修改后 */
.icon-item .pv{width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  color:#fff;background:linear-gradient(135deg,#1677ff,#4096ff);border-radius:10px;
  box-shadow:0 2px 8px rgba(22,119,255,.2)}
```

**② 编辑面板预览区**（65–66 行）：
```css
/* 修改后 */
.editor .preview{display:flex;align-items:center;justify-content:center;height:120px;
  background:linear-gradient(135deg,#1677ff,#4096ff);border-radius:12px;color:#fff;margin-bottom:12px}
```

### 验收
图标管理页列表图标 = 深蓝渐变底 + 白色线条（与基础数据页一致）；编辑预览区同步。

### 涉及文件
- `icon-manager.html`（CSS 修改，2 处）

> 注：本批次确定**视觉基准**（深蓝渐变底+白字），批次158 将把该视觉抽成 `theme.css` 变量，使全站 5 类图标一处可换。

---

## 批次155：存储与备份页改造为基础数据式双入口

### 问题描述
当前「存储与备份」页（`storage-backup.html`）单页两区块平铺（数据备份 + 存储与数据），需改为基础数据式**两个子菜单卡片入口，点击进入各自详情**。

### 目标结构
```
存储与备份（landing 页，basic-data 式列表）
├── 📥 数据备份  → storage-backup.html#backup
└── 💾 存储与数据 → storage-backup.html#storage
```

### 修复方案（hash 路由）
**① 结构调整**：`<div class="container">` 内分 `landingView`（入口列表）/ `backupView` / `storageView`（保留原两个 settings-section，按 hash 显示）。

**② 入口卡片样式**（沿用批次154 确定的视觉，后续批次158 变量化）：
```css
.section-desc{font-size:13px;color:var(--muted);line-height:1.6;margin:4px 4px 14px}
.module-list{background:var(--surface);border-radius:var(--radius);overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.module-row{display:flex;align-items:center;gap:14px;padding:16px;background:var(--surface);
  border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s}
.module-row:last-child{border-bottom:none}
.module-row:active{background:#f2f4f7}
.module-icon{flex-shrink:0;width:44px;height:44px;border-radius:12px;
  display:flex;align-items:center;justify-content:center;color:#fff;
  background:linear-gradient(135deg,#1677ff,#4096ff);box-shadow:0 4px 12px rgba(22,119,255,.25)}
.module-main{flex:1;min-width:0}
.module-name{font-size:16px;font-weight:600}
.module-desc{font-size:12px;color:var(--muted);margin-top:3px;line-height:1.5}
.module-arrow{color:#c7ccd4;flex-shrink:0}
```

**③ JS**：`SUB_MODULES` 渲染 landing 列表；`handleRoute()` 按 `location.hash` 切换视图；`hashchange` 监听。

**④ 返回行为**：子视图返回清空 hash 回 landing；landing 返回 `goBack()`。

**⑤ 两个入口图标重新生成（符合现有图标风格，并同步进图标管理）**：
- ❌ **不要**复用原 `storage-backup.html` 里带 `bk-fill/bk-stroke` / `sto-fill/sto-stroke` 渐变 defs 的内联 SVG。那类图标是区块内装饰专用，带硬编码蓝/紫渐变填充，与 `page-icons.js` 的 `stroke="currentColor"` 风格不一致，**不适合原样放进图标管理**。
- ✅ 按 `page-icons.js` 现有 14 个图标的统一风格（`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`）**重新生成两个 stroke 风格图标**：
  - `backup`（数据备份）：云 + 上箭头（导出/备份语义）
    ```svg
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/></svg>
    ```
  - `storage`（存储与数据）：数据库 cylinder（存储语义）
    ```svg
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
    ```
- ✅ 将这两个图标**注册进 `page-icons.js` 的 `defaults`**（新增 `backup` / `storage` 两个 key），使图标管理页可统一预览 / 编辑 / 导出。
- ✅ `icon-manager.js` 的 `KEY_LABELS` 同步补充 `'backup': '数据备份'`、`'storage': '存储与数据'`，避免图标管理页显示英文 key。
- ✅ 存储与备份页入口卡片改为 `RT_PAGE_ICONS.get('backup')` / `RT_PAGE_ICONS.get('storage')` 引用（与基础数据页一致）。

**⑥ 配色统一**：入口图标容器沿用批次154 确定的深蓝渐变底+白字（`stroke="currentColor"` 在蓝底上即白色）；批次158 落地 `theme.css` 后改为变量引用。

### 涉及文件
- `storage-backup.html`（结构调整 + CSS + JS + 入口图标引用 `RT_PAGE_ICONS.get`）
- `page-icons.js`（`defaults` 新增 `backup` / `storage`）
- `icon-manager.js`（`KEY_LABELS` 新增 `backup` / `storage` 中文标签）

### 执行状态
- **状态：已完成（2026-07-29）**　提交 `737d340`（含 `[no-version-bump]`，版本保持 v1.3.62，已推 `main`）。
- `storage-backup.html`：拆分为 `landingView`（基础数据式 `.module-list` 入口列表）+ `backupView` / `storageView` 两个子视图（初始 `hidden`，按 `location.hash` 切换）；入口卡片 `.module-icon` 复用 `theme.css` 变量，图标经 `RT_PAGE_ICONS.get('backup'/'storage')` 注入；导航栏返回改为 `storagePageBack()`（子视图清 hash 回 landing，landing 才离开本页）；新增 `page-icons.js` 脚本引用。
- `storage-backup.js`：新增 `SUB_MODULES` / `renderLanding` / `handleRoute` / `storagePageBack` / `bootRouting`（先 `RT_PAGE_ICONS.init()` 再渲染 landing，并监听 `hashchange`）。
- `page-icons.js`：`defaults` 新增 `backup`（云+上箭头）、`storage`（数据库 cylinder）两个 `stroke="currentColor"` 风格图标，自动进入 `list()` 与图标管理页。
- `icon-manager.js`：`KEY_LABELS` 新增 `backup=数据备份`、`storage=存储与数据`，图标管理页现在可统一预览 / 编辑 / 导出这两个图标（非原区块内渐变装饰 SVG）。
- 验证：3 个 JS 文件 `node --check` 通过；`page-icons.js` defaults 共 16 个 key；`get('backup'/'storage')` 均返回 `stroke="currentColor"` + `fill="none"` 的合规 SVG；HTML 视图 ID 与 JS 引用一致；UTF-8 有效。

---

## 批次156：PWA 图标缓存更新机制

### 问题描述
v1.3.62 已重新生成 PWA 桌面图标（蓝底白线剪贴板风格，与登录页一致），但本地安装 PWA 图标未更新。

### 根因
1. `manifest.json` 图标路径无版本号 → 浏览器/SW 缓存以 URL 为 key，路径不变返回缓存
2. iOS Safari 平台限制：已装 PWA 主屏图标由系统缓存控制，必须删除重装
3. SW `CACHE='req-tracker-v1.3.62'` 已 bump，但 stale-while-revalidate 下旧缓存可能仍被使用

### 修复方案
**① manifest.json 图标加版本参数**：
```json
{ "src": "icons/icon-192.png?v=1.3.62", "sizes": "192x192", "type": "image/png", "purpose": "any" },
{ "src": "icons/icon-512.png?v=1.3.62", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
```
**② sw.js APP_SHELL**（36–37 行）同步加 `?v=1.3.62` 版本参数
**③ index.html** `apple-touch-icon` / `favicon` 加 `?v=1.3.62`（可选）
**④ 与 theme.css 联动**：PWA 是位图，无法用 CSS 变量换色；参数化生成脚本（读 `theme.css` 主色重生成 PNG）归批次158/159 之后衍生，本批次仅完成版本号 + 缓存失效。

### 用户侧提示
- Android Chrome：清除站点数据或卸载重装
- iOS Safari：长按删除 → 重新访问 → 添加到主屏幕（平台限制，代码无法绕过）

### 涉及文件
- `manifest.json`、`sw.js`、`index.html`

### 执行状态
- **状态：已完成（2026-07-29）**　提交 `ad7b6a7`（含 `[no-version-bump]`，版本保持 v1.3.62，已推 `main`）。
- `manifest.json`：两个图标 `src` 加 `?v=1.3.62`（`icon-192.png`、`icon-512.png`），已通过 `python3 json.load` 校验合法。
- `sw.js`：APP_SHELL 预缓存 `./icons/icon-192.png` / `./icons/icon-512.png` 同步加 `?v=1.3.62`；`node --check` 通过。
- `index.html`：`apple-touch-icon` 与 `favicon-32` 加 `?v=1.3.62`（方案③可选项一并落实）。
- 说明：PNG 位图已在 v1.3.62 重新生成（蓝底白线剪贴板风格）；本批次仅通过版本参数使浏览器 / SW 缓存失效，解决「本地安装 PWA 图标未更新」。位图无法用 CSS 变量换色，参数化生成脚本（读 `theme.css` 主色重生成全套 PNG）归衍生需求，不在本批次范围。用户侧 iOS 仍需删除重装主屏图标（平台限制）。
- 验证：manifest.json 合法、sw.js 语法 OK、三处版本参数均已落地、UTF-8 有效。子页面 `apple-touch-icon` 未改（超出本批次范围，按方案 涉及文件 仅限上述三文件）。

---

## 批次157：全面编码检查（单一职责）

### 目标
执行批次153（修复乱码）后，全量验证项目编码零异常，作为后续改造的回归基线。

### 验证脚本
```bash
python3 -c "
import glob
for f in sorted(glob.glob('**/*.html', recursive=True) + glob.glob('**/*.js', recursive=True)):
    if 'node_modules' in f: continue
    try: open(f,'rb').read().decode('utf-8')
    except UnicodeDecodeError as e: print(f'STILL BROKEN: {f} -> {e}')
print('Scan complete.')
"
```

### 验收
输出仅为 `Scan complete.`，无任何 STILL BROKEN。

### 补充防回归检查
- 全项目无 BOM（`head -c3 | xxd` 非 `ef bb bf`）
- 无字面 U+FFFD（`'\ufffd' in text` 为 False）
- 所有 `?v=` 引用版本号一致

### 涉及文件
- 只读验证：全项目 HTML/JS（无修改）

---

## 批次158：全局图标视觉集中化（单一职责）

> 将批次154 确定的视觉基准抽成单一变量源，覆盖**5 类关键图标**：① 图标管理 14 个　② 首页（品牌+抽屉）　③ 存储与备份　④ 登录页 logo　⑤ PWA 应用图标。**一处改全局生效（非用户 UI 开关）。**

### 覆盖范围与纳入方式

| 图标类别 | 当前实现 | 纳入方式 |
|---------|---------|---------|
| ① 图标管理 14 个 | `page-icons.js` + 容器 CSS（154 已定视觉） | 容器改用 theme.css 变量 |
| ② 首页品牌/抽屉 | `index.html` 品牌 `stroke="#1677ff"`、抽屉 `stroke="currentColor"` | stroke 改 `var(--icon-primary)` |
| ③ 存储与备份 | 入口图标已在 **批次155** 注册进 `page-icons.js`（`backup`/`storage`，stroke 风格）；区块内仍含 `bk-`/`sto-` 渐变 defs 装饰图标 | 入口图标随 158 变量化；区块装饰图标 gradient stop 改引用 `--icon-primary` 系（紫存储可保留特例变量） |
| ④ 登录页 logo | `login/classic.html` 内联 SVG（保持内联，用户要求） | stroke 绑定 `var(--icon-primary)` |
| ⑤ PWA 应用图标 | `icons/*.png` 位图 + manifest | theme.css 主色 → 参数化生成脚本重生成 PNG（本批次建机制，脚本见衍生） |

### 实现方案
**① 新建 `theme.css`**（图标视觉唯一真相源）：
```css
:root{
  --icon-primary: #1677ff;
  --icon-primary-light: #4096ff;
  --icon-bg: linear-gradient(135deg, #1677ff, #4096ff);
  --icon-fg: #ffffff;
  --icon-shadow: 0 4px 12px rgba(22, 119, 255, .25);
  --icon-radius: 12px;
}
```

**② 各页面引入 `theme.css` 并将图标配色改变量引用**：
- `basic-data.html` / `icon-manager.html`（154 已定视觉）：`.module-icon` / `.icon-item .pv` / `.editor .preview` 改 `background:var(--icon-bg);color:var(--icon-fg);box-shadow:var(--icon-shadow);border-radius:var(--icon-radius)`
- `dictionary.html`：`.group-head` 如需统一，改引用 `--icon-bg` 系
- `index.html`：`.brand-icon svg` 的 `stroke="#1677ff"` → `stroke="var(--icon-primary)"`；抽屉导航图标 `stroke="currentColor"` → `stroke="var(--icon-primary)"`
- `storage-backup.html`：把 `bk-fill/bk-stroke`、`sto-fill/sto-stroke` 的 gradient stop-color 改为 `var(--icon-primary)` / `var(--icon-primary-light)`（紫存储图标可保留特例变量 `--icon-accent-purple` 或一并统一）
- `login/classic.html`：logo `stroke="currentColor"` 的父容器设 `color:var(--icon-primary)`；保持内联 SVG 结构不变

**③ 未来一键替换（紫色主题示例）**：只改 `theme.css`：
```css
--icon-primary: #722ed1; --icon-primary-light: #9254de;
--icon-bg: linear-gradient(135deg, #722ed1, #9254de); --icon-fg: #ffffff;
```
→ SVG 图标（首页/存储/登录/图标管理/基础数据）立即换色；运行 PWA 生成脚本 + 发版 → PNG 与 PWA 同步。

### 衍生需求（顺延 160+，不阻塞）
- SVG 源集中（**存储与备份已在批次155 完成**）：首页品牌、抽屉、登录 logo 也登记进 `page-icons.js` 的 `defaults`，使图标管理页可统一预览/导出全部 SVG
- PWA 图标参数化生成：脚本读 `theme.css` 主色重生成全套 PNG
- 动态主题切换器

### 涉及文件
- 新增：`theme.css`
- 修改（引入 + 变量化）：`basic-data.html` / `icon-manager.html` / `dictionary.html` / `index.html` / `storage-backup.html` / `login/classic.html`

### 执行状态
- **状态：已完成（2026-07-29）**　提交 `342410e`（含 `[no-version-bump]`，版本保持 v1.3.62，已推 `main`）。
- `theme.css` 新增并扩展变量：`--icon-bg`(深蓝渐变)/`--icon-fg`(白)/`--icon-radius`(12px)/`--icon-shadow`/`--icon-primary`(+light)/`--icon-fill-light`(+2)/`--icon-accent`(+light/fill/2)；PNG 位图（PWA）因无法用 CSS 变量换色，参数化生成归衍生需求。
- 6 个页面已引入 `theme.css`（登录页用 `../theme.css` 子目录引用），5 类图标容器全部改为变量引用：
  - `basic-data.html` `.module-icon`、`icon-manager.html` `.icon-item .pv`/`.editor .preview` → `var(--icon-bg/-fg/-radius/-shadow)`
  - `index.html` `.brand-icon svg` 与 `.drawer-item svg:first-child` 加 `<style>` 覆盖 `stroke/color` 为 `var(--icon-primary)`（原 `stroke="#1677ff"` 属性保留作兜底）
  - `login/classic.html` `.logo` → `var(--icon-bg)`
  - `storage-backup.html` 16 处 gradient `stop-color` 改为 `style="stop-color:var(--icon-*)"`
  - `dictionary.html` 仅引入 `theme.css`（`.group-head` 为浅蓝面板，非图标容器，保持原样）
- 验证：6 文件 UTF-8 有效、均引入 `theme.css`、`linear-gradient(135deg,#1677ff,#4096ff)` 在图标容器内零残留；残留的 `#1677ff` 仅出现在 `--primary` 定义、`meta theme-color`、`.btn-primary`/登录按钮（按钮非图标容器）及 index 兜底属性，均不在图标容器内。

---

## 批次159：字典管理配置规范化（单一职责）

### 目标
确认并强化字典管理数据源的"代码级可配置"（改一处即全局生效，**非用户 UI 开关**），加明确注释与稳定性约定。

### 现状
- 分类定义：`dictionary.js` 第21行 `SEED_TYPE`（12 个分类 key→中文名）
- 种子数据：`dictionary.js` 第50行起 `SEED` 数组（type/code/name/order/color）
- 渲染：`dictionary.html` 通过 `RT_DICT.SEED_TYPE` + `getAllDict()` 动态生成

当前已是"改 `dictionary.js` 一处即生效"的代码级配置，但缺乏明确约定。

### 改造
1. `dictionary.js` 顶部 `SEED_TYPE` 处加注释：明确其为"字典分类唯一真相源，新增/替换分类只需改此处"
2. 确保 `SEED` 数组结构稳定，未来替换字典内容（增删类型、改配色）只需编辑该数组
3. 不在 UI 增加用户可配置开关

### 涉及文件
- `dictionary.js`（SEED_TYPE 注释规范化）

### 执行状态
- **状态：已完成（2026-07-29）**　提交 `6938b29`（含 `[no-version-bump]`，版本保持 v1.3.62，已推 `main`）。
- `dictionary.js` 在 `SEED_TYPE`（第22行附近）与 `SEED`（第52行附近）上方加注释，明确二者为「字典分类唯一真相源」与「种子数据唯一真相源」；强调新增 / 替换分类、改配色、调顺序只需改这两处即全站生效，属「代码级可配置、一键替换」，且**不新增任何用户可配置 UI 开关**（与既有文件头「页面仅查看，不提供增删改」约定一致）。
- 验证：`dictionary.js` `node --check` 通过、UTF-8 有效、两处「唯一真相源 / 代码级可配置 / 用户侧 UI 开关」注释均已落地。
- 至此批次 153–159 全部完成。

---

## 执行顺序与依赖关系

```
153 修复乱码  ──→  必须先做（阻断件）
  ↓
157 编码检查  ──→  验证153成功，建立回归基线（可紧跟153）
  ↓
154 图标样式  ──→  确定视觉基准（深蓝渐变底+白字）
  ↓
158 图标集中化 ──→  把154视觉及全站5类图标抽成 theme.css 变量
  ↓
155 存储备份  ──→  用158的变量（155本期可先用154一致硬编码值，158时变量化）
156 PWA图标   ──→  独立；版本号 + 缓存失效（参数化生成归158衍生）
159 字典规范  ──→  独立，最后做
```

> 推荐执行顺序：**153 → 157 → 154 → 158 → 155 → 156 → 159**
> （155 依赖 158 的 theme.css 变量；若不等待，155 可前置但图标配色在 158 时再变量化）

## 验收标准

| 批次 | 验收方式 |
|------|---------|
| 153 | 浏览器打开 basic-data.html 中文正常无乱码；Python UTF-8 解析不报错 |
| 154 | 图标管理页列表图标 = 深蓝渐变底 + 白色线条（与基础数据页一致） |
| 155 | 存储与备份页显示两个入口卡片（数据备份/存储与数据），点击进入各自详情 |
| 156 | manifest.json 图标含 ?v= 版本号；清除浏览器缓存后 PWA 安装图标更新 |
| 157 | 全项目 Python UTF-8 扫描零错误（仅 `Scan complete.`） |
| 158 | `theme.css` 落地；5 类图标配色集中为单一变量源，跨页引用一致 |
| 159 | `dictionary.js` SEED_TYPE 注释规范化，确认"一处改全局生效" |
