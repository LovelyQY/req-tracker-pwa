// Batch 206（#13 字典管理修复）
// 静态契约测试：① 字典下拉/选项强制 PWA 字体；② dictionary.html 自包含播种 boot() 已接通；
// ③ 补「显示全部/仅启用」切换核查禁用项；④ 仅启用模式隐藏 disabled 项。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch206 #13：字典下拉选项强制 PWA 默认字体（layout.css 全局 .filter-select）', () => {
  const css = read('layout.css');
  // 全局下拉强制继承 PWA 字体（非系统字体）
  assert.ok(/\.filter-select\s*\{[^}]*font-family:\s*inherit/.test(css), '全局 .filter-select 应 font-family:inherit');
  assert.ok(/\.filter-select option\s*\{[^}]*font-family:\s*inherit/.test(css), '.filter-select option 应 font-family:inherit');
});

test('Batch206 #13：dictionary.html 本地 .filter-select 同样继承 PWA 字体', () => {
  const html = read('dictionary.html');
  assert.ok(/\.filter-select\{[^}]*font-family:\s*inherit/.test(html), 'dictionary.html 的 .filter-select 应 font-family:inherit');
  assert.ok(/\.filter-select option\{[^}]*font-family:\s*inherit/.test(html), 'dictionary.html 的 .filter-select option 应 font-family:inherit');
});

test('Batch206 #13：dictionary.html 已接通自包含播种 boot()（修复「不显示数据」）', () => {
  const html = read('dictionary.html');
  assert.ok(/function boot\(\)/.test(html), '应定义 boot()（内含 seedDict 幂等播种）');
  // 关键：boot() 必须被实际调用（此前仅定义未调用，导致 store 为空不显示数据）
  assert.ok(/^\s*boot\(\);\s*$/m.test(html), '脚本末尾应调用 boot() 触发播种与渲染');
});

test('Batch206 #13：dictionary.html 补「显示全部/仅启用」切换（核查禁用项）', () => {
  const html = read('dictionary.html');
  assert.ok(html.includes('id="status-seg"'), '应含切换容器 status-seg');
  assert.ok(/onclick="setDictView\('all'\)"/.test(html), '应含「显示全部」按钮调用 setDictView');
  assert.ok(/onclick="setDictView\('enabled'\)"/.test(html), '应含「仅启用」按钮调用 setDictView');
  assert.ok(html.includes('data-i18n="dict.showAll"') && html.includes('data-i18n="dict.showEnabled"'), '切换按钮应使用 i18n 键');
  // 切换逻辑：showDisabled 状态翻转 + 重渲染
  assert.ok(/function setDictView\(mode\)/.test(html), '应定义 setDictView');
  assert.ok(/showDisabled = \(mode !== 'enabled'\)/.test(html), 'setDictView 应设置 showDisabled');
});

test('Batch206 #13：render() 仅启用模式隐藏 disabled 项（默认显示全部）', () => {
  const html = read('dictionary.html');
  assert.ok(/var showDisabled = true/.test(html), '默认 showDisabled=true（显示全部，含禁用项）');
  assert.ok(/if \(!showDisabled\) list = list\.filter\(function\(r\)\{ return r\.disabled !== true; \}\);/.test(html), '仅启用模式应过滤 disabled===true');
});

test('Batch206 #13：i18n 补齐 dict.showAll / dict.showEnabled（6 语言）', () => {
  const langs = ['zh-CN', 'en', 'zh-HK', 'zh-TW', 'ja', 'ko'];
  langs.forEach((lc) => {
    const js = read('i18n/' + lc + '.js');
    assert.ok(/'dict\.showAll':/.test(js), '[' + lc + '] 应含 dict.showAll');
    assert.ok(/'dict\.showEnabled':/.test(js), '[' + lc + '] 应含 dict.showEnabled');
  });
});
