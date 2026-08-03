// Batch 222（v1.4.27）：首页问候 / 天气 / 短语
// 1) 天气区县聚合：城市返回「市辖区/县」时上卷到地级市再查天气
// 2) 首页问候语 / 昵称 / 时间字号统一（CSS 选择器存在性）
// 3) 时间下方短语轮播：可配置（RT_CONFIG.homePhrases 优先），默认回退附录 A 12 条
// 从 app.js 静态提取常量与函数（同 Batch 221 城市树测试手法）校验，避免直接加载整份浏览器脚本。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const pagesCss = fs.readFileSync(path.join(ROOT, 'pages.css'), 'utf8');

// 提取纯数据常量（对象 / 数组）
function extract(name) {
  const isObj = name.endsWith('TREE') || name.endsWith('DISTRICTS');
  const re = new RegExp('const ' + name + '\\s*=\\s*(' + (isObj ? '\\{[\\s\\S]*?\\n\\}' : '\\[[\\s\\S]*?\\]') + ');');
  const m = js.match(re);
  if (!m) throw new Error('未在 app.js 中找到 ' + name);
  // eslint-disable-next-line no-eval
  return eval('(' + m[1] + ')');
}
// 按括号配对提取函数源码（支持 try/catch 与嵌套箭头/函数）
function extractFn(name) {
  const marker = 'function ' + name + '(';
  const start = js.indexOf(marker);
  if (start < 0) throw new Error('未在 app.js 中找到函数 ' + name);
  let i = js.indexOf('{', start);
  if (i < 0) throw new Error('未找到函数体起始 { : ' + name);
  let depth = 0;
  for (; i < js.length; i++) {
    const ch = js[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return js.slice(start, i);
}

// ---- 重建区→市反查表（与 app.js 中 RT_DISTRICT_TO_CITY 的 IIFE 同构）----
const DISTRICTS = extract('RT_CITY_DISTRICTS');
var RT_DISTRICT_TO_CITY = {};
Object.keys(DISTRICTS).forEach(function (c) {
  (DISTRICTS[c] || []).forEach(function (d) { RT_DISTRICT_TO_CITY[d] = c; });
});
const DEFAULT_PHRASES = extract('RT_HOME_PHRASES_DEFAULT');
var RT_HOME_PHRASES_DEFAULT = DEFAULT_PHRASES;
var RT_CONFIG = {};
// 与 app.js 同构的偏好读取（node 环境无 localStorage，try/catch 安全回退 {}）
function readHomePrefs() {
  try { return JSON.parse(localStorage.getItem('rt_ui_prefs') || '{}') || {}; } catch (e) { return {}; }
}

// 在模块作用域内 eval 两个函数，自由变量闭包到上面的模块级 var
// eslint-disable-next-line no-eval
var weatherQueryCity = eval('(' + extractFn('weatherQueryCity') + ')');
// eslint-disable-next-line no-eval
var getHomePhrases = eval('(' + extractFn('getHomePhrases') + ')');

// ---------- 1) 天气区县聚合 ----------
test('Batch222 #1：天气城市聚合——「城市·区县」取地级市', () => {
  assert.equal(weatherQueryCity('北京·朝阳区'), '北京');
  assert.equal(weatherQueryCity('上海·浦东新区'), '上海');
  assert.equal(weatherQueryCity('杭州·西湖区'), '杭州');
});

test('Batch222 #1：天气城市聚合——裸区县名上卷到所属地级市', () => {
  // 注：「西湖区」在 RT_CITY_DISTRICTS 中同时归属 杭州 与 南昌（数据本身存在重名区县），
  // 故此处选用唯一区县名，避免锁定到歧义结果。
  assert.equal(weatherQueryCity('武侯区'), '成都');
  assert.equal(weatherQueryCity('海淀区'), '北京');
  assert.equal(weatherQueryCity('天河区'), '广州');
});

test('Batch222 #1：天气城市聚合——地级市/未知名原样返回，空值回退北京', () => {
  assert.equal(weatherQueryCity('上海'), '上海');
  assert.equal(weatherQueryCity('火星基地'), '火星基地');
  assert.equal(weatherQueryCity(''), '北京');
  assert.equal(weatherQueryCity(null), '北京');
});

// ---------- 3) 短语轮播 ----------
test('Batch222 #3：默认短语池为附录 A 的 12 条', () => {
  assert.equal(Array.isArray(DEFAULT_PHRASES), true);
  assert.equal(DEFAULT_PHRASES.length, 12);
  assert.ok(DEFAULT_PHRASES.every(function (x) { return typeof x === 'string' && x.trim(); }), '默认池元素均为非空字符串');
});

test('Batch222 #3：getHomePhrases 优先取 RT_CONFIG.homePhrases', () => {
  RT_CONFIG = { homePhrases: ['自定义短语A', '自定义短语B'] };
  const got = getHomePhrases();
  assert.deepEqual(got, ['自定义短语A', '自定义短语B']);
});

test('Batch222 #3：getHomePhrases 在配置为空/缺失时回退默认池', () => {
  RT_CONFIG = { homePhrases: [] };
  assert.equal(getHomePhrases().length, 12, '空数组应回退默认池');
  RT_CONFIG = {};
  assert.equal(getHomePhrases().length, 12, '无 homePhrases 字段应回退默认池');
});

test('Batch222 #3：getHomePhrases 过滤配置中的空白/非字符串项', () => {
  RT_CONFIG = { homePhrases: ['   ', null, undefined, '有效短语', 123] };
  const got = getHomePhrases();
  assert.deepEqual(got, ['有效短语']);
});

// ---------- 2/3) DOM / CSS / i18n 结构存在性 ----------
test('Batch222 #2/#3：首页存在时间下方短语轮播元素 #homePhrase', () => {
  assert.ok(indexHtml.includes('id="homePhrase"'), 'index.html 应含 #homePhrase');
  assert.ok(indexHtml.includes('data-i18n="home.phraseLabel"'), '应带短语标签 i18n 占位');
});

test('Batch222 #2：pages.css 含统一的问候字号选择器', () => {
  assert.ok(/\.home-greet-hi\s*\{[^}]*font-size/.test(pagesCss), 'home-greet-hi 应声明 font-size');
  assert.ok(/\.home-greet-name\s*\{[^}]*font-size/.test(pagesCss), 'home-greet-name 应声明 font-size');
  assert.ok(/\.home-date\s*\{[^}]*font-size/.test(pagesCss), 'home-date 应声明 font-size');
});

test('Batch222 #3：pages.css 含短语轮播样式 .home-phrase', () => {
  assert.ok(/\.home-phrase\s*\{/.test(pagesCss), '应定义 .home-phrase 基础样式');
  assert.ok(/\.home-phrase-in/.test(pagesCss), '应定义淡入态 .home-phrase-in');
  assert.ok(/\.home-phrase-label/.test(pagesCss), '应定义 .home-phrase-label');
});

test('Batch222 #3：6 语言均含 home.phraseLabel 文案键', () => {
  ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'].forEach(function (lg) {
    const src = fs.readFileSync(path.join(ROOT, 'i18n', lg + '.js'), 'utf8');
    assert.ok(src.includes("'home.phraseLabel':"), lg + ' 应含 home.phraseLabel');
  });
});
