// Batch 234（v1.4.34）：首页短语可配置 + 通知铃铛融入问候 + 字典页 bug 修复
// 纯静态契约 + 局部函数提取断言（与 test-batch221/222 风格一致）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const indexHtml = read('index.html');
const pagesCss = read('pages.css');
const appJs = read('app.js');
const settingsHtml = read('settings.html');
const settingsJs = read('settings.js');
const configJs = read('config.js');
const dictionaryHtml = read('dictionary.html');

// ---------- 1) 字典页 bug 修复 ----------
test('Batch234 #dict：字典页引入全部 6 份语言包（修复标题显示 dict.title 裸键）', () => {
  ['zh-CN', 'en', 'zh-HK', 'zh-TW', 'ko', 'ja'].forEach((lg) => {
    assert.ok(dictionaryHtml.includes(`i18n/${lg}.js`), `字典页应引入 i18n/${lg}.js`);
  });
});

test('Batch234 #dict：字典页 boot 在 DOMContentLoaded 后执行（修复列表空白）', () => {
  assert.ok(/function initDictionaryPage/.test(dictionaryHtml), '应定义 initDictionaryPage');
  assert.ok(/addEventListener\('DOMContentLoaded',\s*initDictionaryPage\)/.test(dictionaryHtml),
    '应在 DOMContentLoaded 中初始化，而非 parse 阶段内联立即执行（旧 bug：RT_DICT 未定义致空白）');
  const fnStart = dictionaryHtml.indexOf('function initDictionaryPage');
  const fnSeg = dictionaryHtml.slice(fnStart, dictionaryHtml.indexOf('</script>', fnStart));
  assert.ok(/\bboot\(\);/.test(fnSeg), 'initDictionaryPage 内应调用 boot()');
});

test('Batch234 #dict：zh-CN 语言包含 dict.title 键（标题可被 t() 解析）', () => {
  assert.ok(dictionaryHtml.includes('data-i18n="dict.title"'), '标题应带 data-i18n="dict.title" 占位');
  const zh = read('i18n/zh-CN.js');
  assert.ok(zh.includes("'dict.title':"), 'zh-CN 语言包应含 dict.title 键');
});

// ---------- 2) 首页短语可配置 ----------
test('Batch234 #phrase：config.js 提供 homePhrasesDefault 单一事实来源（12 条）', () => {
  assert.ok(/homePhrasesDefault\s*:/.test(configJs), 'config.js 应定义 homePhrasesDefault');
  const m = configJs.match(/homePhrasesDefault\s*:\s*\[([\s\S]*?)\]/);
  assert.ok(m, '应能提取 homePhrasesDefault 数组');
  const arr = eval('[' + m[1] + ']'); // eslint-disable-line no-eval
  assert.equal(arr.length, 12, '默认短语池应为 12 条');
  assert.ok(arr.every((x) => typeof x === 'string' && x.trim()), '默认池元素均为非空字符串');
});

test('Batch234 #phrase：getHomePhrases 优先读取 rt_ui_prefs.homePhrases', () => {
  function extractFn(name) {
    const marker = 'function ' + name + '(';
    const start = appJs.indexOf(marker);
    assert.ok(start >= 0, '找到 ' + name);
    let i = appJs.indexOf('{', start), depth = 0;
    for (; i < appJs.length; i++) {
      if (appJs[i] === '{') depth++;
      else if (appJs[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return appJs.slice(start, i);
  }
  function readHomePrefs() {
    try { return JSON.parse((global.localStorage && global.localStorage.getItem('rt_ui_prefs')) || '{}') || {}; }
    catch (e) { return {}; }
  }
  const RT_CONFIG = { homePhrasesDefault: ['d1', 'd2', 'd3'] };
  const RT_HOME_PHRASES_DEFAULT = RT_CONFIG.homePhrasesDefault;
  // eslint-disable-next-line no-eval
  const getHomePhrases = eval('(' + extractFn('getHomePhrases') + ')');

  // 未自定义：回退 homePhrasesDefault
  global.localStorage = { getItem: () => null };
  assert.deepEqual(getHomePhrases(), ['d1', 'd2', 'd3']);

  // 已自定义：取 prefs.homePhrases，并过滤空白项
  global.localStorage = { getItem: () => JSON.stringify({ homePhrases: ['自定义1', '   ', '自定义2'] }) };
  assert.deepEqual(getHomePhrases(), ['自定义1', '自定义2'], '应过滤空白项');

  // 自定义为空数组：回退默认
  global.localStorage = { getItem: () => JSON.stringify({ homePhrases: [] }) };
  assert.deepEqual(getHomePhrases(), ['d1', 'd2', 'd3']);
});

test('Batch234 #phrase：startHomePhraseCarousel 读取 rt_ui_prefs.homePhraseInterval（默认 8000）', () => {
  assert.ok(/HOME_PHRASE_DEFAULT_INTERVAL\s*=\s*8000/.test(appJs), '默认间隔应为 8000ms（较原 4000 更舒缓）');
  assert.ok(/readHomePrefs\(\)/.test(appJs), '应读取首页偏好');
  assert.ok(/prefs\.homePhraseInterval/.test(appJs), '应使用 prefs.homePhraseInterval 作为轮播间隔');
});

test('Batch234 #phrase：设置页「界面与展示」含短语配置控件', () => {
  assert.ok(settingsHtml.includes('id="hpInterval"'), '应设置轮播间隔选择器');
  assert.ok(settingsHtml.includes('id="hpPool"'), '应设置短语池文本框');
  assert.ok(settingsHtml.includes('RT_SETTINGS_PAGE.saveHomePhrase()'), '保存应调用 saveHomePhrase');
  assert.ok(settingsHtml.includes('RT_SETTINGS_PAGE.resetHomePhrase()'), '恢复默认应调用 resetHomePhrase');
});

test('Batch234 #phrase：settings.js 暴露并接线短语配置函数', () => {
  assert.ok(/function renderHomePhrase\(/.test(settingsJs), '应定义 renderHomePhrase');
  assert.ok(/function saveHomePhrase\(/.test(settingsJs), '应定义 saveHomePhrase');
  assert.ok(/function resetHomePhrase\(/.test(settingsJs), '应定义 resetHomePhrase');
  assert.ok(/renderHomePhrase\(\);\s*\/\/\s*批次 234/.test(settingsJs), 'renderUI 应调用 renderHomePhrase');
  assert.ok(/renderHomePhrase: renderHomePhrase/.test(settingsJs), '应暴露到 RT_SETTINGS_PAGE');
  assert.ok(/saveHomePhrase: saveHomePhrase/.test(settingsJs), '应暴露 saveHomePhrase');
  assert.ok(/resetHomePhrase: resetHomePhrase/.test(settingsJs), '应暴露 resetHomePhrase');
});

test('Batch234 #phrase：恢复默认将默认短语池与默认间隔写回 rt_ui_prefs', () => {
  assert.ok(/prefsSet\(\{\s*homePhrases:\s*def,\s*homePhraseInterval:\s*HOME_PHRASE_DEFAULT_INTERVAL\s*\}\)/.test(settingsJs),
    '恢复默认应回写默认池与默认间隔');
});
