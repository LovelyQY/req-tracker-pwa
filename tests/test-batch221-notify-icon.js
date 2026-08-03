// Batch 221 #2：通知图标改为非 emoji，置于城市选择器同行右侧
// 纯静态契约断言（与 test-batch192/200/221-app-rename 风格一致）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch234：通知按钮融入问候行，位于「早上好」之前、且不再位于天气卡内', () => {
  const html = read('index.html');
  const greetIdx = html.indexOf('class="home-greeting"');
  const bellIdx = html.indexOf('id="btnNotifyBell"');
  const greetHiIdx = html.indexOf('id="homeGreeting"');
  const weatherIdx = html.indexOf('id="homeWeather"');
  assert.ok(greetIdx > 0 && bellIdx > 0 && greetHiIdx > 0 && weatherIdx > 0, '问候区/通知/问候语/天气节点均应存在');
  assert.ok(bellIdx < greetHiIdx, '通知按钮应在问候语（#homeGreeting）之前');
  assert.ok(bellIdx > greetIdx, '通知按钮应在 .home-greeting 内');
  // 关键回归：铃铛已移出蓝渐变天气卡（避免左侧突兀）；天气卡之后不应再出现通知按钮
  assert.ok(html.indexOf('id="btnNotifyBell"', weatherIdx) === -1, '天气卡之后不应再出现通知按钮（已移入问候行）');
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

test('Batch234：铃铛恢复为问候行内的白色圆形（通透背景、白色、圆角）', () => {
  const css = read('pages.css');
  const scoped = css.match(/\.home-greeting\s+\.bell-btn\s*\{[^}]+\}/);
  assert.ok(scoped, '应存在 .home-greeting .bell-btn 作用域规则');
  const block = scoped[0];
  // 白色圆形：通透白底 + 白字 + 圆形（与旧版「城市边上」同款观感），不再是无背景弱存在感
  assert.ok(/background:\s*rgba\(255,\s*255,\s*255,\s*\.16\)/.test(block), '铃铛应为白色通透圆形背景');
  assert.ok(/color:\s*#fff/.test(block), '铃铛图标应为白色');
  assert.ok(/border-radius:\s*999px/.test(block), '铃铛应为圆形');
  const svgScoped = css.match(/\.home-greeting\s+\.bell-ico\s+svg\s*\{[^}]+\}/);
  assert.ok(svgScoped, '应存在 .home-greeting .bell-ico svg 尺寸规则');
  assert.ok(/width:\s*18px/.test(svgScoped[0]), '铃铛 SVG 应显式指定宽度');
  assert.ok(/height:\s*18px/.test(svgScoped[0]), '铃铛 SVG 应显式指定高度');
});

test('Batch221 后续修正：铃铛 SVG 在 HTML 内联显式尺寸（CSS 失效也可见）', () => {
  const html = read('index.html');
  const start = html.indexOf('id="btnNotifyBell"');
  const seg = html.slice(start, start + 500);
  assert.ok(/<svg[^>]*\bwidth="18"[^>]*\bheight="18"/.test(seg) || /<svg[^>]*\bheight="18"[^>]*\bwidth="18"/.test(seg),
    '铃铛 SVG 应有内联 width/height=18');
});
