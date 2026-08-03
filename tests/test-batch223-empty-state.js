// 统一空状态（批次223 初版 → 批次224 彩色填充 → 批次225 回退 emoji 📭 且可配置）
// 历史脉络：
//   批次223 统一首页空态，去除 emoji 📭，改用线条风格 SVG。
//   批次224 按需求改回彩色填充（有颜色、实心填充，按 variant 区分场景）。
//   批次225 用户再次要求：统一回退为「之前的邮箱 emoji 📭」，做成可配置项（可在图标管理页
//   显示/编辑/覆盖），且全局统一（忽略 variant）。→ 注册为 page-icons 的 'empty' 默认 key，
//   渲染统一走 config.js 的 getEmptyIconHtml()。
//
// 本测试覆盖：
//   ① 渲染产物为 emoji 📭（无彩色填充 / 无描边 / 无 variant 差异）；
//   ② 全局统一（忽略 variant）；
//   ③ 可配置（page-icons 'empty' 默认 = 📭；set 覆盖、reset 回默认）；
//   ④ 内联空态页（基础数据/流程/统计等）已改用 getEmptyIconHtml()，无彩色 fill；
//   ⑤ icon-manager KEY_LABELS 含 'empty'。
// 手法：沙箱 eval report-shared.js 执行 helper + 对源码做静态校验 + 直接 require page-icons.js 验证可配置。
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
// 内联空态页（基础数据 / 流程 / 统计等独立页面，原内联彩色 SVG，现改用 getEmptyIconHtml()）
const companyHtml = fs.readFileSync(path.join(ROOT, 'company.html'), 'utf8');
const departmentHtml = fs.readFileSync(path.join(ROOT, 'department.html'), 'utf8');
const projectHtml = fs.readFileSync(path.join(ROOT, 'project.html'), 'utf8');
const projectVersionHtml = fs.readFileSync(path.join(ROOT, 'project-version.html'), 'utf8');
const positionHtml = fs.readFileSync(path.join(ROOT, 'position.html'), 'utf8');
const userHtml = fs.readFileSync(path.join(ROOT, 'user.html'), 'utf8');
const dictionaryHtml = fs.readFileSync(path.join(ROOT, 'dictionary.html'), 'utf8');
const roleJs = fs.readFileSync(path.join(ROOT, 'role.js'), 'utf8');
const permissionHtml = fs.readFileSync(path.join(ROOT, 'permission.html'), 'utf8');
const permissionJs = fs.readFileSync(path.join(ROOT, 'permission.js'), 'utf8');
const processHtml = fs.readFileSync(path.join(ROOT, 'process.html'), 'utf8');
const workflowHtml = fs.readFileSync(path.join(ROOT, 'workflow.html'), 'utf8');
const statsViewJs = fs.readFileSync(path.join(ROOT, 'stats-view.js'), 'utf8');

// emoji 默认 SVG（与 config.js RT_EMPTY_ICON_DEFAULT / page-icons 'empty' 默认一致）
const EMOJI_SVG = '<svg viewBox="0 0 24 24" width="22" height="22"><text x="12" y="17" font-size="18" text-anchor="middle">📭</text></svg>';

// 在带 mock window / escapeHtml / getEmptyIconHtml 的沙箱中执行 report-shared.js，取出 helper
function loadShared() {
  const sandboxWindow = {};
  const realEsc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function('window', 'escapeHtml', 'getEmptyIconHtml',
    sharedSrc + '\n; return { rtEmptyState: rtEmptyState, rtEmptyIcon: rtEmptyIcon, ' +
    'RT_EMPTY_STATE: window.RT_EMPTY_STATE };');
  return factory(sandboxWindow, realEsc, function () { return EMOJI_SVG; });
}
const S = loadShared();

// ---------- 1) helper 存在且为函数 ----------
test('Batch223 #1：rtEmptyState / rtEmptyIcon 已暴露且为函数', () => {
  assert.equal(typeof S.rtEmptyState, 'function');
  assert.equal(typeof S.rtEmptyIcon, 'function');
  assert.ok(S.RT_EMPTY_STATE && typeof S.RT_EMPTY_STATE.state === 'function');
  assert.ok(S.RT_EMPTY_STATE && typeof S.RT_EMPTY_STATE.icon === 'function');
});

