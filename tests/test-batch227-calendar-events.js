// Batch 227（日历与考勤 下）：颜色统一走字典 / 事件类型（外出·出差）/ 云端时间
// 运行环境无 jsdom，纯逻辑用 node 直跑；UI 以「源码结构 / 静态契约」断言为主。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ============ 运行时：leave.js / time-source.js（浏览器全局，需 window）============
// 注意：这两个模块无 module.exports，仅通过 window.* 暴露；require 会被缓存，故只挂一次。
globalThis.window = globalThis;
require(path.join(ROOT, 'leave.js'));
require(path.join(ROOT, 'time-source.js'));
const LEAVE = globalThis.RT_LEAVE;
const TIME = globalThis.RT_TIME_SOURCE;

test('Batch227 #2+#3：leave.js TYPES 含 outing/travel 且 noDeduct', () => {
  const RT = LEAVE;
  const keys = RT.TYPES.map((t) => t.key);
  assert.ok(keys.indexOf('outing') >= 0, 'TYPES 应含 outing');
  assert.ok(keys.indexOf('travel') >= 0, 'TYPES 应含 travel');
  const outing = RT.TYPES.find((t) => t.key === 'outing');
  const travel = RT.TYPES.find((t) => t.key === 'travel');
  assert.strictEqual(outing.noDeduct, true, 'outing 应 noDeduct');
  assert.strictEqual(travel.noDeduct, true, 'travel 应 noDeduct');
  assert.strictEqual(outing.label, '外出', 'outing 文案应为 外出');
  assert.strictEqual(travel.label, '出差', 'travel 文案应为 出差');
});

test('Batch227 #2+#3：colorOf 返回正确色（两层色板：青/紫/橙）', () => {
  const RT = LEAVE;
  assert.strictEqual(RT.colorOf('outing'), '#fa8c16', 'outing 应为橙 #fa8c16（两层色板）');
  assert.strictEqual(RT.colorOf('travel'), '#722ed1', 'travel 应为紫 #722ed1');
  assert.strictEqual(RT.colorOf('personal'), '#13c2c2', 'personal 应为青 #13c2c2（请假子类合并色）');
  assert.strictEqual(RT.colorOf('adjust'), '#faad14', 'adjust 应为黄 #faad14（调休）');
  assert.strictEqual(RT.colorOf('unknown'), '#8c8c8c', '未知类型回退中性灰');
});

test('Batch227 #3：isDeducting 对 outing/travel 为 false，其余为 true', () => {
  const RT = LEAVE;
  assert.strictEqual(RT.isDeducting('outing'), false, 'outing 不扣工时');
  assert.strictEqual(RT.isDeducting('travel'), false, 'travel 不扣工时');
  assert.strictEqual(RT.isDeducting('personal'), true, 'personal 扣工时');
  assert.strictEqual(RT.isDeducting('sick'), true, 'sick 扣工时');
  assert.strictEqual(RT.isDeducting('unknown'), true, '未知类型默认扣工时');
});

test('Batch227 #3：effectiveHours 对 outing/travel 不扣工时', () => {
  const RT = LEAVE;
  const day = new Date(2026, 7, 3);
  const mk = (h, m) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
  const att = { clockIn: mk(9, 0), clockOut: mk(18, 0) };
  // 同段请假 09:00–11:00：扣减类型 → 工时 7、请假 2；不扣类型 → 工时 9、请假 0
  const personal = { type: 'personal', startMin: 9 * 60, endMin: 11 * 60, minutes: 120 };
  const outing = { type: 'outing', startMin: 9 * 60, endMin: 11 * 60, minutes: 120 };
  const effP = RT.effectiveHours(att, [personal]);
  const effO = RT.effectiveHours(att, [outing]);
  assert.strictEqual(Math.round(effP.hours), 7, '事假应扣 2 小时 → 工时 7');
  assert.strictEqual(Math.round(effP.leaveHours), 2, '事假 leaveHours 应为 2');
  assert.strictEqual(Math.round(effO.hours), 9, '外出不扣工时 → 工时 9');
  assert.strictEqual(Math.round(effO.leaveHours), 0, '外出 leaveHours 应为 0');
});

