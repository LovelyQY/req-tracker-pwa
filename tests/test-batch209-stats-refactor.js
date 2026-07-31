// test-batch209-stats-refactor.js — #16 考勤工时统计重构（batch 209）静态契约测试
// 覆盖：① 去重返回 ② 去紫文案（改中性） ③ 导出按钮移到「今天」左侧
//       ④ 上移（见 report-stats.html 减顶部留白） ⑤ 卡片标题外置 + 对齐 devices.html
//       ⑥ 考勤数字语义色（字典） ⑦ 周统计柱色（红/系统/深绿，字典可配）+ 加班字段
//       ⑧ 柱状梯子用网格色 ⑨ 出勤/应出勤不换行
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const html = read('report-stats.html');
const view = read('stats-view.js');
const css = read('pages.css');
const stats = read('stats.js');

test('report-stats.html：导出 toolbar 已移除（导出移入视图内）', () => {
  assert.ok(!html.includes('id="reportToolbar"'), 'reportToolbar 应已移除');
  assert.ok(!html.includes('class="rf-export"'), '旧 rf-export 按钮应已移除');
  // 仍加载 dictionary.js（颜色从字典读）
  assert.ok(/<script src="dictionary\.js[^"]*" defer><\/script>/.test(html), '应仍加载 dictionary.js');
  // 视图容器仍在
  assert.ok(html.includes('id="view-stats"'), 'view-stats 容器应保留');
});

test('report-stats.html：顶部留白已减小（减 padding / desc margin）', () => {
  assert.ok(/\.wrap\{[^}]*padding:8px 14px/.test(html), 'wrap 顶部 padding 应减为 8px');
  assert.ok(/\.section-desc\{[^}]*margin:2px 4px 8px/.test(html), 'section-desc margin 应减小');
});

test('stats-view.js：① 视图内返回按钮已移除（与标题栏重复）', () => {
  assert.ok(!view.includes('st-back'), 'st-back 不应再出现');
});

test('stats-view.js：③ 导出按钮在「今天」左侧', () => {
  assert.ok(view.includes('导出PDF'), '应包含导出PDF');
  assert.ok(view.includes('今天'), '应包含今天');
  // 在拼接顺序上：导出按钮字符串应出现在「今天」按钮之前
  const iExport = view.indexOf('导出PDF');
  const iToday = view.indexOf('今天</button>');
  assert.ok(iExport > 0 && iExport < iToday, '导出PDF 应位于「今天」左侧');
});

test('stats-view.js：② 标题改中性（st-h-title 不再醒目），⑤ 卡片标题外置', () => {
  // 标题元素保留但配色由 CSS 改为 muted（此处只校验结构：仍输出 st-h-title）
  assert.ok(view.includes('st-h-title'), 'st-h-title 结构应保留');
  // 卡片标题外置：stSec 同时产出 set-group-title（外）与 set-group（卡片本体）
  assert.ok(view.includes('set-group-title'), 'stSec 应把标题放到 set-group-title');
  assert.ok(view.includes('set-group'), 'stSec 应包裹 set-group 卡片');
  assert.ok(!view.includes('st-sec-t'), '不应再使用旧的 st-sec-t（标题内置于卡片）');
});

test('stats-view.js：⑥⑦ 颜色从字典读 + 加班字段', () => {
  assert.ok(view.includes('loadStatsColors'), '应存在字典色加载函数');
  assert.ok(view.includes('STATS_COLOR_FALLBACK'), '应有配置色回退');
  assert.ok(view.includes('weekBarColor'), '应有周柱状色函数');
  assert.ok(view.includes('isOvertime'), '应引用加班字段');
  // 考勤数字传入语义色
  assert.ok(view.includes("{ color: numC }") || view.includes('{ color: colors.ATTEND_NUM }'), '考勤数字应带语义色');
});

test('stats-view.js：⑧ 柱状轨道用字典网格色', () => {
  assert.ok(view.includes("style=\"background:' + colors.BAR_GRID"), 'st-bar-track 应注入 BAR_GRID 网格色');
  assert.ok(css.includes('st-bar-fill.is-absent { opacity'), '缺勤柱应弱化（透明）而非纯黑');
});

test('stats.js：⑦ isOvertime 字段（下班后打卡记为加班→深绿柱）', () => {
  // 直接加载 stats.js（root=globalThis），不依赖浏览器全局
  delete require.cache[require.resolve(path.join(ROOT, 'stats.js'))];
  const RT_STATS = require(path.join(ROOT, 'stats.js'));
  const sched = { startMin: 9 * 60, endMin: 18 * 60, graceMin: 0 };
  const key = '2026-07-31';
  // 正常下班：18:00 打卡 → 非加班
  const normal = RT_STATS.dayStat(key, { clockIn: new Date(2026, 6, 31, 9, 5).getTime(), clockOut: new Date(2026, 6, 31, 18, 0).getTime() }, [], false, sched);
  assert.strictEqual(normal.isOvertime, false, '18:00 下班不应记为加班');
  // 加班：20:30 打卡 → 加班
  const ot = RT_STATS.dayStat(key, { clockIn: new Date(2026, 6, 31, 9, 5).getTime(), clockOut: new Date(2026, 6, 31, 20, 30).getTime() }, [], false, sched);
  assert.strictEqual(ot.isOvertime, true, '20:30 下班应记为加班');
  // 休息日不判加班
  const rest = RT_STATS.dayStat(key, null, [], true, sched);
  assert.strictEqual(rest.isOvertime, false, '休息日不应记为加班');
});

test('pages.css：⑨ 卡片标签不换行；② 标题中性；⑦⑨ 柱色/字号', () => {
  assert.ok(css.includes('.st-sec .stat-label { white-space: nowrap'), '统计卡片标签应 nowrap');
  assert.ok(css.includes('.st-h-title'), 'st-h-title 规则应存在');
  // 标题改为中性（muted），不再 18px/700/var(--text)
  assert.ok(/\.st-h-title \{[^}]*color: var\(--muted\)/.test(css), 'st-h-title 应改中性色');
});
