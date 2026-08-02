// 统一空状态（Batch 223 初版 → Batch 224 升级为彩色填充 + 全页扩展）
// 历史：Batch 223 统一首页空态，去除 emoji 📭，改用线条风格 SVG。
// 用户反馈「线条不如原 emoji 📭 好看」，要求：① 改回彩色填充（有颜色、实心填充，像原 emoji）；
// ② 图案风格一致；③ 不止首页，基础数据/通知/反馈/考勤/统计/流程等所有页面都显示；
// ④ 每个页面图案稍有区别（不同 variant）。→ 落地为 Batch 224（彩色填充 + 全页扩展）。
//
// 本测试同时覆盖两批：结构统一（Batch 223）+ 彩色填充与全页扩展（Batch 224）。
// 手法：沙箱 eval report-shared.js 执行 helper，并对源码做静态校验（同 Batch 221/222）。
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
// 全页扩展：基础数据 / 流程 / 统计等独立页面（不加载 report-shared.js，内联同款彩色 SVG）
const companyHtml = fs.readFileSync(path.join(ROOT, 'company.html'), 'utf8');
const departmentHtml = fs.readFileSync(path.join(ROOT, 'department.html'), 'utf8');
const projectHtml = fs.readFileSync(path.join(ROOT, 'project.html'), 'utf8');
const projectVersionHtml = fs.readFileSync(path.join(ROOT, 'project-version.html'), 'utf8');
const positionHtml = fs.readFileSync(path.join(ROOT, 'position.html'), 'utf8');
const userHtml = fs.readFileSync(path.join(ROOT, 'user.html'), 'utf8');
const dictionaryHtml = fs.readFileSync(path.join(ROOT, 'dictionary.html'), 'utf8');
const roleJs = fs.readFileSync(path.join(ROOT, 'role.js'), 'utf8');
const permissionHtml = fs.readFileSync(path.join(ROOT, 'permission.html'), 'utf8');
const processHtml = fs.readFileSync(path.join(ROOT, 'process.html'), 'utf8');
const workflowHtml = fs.readFileSync(path.join(ROOT, 'workflow.html'), 'utf8');
const statsViewJs = fs.readFileSync(path.join(ROOT, 'stats-view.js'), 'utf8');

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

// ---------- 2) 标准空态块结构：彩色填充 SVG（fill + evenodd），无描边、无 emoji ----------
test('Batch224 #2：rtEmptyState 产出彩色填充结构（fill + fill-rule=evenodd），无 📭/无描边', () => {
  const html = S.rtEmptyState('该范围暂无任务', 'task');
  assert.ok(html.includes('class="empty"'), '应含 .empty 容器');
  assert.ok(html.includes('class="empty-icon"'), '应含 .empty-icon 图标容器');
  assert.ok(html.includes('<svg'), '应含内嵌 SVG（去 emoji）');
  assert.ok(html.includes('该范围暂无任务'), '应保留「暂无 xxx」文案');
  assert.ok(!html.includes('📭'), '不得残留 emoji 📭');
  // 彩色填充：fill=主题色 + fill-rule=evenodd，统一 24x24 视图框
  assert.ok(/fill="#[0-9A-Fa-f]{6}"/.test(html), 'SVG 应使用彩色填充 fill="#xxxxxx"');
  assert.ok(html.includes('fill-rule="evenodd"'), 'SVG 应使用 fill-rule=evenodd（Material 实心 path）');
  assert.ok(html.includes('viewBox="0 0 24 24"'), 'SVG 应使用 24x24 视图框');
  // 不再是线条风格：不得出现描边
  assert.ok(!/stroke=/.test(html), '彩色填充 SVG 不得含 stroke 描边');
});

