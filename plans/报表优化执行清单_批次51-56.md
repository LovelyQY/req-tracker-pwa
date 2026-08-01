# 报表页优化执行清单（批次 51-56）

> 你分批次执行。每批独立推送（不升级版本），全部完成后统一 release。
> 全部改动集中在 `req-tracker-pwa/` 下。

---

## 批次 51 ｜ Issue 1：已上线进度条紫色→绿色

**文件**：`report-task.js` 第 126 行

```js
// Before:
var ENTERED_COLOR = { '测试中': '#1677ff', '已测完': '#52c41a', '已上线': '#722ed1', '暂停中': '#8c8c8c' };
// After:
var ENTERED_COLOR = { '测试中': '#1677ff', '已测完': '#52c41a', '已上线': '#389e0d', '暂停中': '#8c8c8c' };
```

**验证**：任务统计页 → 已上线状态条应为绿色。

---

## 批次 54 ｜ Issue 4：三类报表导出PDF无反应（fmtDateTime 未导出）

**文件**：`report-common.js`

1. 在 `fmtDate` 函数（第 46 行 `}` 之后）新增：
```js
function fmtDateTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  var hh = ('0' + d.getHours()).slice(-2);
  var mm = ('0' + d.getMinutes()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day + ' ' + hh + ':' + mm;
}
```

2. 导出对象里（`fmtDate: fmtDate,` 那一行之后）补一行：
```js
fmtDateTime: fmtDateTime,
```

**验证**：todo / bug / meeting 统计 → 点「导出PDF」→ 应弹出打印对话框，表格有数据且状态/类型为中文（非 CODE）。

---

## 批次 55 ｜ Issue 5：卡片布局 + 按钮名称

### 5a. 按钮名称（三处，仅改 span 文字）
- `report-todo.js` 第 92 行 → `'<span>事项清单 (' + pTotal + ')</span>'`
- `report-bug.js` 第 104 行 → `'<span>缺陷清单 (' + pTotal + ')</span>'`
- `report-meeting.js` 第 96 行 → `'<span>会议清单 (' + pTotal + ')</span>'`

### 5b. 卡片结构（三处，把按钮从 `.rm-project-header` 内移到 `.rm-status-row` 之后）
改为：
```js
html += '<div class="report-module rm-project-card">'
  + '<div class="rm-project-header">'
  +   '<div class="rm-project-name">' + pName + '</div>'
  + '</div>'
  + '<div class="rm-status-row">' + cells + '</div>'
  + '<button class="rm-list-btn" data-project="' + escapeHtml(pid) + '" type="button">'
  +   '<span>【事项清单/缺陷清单/会议清单】 (' + pTotal + ')</span>'
  +   '<svg class="rm-list-arrow" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>'
  + '</button>'
  + '</div>';
```

### 5c. 样式 `styles.css`（替换 `.rm-project-header` / `.rm-project-name` / `.rm-list-btn` 现有规则）
```css
/* 卡片头部：蓝底白字通栏标题带，对齐任务统计「已进入测试」(.rm-title) */
.rm-project-header { display: flex; align-items: center; padding: 12px 16px; background: var(--primary); color: #fff; border-bottom: none; }
.rm-project-name { font-size: 16px; font-weight: 700; color: #fff; width: 100%; }
/* 清单按钮置于卡片末尾，留边距避免贴边 */
.rm-list-btn { width: calc(100% - 24px); margin: 12px; justify-content: space-between; padding: 12px 14px; }
```

**验证**：三类统计页 → 项目名独占首行、状态条居中、清单按钮独占末行；按钮名分别为 事项清单 / 缺陷清单 / 会议清单。

---

## 批次 56 ｜ Issue 6：进度条上显示百分比 + 卡片备注

**目标**：在原有进度条上直接叠加显示百分比；卡片底部加**一行**备注说明百分比含义（仅一行，不每个状态都加）。大号数值恢复为计数 `cnt`。

**文件 A（JS，三处状态格渲染，结构相同）**：
- `report-todo.js` 第 82-86 行
- `report-bug.js` 第 94-98 行
- `report-meeting.js` 第 86-90 行

状态格改为（百分比移到进度条上）：
```js
cells += '<div class="rm-status-cell">'
  + '<div class="rm-status-num" style="color:' + c + '">' + cnt + '</div>'
  + '<div class="rm-status-label">' + s.name + '</div>'
  + '<div class="rm-status-bar"><div class="rm-status-bar-inner" style="width:' + pct + '%;background:' + c + '"></div><span class="rm-status-pct">' + pct + '%</span></div>'
  + '</div>';
```

