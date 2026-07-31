// Batch 205（#6 登录设备页修复）
// 静态契约测试：auth.js 会话写入真实 loginAt 并暴露 getSession；devices.html 当前设备补全「登录时间」字段。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch205 #6：auth.js setSession 写入真实 loginAt，并提供 getSession()', () => {
  const js = read('auth.js');
  // 会话载荷含 loginAt（登录时真实时间戳）
  assert.ok(/JSON\.stringify\(\{ a: account, exp: exp, loginAt: Date\.now\(\) \}\)/.test(js), 'setSession 应在会话载荷写入 loginAt');
  // 导出 getSession
  assert.ok(/function getSession\(\)/.test(js), '应定义 getSession');
  assert.ok(/root\.getSession = getSession/.test(js), '应在全局导出 getSession');
});

test('Batch205 #6：devices.html 当前设备卡补全「登录时间」字段（保留账号）', () => {
  const html = read('devices.html');
  // 当前设备卡含 设备 / 账号 / 登录时间 / 登录方式 四字段
  assert.ok(html.includes('id="dv-ua"'), '应含 设备 字段 dv-ua');
  assert.ok(html.includes('id="dv-acc"'), '应保留 账号 字段 dv-acc');
  assert.ok(html.includes('id="dv-login-time"'), '应含 登录时间 字段 dv-login-time');
  assert.ok(html.includes('data-i18n="devices.loginTime"'), '登录时间 应使用 data-i18n 键');
  assert.ok(html.includes('id="dv-login-time"') && /dv-login-time[\s\S]*?dv-acc/.test(html.replace(/dv-login-time[\s\S]*$/, '')) || html.indexOf('dv-acc') < html.indexOf('dv-login-time'), '账号应排在登录时间之前');
});

test('Batch205 #6：renderDevices 从 getSession().loginAt 取真实登录时间（无则 —，不伪造）', () => {
  const html = read('devices.html');
  assert.ok(/getSession\(\)/.test(html), 'renderDevices 应调用 getSession()');
  assert.ok(/dv-login-time/.test(html), 'renderDevices 应操作 dv-login-time 元素');
  assert.ok(/s\.loginAt/.test(html), '应读取会话 loginAt');
  assert.ok(/ltEl\.textContent = '—'/.test(html), '无 loginAt 时应显示 —（不伪造）');
});

test('Batch205 #6：i18n 补齐 devices.loginTime（6 语言）', () => {
  const langs = ['zh-CN', 'en', 'zh-HK', 'zh-TW', 'ja', 'ko'];
  langs.forEach((lc) => {
    const js = read('i18n/' + lc + '.js');
    assert.ok(/'devices\.loginTime':/.test(js), '[' + lc + '] 应含 devices.loginTime');
  });
});

test('Batch205 #6：历史记录区保留明确占位文案（属后端能力，标注云端）', () => {
  const html = read('devices.html');
  assert.ok(/data-i18n="devices.otherHint"/.test(html), '其他设备区应使用 otherHint 占位文案');
  assert.ok(/历史登录设备列表|historical login devices|過去のログイン|이전 로그인/.test(html), '占位文案应说明历史设备列表需云端后端');
});
