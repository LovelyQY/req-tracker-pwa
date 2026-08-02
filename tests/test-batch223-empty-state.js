// Batch 223（v1.4.28）：首页空状态统一
// 1) 统一空态组件 rtEmptyState / rtEmptyIcon 存在，去除 emoji 📭，改用线条风格 SVG
// 2) 各场景 variant 映射（box/task/bug/meeting/process）存在差异但风格一致
// 3) 文案统一「暂无 xxx」；app.js / report-*.js 渲染点已切换为统一组件
// 4) CSS：.empty-icon 渲染 SVG（.empty-icon svg / .empty > svg）+ .pi-home-empty > svg
// 通过沙箱 eval report-shared.js 执行 helper，并对源码做静态校验（同 Batch 221/222 手法）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const sharedSrc = fs.readFileSync(path.join(ROOT, 'report-shared.js'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const overlaysCss = fs.readFileSync(path.join(ROOT, 'overlays.css'), 'utf8');
const pagesCss = fs.readFileSync(path.join(ROOT, 'pages.css'), 'utf8');
const reportTodo = fs.readFileSync(path.join(ROOT, 'report-todo.js'), 'utf8');
const reportTask = fs.readFileSync(path.join(ROOT, 'report-task.js'), 'utf8');
const reportMeeting = fs.readFileSync(path.join(ROOT, 'report-meeting.js'), 'utf8');
const reportBug = fs.readFileSync(path.join(ROOT, 'report-bug.js'), 'utf8');

// 在带 mock window / escapeHtml 的沙箱中执行 report-shared.js，取出 helper
function loadShared() {
  const sandboxWindow = {};
  const realEsc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function('window', 'escapeHtml',
    sharedSrc + '\n; return { rtEmptyState: rtEmptyState, rtEmptyIcon: rtEmptyIcon, ' +
    'ICONS: RT_EMPTY_ICONS, RT_EMPTY_STATE: window.RT_EMPTY_STATE };');
  return factory(sandboxWindow, realEsc);
}
const S = loadShared();

// ---------- 1) helper 存在且为函数 ----------
test('Batch223 #1：rtEmptyState / rtEmptyIcon 已暴露且为函数', () => {
  assert.equal(typeof S.rtEmptyState, 'function');
  assert.equal(typeof S.rtEmptyIcon, 'function');
  assert.ok(S.RT_EMPTY_STATE && typeof S.RT_EMPTY_STATE.state === 'function');
  assert.ok(S.RT_EMPTY_STATE && typeof S.RT_EMPTY_STATE.icon === 'function');
});

// ---------- 2) 标准空态块结构：.empty > .empty-icon > svg，且无 emoji ----------
test('Batch223 #2：rtEmptyState 产出统一结构（.empty/.empty-icon/svg），无 📭', () => {
  const html = S.rtEmptyState('该范围暂无任务', 'task');
  assert.ok(html.includes('class="empty"'), '应含 .empty 容器');
  assert.ok(html.includes('class="empty-icon"'), '应含 .empty-icon 图标容器');
  assert.ok(html.includes('<svg'), '应含内嵌 SVG（去 emoji）');
  assert.ok(html.includes('该范围暂无任务'), '应保留「暂无 xxx」文案');
  assert.ok(!html.includes('📭'), '不得残留 emoji 📭');
  // SVG 为线条风格：stroke + currentColor + viewBox
  assert.ok(html.includes('stroke="currentColor"'), 'SVG 应使用 currentColor 描边');
  assert.ok(html.includes('stroke-width="1.5"'), 'SVG 应统一 stroke-width 1.5');
  assert.ok(html.includes('viewBox="0 0 24 24"'), 'SVG 应使用 24x24 视图框');
});

// ---------- 3) variant 映射：各场景图标路径不同 ----------
test('Batch223 #3：各场景 variant 映射到不同图标（box/task/bug/meeting/process）', () => {
  const box = S.rtEmptyIcon('box');
  const task = S.rtEmptyIcon('task');
  const bug = S.rtEmptyIcon('bug');
  const meeting = S.rtEmptyIcon('meeting');
  const process = S.rtEmptyIcon('process');
  // 全部为合法 SVG，风格一致
  [box, task, bug, meeting, process].forEach(function (svg) {
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), '应为完整 SVG');
    assert.ok(svg.includes('stroke-width="1.5"'), '统一线条粗细');
  });
  // 场景间图标存在差异（非全等）
  assert.notEqual(box, task, 'box 与 task 图标应不同');
  assert.notEqual(task, bug, 'task 与 bug 图标应不同');
  assert.notEqual(bug, meeting, 'bug 与 meeting 图标应不同');
  assert.notEqual(meeting, process, 'meeting 与 process 图标应不同');
  // 语义校验：bug 含甲虫身体矩形、meeting 含日历矩形、process 含分支圆点
  assert.ok(bug.includes('<rect'), 'bug 图标应含躯干矩形');
  assert.ok(meeting.includes('<rect'), 'meeting 图标应含日历矩形');
  assert.ok((process.match(/<circle/g) || []).length >= 2, 'process 图标应含至少 2 个节点圆');
  // 未知 variant 回退到默认 box
  assert.equal(S.rtEmptyIcon('__unknown__'), box, '未知 variant 应回退到 box');
});

