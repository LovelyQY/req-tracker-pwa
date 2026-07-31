// Batch 195（#22 报表中心暴露：日/周/综合考勤工时统计接入报表中心 + 权限门控）
// 运行环境无 jsdom，以「源码结构 / 静态契约 + 注册表实测」断言为主，与 191–194 测试风格一致。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ===== #22 权限注册：page_report_stats + op_report_stats_view / export =====
test('Batch195 #22：权限注册表登记 page_report_stats（op_report_stats_view / op_report_stats_export）', () => {
  const reg = require(path.join(ROOT, 'permissions-registry.js'));
  const codes = reg.flattenRegistryCodes();
  assert.ok(codes.indexOf('page_report_stats') >= 0, '应登记页面 page_report_stats');
  assert.ok(codes.indexOf('op_report_stats_view') >= 0, '应登记操作叶子 op_report_stats_view');
  assert.ok(codes.indexOf('op_report_stats_export') >= 0, '应登记操作叶子 op_report_stats_export');
  assert.strictEqual(reg.expandOp('page_report_stats', 'view'), 'op_report_stats_view', 'expandOp 应正确展开 op_report_stats_view');
  assert.strictEqual(reg.expandOp('page_report_stats', 'export'), 'op_report_stats_export', 'expandOp 应正确展开 op_report_stats_export');
});

// ===== #22 report.html 报表中心 hub 注册考勤工时统计模块 =====
test('Batch195 #22：report.html 报表中心 hub 注册考勤工时统计模块（key: "stats"）', () => {
  const html = read('report.html');
  assert.ok(/key:\s*['"]stats['"]/.test(html), 'REPORT_MODULES 应包含 key: "stats" 条目');
  assert.ok(/report-stats\.html/.test(html), 'stats 模块应引用 report-stats.html');
});

// ===== #22 stats-view.js 导出 RT_STATS_VIEW.renderInto 及全局切换函数 =====
test('Batch195 #22：stats-view.js 导出 RT_STATS_VIEW.renderInto 及全局切换函数', () => {
  const js = read('stats-view.js');
  assert.ok(/window\.RT_STATS_VIEW\s*=/.test(js), '应赋值 window.RT_STATS_VIEW');
  assert.ok(/renderInto/.test(js) && /renderInto\s*:/.test(js) && /function\s+renderInto/.test(js), 'renderInto 应在导出对象中且已定义');
  // 全局切换函数通过 window. 暴露给 inline onclick
  assert.ok(/window\.statsShift\s*=/.test(js), 'statsShift 应以 window. 形式暴露');
  assert.ok(/window\.statsSwitchMode\s*=/.test(js), 'statsSwitchMode 应以 window. 形式暴露');
  assert.ok(/window\.statsGoToday\s*=/.test(js), 'statsGoToday 应以 window. 形式暴露');
  assert.ok(/window\.statsRange\s*=/.test(js), 'statsRange 应以 window. 形式暴露');
});

// ===== #22 app.js 委托 RT_STATS_VIEW.renderInto，不再内联 stCard / stDayHtml / stOverallHtml =====
test('Batch195 #22：app.js 委托 RT_STATS_VIEW.renderInto，不再内联 stCard / stDayHtml / stOverallHtml', () => {
  const js = read('app.js');
  assert.ok(/RT_STATS_VIEW\.renderInto/.test(js), 'app.js 应调用 RT_STATS_VIEW.renderInto');
  assert.ok(!/function stCard\(/.test(js), 'app.js 不应再定义 function stCard（已迁移到 stats-view.js）');
  assert.ok(!/function stDayHtml\(/.test(js), 'app.js 不应再定义 function stDayHtml（已迁移到 stats-view.js）');
  assert.ok(!/function stOverallHtml\(/.test(js), 'app.js 不应再定义 function stOverallHtml（已迁移到 stats-view.js）');
});

// ===== #22 report-stats.html 加载 stats-view.js，权限门控，调用 RT_PERM.guard =====
// 批次 209 / #16：导出 PDF 按钮已从页面顶部 toolbar 移入视图内「今天」左侧，
// 权限门控改为 stats-view.js 内 RT_PERM.can('page_report_stats','export') 动态显隐（不再用静态 data-perm）。
test('Batch195 #22：report-stats.html 加载 stats-view.js，权限门控，调用 RT_PERM.guard', () => {
  const html = read('report-stats.html');
  const view = read('stats-view.js');
  assert.ok(/<script src="stats-view\.js\?v=/.test(html), '应引用 stats-view.js（带 ?v= 版本标识）');
  assert.ok(/data-perm="op_report_stats_view"/.test(html), '应有 data-perm="op_report_stats_view"');
  assert.ok(!html.includes('reportToolbar'), '导出 toolbar 已移除（导出按钮移入视图内）');
  assert.ok(/RT_PERM\.guard\(document\)/.test(html), '应调用 RT_PERM.guard(document) 进行权限门控');
  assert.ok(/RT_PERM\.can\(.*'page_report_stats'/.test(html), '应通过 RT_PERM.can 检查 page_report_stats view 权限');
  // 导出权限门控改由 stats-view.js 内 JS 显隐（仍可追溯到 op_report_stats_export）
  assert.ok(/RT_PERM\.can\(['"]?page_report_stats['"]?\s*,\s*['"]export['"]/.test(view), 'stats-view.js 应按 export 权限动态门控导出按钮');
});

// ===== #22 index.html 加载 stats-view.js，抽屉入口包含 op_report_stats_view 权限 =====
test('Batch195 #22：index.html 加载 stats-view.js，抽屉入口包含 op_report_stats_view 权限', () => {
  const html = read('index.html');
  assert.ok(/<script src="stats-view\.js\?v=/.test(html), 'index.html 应引用 stats-view.js（带 ?v= 版本标识）');
  assert.ok(/op_report_stats_view/.test(html), 'index.html 抽屉导航应包含 op_report_stats_view 权限入口');
});
