// Batch 191（#10 图标白线一致、#11 图标标签补全、#12 默认 SVG 去重、#25 引用键可解析）
// 运行环境无 jsdom，本批以「源码结构 / 静态契约 + 运行时 default 注册表」断言为主，
// 与 test-batch186/188/190 风格一致。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ICO = require(path.join(ROOT, 'page-icons.js'));
const DEFAULTS = ICO._defaults;
const REG_KEYS = Object.keys(DEFAULTS);

// 文档化例外：品牌 logo 三角色（首页左上角 / 登录页 logo / PWA 桌面）刻意复用同一品牌字形
const BRAND_EXCEPTION = new Set(['index', 'login', 'pwa']);

// —— #10 图标白线一致：默认注册表与页面内联 SVG 均为 currentColor 白线 ——
test('Batch191 #10：page-icons.js 全部默认图标均为白线（stroke=currentColor，无填充色）', () => {
  for (const k of REG_KEYS) {
    const svg = DEFAULTS[k];
    assert.ok(/stroke="currentColor"/.test(svg), `默认图标 ${k} 应为白线（stroke=currentColor）`);
    // 除 fill="none" 外不应出现其它填充色（白线图标只描边）
    const stripped = svg.replace(/fill="none"/g, '');
    assert.ok(!/fill="(?!none)/.test(stripped), `默认图标 ${k} 不应使用填充色`);
  }
});

test('Batch191 #10：页面内联 SVG 同样为白线（settings / basic-data / icon-manager）', () => {
  for (const f of ['settings.html', 'basic-data.html', 'icon-manager.html']) {
    const s = read(f);
    const inline = [...s.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0]);
    for (const svg of inline) {
      assert.ok(/stroke="currentColor"/.test(svg), `${f} 内联 SVG 应为白线`);
      const stripped = svg.replace(/fill="none"/g, '');
      assert.ok(!/fill="(?!none)/.test(stripped), `${f} 内联 SVG 不应使用填充色`);
    }
  }
});

// —— #11 图标标签补全：注册表每个 key 都在 icon-manager.js 的 KEY_LABELS 中有中文标签 ——
test('Batch191 #11：icon-manager.js KEY_LABELS 覆盖全部默认注册表 key', () => {
  const src = read('icon-manager.js');
  const m = src.match(/KEY_LABELS\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(m, '应存在 KEY_LABELS 定义');
  const labelKeys = [...m[1].matchAll(/'([a-z\-]+)'\s*:/g)].map((x) => x[1]);
  const kl = new Set(labelKeys);
  for (const k of REG_KEYS) {
    assert.ok(kl.has(k), `KEY_LABELS 应含默认 key「${k}」的中文标签`);
  }
});

// —— #12 默认 SVG 去重：除品牌 logo 三角外，任何两个 key 不得字节相同 ——
test('Batch191 #12：默认 SVG 无字节相同重复（品牌 logo 三角 index/login/pwa 除外）', () => {
  const seen = {};
  const unexpected = [];
  for (const k of REG_KEYS) {
    const v = DEFAULTS[k];
    if (seen[v]) {
      const a = seen[v];
      if (!(BRAND_EXCEPTION.has(a) && BRAND_EXCEPTION.has(k))) {
        unexpected.push([a, k]);
      }
    } else {
      seen[v] = k;
    }
  }
  assert.deepStrictEqual(unexpected, [], '除品牌 logo 外不应存在字节相同的默认 SVG');
});

test('Batch191 #12：department/user/report-meeting/account 已各自语义化（不再共用同一人形）', () => {
  const quad = ['department', 'user', 'report-meeting', 'account'];
  const uniq = new Set(quad.map((k) => DEFAULTS[k]));
  assert.strictEqual(uniq.size, quad.length, '四人形相关 key 应彼此字节不同');
  // 与品牌 logo 三角也不应相同
  for (const k of quad) {
    assert.ok(!BRAND_EXCEPTION.has(k), '四人形 key 不应是品牌 logo 例外');
  }
});

test('Batch191 #12：icon-manager 与 theme 已去重（各自独立语义图标）', () => {
  assert.notStrictEqual(DEFAULTS['icon-manager'], DEFAULTS['theme'], 'icon-manager 与 theme 默认 SVG 不应相同');
});

// —— #25 引用键可解析 + 前向兼容图标补齐 ——
test('Batch191 #25：所有 RT_PAGE_ICONS.get(KEY) 引用均命中已注册默认 key', () => {
  const refs = new Set();
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    if (!/\.(js|html)$/.test(e.name)) continue;
    if (e.name === 'test-batch191-icons.js') continue;
    const s = read(e.name);
    const re = /RT_PAGE_ICONS\.get\(\s*['"]([a-z\-]+)['"]/g;
    let mm;
    while ((mm = re.exec(s))) refs.add(mm[1]);
  }
  for (const k of refs) {
    assert.ok(REG_KEYS.includes(k), `被引用的 key「${k}」应已在默认注册表中`);
  }
});

test('Batch191 #25：前向兼容图标 workflow/process/weather/ticket 已补齐默认 SVG 且有标签', () => {
  const fwd = ['workflow', 'process', 'weather', 'ticket'];
  const src = read('icon-manager.js');
  const m = src.match(/KEY_LABELS\s*=\s*\{([\s\S]*?)\};/);
  const kl = new Set([...m[1].matchAll(/'([a-z\-]+)'\s*:/g)].map((x) => x[1]));
  for (const k of fwd) {
    assert.ok(REG_KEYS.includes(k), `前向兼容 key「${k}」应已注册默认 SVG`);
    assert.ok(kl.has(k), `KEY_LABELS 应含前向兼容 key「${k}」的标签`);
  }
});