// ---------- 3) variant 映射：各场景图标「形状」不同，且均为彩色填充 ----------
test('Batch224 #3：各场景 variant 形状不同、均为彩色填充、未知回退 box', () => {
  const box = S.rtEmptyIcon('box');
  const task = S.rtEmptyIcon('task');
  const bug = S.rtEmptyIcon('bug');
  const meeting = S.rtEmptyIcon('meeting');
  const process = S.rtEmptyIcon('process');
  // 全部为合法彩色填充 SVG：fill + evenodd + 无 stroke
  [box, task, bug, meeting, process].forEach(function (svg) {
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), '应为完整 SVG');
    assert.ok(/fill="#[0-9A-Fa-f]{6}"/.test(svg), '应为彩色填充');
    assert.ok(svg.includes('fill-rule="evenodd"'), '应使用 evenodd');
    assert.ok(!/stroke=/.test(svg), '不得含描边');
  });
  // 场景间图标形状存在差异（非全等）
  assert.notEqual(box, task, 'box 与 task 图标形状应不同');
  assert.notEqual(task, bug, 'task 与 bug 图标形状应不同');
  assert.notEqual(bug, meeting, 'bug 与 meeting 图标形状应不同');
  assert.notEqual(meeting, process, 'meeting 与 process 图标形状应不同');
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