卡片结构里，在 `.rm-status-row` 之后追加一行备注（**每个卡片仅一行，不按状态重复**）：
```js
  + '<div class="rm-status-row">' + cells + '</div>'
  + '<div class="rm-status-note">进度条百分比 = 该状态数量 ÷ 本项目内条目总数</div>'
  + '<button class="rm-list-btn" ...>'
```

**文件 B（CSS，`styles.css`）**：覆盖 `.rm-status-bar` 高度并新增 `.rm-status-pct` / `.rm-status-note`
```css
.rm-status-bar { position: relative; height: 16px; border-radius: 8px; background: #f0f2f5; margin: 4px 4px 0; overflow: hidden; }
.rm-status-pct { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: 600; color: #334155; }
.rm-status-note { font-size: 11px; color: #94a3b8; padding: 6px 16px 0; line-height: 1.4; }
```

**验证**：会议统计 → 1 已结束 + 1 已取消 → 每个状态条上显示「50%」，卡片底部一行「进度条百分比 = 该状态数量 ÷ 本项目内条目总数」；不再出现「50% · 共2」式堆叠。

---

## 批次 53 ｜ Issue 3：任务统计PDF表格排版

**文件**：`report-task.html` 内联 `<style>` 的 `@media print` 段（第 38-48 行）整体替换为：
```css
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  .nav-bar, .tl-overlay, .rm-list-btn { display: none !important; }
  body { background: #fff; }
  .rf-print-title { display: block !important; font-size: 16px; font-weight: 700; text-align: center; margin: 4px 0 10px; }
  .report-toolbar { box-shadow: none; }
  .rf-detail-table {
    display: table; width: 100%; border-collapse: collapse;
    font-size: 7pt; margin-top: 10px;
    table-layout: fixed;
    page-break-inside: avoid;
  }
  .rf-detail-table th, .rf-detail-table td {
    border: 0.5px solid #ccc; padding: 2px 4px;
    text-align: left; vertical-align: top;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .rf-detail-table th:nth-child(1), .rf-detail-table td:nth-child(1),
  .rf-detail-table th:nth-child(7), .rf-detail-table td:nth-child(7) {
    white-space: normal; word-break: break-word;
  }
  .rf-detail-table thead th { background: #f0f2f5; font-weight: 600; }
}
```
**另**：`report-task.js` `buildDetailTable` 第 251 行 thead，给名称/描述列加 `width:14%`，其余列 `width:auto`，避免挤压。

**验证**：任务统计 → 导出PDF → 预览单页显示统计+完整表格，字段不换行（名称/描述除外）。

---

## 批次 52 ｜ Issue 2：导出PDF后「返回」仍在此页

**文件**：`auth.js` —— 重写 `goBack()`（`currentPageName()` 之后）
```js
function goBack() {
  try {
    var stack = [];
    try { stack = JSON.parse(sessionStorage.getItem(BACK_KEY) || '[]'); } catch (e) {}
    if (!Array.isArray(stack)) stack = [];
    var cur = currentPageName();
    while (stack.length) {
      var prev = stack.pop();
      if (prev && prev !== cur) {
        sessionStorage.setItem(BACK_KEY, JSON.stringify(stack));
        location.href = prev;
        return;
      }
    }
    if (cur === 'report-task.html' || cur === 'report-todo.html' || cur === 'report-bug.html' || cur === 'report-meeting.html') {
      window.location.href = 'report.html';
      return;
    }
    if (window.history && window.history.length > 1) { window.history.go(-1); return; }
  } catch (e) {}
  window.location.href = 'index.html';
}
```

**验证**：任务统计 → 导出PDF → 关闭打印 → 点「返回」→ 回到报表汇总页（report.html），不再停留本页。

---

## 推荐执行顺序
**51 → 54 → 55 → 56 → 53 → 52**（每批独立推送不升级，最后统一 release）

| 批次 | 文件 | 改动量 |
|------|------|--------|
| 51 | report-task.js | 1 行 |
| 54 | report-common.js | ~12 行 |
| 55 | report-todo/bug/meeting.js + styles.css | ~14 行 |
| 56 | report-todo/bug/meeting.js | 3 行 |
| 53 | report-task.html + report-task.js | ~20 行 |
| 52 | auth.js | ~18 行 |