// ---------- 4) 转义防御：文案含特殊字符时安全 ----------
test('Batch223 #4：rtEmptyState 对特殊字符做 HTML 转义', () => {
  const html = S.rtEmptyState('暂无 <b> & "x"', 'box');
  assert.ok(html.includes('&lt;b&gt;'), '尖括号应被转义');
  assert.ok(html.includes('&amp;'), '与号应被转义');
  assert.ok(html.includes('&quot;'), '引号应被转义');
});

// ---------- 5) app.js 渲染点已切换为统一组件 ----------
test('Batch223 #5：app.js 任务/代办/流程空态改用统一组件', () => {
  assert.ok(appJs.includes("rtEmptyState('暂无任务，点击右下角 + 添加一条', 'task')"),
    '首页任务空态应改用 rtEmptyState(task)');
  assert.ok(appJs.includes("rtEmptyState('暂无代办', 'task')"),
    '首页代办空态应改用 rtEmptyState(task)');
  assert.ok(appJs.includes("rtEmptyIcon('process')"),
    '首页流程空态应补统一图标 rtEmptyIcon(process)');
  // app.js 内不得再出现 📭
  assert.ok(!appJs.includes('📭'), 'app.js 不得残留 emoji 📭');
  // 代办不再用无图标的 .empty-tip（创建页统一带图标）
  assert.ok(!appJs.includes("emptyHtml: '<div class=\"empty-tip\">暂无代办</div>'"),
    '代办空态不应再是无图标 .empty-tip');
});

// ---------- 6) report-*.js 渲染点已切换且去除 emoji ----------
test('Batch223 #6：report-todo/task/meeting/bug 空态改用统一组件，无 📭', () => {
  assert.ok(reportTodo.includes("rtEmptyState('该范围暂无数据', 'box')"), 'report-todo 泛型回退应为 box');
  assert.ok(reportTodo.includes("rtEmptyState('该范围暂无任务事项', 'task')"), 'report-todo 任务事项应为 task');
  assert.ok(reportTask.includes("rtEmptyState('该范围暂无任务', 'task')"), 'report-task 应为 task');
  assert.ok(reportMeeting.includes("rtEmptyState('该范围暂无数据', 'box')"), 'report-meeting 泛型回退应为 box');
  assert.ok(reportMeeting.includes("rtEmptyState('该范围暂无会议', 'meeting')"), 'report-meeting 应为 meeting');
  assert.ok(reportBug.includes("rtEmptyState('该范围暂无数据', 'box')"), 'report-bug 泛型回退应为 box');
  assert.ok(reportBug.includes("rtEmptyState('该范围暂无缺陷', 'bug')"), 'report-bug 应为 bug');
  [reportTodo, reportTask, reportMeeting, reportBug].forEach(function (src, i) {
    assert.ok(!src.includes('📭'), 'report 模块 #' + i + ' 不得残留 emoji 📭');
  });
});

// ---------- 7) CSS：.empty-icon 渲染 SVG + 兼容内嵌 svg + .pi-home-empty ----------
test('Batch223 #7：CSS 统一空态图标尺寸与风格', () => {
  assert.ok(overlaysCss.includes('.empty-icon svg'), 'overlays.css 应定义 .empty-icon svg 尺寸');
  assert.ok(overlaysCss.includes('.empty > svg'), 'overlays.css 应兼容 .empty 内嵌 svg（role.js/process.html）');
  assert.ok(overlaysCss.includes('opacity: 0.5'), '.empty-icon 图标应半透明（muted 风格）');
  assert.ok(pagesCss.includes('.pi-home-empty > svg'), 'pages.css 应定义 .pi-home-empty > svg');
  // 图标尺寸统一为 56px
  assert.ok(/\.empty-icon\s*\{[^}]*width:\s*56px/.test(overlaysCss), '.empty-icon 宽应为 56px');
  assert.ok(/\.empty\s*>\s*svg\s*\{[^}]*width:\s*56px/.test(overlaysCss), '.empty > svg 宽应为 56px');
});
