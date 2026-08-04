// Batch 226（日历状态模型统一 + 配色收尾）—— 状态模型 + dayDots 纯逻辑 + 图例色板
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
const setStats = (opts) => { global.RT_STATS = { dayStat: () => fakeDayStat(opts) }; };
const clearStats = () => { delete global.RT_STATS; };

const TODAY = '2026-08-04';
const PAST = '2026-08-03';
const FUTURE = '2026-12-01';

test('Batch226 #1：STATUS_ORDER 数值化与显示优先级', () => {
  const O = clockStatus.STATUS_ORDER;
  // 请假 = 外出 = 出差 = 调休 > 迟到 = 早退 > 未打卡 > 加班 > 已打卡
  assert.strictEqual(O.LEAVE, 100, '请假应为 100');
  assert.strictEqual(O.OUTING, 95, '外出应为 95');
  assert.strictEqual(O.TRAVEL, 95, '出差应为 95');
  assert.strictEqual(O.ADJUST, 95, '调休应为 95');
  assert.strictEqual(O.LATE, 80, '迟到应为 80');
  assert.strictEqual(O.EARLY, 80, '早退应为 80');
  assert.strictEqual(O.NONE, 60, '未打卡应为 60');
  assert.strictEqual(O.OVERTIME, 40, '加班应为 40');
  assert.strictEqual(O.DONE, 20, '已打卡应为 20');
  // 优先级链校验（高→低）
  assert.ok(O.LEAVE > O.LATE && O.LATE > O.NONE && O.NONE > O.OVERTIME && O.OVERTIME > O.DONE, '优先级链应为 请假>迟到>未打卡>加班>已打卡');
  assert.ok(O.OUTING === O.TRAVEL && O.TRAVEL === O.ADJUST, '外出/出差/调休三者等价');
});

test('Batch226 #1：statusRank 将事件/请假子类映射为对应等级', () => {
  const r = clockStatus.statusRank;
  // 事件态：outing/travel/adjust → 95
  assert.strictEqual(r('outing'), 95, 'outing 应映射为 95');
  assert.strictEqual(r('travel'), 95, 'travel 应映射为 95');
  assert.strictEqual(r('adjust'), 95, 'adjust 应映射为 95');
  // 请假子类（含 personal/sick/annual/other）统一映射为请假级 100
  assert.strictEqual(r('personal'), 100, 'personal 应映射为请假级 100');
  assert.strictEqual(r('sick'), 100, 'sick 应映射为请假级 100');
  assert.strictEqual(r('annual'), 100, 'annual 应映射为请假级 100');
  assert.strictEqual(r('other'), 100, 'other 应映射为请假级 100');
  assert.strictEqual(r('LEAVE'), 100, 'LEAVE 应返回 100');
  // 已知时钟状态直接取
  assert.strictEqual(r('LATE'), 80, 'LATE 返回 80');
  assert.strictEqual(r('DONE'), 20, 'DONE 返回 20');
  // 非法/空 → 0
  assert.strictEqual(r(null), 0, 'null 返回 0');
  assert.strictEqual(r('bogus'), 0, '未知 code 返回 0');
});

test('Batch226 #3+设计修订：dayDots 未来日期屏蔽（无事件/请假命中）', () => {
  setStats({ clockIn: '09:00', clockOut: '18:00' });
  // 未来日期、无 leaves → 屏蔽为 []
  const blocked = clockStatus.dayDots(FUTURE, { clockIn: '09:00', clockOut: '18:00' }, [], false, { todayKey: TODAY });
  assert.deepStrictEqual(blocked, [], '未来无事件应屏蔽为 []');
  // 过去日期、无 leaves → 正常出点
  const past = clockStatus.dayDots(PAST, { clockIn: '09:00', clockOut: '18:00' }, [], false, { todayKey: TODAY });
  assert.deepStrictEqual(past, [clockStatus.STATUS.DONE], '过去应正常出点');
});

test('Batch226 #3+设计修订：dayDots 未来日期若事件/请假命中则放行', () => {
  setStats({ clockIn: '09:00', clockOut: '18:00' });
  // 未来日期但有请假命中（带打卡记录）→ 不屏蔽，返回时钟点
  const hit = clockStatus.dayDots(FUTURE, { clockIn: '09:00', clockOut: '18:00' }, [{ type: 'personal' }], false, { todayKey: TODAY });
  assert.deepStrictEqual(hit, [clockStatus.STATUS.DONE], '未来但请假命中应放行（时钟逻辑正常）');
  // 无 todayKey 时不屏蔽
  const noKey = clockStatus.dayDots(FUTURE, { clockIn: '09:00', clockOut: '18:00' }, [], false, {});
  assert.deepStrictEqual(noKey, [clockStatus.STATUS.DONE], '未传 todayKey 不应屏蔽');
});

test('Batch226 #2（设计修订）：dayDots 正常上班蓝点常驻（仅 1 蓝点）', () => {
  setStats({ clockIn: '09:00', clockOut: '18:00' });
  const codes = clockStatus.dayDots(PAST, { clockIn: '09:00', clockOut: '18:00' }, [], false, { todayKey: TODAY });
  assert.deepStrictEqual(codes, [clockStatus.STATUS.DONE], '正常整天应仅 1 个 DONE（系统蓝点）');
});