test('Batch227 #3：totalMinutes 跳过 noDeduct 类型', () => {
  const RT = LEAVE;
  const list = [
    { type: 'outing', minutes: 120 },
    { type: 'personal', minutes: 60 },
    { type: 'travel', minutes: 90 }
  ];
  assert.strictEqual(RT.totalMinutes(list), 60, '请假合计应只计扣减类型（60），排除外出/出差');
});

test('Batch227 #2：colors() 优先字典 LEAVE_TYPE，回退 TYPES', async () => {
  const RT = LEAVE;
  // 无字典：回退 TYPES（两层色板）
  let map = await RT.colors();
  assert.strictEqual(map.outing, '#fa8c16', '无字典时回退 TYPES 色（橙）');
  assert.strictEqual(map.travel, '#722ed1', '无字典时回退 TYPES 色（紫）');
  assert.strictEqual(map.personal, '#13c2c2', '无字典时回退 TYPES 色（请假青）');
  // 有字典：字典覆盖
  globalThis.RT_DICT = {
    SEED_TYPE: { LEAVE_TYPE: '请假/事件类型' },
    getDictByType: () => Promise.resolve([
      { code: 'outing', color: '#123456' },
      { code: 'personal', color: '#abcdef' }
    ])
  };
  map = await RT.colors();
  assert.strictEqual(map.outing, '#123456', '字典存在时应优先字典色');
  assert.strictEqual(map.personal, '#abcdef', '字典存在时应优先字典色');
  delete globalThis.RT_DICT;
});

// ============ 运行时：time-source.js 云端时间回退 ============
// TIME 已在模块顶部挂载一次；getServerTime 在调用时实时读取 globalThis.RT_CLOUD，故只需切换该全局。
test('Batch227 #5：未配置云时 getServerTime 立即回退 Date.now()', async () => {
  delete globalThis.RT_CLOUD;
  const t = await TIME.getServerTime();
  assert.strictEqual(typeof t, 'number', '应返回时间戳数字');
  assert.ok(t > 0, '时间戳应大于 0');
});

test('Batch227 #5：云函数可用时 getServerTime 返回服务端时间', async () => {
  globalThis.RT_CLOUD = {
    _app: { callFunction: () => Promise.resolve({ result: { time: 1700000000000 } }) },
    callFunction: function (n, d) { return this._app.callFunction(n, d); }
  };
  const t = await TIME.getServerTime();
  assert.strictEqual(t, 1700000000000, '应返回云函数 time');
  delete globalThis.RT_CLOUD;
});

test('Batch227 #5：云函数报错/超时回退 Date.now()', async () => {
  let called = false;
  globalThis.RT_CLOUD = {
    _app: {},
    callFunction: function () { called = true; return Promise.reject(new Error('no func')); }
  };
  const t = await TIME.getServerTime();
  assert.ok(called, '应尝试调用云函数');
  assert.strictEqual(typeof t, 'number', '云函数失败应回退本地时间');
  delete globalThis.RT_CLOUD;
});

// ============ 结构/契约：源码 ============
test('Batch227 #2：dictionary.js 新增 LEAVE_TYPE 类型与种子', () => {
  const js = read('dictionary.js');
  assert.ok(/LEAVE_TYPE:\s*'请假\/事件类型'/.test(js), 'SEED_TYPE 应含 LEAVE_TYPE');
  assert.ok(/type:\s*SEED_TYPE\.LEAVE_TYPE,\s*code:\s*'outing'/.test(js), '应播种 outing');
  assert.ok(/code:\s*'outing'[^}]*color:\s*'#fa8c16'/.test(js), 'outing 应为橙 #fa8c16（两层色板）');
  assert.ok(/code:\s*'travel'[^}]*color:\s*'#722ed1'/.test(js), 'travel 应为紫 #722ed1');
  assert.ok(/code:\s*'personal'[^}]*color:\s*'#13c2c2'/.test(js), 'personal 应为青 #13c2c2（请假子类合并）');
  assert.ok(/code:\s*'adjust'[^}]*color:\s*'#faad14'/.test(js), 'adjust 应为黄 #faad14（调休）');
});