// ---------- 2) 标准空态块结构：emoji 📭（无彩色填充 / 无描边 / 无 variant 差异）----------
test('Batch225 #2：rtEmptyState 产出 emoji 📭 结构，无彩色填充 / 无描边', () => {
  const html = S.rtEmptyState('该范围暂无任务', 'task');
  assert.ok(html.includes('class="empty"'), '应含 .empty 容器');
  assert.ok(html.includes('class="empty-icon"'), '应含 .empty-icon 图标容器');
  assert.ok(html.includes('<svg'), '应含内嵌 SVG');
  assert.ok(html.includes('📭'), '应渲染邮箱 emoji 📭');
  assert.ok(html.includes('该范围暂无任务'), '应保留「暂无 xxx」文案');
  assert.ok(html.includes('viewBox="0 0 24 24"'), 'SVG 应使用 24x24 视图框');
  // 批次225：不再使用彩色填充 / 描边（回退 emoji）
  assert.ok(!/fill="#[0-9A-Fa-f]{6}"/.test(html), '不得含彩色填充 fill="#xxxxxx"');
  assert.ok(!html.includes('fill-rule="evenodd"'), '不得含 fill-rule=evenodd');
  assert.ok(!/stroke=/.test(html), 'emoji SVG 不得含 stroke 描边');
});

// ---------- 3) variant 忽略：全局统一为同一 emoji ----------
test('Batch225 #3：各场景 variant 被忽略，统一为同一 emoji 📭', () => {
  const box = S.rtEmptyIcon('box');
  const task = S.rtEmptyIcon('task');
  const bug = S.rtEmptyIcon('bug');
  const meeting = S.rtEmptyIcon('meeting');
  const process = S.rtEmptyIcon('process');
  const unknown = S.rtEmptyIcon('__unknown__');
  [box, task, bug, meeting, process, unknown].forEach(function (svg) {
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), '应为完整 SVG');
    assert.ok(svg.includes('📭'), '应包含 emoji 📭');
    assert.ok(!/fill="#[0-9A-Fa-f]{6}"/.test(svg), '不得含彩色填充');
  });
  // 全局统一：所有 variant 输出完全相同
  assert.equal(box, task, 'box 与 task 应输出相同 emoji');
  assert.equal(task, bug, 'task 与 bug 应输出相同 emoji');
  assert.equal(bug, meeting, 'bug 与 meeting 应输出相同 emoji');
  assert.equal(meeting, process, 'meeting 与 process 应输出相同 emoji');
  assert.equal(process, unknown, '未知 variant 应与已知相同');
});

// ---------- 4) 转义防御：文案含特殊字符时安全 ----------
test('Batch223 #4：rtEmptyState 对特殊字符做 HTML 转义', () => {
  const html = S.rtEmptyState('暂无 <b> & "x"', 'box');
  assert.ok(html.includes('&lt;b&gt;'), '尖括号应被转义');
  assert.ok(html.includes('&amp;'), '与号应被转义');
  assert.ok(html.includes('&quot;'), '引号应被转义');
});

// ---------- 5) app.js 渲染点仍使用统一组件（首页任务/代办/流程/通知/反馈/考勤）----------
test('Batch225 #5：app.js 任务/代办/流程/通知/反馈/考勤空态仍使用统一组件', () => {
  assert.ok(appJs.includes("rtEmptyState('暂无任务，点击右下角 + 添加一条', 'task')"), '首页任务空态应改用 rtEmptyState');
  assert.ok(appJs.includes("rtEmptyState('暂无代办', 'task')"), '首页代办空态应改用 rtEmptyState');
  assert.ok(appJs.includes("rtEmptyIcon('process')"), '首页流程空态应改用 rtEmptyIcon(process)');
  assert.ok(appJs.includes("rtEmptyIcon('notify')"), '通知空态应改用 rtEmptyIcon(notify)');
  assert.ok(appJs.includes("rtEmptyIcon('feedback')"), '反馈空态应改用 rtEmptyIcon(feedback)');
  assert.ok(appJs.includes("rtEmptyIcon('clock')"), '考勤/打卡聚合空态应改用 rtEmptyIcon(clock)');
  // 批次225：不得残留彩色填充 / 旧 RT_EMPTY_ICONS
  assert.ok(!/fill="#[0-9A-Fa-f]{6}" fill-rule="evenodd"/.test(appJs), 'app.js 不得含彩色填充空态');
  assert.ok(!appJs.includes('RT_EMPTY_ICONS'), 'app.js 不得引用已移除的 RT_EMPTY_ICONS');
});