test('Batch226 #4（设计修订）：dayDots 加班覆盖正常蓝点（仅 1 深绿点）', () => {
  setStats({ clockIn: '09:00', clockOut: '21:00', overtime: true });
  const codes = clockStatus.dayDots(PAST, { clockIn: '09:00', clockOut: '21:00' }, [], false, { todayKey: TODAY });
  assert.deepStrictEqual(codes, [clockStatus.STATUS.OVERTIME], '加班日应仅 1 个 OVERTIME（深绿），覆盖 DONE 蓝点');
  assert.ok(codes.indexOf(clockStatus.STATUS.DONE) < 0, '加班日不得含 DONE 蓝点');
});

test('Batch226 #3（设计修订）：dayDots 同色合并 / 异色展开', () => {
  setStats({ clockIn: '10:00', clockOut: '17:00', late: true, early: true });
  // 迟到(红) + 早退(红) → 同色 → 1 点
  assert.deepStrictEqual(clockStatus.dayDots(PAST, { clockIn: '10:00', clockOut: '17:00' }, [], false, { todayKey: TODAY }), [clockStatus.STATUS.LATE], '迟到+早退同为红应合并为 1 红点');

  setStats({ clockIn: '10:00', clockOut: '18:00', late: true });
  // 上午迟到(红) + 下午正常(蓝) → 异色 → 2 点
  assert.deepStrictEqual(clockStatus.dayDots(PAST, { clockIn: '10:00', clockOut: '18:00' }, [], false, { todayKey: TODAY }), [clockStatus.STATUS.LATE, clockStatus.STATUS.DONE], '迟到+正常应展开 2 点（红+蓝）');

  setStats({ clockIn: '10:00', clockOut: '21:00', late: true, overtime: true });
  // 上午迟到(红) + 下午加班(深绿) → 异色 → 2 点（加班覆盖蓝但不影响迟到）
  assert.deepStrictEqual(clockStatus.dayDots(PAST, { clockIn: '10:00', clockOut: '21:00' }, [], false, { todayKey: TODAY }), [clockStatus.STATUS.LATE, clockStatus.STATUS.OVERTIME], '迟到+加班应展开 2 点（红+深绿）');
});

test('Batch226 #3（设计修订）：app.js 两日历共用 RT_CLOCK_STATUS.dayDots 取点', () => {
  const js = read('app.js');
  // 日历 TAB 与首页迷你均调用 dayDots
  assert.ok(/RT_CLOCK_STATUS\.dayDots\(/.test(js), '应调用 RT_CLOCK_STATUS.dayDots');
  // 首页迷你日历独立调用（含回退逻辑）
  assert.ok(/const codes = \(window\.RT_CLOCK_STATUS && RT_CLOCK_STATUS\.dayDots\)/.test(js), '首页迷你日历应改用 dayDots');
  // 点渲染包入 .cal-dots
  assert.ok(/<span class="cal-dots">/.test(js), '状态点应包入 .cal-dots（双点并排）');
});

test('Batch226 #4（设计修订）：图例色值对齐两层色板（打卡态硬编码 + 事件类动态生成）', () => {
  const js = read('app.js');
  const legend = js.slice(js.indexOf('cal-legend'), js.indexOf('cal-legend') + 1400);
  // 打卡态图例（固定小集合，硬编码权威色值）
  assert.ok(legend.includes('#1677ff'), '图例应含正常上班系统蓝 #1677ff');
  assert.ok(legend.includes('#f5222d'), '图例应含迟到/早退红 #f5222d');
  assert.ok(legend.includes('#389e0d'), '图例应含加班深绿 #389e0d');
  // 事件类图例由 RT_LEAVE.TYPES 动态生成（两层色板色值由 leaveColorOf 实时取，源码不写死）
  assert.ok(/RT_LEAVE\.TYPES\.map\(function \(t\)/.test(js), '图例事件项应由 RT_LEAVE.TYPES 动态生成');
  assert.ok(/leaveColorOf\(t\.key\)/.test(js), '图例事件项应按类型色渲染');
  assert.ok(/\+ \(t\.label \|\| t\.key\)/.test(js), '图例事件项应使用类型 label');
  // 点合并规则备注独立存在
  assert.ok(/同色→1 点、异色→2 点/.test(js), '图例区应有「点合并规则」独立备注');
  assert.ok(/加班日覆盖为深绿点/.test(js), '图例区应注明加班覆盖深绿点');
});

test('Batch226 #3（设计修订）：base.css 周末淡绿降亮（去晃眼）', () => {
  const css = read('base.css');
  assert.ok(/--weekend-fg:\s*#52c41a/.test(css), '浅色周末字色应为绿 #52c41a');
  assert.ok(/--weekend-bg:\s*rgba\(82, 196, 26, 0\.06\)/.test(css), '浅色周末底色应降为 .06 淡绿');
  const dark = css.slice(css.indexOf('html.dark'));
  assert.ok(/--weekend-fg:\s*#73d13d/.test(dark), '深色周末字色应为绿 #73d13d');
  assert.ok(/--weekend-bg:\s*rgba\(115, 209, 61, 0\.08\)/.test(dark), '深色周末底色应降为 .08 淡绿');
});

clearStats();
