// Batch 221 #2：通知图标改为非 emoji，置于城市选择器同行右侧
// 纯静态契约断言（与 test-batch192/200/221-app-rename 风格一致）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch221/233 #2：通知按钮位于城市选择器之前、天气详情之后（同行，已与城市按钮调换）', () => {
  const html = read('index.html');
  const cityIdx = html.indexOf('id="homeWeatherCity"');
  const bellIdx = html.indexOf('id="btnNotifyBell"');
  const bodyIdx = html.indexOf('id="homeWeatherDays"');
  assert.ok(cityIdx > 0 && bellIdx > 0 && bodyIdx > 0, '城市 / 通知 / 天气节点均应存在');
  assert.ok(bellIdx < cityIdx, '通知按钮应在城市选择器之前（批次 233 调换）');
  assert.ok(bodyIdx > cityIdx, '天气详情应在城市按钮之后');
  // 铃铛与城市按钮同处 home-weather-top 容器内（二者之间未被 home-weather 闭合 div 隔开）
  const seg = html.slice(bellIdx, cityIdx);
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

test('Batch221 后续修正：铃铛按钮在蓝渐变卡内为白色半透明圆角（与城市按钮一致）', () => {
  const css = read('pages.css');
  const scoped = css.match(/\.home-weather\s+\.bell-btn\s*\{[^}]+\}/);
  assert.ok(scoped, '应存在 .home-weather .bell-btn 作用域规则');
  const block = scoped[0];
  assert.ok(/background:\s*rgba\(255,\s*255,\s*255,\s*\.1[0-9]/.test(block),
    '铃铛按钮应为白色半透明背景');
  assert.ok(/color:\s*#fff\b/i.test(block), '铃铛按钮图标应为白色 #fff');
  assert.ok(/border-radius:\s*999px/i.test(block), '铃铛按钮应为胶囊圆角 999px');
  const svgScoped = css.match(/\.home-weather\s+\.bell-ico\s+svg\s*\{[^}]+\}/);
  assert.ok(svgScoped, '应存在 .home-weather .bell-ico svg 尺寸规则');
  assert.ok(/width:\s*\d+px/.test(svgScoped[0]), '铃铛 SVG 应显式指定宽度');
  assert.ok(/height:\s*\d+px/.test(svgScoped[0]), '铃铛 SVG 应显式指定高度');
});

test('Batch221 后续修正：铃铛 SVG 在 HTML 内联显式尺寸（CSS 失效也可见）', () => {
  const html = read('index.html');
  const start = html.indexOf('id="btnNotifyBell"');
  const seg = html.slice(start, start + 500);
  assert.ok(/<svg[^>]*\bwidth="18"[^>]*\bheight="18"/.test(seg) || /<svg[^>]*\bheight="18"[^>]*\bwidth="18"/.test(seg),
    '铃铛 SVG 应有内联 width/height=18');
});
