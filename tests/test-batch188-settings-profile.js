// Batch 188（#2 设置 hub 导航重构 + #3 profile.html 两段式卡片）
// 由于运行环境无 jsdom，本批以「源码结构 / 静态契约」断言为主，与 test-batch186 风格一致。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch188 #2：settings.html 已移除全部内嵌账号子视图与共享编辑浮层（#2/#4/#5 均独立页化）', () => {
  const html = read('settings.html');
  // 个人资料 / 账号安全 / 登录设备 内嵌子视图已改由独立页 profile.html / security.html / devices.html 承担
  assert.ok(!html.includes('id="account-profileView"'), '不应再含 account-profileView 内嵌子视图');
  assert.ok(!html.includes('id="account-securityView"'), '不应再含 account-securityView 内嵌子视图');
  assert.ok(!html.includes('id="account-devicesView"'), '不应再含 account-devicesView 内嵌子视图（已独立为 devices.html）');
  assert.ok(!html.includes('id="acSheet"'), '不应再含共享编辑浮层 acSheet');
  assert.ok(!html.includes('id="acSheetMask"'), '不应再含 acSheetMask');
  assert.ok(!html.includes('acF-input1'), '不应再含 acF-input1');
  assert.ok(!html.includes("RT_SETTINGS_PAGE.openAcEdit"), '不应再引用 openAcEdit');
  // hub 容器与 通用 / 帮助 子视图不受影响
  assert.ok(html.includes('id="landingView"'), 'hub 容器 landingView 应保留');
  assert.ok(html.includes('id="gen-uiView"'), '通用子视图应保留');
  assert.ok(html.includes('id="helpView"'), '帮助子视图应保留');
});

test('Batch188 #2：settings.js 账号组条目（个人资料/账号安全/登录设备）均改为 nav 跳转独立页', () => {
  const js = read('settings.js');
  // 个人资料 → profile.html；账号安全 → security.html；登录设备 → devices.html（均 nav 独立页）
  assert.ok(js.includes("nav: 'profile.html'"), '个人资料应 nav 到 profile.html');
  assert.ok(js.includes("nav: 'security.html'"), '账号安全应 nav 到 security.html');
  assert.ok(js.includes("nav: 'devices.html'"), '登录设备应 nav 到 devices.html');
  // 不再保留「登录设备」页内 hash 子视图（已独立为 devices.html）
  assert.ok(!js.includes("hash: 'account-devices'"), '登录设备不应再保留 hash 子视图');
  // renderLanding 支持 nav / hash 两类点击
  assert.ok(js.includes("navTo("), 'renderLanding 应分支处理 nav（navTo 跳转）');
  assert.ok(js.includes("location.hash="), 'renderLanding 应分支处理 hash（页内子视图）');
  // HASH_MAP 仅登记带 hash 的条目（跳过 nav 项）
  assert.ok(js.includes('if (it.hash) HASH_MAP[it.hash]'), 'HASH_MAP 应跳过无 hash 的 nav 项');
});

test('Batch188 #2：settings.js 已移除全部内嵌账号编辑与设备渲染逻辑（迁移至独立页）', () => {
  const js = read('settings.js');
  // 内嵌账号资料/安全编辑
  assert.ok(!js.includes('function renderProfile()'), '应移除内嵌 renderProfile');
  assert.ok(!js.includes('function renderSecurity()'), '应移除内嵌 renderSecurity');
  assert.ok(!js.includes('function openAcEdit('), '应移除 openAcEdit');
  assert.ok(!js.includes('function saveAcField('), '应移除 saveAcField');
  assert.ok(!js.includes('function closeAcSheet('), '应移除 closeAcSheet');
  assert.ok(!js.includes('var AC_FIELDS'), '应移除 AC_FIELDS');
  assert.ok(!js.includes('accountRec ='), '不应再引用 accountRec');
  // 内嵌设备渲染 / 权限守卫（已迁移至 devices.html）
  assert.ok(!js.includes('async function renderDevices()'), '应移除内嵌 renderDevices（已迁移 devices.html）');
  assert.ok(!js.includes('function prettyUA('), '应移除内嵌 prettyUA（已迁移 devices.html）');
  assert.ok(!js.includes('function guardPerm('), '应移除内嵌 guardPerm（已迁移 devices.html）');
  // 导出对象不应再暴露已移除函数
  const exportBlock = js.slice(js.indexOf('root.RT_SETTINGS_PAGE = {'));
  assert.ok(!/renderProfile: renderProfile/.test(exportBlock), '导出不应含 renderProfile');
  assert.ok(!/openAcEdit: openAcEdit/.test(exportBlock), '导出不应含 openAcEdit');
  assert.ok(!/renderDevices: renderDevices/.test(exportBlock), '导出不应含 renderDevices');
});

test('Batch188 #3：profile.html 重构为「基本信息 + 组织信息」两段式卡片', () => {
  const html = read('profile.html');
  // 两个卡片分区
  const pcards = (html.match(/class="pcard"/g) || []).length;
  assert.ok(pcards >= 2, '应至少有 2 个 .pcard 卡片（基本信息 / 组织信息），实际 ' + pcards);
  assert.ok(html.includes('基本信息'), '应含「基本信息」分区标题');
  assert.ok(html.includes('组织信息'), '应含「组织信息」分区标题');
  // 组织信息字段 ID 齐全
  ['pv-name', 'pv-emp', 'pv-company', 'pv-dept', 'pv-pos'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), '组织信息字段缺失：' + id);
  });
  // 基本信息字段（头像/账号/昵称/标签/签名/详情）保留
  ['pv-account', 'pv-nickname', 'pv-tags', 'pv-bio', 'pv-avatar-name'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), '基本信息字段缺失：' + id);
  });
  // 旧的「全屏单卡片 .card」布局应已被 .page 取代
  assert.ok(!/<div class="card">/.test(html), '不应再使用旧的 .card 全屏单卡片');
  assert.ok(html.includes('class="page"'), '应使用 .page 滚动容器');
});

test('Batch188 #3：profile.html 引入组织信息所需的 departments / companies / positions 脚本', () => {
  const html = read('profile.html');
  assert.ok(/departments\.js\?v=\d+\.\d+\.\d+/.test(html), '应引入 departments.js（带版本号）');
  assert.ok(/companies\.js\?v=\d+\.\d+\.\d+/.test(html), '应引入 companies.js（带版本号）');
  assert.ok(/positions\.js\?v=\d+\.\d+\.\d+/.test(html), '应引入 positions.js（带版本号）');
});

test('Batch188：release.sh 已为 profile.html 系列登记 organizations 脚本版本号（防漂移自检失败）', () => {
  const sh = read('release.sh');
  assert.ok(sh.includes('PROFILE_ORG_PAGES="profile.html"'), '应登记 PROFILE_ORG_PAGES=profile.html');
  assert.ok(sh.includes('departments.js?v=$NEW_VER') && sh.includes('PROFILE_ORG_PAGES'), '应为 profile.html 升级 departments.js');
  assert.ok(sh.includes('companies.js?v=$NEW_VER') && sh.includes('PROFILE_ORG_PAGES'), '应为 profile.html 升级 companies.js');
  assert.ok(sh.includes('positions.js?v=$NEW_VER') && sh.includes('PROFILE_ORG_PAGES'), '应为 profile.html 升级 positions.js');
});
