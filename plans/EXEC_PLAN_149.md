# 批次149：UI 一致性修复与图标问题执行清单

> 起始版本：v1.3.61 | 目标版本：待 ./release.sh 升级
> 创建时间：2026-07-29 | **状态：代码完成，待发版**

---

## 问题总览（4 个问题）

| # | 问题 | 严重度 | 影响范围 | 批次 |
|---|------|--------|----------|------|
| 1 | 图标管理页缺少自身条目 → 与基础数据页图标不一致 | 高 | page-icons.js + basic-data.html | 149 |
| 2 | 图标管理页面显示英文 key 而非中文 | 高 | icon-manager.js | 150 |
| 3 | PWA 桌面图标应与登录页 logo 一致（剪贴板+勾选） | 中 | icons/*.png | 151 |
| 4 | 登录页应恢复原始内联 SVG 图标（不引用 PWA 图标） | 中 | login/classic.html | 152 |

---

## 批次149：图标管理共享图标条目 — 修复基础数据与图标管理页不一致 ✅ 已完成

### 现象（截图对比）
- **基础数据页** (`basic-data.html`)：10 个模块卡片中，"图标管理"显示 **调色板图标**
- **图标管理页** (`icon-manager.html`)：仅列出 **13 项**，**没有 `icon-manager` 自身条目**
→ 基础数据页显示了图标管理的图标，但图标管理页不收录自己 → **不一致**

### 根因
批次 148 新建图标管理页时，在 `page-icons.js` 注册了 13 个默认图标（company~report-meeting），但漏掉了 `icon-manager` 自身。基础数据页只好硬编码内联 SVG 兜底。

### 改动
- **`page-icons.js`**：`defaults` 新增 `'icon-manager'` 条目（调色板/画笔 SVG）
- **`basic-data.html`**：图标管理 icon 从硬编码 SVG 改为 `RT_PAGE_ICONS.get('icon-manager') || ''`

### 效果
- `RT_PAGE_ICONS.list()` 返回 **14 项**（含 icon-manager）
- 图标管理页现在列出 **14 项**（含自身），与基础数据页一致
- 字典管理(book) 和 图标管理(palette) 在两页的图标 **来源统一**

### 验收
- [x] `RT_PAGE_ICONS.list()` 返回 14 项（含 icon-manager）
- [x] 基础数据页"图标管理"卡片图标来自共享模块
- [x] 图标管理页内可以编辑 icon-manager 自身图标（覆盖后基础数据页同步更新）

---

## 批次150：图标管理中文标签 ✅ 已完成

### 现象
图标管理页列表每行显示英文 key（`company`, `department`, `position`…），而非中文页面名称。

### 改动
- **`icon-manager.js`**：新增 `KEY_LABELS` 映射表（14 个 key→中文），新增 `labelForKey()`；`renderList()` / `selectKey()` / `reset()` / 保存提示均改为显示中文

### 验收
- [x] 列表 14 项全部显示中文
- [x] 选中编辑面板显示中文名称
- [x] 导出 JSON 仍保留英文 key（未改动）

---

## 批次151：PWA 桌面图标重设计为登录页风格 ✅ 已完成

### 需求
PWA 桌面应用图标（`icons/icon-192.png` / `icon-512.png` / `favicon-32.png`）应与**登录页原始 logo 一致**——即 **蓝色圆角背景 + 白色剪贴板+勾选图标**。不用新生成的清单卡片图标，也不用旧的 PWA 图标。

### 改动
重新生成三个尺寸图标：
- `icons/icon-192.png` (192×192) ✅ 蓝色背景 + 白色剪贴板勾选
- `icons/icon-512.png` (512×512) ✅ 同上
- `icons/favicon-32.png` (32×32) ✅ 同上

### 设计说明
图标图形来自 `login/classic.html` 原始内联 SVG（批次145之前）：
```svg
<rect x="8" y="2" width="8" height="4" rx="1"/>     <!-- 夹子 -->
<path d="M16 4h2a2 0 0 1 2 2v14a2 0 0 1-2 2H6a2 0 0 1-2-2V6a2 0 0 1 2-2h2"/>  <!-- 主体 -->
<path d="M9 14l2 2 4-4"/>                           <!-- 勾选 -->
```
白色描边(stroke) + 蓝色圆角背景(#1677ff)，与登录页 `.logo` 视觉完全一致。

### 验收
- [x] PWA 图标 = 登录页剪贴板+勾选风格
- [x] `manifest.json` 无需变更（文件名不变）

---

## 批次152：登录页恢复原始内联 SVG 图标 ✅ 已完成

### 决策
撤销批次 145 的改动，登录页 logo 恢复为**原始内联 SVG**（剪贴板+勾选），不再引用 `icons/icon-192.png`。
→ 登录页与 PWA 桌面图标解耦，各自独立。

### 改动
- **`login/classic.html`**：
  - CSS: `.logo svg{width:30px;height:30px}`（恢复）
  - logo: 内联 SVG 剪贴板+勾选（恢复）
  - 保留 `appIconGrad` 渐变定义（表单字段图标仍引用）

### 验收
- [x] 登录页 logo 为原始内联 SVG 剪贴板图标
- [x] 不引用 `icons/icon-192.png`
- [x] 表单字段图标(appIconGrad)不受影响

---

## 执行记录

```
批次149 ✅ 图标管理共享图标条目（page-icons.js + basic-data.html）— 修复基础数据与图标管理页不一致
批次150 ✅ 图标管理中文标签（icon-manager.js）
批次151 ✅ PWA 桌面图标 = 登录页剪贴板+勾选风格（icons/*.png）
批次152 ✅ 登录页恢复原始内联 SVG 图标（login/classic.html）
```

## 改动文件总览

| 文件 | 改动内容 | 批次 |
|------|----------|------|
| `page-icons.js` | defaults 新增 'icon-manager' | 149 |
| `basic-data.html` | icon-manager 改为动态获取 | 149 |
| `icon-manager.js` | KEY_LABELS 中文映射表 | 150 |
| `icons/icon-192.png` | 剪贴板+勾选风格（=登录页） | 151 |
| `icons/icon-512.png` | 同上 | 151 |
| `icons/favicon-32.png` | 同上 | 151 |
| `login/classic.html` | 恢复原始内联 SVG logo | 152 |

## 注意事项
- 所有修改遵循 RULES.md：UTF-8 编码、tap-highlight-color reset、navTo/goBack 导航
- 修改的 HTML/JS 已在 `release.sh` 注册组中存在
- 推送前必须运行 `./release.sh` 升级版本号
- 测试套件 `npm test` 基线：157 pass / 14 fail（14 个失败为权限模块预存问题，非本次引入）