// ---------- 6) report-*.js 渲染点仍使用统一组件，无彩色填充 ----------
test('Batch225 #6：report-todo/task/meeting/bug 空态使用统一组件，无彩色填充', () => {
  assert.ok(reportTodo.includes("rtEmptyState('该范围暂无数据', 'box')"), 'report-todo 泛型回退应为 box');
  assert.ok(reportTodo.includes("rtEmptyState('该范围暂无任务事项', 'task')"), 'report-todo 任务事项应为 task');
  assert.ok(reportTask.includes("rtEmptyState('该范围暂无任务', 'task')"), 'report-task 应为 task');
  assert.ok(reportMeeting.includes("rtEmptyState('该范围暂无数据', 'box')"), 'report-meeting 泛型回退应为 box');
  assert.ok(reportMeeting.includes("rtEmptyState('该范围暂无会议', 'meeting')"), 'report-meeting 应为 meeting');
  assert.ok(reportBug.includes("rtEmptyState('该范围暂无数据', 'box')"), 'report-bug 泛型回退应为 box');
  assert.ok(reportBug.includes("rtEmptyState('该范围暂无缺陷', 'bug')"), 'report-bug 应为 bug');
  [reportTodo, reportTask, reportMeeting, reportBug].forEach(function (src, i) {
    assert.ok(!/fill="#[0-9A-Fa-f]{6}" fill-rule="evenodd"/.test(src), 'report 模块 #' + i + ' 不得含彩色填充空态');
    assert.ok(!src.includes('RT_EMPTY_ICONS'), 'report 模块 #' + i + ' 不得引用 RT_EMPTY_ICONS');
  });
});

// ---------- 7) CSS：空态图标尺寸规则仍保留（emoji SVG 随容器缩放）----------
test('Batch225 #7：CSS 保留空态图标尺寸规则（.empty-icon/.empty > svg 64px 及各页 svg）', () => {
  assert.ok(overlaysCss.includes('.empty-icon svg'), 'overlays.css 应定义 .empty-icon svg 尺寸');
  assert.ok(overlaysCss.includes('.empty > svg'), 'overlays.css 应兼容 .empty 内嵌 svg');
  assert.ok(/\.empty-icon\s*\{[^}]*width:\s*64px/.test(overlaysCss), '.empty-icon 宽应为 64px');
  assert.ok(/\.empty\s*>\s*svg\s*\{[^}]*width:\s*64px/.test(overlaysCss), '.empty > svg 宽应为 64px');
  assert.ok(overlaysCss.includes('.notify-empty > svg'), '应定义 .notify-empty > svg');
  assert.ok(overlaysCss.includes('.fb-empty > svg'), '应定义 .fb-empty > svg');
  assert.ok(overlaysCss.includes('.lv-empty > svg'), '应定义 .lv-empty > svg');
  assert.ok(overlaysCss.includes('.dayf-empty > svg'), '应定义 .dayf-empty > svg');
  assert.ok(pagesCss.includes('.pi-home-empty > svg'), 'pages.css 应定义 .pi-home-empty > svg');
  assert.ok(/\.pi-home-empty\s*>\s*svg\s*\{[^}]*width:\s*64px/.test(pagesCss), '.pi-home-empty > svg 宽应为 64px');
});

