// Batch 226（日历与考勤 上）：清理首页入口 / 周末假期展示 / 周末改绿 / 打卡分上下午双点
// 运行环境无 jsdom，以「源码结构 / 静态契约 + clock-status 纯逻辑」断言为主。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// 载入 clock-status.js（纯逻辑、无 DOM，可在 node 直跑）
const clockStatus = require(path.join(ROOT, 'clock-status.js'));

// dayStat 桩：覆盖迟到/早退/加班/有无打卡
function fakeDayStat(opts) {
  opts = opts || {};
  return {
    hasClock: !!opts.clockIn,
    clockIn: opts.clockIn || null,
    clockOut: opts.clockOut || null,
    isLate: !!opts.late,
    isEarly: !!opts.early,
    isOvertime: !!opts.overtime
  };
}

test('Batch226 #4：clock-status 暴露 ofDaySplit', () => {
  assert.strictEqual(typeof clockStatus.ofDaySplit, 'function', '应导出 ofDaySplit');
});

test('Batch226 #4：ofDaySplit 分上下午状态码', () => {
  const S = clockStatus.STATUS;
  // 正常整天：双绿
  global.RT_STATS = { dayStat: () => fakeDayStat({ clockIn: '09:00', clockOut: '18:00' }) };
  let r = clockStatus.ofDaySplit('2026-08-03', { clockIn: '09:00', clockOut: '18:00' }, [], false);
  assert.strictEqual(r.am, S.DONE, '正常整天 am 应为 DONE');
  assert.strictEqual(r.pm, S.DONE, '正常整天 pm 应为 DONE');

  // 仅上午迟到：左红右绿
  global.RT_STATS = { dayStat: () => fakeDayStat({ clockIn: '10:00', clockOut: '18:00', late: true }) };
  r = clockStatus.ofDaySplit('2026-08-03', { clockIn: '10:00', clockOut: '18:00' }, [], false);
  assert.strictEqual(r.am, S.LATE, '迟到 am 应为 LATE');
  assert.strictEqual(r.pm, S.DONE, '迟到 pm 应为 DONE');

  // 仅下午早退：左绿右红
  global.RT_STATS = { dayStat: () => fakeDayStat({ clockIn: '09:00', clockOut: '17:00', early: true }) };
  r = clockStatus.ofDaySplit('2026-08-03', { clockIn: '09:00', clockOut: '17:00' }, [], false);
  assert.strictEqual(r.am, S.DONE, '早退 am 应为 DONE');
  assert.strictEqual(r.pm, S.EARLY, '早退 pm 应为 EARLY');

  // 迟到 + 早退：左右皆红
  global.RT_STATS = { dayStat: () => fakeDayStat({ clockIn: '10:00', clockOut: '17:00', late: true, early: true }) };
  r = clockStatus.ofDaySplit('2026-08-03', { clockIn: '10:00', clockOut: '17:00' }, [], false);
  assert.strictEqual(r.am, S.LATE, '迟到+早退 am 应为 LATE');
  assert.strictEqual(r.pm, S.EARLY, '迟到+早退 pm 应为 EARLY');

  // 加班：右深绿
  global.RT_STATS = { dayStat: () => fakeDayStat({ clockIn: '09:00', clockOut: '21:00', overtime: true }) };
  r = clockStatus.ofDaySplit('2026-08-03', { clockIn: '09:00', clockOut: '21:00' }, [], false);
  assert.strictEqual(r.am, S.DONE, '加班 am 应为 DONE');
  assert.strictEqual(r.pm, S.OVERTIME, '加班 pm 应为 OVERTIME');

  // 仅上班未下班：左绿右空
  global.RT_STATS = { dayStat: () => fakeDayStat({ clockIn: '09:00' }) };
  r = clockStatus.ofDaySplit('2026-08-03', { clockIn: '09:00' }, [], false);
  assert.strictEqual(r.am, S.DONE, '仅上班 am 应为 DONE');
  assert.strictEqual(r.pm, S.NONE, '仅上班 pm 应为 NONE');

  // 完全无打卡：左右皆空
  global.RT_STATS = { dayStat: () => fakeDayStat({}) };
  r = clockStatus.ofDaySplit('2026-08-03', null, [], false);
  assert.strictEqual(r.am, S.NONE, '无打卡 am 应为 NONE');
  assert.strictEqual(r.pm, S.NONE, '无打卡 pm 应为 NONE');
});

