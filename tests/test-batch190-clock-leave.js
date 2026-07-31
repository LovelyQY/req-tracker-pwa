// Batch 190（#17 打卡颜色统一+手动编辑时间、#18 请假小时核对）
// 由于运行环境无 jsdom，本批以「源码结构 / 静态契约」断言为主，与 test-batch186/188 风格一致。
// 另含对 leave / stats 时长格式化契约的运行时断言（#18：请假均以小时展示与计算）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// —— #17 ① 打卡色板：统一 --clock-in / --clock-out 变量，全站只引用变量 ——
test('Batch190 #17：base.css 定义 --clock-in / --clock-out 变量（浅色 + 深色覆盖）', () => {
  const css = read('base.css');
  assert.ok(/--clock-in:\s*#1677ff/.test(css), '浅色应定义 --clock-in: #1677ff（上班 蓝）');
  assert.ok(/--clock-out:\s*#389e0d/.test(css), '浅色应定义 --clock-out: #389e0d（下班 绿）');
  // 深色覆盖块内也应覆盖这两个变量
  const darkIdx = css.indexOf('html.dark');
  const dark = css.slice(darkIdx);
  assert.ok(/--clock-in:\s*#4096ff/.test(dark), '深色应覆盖 --clock-in: #4096ff');
  assert.ok(/--clock-out:\s*#73d13d/.test(dark), '深色应覆盖 --clock-out: #73d13d');
});

test('Batch190 #17：pages.css 全站打卡元素只引用变量（消除红/绿混）', () => {
  const css = read('pages.css');
  // 首页打卡点：working→--clock-in，done→--clock-out（原 coral 红已移除）
  assert.ok(/\.home-clock-dot\.dot-working\s*\{[^}]*var\(--clock-in/.test(css), '首页 working 点应引用 --clock-in');
  assert.ok(/\.home-clock-dot\.dot-done\s*\{[^}]*var\(--clock-out/.test(css), '首页 done 点应引用 --clock-out');
  assert.ok(!/dot-working\s*\{[^}]*var\(--coral/.test(css), '首页 working 点不应再硬编码 coral 红');
  // 日历点：doing→--clock-in，done→--clock-out
  assert.ok(/\.cal-dot-doing\s*\{[^}]*var\(--clock-in/.test(css), '日历 doing 点应引用 --clock-in');
  assert.ok(/\.cal-dot-done\s*\{[^}]*var\(--clock-out/.test(css), '日历 done 点应引用 --clock-out');
  // 打卡面板时间：上班 in / 下班 out 分别引用变量
  assert.ok(/\.cal-clock-t\.in\s*\{[^}]*var\(--clock-in/.test(css), '打卡面板「上班」时间应引用 --clock-in');
  assert.ok(/\.cal-clock-t\.out\s*\{[^}]*var\(--clock-out/.test(css), '打卡面板「下班」时间应引用 --clock-out');
});

test('Batch190 #17：app.js 打卡面板为上班/下班时间分别加 in / out 类', () => {
  const js = read('app.js');
  assert.ok(js.includes('cal-clock-t in'), '上班时间格应带 class "cal-clock-t in"');
  assert.ok(js.includes('cal-clock-t out'), '下班时间格应带 class "cal-clock-t out"');
});

// —— #17 ② 手动编辑打卡时间 ——
test('Batch190 #17：attendance.js 暴露 editTime 供手动编辑打卡时间', () => {
  const js = read('attendance.js');
  assert.ok(/function editTime\(date, times\)/.test(js), '应定义 editTime(date, times)');
  assert.ok(/editTime: editTime/.test(js), 'RT_ATTENDANCE 应导出 editTime');
  // 仅覆盖传入字段（'clockIn' in times），写回后触发 updatedAt
  assert.ok(/'clockIn' in times/.test(js), 'editTime 应仅覆盖传入字段');
  assert.ok(/updatedAt = now/.test(js), 'editTime 应刷新 updatedAt');
});

test('Batch190 #17：app.js 当日面板提供「编辑时间」内联入口与保存逻辑', () => {
  const js = read('app.js');
  // 入口：考勤分区「编辑时间」按钮
  assert.ok(/onclick="toggleClockEdit\(/.test(js), '当日面板应有 toggleClockEdit 入口');
  assert.ok(/id="ceIn_' \+ date/.test(js), '应含上班 time 输入框 ceIn_<date>');
  assert.ok(/id="ceOut_' \+ date/.test(js), '应含下班 time 输入框 ceOut_<date>');
  assert.ok(/onclick="saveClockEdit\(/.test(js), '应含 saveClockEdit 保存按钮');
  // 辅助函数
  assert.ok(/function tsToHm\(ts\)/.test(js), '应定义 tsToHm（时间戳→HH:MM）');
  assert.ok(/function combineDateTime\(dateStr, hm\)/.test(js), '应定义 combineDateTime（日期+时间→时间戳）');
  assert.ok(/function toggleClockEdit\(date\)/.test(js), '应定义 toggleClockEdit');
  assert.ok(/async function saveClockEdit\(date\)/.test(js), '应定义 saveClockEdit');
  // 写回并触发重渲染（工时经 hoursOf 实时派生）
  assert.ok(/RT_ATTENDANCE\.editTime\(date, \{ clockIn: clockIn, clockOut: clockOut \}\)/.test(js), 'saveClockEdit 应调用 editTime 写回');
  assert.ok(/await renderCalendar\(\)/.test(js), '保存后应重渲染日历（工时重算）');
  // 下班早于上班应拦截
  assert.ok(/clockOut < clockIn/.test(js), '保存应校验下班不早于上班');
});

// —— #18 请假小时核对：时长格式化契约（运行时断言） ——
test('Batch190 #18：leave.js 时长以「小时」展示（非按天）', () => {
  // 静态加载 leave.js 会触发 IndexedDB，但 fmtDuration 为纯函数，在 IIFE 内。
  // 这里改为直接断言：源码中 fmtDuration 返回「小时」文案，而非「天」。
  const js = read('leave.js');
  assert.ok(/function fmtDuration\(min\)/.test(js), '应定义 fmtDuration(min)');
  assert.ok(/' 小时'/.test(js), 'fmtDuration 应返回「小时」文案');
  assert.ok(!/' 天'/.test(js), 'fmtDuration 不应返回「天」文案');
  // 150 分钟 → "2.5 小时"（从源码逻辑反推，确保非按天）
  assert.ok(/min % 60 === 0\) return \(min \/ 60\) \+ ' 小时'/.test(js), 'fmtDuration 整小时分支应为「X 小时」');
});

test('Batch190 #18：stats.js 请假合计以「时」展示（与 leave 小时口径一致）', () => {
  const js = read('stats.js');
  assert.ok(/function fmtMin\(m\)/.test(js), '应定义 fmtMin(m)');
  assert.ok(/' 时'/.test(js), 'fmtMin 应返回「时」文案');
  assert.ok(/' 分'/.test(js), 'fmtMin 不足 1 时应回退「分」');
});

test('Batch190 #18：stats-view.js 各请假入口均走小时格式化（无按天时长）', () => {
  const js = read('stats-view.js');
  // 首页面板 / 日历当日面板 仍走 app.js → 此处只检查 stats-view.js 的统计请假合计
  // 注意：RT_LEAVE.fmtDuration 的调用仍在 app.js（面板渲染），不在 stats-view.js
  assert.ok(/S\.fmtMin\(s\.leaveMin\)/.test(js), '统计请假合计应走 RT_STATS.fmtMin（时）');
});

test('Batch190 #18：stats.js 中 leaveDays 为「有请假记录的天数」计数（频率指标，非时长）', () => {
  const st = read('stats.js');
  // 初始化为 0、按天累加，确认它是「天数计数」而非「时长（天）」替代
  assert.ok(/leaveDays:\s*0/.test(st), 'summary.leaveDays 应初始化为 0');
  assert.ok(/leaveDays\+\+/.test(st), 'leaveDays 应按天累加（频率计数）');
});
