// Batch 189（#4 账号安全页 + #5 登录设备页）
// 结构 / 静态契约断言（无 jsdom，与 test-batch186/188 风格一致）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch189 #4：security.html 已实现账号安全页（账号/密码/手机/邮箱可编辑+校验+保存）', () => {
  const html = read('security.html');
  assert.ok(html.includes('账号与安全'), '标题应为「账号与安全」');
  // 四个可编辑字段
  ['sv-account', 'sv-password', 'sv-phone', 'sv-email'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), '缺账号安全字段：' + id);
  });
  // 点击进入编辑浮层（openEdit）
  assert.ok(html.includes("openEdit('account')"), '应可编辑账号');
  assert.ok(html.includes("openEdit('password')"), '应可编辑密码');
  assert.ok(html.includes("openEdit('phone')"), '应可编辑手机');
  assert.ok(html.includes("openEdit('email')"), '应可编辑邮箱');
  // 保存按钮带 op_security_edit 权限
  assert.ok(/data-perm="op_security_edit"/.test(html), '保存按钮应要求 op_security_edit 权限');
  assert.ok(html.includes('function saveField('), '应有 saveField 保存逻辑');
  // 校验正则（与 settings 旧内嵌逻辑一致）
  assert.ok(html.includes('RE_ACCOUNT') && html.includes('RE_PW_CHARSET') && html.includes('RE_PHONE') && html.includes('RE_EMAIL'),
    '应包含账号/密码/手机/邮箱校验正则');
  // 数据落库走 RT_USERS.updateProfile
  assert.ok(html.includes('RT_USERS.updateProfile'), '保存应写回 RT_USERS');
});

test('Batch189 #4：settings hub「账号安全」已跳转 security.html（Batch 188 落地，本批确认）', () => {
  const js = read('settings.js');
  assert.ok(js.includes("nav: 'security.html'"), '账号安全应 nav 到 security.html');
});

test('Batch189 #5：devices.html 作为独立登录设备页已创建', () => {
  const html = read('devices.html');
  assert.ok(html.includes('登录设备'), '标题应为「登录设备」');
  // 当前设备 + 其他设备 两段
  assert.ok(html.includes('id="dv-ua"'), '应有当前设备 UA 字段 dv-ua');
  assert.ok(html.includes('id="dv-acc"'), '应有当前账号字段 dv-acc');
  assert.ok(html.includes('其他设备'), '应有「其他设备」分区');
  assert.ok(html.includes('empty-tip'), '其他设备应为占位（待后端）');
  // 返回按钮（goBack）
  assert.ok(html.includes("onclick=\"goBack()\""), '应有返回按钮 goBack()');
  // 引入了所需脚本（auth/config/theme-bootstrap/ui-utils/permissions/sw-register）
  ['auth.js', 'config.js', 'theme-bootstrap.js', 'ui-utils.js', 'permissions-registry.js', 'permissions.js', 'sw-register.js']
    .forEach((s) => assert.ok(new RegExp(s + '\\?v=\\d+\\.\\d+\\.\\d+').test(html), 'devices.html 应引入 ' + s));
  // 渲染逻辑
  assert.ok(html.includes('function renderDevices('), '应有 renderDevices 渲染当前设备');
  assert.ok(html.includes('prettyUA('), '应有 UA 解析');
});

test('Batch189 #5：settings hub「登录设备」改为 nav 跳转 devices.html，移除页内子视图', () => {
  const js = read('settings.js');
  assert.ok(js.includes("nav: 'devices.html'"), '登录设备应 nav 到 devices.html');
  assert.ok(!js.includes("hash: 'account-devices'"), '不应再使用 account-devices hash 子视图');
  assert.ok(!js.includes('function renderDevices('), 'settings.js 不应再内嵌 renderDevices');
  assert.ok(!js.includes('function prettyUA('), 'settings.js 不应再内嵌 prettyUA');
  assert.ok(!js.includes('function guardPerm('), 'settings.js 不应再内嵌 guardPerm');

  const html = read('settings.html');
  assert.ok(!html.includes('id="account-devicesView"'), 'settings.html 不应再含 account-devicesView');
  assert.ok(!html.includes('dv-ua'), 'settings.html 不应再含 dv-ua（已迁至 devices.html）');
});

test('Batch189：release.sh 已为 devices.html 登记脚本版本号（防漂移自检失败）', () => {
  const sh = read('release.sh');
  assert.ok(sh.includes('DEVICES_PAGE="devices.html"'), '应登记 DEVICES_PAGE=devices.html');
  ['auth.js', 'config.js', 'theme-bootstrap.js', 'ui-utils.js', 'permissions-registry.js', 'permissions.js', 'sw-register.js']
    .forEach((s) => {
      const re = new RegExp(s.replace('.', '\\.') + '\\?v=\\$NEW_VER');
      assert.ok(re.test(sh) && sh.includes('DEVICES_PAGE'), 'DEVICES_PAGE 应为 devices.html 升级 ' + s);
    });
});