test('Batch226 #4：app.js 两个日历均用 ofDaySplit + dotCodes 且双点包入 .cal-dots', () => {
  const js = read('app.js');
  assert.ok(/RT_CLOCK_STATUS\.ofDaySplit/.test(js), '应调用 ofDaySplit');
  assert.ok(/RT_CLOCK_STATUS\.dotCodes/.test(js), '应调用 dotCodes（合并/展开规则）');
  assert.ok(/const split = \(window\.RT_CLOCK_STATUS && RT_CLOCK_STATUS\.ofDaySplit\)/.test(js), '首页迷你日历应调用 ofDaySplit');
  assert.ok(/<span class="cal-dots">/.test(js), '状态点应包入 .cal-dots（双点并排）');
});

test('Batch226 #4（修订）：dotCodes 颜色相同→1点、不同→2点、未打卡→0点', () => {
  const S = clockStatus.STATUS;
  // 正常双绿 → 1点
  assert.deepStrictEqual(clockStatus.dotCodes(S.DONE, S.DONE), [S.DONE], '正常双绿应合并为 1 点');
  // 迟到(红) + 正常(绿) → 2点
  assert.deepStrictEqual(clockStatus.dotCodes(S.LATE, S.DONE), [S.LATE, S.DONE], '迟到+正常应展开 2 点');
  // 正常(绿) + 早退(红) → 2点
  assert.deepStrictEqual(clockStatus.dotCodes(S.DONE, S.EARLY), [S.DONE, S.EARLY], '正常+早退应展开 2 点');
  // 迟到(红) + 早退(红) → 同色 → 1点（左/右同为红，合并）
  assert.deepStrictEqual(clockStatus.dotCodes(S.LATE, S.EARLY), [S.LATE], '迟到+早退同为红应合并为 1 红点');
  // 加班(深绿) + 正常(绿) → 不同 → 2点
  assert.deepStrictEqual(clockStatus.dotCodes(S.DONE, S.OVERTIME), [S.DONE, S.OVERTIME], '正常+加班应展开 2 点');
  // 仅上班（am DONE, pm NONE）→ 1点
  assert.deepStrictEqual(clockStatus.dotCodes(S.DONE, S.NONE), [S.DONE], '仅上班应只渲上午 1 点');
  // 两侧皆未打卡 → 0点
  assert.deepStrictEqual(clockStatus.dotCodes(S.NONE, S.NONE), [], '未打卡应 0 点');
});

test('Batch226 #4：pages.css 提供首页迷你日历双点容器样式', () => {
  const css = read('pages.css');
  assert.ok(/\.home-cal-cell \.cal-dots\s*\{[^}]*display:\s*flex/.test(css), '应定义 .home-cal-cell .cal-dots 双点横排容器');
  assert.ok(/\.home-cal-cell \.cal-dots \.cal-dot\s*\{[^}]*position:\s*static/.test(css), 'mini 日历双点子元素应取消绝对定位');
});

test('Batch226 #3：周末配色变量改为绿色（浅色 + 深色）', () => {
  const css = read('base.css');
  assert.ok(/--weekend-fg:\s*#52c41a/.test(css), '浅色周末字色应为绿 #52c41a');
  assert.ok(/--weekend-bg:\s*rgba\(82, 196, 26, 0\.10\)/.test(css), '浅色周末底色应为淡绿');
  const dark = css.slice(css.indexOf('html.dark'));
  assert.ok(/--weekend-fg:\s*#73d13d/.test(dark), '深色周末字色应为绿 #73d13d');
  assert.ok(/--weekend-bg:\s*rgba\(115, 209, 61, 0\.14\)/.test(dark), '深色周末底色应为淡绿');
});

test('Batch226 #2：renderHomeAttendance 周末/假期展示「周末」或「假期」', () => {
  const js = read('app.js');
  assert.ok(/statusEl\.textContent = isHoliday \? '假期' : '周末'/.test(js), '休息日应显示「假期」或「周末」');
  assert.ok(/isHoliday = !![(\(]td && td[.]type === 'holiday'[)];/.test(js), '应将法定假标记为 isHoliday');
});

test('Batch226 #1：首页已移除「统计」「待我审批」快捷入口', () => {
  const html = read('index.html');
  assert.ok(!html.includes('homePendingCount'), 'index.html 不应残留 homePendingCount 计数元素');
  assert.ok(!/class="home-quick"/.test(html), 'index.html 不应残留 home-quick 容器');
});
