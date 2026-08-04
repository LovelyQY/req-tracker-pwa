// Batch 193（#16 日历周末配色、#19 日历下方统计颜色非黑）
// 运行环境无 jsdom，以「源码结构 / 静态契约」断言为主，与 test-batch186/188/190/191/192 风格一致。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// —— #16 日历周末配色：新增周末语义色变量（浅色 + 深色）并应用到两个日历 ——
test('Batch193 #16：base.css 定义周末配色变量（浅色 + 深色覆盖）', () => {
  const css = read('base.css');
  assert.ok(/--weekend-fg:\s*#52c41a/.test(css), '浅色应定义 --weekend-fg: #52c41a（绿）');
  assert.ok(/--weekend-bg:\s*rgba\(82, 196, 26, 0\.06\)/.test(css), '浅色应定义 --weekend-bg（淡绿·批次226降亮）');
  const darkIdx = css.indexOf('html.dark');
  const dark = css.slice(darkIdx);
  assert.ok(/--weekend-fg:\s*#73d13d/.test(dark), '深色应覆盖 --weekend-fg: #73d13d（绿）');
  assert.ok(/--weekend-bg:\s*rgba\(115, 209, 61, 0\.08\)/.test(dark), '深色应覆盖 --weekend-bg（淡绿·批次226降亮）');
});

test('Batch193 #16：pages.css 周末单元格套用周末配色（全量日历 + 首页迷你日历）', () => {
  const css = read('pages.css');
  assert.ok(/\.cal-cell\.is-weekend\s*\{[^}]*var\(--weekend-bg\)/.test(css), '全量日历 .cal-cell.is-weekend 应套周末底色');
  assert.ok(/\.cal-cell\.is-weekend \.cal-num\s*\{[^}]*var\(--weekend-fg\)/.test(css), '全量日历周末日期字色应为 --weekend-fg');
  assert.ok(/\.home-cal-cell\.is-weekend\s*\{[^}]*var\(--weekend-fg\)/.test(css), '首页迷你日历 .home-cal-cell.is-weekend 应套周末字色');
  // 图例：周末色点
  assert.ok(/\.cal-dot-weekend\s*\{[^}]*var\(--weekend-fg\)/.test(css), '应定义 .cal-dot-weekend 图例色点');
});

test('Batch193 #16：app.js 两个日历均按周六/周日标记 is-weekend', () => {
  const js = read('app.js');
  // 全量日历 renderCalendar
  assert.ok(/new Date\(calYear, calMonth, d\)\.getDay\(\)/.test(js), 'renderCalendar 应取星期几');
  assert.ok(/dow === 0 \|\| dow === 6\) cls\.push\('is-weekend'\)/.test(js), 'renderCalendar 周六/周日应加 is-weekend');
  // 首页迷你日历 renderHomeCalendar
  assert.ok(/new Date\(y, m, d\)\.getDay\(\)/.test(js), 'renderHomeCalendar 应取星期几');
  assert.ok(/dow === 0 \|\| dow === 6\) cls\.push\('is-weekend'\)/.test(js), 'renderHomeCalendar 周六/周日应加 is-weekend');
  // 图例含周末条目
  assert.ok(/cal-dot-weekend['"]*>?[^<]*<\/i>周末/.test(js) || /cal-dot cal-dot-weekend"><\/i>周末/.test(js), '日历图例应含「周末」项');
});

// —— #19 日历下方统计颜色非黑：用语义色变量（与主题/深色联动） ——
test('Batch193 #19：日历下方月度小结统计改用语义色变量（非纯黑）', () => {
  const js = read('app.js');
  // cal-summary 块内四个 stat-num 分别用语义色：primary / success / muted / warning
  assert.ok(/class="cal-summary cal-summary-4"/.test(js), '应存在 .cal-summary.cal-summary-4 月度小结容器');
  assert.ok(/class="stat-num" style="color:var\(--primary\)"/.test(js), '出勤天数应着色 var(--primary)');
  assert.ok(/class="stat-num" style="color:var\(--success\)"/.test(js), '实际工时应着色 var(--success)');
  assert.ok(/class="stat-num" style="color:var\(--muted\)"/.test(js), '应出勤应着色 var(--muted)（非纯黑）');
  assert.ok(/class="stat-num" style="color:var\(--warning\)"/.test(js), '请假合计应着色 var(--warning)');
  // 所用变量均为 base.css 已定义语义色（浅/深均有效）
  const css = read('base.css');
  assert.ok(/--primary:\s*#1677ff/.test(css), 'var(--primary) 应已定义');
  assert.ok(/--success:\s*#389e0d/.test(css), 'var(--success) 应已定义');
  assert.ok(/--muted:\s*#6b7280/.test(css), 'var(--muted) 应已定义');
  assert.ok(/--warning:\s*#fa8c16/.test(css), 'var(--warning) 应已定义');
});