// ---------- 5) app.js 渲染点已切换为统一组件（首页任务/代办/流程）----------
test('Batch223 #5：app.js 任务/代办/流程空态改用统一组件', () => {
  assert.ok(appJs.includes("rtEmptyState('暂无任务，点击右下角 + 添加一条', 'task')"),
    '首页任务空态应改用 rtEmptyState(task)');
  assert.ok(appJs.includes("rtEmptyState('暂无代办', 'task')"),
    '首页代办空态应改用 rtEmptyState(task)');
  assert.ok(appJs.includes("rtEmptyIcon('process')"),
    '首页流程空态应补统一图标 rtEmptyIcon(process)');
  assert.ok(!appJs.includes('📭'), 'app.js 不得残留 emoji 📭');
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

// ---------- 7) CSS：彩色填充图标统一 64px，已去描边/半透明/muted 限制 ----------
test('Batch224 #7：CSS 统一空态图标尺寸 64px，无 opacity:0.5 / muted 限制', () => {
  assert.ok(overlaysCss.includes('.empty-icon svg'), 'overlays.css 应定义 .empty-icon svg 尺寸');
  assert.ok(overlaysCss.includes('.empty > svg'), 'overlays.css 应兼容 .empty 内嵌 svg（role.js/process.html）');
  // 彩色填充图标统一为 64px（Batch 224：由 56px 放大，去半透明）
  assert.ok(/\.empty-icon\s*\{[^}]*width:\s*64px/.test(overlaysCss), '.empty-icon 宽应为 64px');
  assert.ok(/\.empty\s*>\s*svg\s*\{[^}]*width:\s*64px/.test(overlaysCss), '.empty > svg 宽应为 64px');
  // 去除了线条时期的半透明（muted）风格
  assert.ok(!overlaysCss.includes('opacity: 0.5'), '彩色填充不应再半透明 opacity:0.5');
  // 各页面空态（通知/反馈/请假/打卡聚合等）内嵌彩色 SVG 统一尺寸
  assert.ok(overlaysCss.includes('.notify-empty > svg'), '应定义 .notify-empty > svg');
  assert.ok(overlaysCss.includes('.fb-empty > svg'), '应定义 .fb-empty > svg');
  assert.ok(overlaysCss.includes('.lv-empty > svg'), '应定义 .lv-empty > svg');
  assert.ok(overlaysCss.includes('.dayf-empty > svg'), '应定义 .dayf-empty > svg');
  assert.ok(pagesCss.includes('.pi-home-empty > svg'), 'pages.css 应定义 .pi-home-empty > svg');
  assert.ok(/\.pi-home-empty\s*>\s*svg\s*\{[^}]*width:\s*64px/.test(pagesCss), '.pi-home-empty > svg 宽应为 64px');
});

// ---------- 8) app.js 通知/反馈/考勤/流程空态使用对应彩色 variant ----------
test('Batch224 #8：app.js 通知/反馈/考勤/流程空态改用彩色 variant（notify/feedback/clock/process）', () => {
  assert.ok(appJs.includes("rtEmptyIcon('notify')"), '通知空态应为彩色 notify 铃铛');
  assert.ok(appJs.includes("rtEmptyIcon('feedback')"), '反馈空态应为彩色 feedback 气泡');
  assert.ok(appJs.includes("rtEmptyIcon('clock')"), '考勤/打卡聚合空态应为彩色 clock 时钟');
  assert.ok(appJs.includes("rtEmptyIcon('process')"), '流程空态应为彩色 process 分支');
  // 首页问候/天气等彩色路径无关 emoji
  assert.ok(!appJs.includes('📭'), 'app.js 不得残留 emoji 📭');
});

// ---------- 9) 主题色板：彩色填充、各页用不同主题色（风格一致 + 每页稍异）----------
test('Batch224 #9：11 个 variant 均彩色填充，主题色板覆盖多色系', () => {
  const expected = {
    box: '#4C8DFF', task: '#4C8DFF', bug: '#FF6B6B', meeting: '#FFB020',
    process: '#A78BFA', notify: '#FFB020', data: '#34C0FA', stats: '#34C759',
    feedback: '#4C8DFF', clock: '#22C2B8', search: '#9AA5B1'
  };
  const keys = Object.keys(expected);
  assert.equal(keys.length, 11, '应定义 11 个 variant');
  keys.forEach(function (k) {
    assert.ok(S.ICONS[k] && S.ICONS[k].c === expected[k], k + ' 主题色应为 ' + expected[k]);
    assert.ok(S.ICONS[k].p && S.ICONS[k].p.length > 10, k + ' 应含实心 path');
  });
  // 彩色填充风格一致：rtEmptyIcon 输出 fill=对应主题色
  keys.forEach(function (k) {
    const svg = S.rtEmptyIcon(k);
    assert.ok(svg.includes('fill="' + expected[k] + '"'), k + ' 输出应填充主题色 ' + expected[k]);
    assert.ok(!/stroke=/.test(svg), k + ' 不得含描边');
  });
  // 每页稍异：图标形状（path）不止一套，主题色至少跨越 5 个色系
  const shapes = new Set(keys.map(function (k) { return S.ICONS[k].p; }));
  assert.ok(shapes.size >= 5, '图标形状应有多套（每页稍异）');
  const colors = new Set(keys.map(function (k) { return S.ICONS[k].c; }));
  assert.ok(colors.size >= 5, '主题色应跨多个色系');
});

// ---------- 10) 全页扩展：基础数据/流程/统计独立页内联「同款」彩色 SVG（零依赖、风格一致）----------
test('Batch224 #10：基础数据/流程/统计页内联同款彩色 SVG（路径与共享 variant 一致）', () => {
  const dataP = S.ICONS.data.p, dataC = S.ICONS.data.c;          // #34C0FA 存储栈
  const procP = S.ICONS.process.p, procC = S.ICONS.process.c;    // #A78BFA 分支
  const statP = S.ICONS.stats.p, statC = S.ICONS.stats.c;        // #34C759 柱状图
  // 基础数据页（公司/部门/项目/版本/岗位/用户/字典/角色/权限）均内联 data 同款
  const dataPages = {
    company: companyHtml, department: departmentHtml, project: projectHtml,
    projectVersion: projectVersionHtml, position: positionHtml, user: userHtml,
    dictionary: dictionaryHtml, role: roleJs, permission: permissionHtml
  };
  Object.keys(dataPages).forEach(function (name) {
    const src = dataPages[name];
    assert.ok(src.includes('fill="' + dataC + '" fill-rule="evenodd"'),
      name + ' 应内联彩色 data 图标（fill=' + dataC + '）');
    assert.ok(src.includes('<path d="' + dataP + '"'),
      name + ' 内联路径应与共享 data variant 完全一致（风格一致）');
    assert.ok(!src.includes('📭'), name + ' 不得残留 emoji 📭');
  });
  // 流程 / 工作流页内联 process 同款
  [['process', processHtml], ['workflow', workflowHtml]].forEach(function (pair) {
    const src = pair[1];
    assert.ok(src.includes('fill="' + procC + '" fill-rule="evenodd"'),
      pair[0] + ' 应内联彩色 process 图标（fill=' + procC + '）');
    assert.ok(src.includes('<path d="' + procP + '"'),
      pair[0] + ' 内联路径应与共享 process variant 一致');
    assert.ok(!src.includes('📭'), pair[0] + ' 不得残留 emoji 📭');
  });
  // 统计页内联 stats 同款
  assert.ok(statsViewJs.includes('fill="' + statC + '" fill-rule="evenodd"'),
    'stats-view 应内联彩色 stats 图标（fill=' + statC + '）');
  assert.ok(statsViewJs.includes('<path d="' + statP + '"'),
    'stats-view 内联路径应与共享 stats variant 一致');
  assert.ok(!statsViewJs.includes('📭'), 'stats-view 不得残留 emoji 📭');
});