test('Batch227 #3：app.js 两日历按 RT_LEAVE 类型色渲染色点（非单一橙点）', () => {
  const js = read('app.js');
  // 日历 TAB 与首页迷你日历都通过 leaveColorOf 取色，且遍历 leaveMap 逐条渲染色点
  assert.ok(/leaveColorOf\(lv\.type\)/.test(js), '应调用 leaveColorOf 取请假/事件类型色');
  assert.ok(/const leaveColorOf = function \(type\)/.test(js), '应定义 leaveColorOf 取色函数');
  // 不再依赖单一 .cal-dot-leave 橙点（已被逐类型色点取代）
  assert.ok(/leaveColorMap = await RT_LEAVE\.colors\(\)/.test(js), '应加载请假/事件类型色表');
});

test('Batch227 #3：图例由 RT_LEAVE.TYPES 动态生成（含外出/出差）', () => {
  const js = read('app.js');
  const lv = read('leave.js');
  // app.js 图例遍历 RT_LEAVE.TYPES、按类型色 + 标签渲染（标签含 外出/出差，来自 leave.js）
  assert.ok(/RT_LEAVE\.TYPES\.map\(function \(t\)/.test(js), '图例应由 RT_LEAVE.TYPES 动态生成');
  assert.ok(/leaveColorOf\(t\.key\)/.test(js), '图例应按类型色渲染');
  assert.ok(/\+ \(t\.label \|\| t\.key\)/.test(js), '图例应使用类型 label');
  // 标签来源（leave.js TYPES）须含 外出/出差
  assert.ok(/key:\s*'outing',\s*label:\s*'外出'/.test(lv), 'leave.js 外出标签应为 外出');
  assert.ok(/key:\s*'travel',\s*label:\s*'出差'/.test(lv), 'leave.js 出差标签应为 出差');
});

test('Batch227 #5：cloudbase.js 暴露 callFunction', () => {
  const js = read('cloudbase.js');
  assert.ok(/callFunction:\s*function \(name, data\)/.test(js), 'RT_CLOUD 应导出 callFunction');
});

test('Batch227 #5：attendance.js 存 clockInServer / clockOutServer 双时间戳', () => {
  const js = read('attendance.js');
  assert.ok(/clockInServer/.test(js), '应存 clockInServer 服务端时间戳');
  assert.ok(/clockOutServer/.test(js), '应存 clockOutServer 服务端时间戳');
  assert.ok(/RT_TIME_SOURCE\.getServerTime/.test(js), '应通过 RT_TIME_SOURCE.getServerTime 取权威时间');
});

test('Batch227 #5：app.js 打卡时间优先显示服务端时间并标注云端', () => {
  const js = read('app.js');
  assert.ok(/att\.clockInServer/.test(js), '当日面板应优先显示 clockInServer');
  assert.ok(/云端时间/.test(js), '存在服务端时间时应标注「云端时间」');
  assert.ok(/inTs = att \? \(att\.clockInServer/.test(js), '优先取 clockInServer||clockIn');
});

test('Batch227 #5：新建 time-source.js 与云函数 getServerTime', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'time-source.js')), '应存在 time-source.js');
  assert.ok(fs.existsSync(path.join(ROOT, 'functions', 'getServerTime', 'index.js')), '应存在云函数 getServerTime/index.js');
  const fn = read('functions/getServerTime/index.js');
  assert.ok(/exports\.main/.test(fn), '云函数应导出 main');
  assert.ok(/time:/.test(fn), '云函数应返回 time 字段');
});
