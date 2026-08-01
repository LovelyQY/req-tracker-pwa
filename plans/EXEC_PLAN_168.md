# 批次168：图标管理微调（去导出/导入提示 + 确认弹框缺失恢复按钮）

> 创建时间：2026-07-29 22:19
> 前置版本：v1.3.66
> 状态：待执行
> 触发来源：用户实测 v1.3.66 反馈 2 项问题（附 2 张截图）

---

## 关键事实（已排查确认）

### 问题1：导出和导入去掉 toast 提示
- **现象**：导出/导入操作后出现顶部 toast 提示（如「已导出 N 个图标…」「已导入 N 个图标…」），用户不想要。
- **涉及位置**：
  - `exportAll()`（icon-manager.js ~第141行）：`toast('已导出 ' + data.icons.length + ' 个图标…', 'success')`
  - `importAll()`（icon-manager.js ~第182-184行）：成功后 `toast('已导入 ' + count + ' 个图标…')`
- **处理**：删除导出/导入的**成功提示 toast**；**错误类 toast 保留**（文件格式错误、导入失败等属异常反馈，应保留）。

### 问题2：「恢复默认」/「批量恢复」确认弹框只有「取消」，没有确认（恢复）按钮 ⚠️ 根因级别：高
- **现象**（截图2印证）：点「恢复默认」或「批量恢复」→ 弹框标题+正文+「取消」按钮均正常渲染，但**确认（恢复）按钮不可见**。
- **根因（已确凿）：`icon-manager.html` 的 `:root` 缺少 `--danger` 和 `--primary-dark` CSS 变量！**
  - `customConfirm()`（config.js:155）生成的确认按钮 class 为 `cd-confirm cd-danger`（当 `opts.danger=true` 时）。
  - `overlays.css:163` 定义：`.cd-btn.cd-danger { background: var(--danger); color: var(--surface); }`
  - `overlays.css:162` 定义：`.cd-btn.cd-confirm:active { background: var(--primary-dark); }`
  - **但 `icon-manager.html` 的 `:root` 只定义了 10 个变量**（`--primary/--primary-light/--bg/--surface/--text/--muted/--border/--radius`），**没有 `--danger` 和 `--primary-dark`**。
  - 结果：`var(--danger)` 解析为空 → 确认按钮 `background` 为透明/继承 → 白色卡片底色上白字白底 → **视觉消失**。
  - 对比：其它页面（settings/user/department/company 等）均在本地 `:root` 补了 `--danger:#ef4444;`，故它们的 customConfirm 正常。
- **修复**：在 `icon-manager.html` 的 `:root` 中补 `--danger:#ef4444;--primary-dark:#0958d9;`（与项目其它页面一致）。

---

## 问题总览

| # | 问题 | 严重度 | 涉及文件 | 根因 |
|---|------|--------|---------|------|
| 1 | 导出/导入成功后不需要 toast 提示 | 低 | `icon-manager.js` | 用户偏好，删掉即可 |
| 2 | 恢复/批量恢复确认弹框无确认按钮 | **高** | `icon-manager.html` | `:root` 缺 `--danger`/`--primary-dark` 变量 |

---

## 批次168 修复清单

### 168-A `icon-manager.js`（2 处：删 toast）
1. **`exportAll()`**：删除第141行的 `toast('已导出 ' + data.icons.length + ' 个图标（在各页面以 44×44 展示）', 'success');`
2. **`importAll()`**：删除第182-184行的成功 toast（`var msg = …` 至 `toast(msg, …)` 整段）；**保留**错误 toast（格式错误 / 导入失败异常提示不动）。

### 168-B `icon-manager.html`（1 处：补 CSS 变量）
1. **`:root` 补变量**：在现有变量末尾追加 `--danger:#ef4444;--primary-dark:#0958d9;`，使 overlays.css 的 `.cd-danger` / `.cd-confirm:active` 能正确解析颜色。

---

## 版本与推送策略
- 建议走 `[no-version-bump]` 先提交推送，验证无误后再统一发版。

## 风险与注意
- 168-A 删除的是成功路径 toast，不影响功能逻辑（下载/导入仍正常执行）。
- 168-B 是纯 CSS 变量补全，零功能风险；同时修复单条恢复(`reset`)和批量恢复(`resetAll`)两条弹框路径。
