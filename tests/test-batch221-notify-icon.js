// Batch 221 #2：通知图标改为非 emoji，置于城市选择器同行右侧
// 纯静态契约断言（与 test-batch192/200/221-app-rename 风格一致）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch221 #2：通知按钮位于城市选择器之后、天气详情之前（同行右侧）', () => {
  const html = read('index.html');
  const cityIdx = html.indexOf('id="homeWeatherCity"');
  const bellIdx = html.indexOf('id="btnNotifyBell"');
  const bodyIdx = html.indexOf('id="homeWeatherDays"');
  assert.ok(cityIdx > 0 && bellIdx > 0 && bodyIdx > 0, '城市 / 通知 / 天气节点均应存在');
  assert.ok(bellIdx > cityIdx, '通知按钮应在城市选择器之后');
  assert.ok(bodyIdx > bellIdx, '天气详情应在通知按钮之后');
  // 城市选择器与通知按钮同处 home-weather 容器内（二者之间未被 home-weather 闭合 div 隔开）
  const seg = html.slice(cityIdx, bellIdx);
  assert.ok(!/<\/div>\s*<div class="home-greeting"/.test(seg), '通知按钮应与城市选择器同处 home-weather 内');
});

test('Batch221 #2：通知图标为非 emoji 的 SVG（通知按钮内不再使用 🔔）', () => {
  const html = read('index.html');
  const start = html.indexOf('id="btnNotifyBell"');
  const seg = html.slice(start, start + 500);
  assert.ok(!seg.includes('🔔'), '通知按钮内不应再使用 emoji 铃铛');
  assert.ok(/<svg[\s\S]*<\/svg>/.test(seg), '通知按钮应使用 SVG 图标');
});

test('Batch221 #2：通知按钮已从 header 移出', () => {
  const html = read('index.html');
  const headerEnd = html.indexOf('</header>');
  const header = html.slice(0, headerEnd);
  assert.ok(!header.includes('id="btnNotifyBell"'), 'header 内不应再含通知按钮');
});
