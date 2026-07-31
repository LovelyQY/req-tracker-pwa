// Batch 204（#4 个人信息页重构）
// 静态契约测试：组织信息顺序 公司→部门→职位→工号→姓名；基础数据区移除「详细信息」入口；
// 保留 基本资料卡 + 组织信息卡 两段结构（对齐 devices.html 卡片风格）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch204 #4：profile.html 仍为两段卡片（基本资料卡 + 组织信息卡）', () => {
  const html = read('profile.html');
  const pcards = (html.match(/class="pcard"/g) || []).length;
  assert.ok(pcards >= 2, '应至少有 2 个 .pcard 卡片，实际 ' + pcards);
  assert.ok(html.includes('基本信息'), '应含「基本信息」卡');
  assert.ok(html.includes('组织信息'), '应含「组织信息」卡');
});

test('Batch204 #4：组织信息顺序为 公司→部门→职位→工号→姓名', () => {
  const html = read('profile.html');
  const order = ['pv-company', 'pv-dept', 'pv-pos', 'pv-emp', 'pv-name']
    .map((id) => html.indexOf('id="' + id + '"'));
  // 全部存在
  order.forEach((pos, i) => assert.ok(pos >= 0, '缺少组织信息字段 ' + ['pv-company', 'pv-dept', 'pv-pos', 'pv-emp', 'pv-name'][i]));
  // 顺序正确（索引递增）
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], '组织信息顺序应为 公司→部门→职位→工号→姓名（索引应递增）');
  }
});

test('Batch204 #4：基础数据区已移除「详细信息」入口', () => {
  const html = read('profile.html');
  assert.ok(!html.includes("navTo('profile-detail.html')"), 'profile.html 不应再含跳转 profile-detail.html 的「详细信息」行');
  // 基本信息卡内的字段（账号/昵称/标签/个性签名）仍保留
  ['pv-account', 'pv-nickname', 'pv-tags', 'pv-bio'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), '基本信息字段缺失：' + id);
  });
});

test('Batch204 #4：renderProfile 仍解析并填充全部组织信息外键（公司/部门/职位/工号/姓名）', () => {
  const html = read('profile.html');
  // 通过 RT_DEPTS / RT_COMPANIES / RT_POSITIONS 只读解析组织信息
  assert.ok(/RT_DEPTS/.test(html), '应通过 RT_DEPTS 解析部门');
  assert.ok(/RT_COMPANIES/.test(html), '应通过 RT_COMPANIES 解析公司');
  assert.ok(/RT_POSITIONS/.test(html), '应通过 RT_POSITIONS 解析职位');
  // 填充目标元素齐全
  ['pv-company', 'pv-dept', 'pv-pos', 'pv-emp', 'pv-name'].forEach((id) => {
    assert.ok(new RegExp("setVal\\('" + id + "'").test(html), '应填充 ' + id);
  });
});