// ---------- 8) 可配置：page-icons 'empty' 默认 = 📭，set 覆盖 / reset 回默认 ----------
test('Batch225 #8：空状态图标可配置（默认 📭，set 覆盖后生效，reset 回默认）', () => {
  const ICO = require(path.join(ROOT, 'page-icons.js'));
  assert.ok(ICO._defaults.empty && ICO._defaults.empty.includes('📭'), "默认 'empty' 应为 emoji 📭");
  assert.equal(ICO.get('empty'), ICO._defaults.empty, 'get 默认应返回 📭');
  // 模拟「图标管理」覆盖：set 后 get 返回自定义值（无 IDB 环境下内存覆盖即时生效）
  const CUSTOM = '<svg viewBox="0 0 24 24" width="22" height="22"><text x="12" y="17" font-size="18" text-anchor="middle">📪</text></svg>';
  ICO.set('empty', CUSTOM);
  assert.equal(ICO.get('empty'), CUSTOM, 'set 覆盖后 get 应返回自定义图标');
  // reset 回默认
  ICO.reset('empty');
  assert.equal(ICO.get('empty'), ICO._defaults.empty, 'reset 后应回退到默认 📭');
  // getEmptyIconHtml 同源行为（优先读覆盖层，缺失回退默认）
  global.getEmptyIconHtml = function () { return ICO.get('empty'); };
  assert.equal(getEmptyIconHtml(), ICO._defaults.empty, 'getEmptyIconHtml 默认应返回 📭');
  ICO.set('empty', CUSTOM);
  assert.equal(getEmptyIconHtml(), CUSTOM, 'getEmptyIconHtml 应反映覆盖层');
  ICO.reset('empty');
  delete global.getEmptyIconHtml;
});

// ---------- 9) 内联空态页已改用 getEmptyIconHtml()，无彩色 fill ----------
test('Batch225 #9：基础数据/流程/统计内联空态改用 getEmptyIconHtml()，无彩色填充', () => {
  const COLOR_FILL = /fill="#[0-9A-Fa-f]{6}" fill-rule="evenodd"/;
  const inlinePages = {
    company: companyHtml, department: departmentHtml, project: projectHtml,
    projectVersion: projectVersionHtml, position: positionHtml, user: userHtml,
    dictionary: dictionaryHtml, role: roleJs, process: processHtml, workflow: workflowHtml,
    statsView: statsViewJs
  };
  Object.keys(inlinePages).forEach(function (name) {
    const src = inlinePages[name];
    assert.ok(src.includes('getEmptyIconHtml()'), name + ' 应调用 getEmptyIconHtml()');
    assert.ok(!COLOR_FILL.test(src), name + ' 不得含彩色填充空态');
  });
  // permission 为静态占位 + JS 填充：permission.html 不得含彩色填充，permission.js 调用 getEmptyIconHtml
  assert.ok(!COLOR_FILL.test(permissionHtml), 'permission.html 不得含彩色填充空态');
  assert.ok(permissionHtml.includes('id="treeEmptyIcon"'), 'permission.html 应预留空状态图标占位');
  assert.ok(permissionJs.includes('getEmptyIconHtml()'), 'permission.js paint() 应填充空状态图标');
});

// ---------- 10) icon-manager KEY_LABELS 含 'empty'（可在图标管理显示/配置）----------
test('Batch225 #10：icon-manager.js KEY_LABELS 含 empty（空状态图标可管理）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'icon-manager.js'), 'utf8');
  const m = src.match(/KEY_LABELS\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(m, '应存在 KEY_LABELS 定义');
  const labelKeys = [...m[1].matchAll(/'([a-z\-]+)'\s*:/g)].map((x) => x[1]);
  assert.ok(labelKeys.includes('empty'), "KEY_LABELS 应含 'empty'（空状态图标）");
  // 与默认注册表 key 同步：'empty' 已在 page-icons 注册
  const ICO = require(path.join(ROOT, 'page-icons.js'));
  assert.ok(Object.keys(ICO._defaults).includes('empty'), "page-icons 默认注册表应含 'empty'");
});
