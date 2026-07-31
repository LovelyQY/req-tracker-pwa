// Batch 200（#27 语言补上所有类别语言）—— i18n 全类别收口覆盖测试
// 三组断言：① 字典完整性（zh-CN 为源，其余 5 语言零缺失）
//           ② 语法（6 份字典均可解析，防再次整份断裂静默回退）
//           ③ 悬空 key 扫描（所有 data-i18n* 与 t('...') 引用的 key 必须在 zh-CN 存在，不白屏）
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const LANGS = ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'];
const SRC = 'zh-CN';

function loadDicts() {
  const dicts = {};
  for (const l of LANGS) {
    const code = fs.readFileSync(path.join(ROOT, 'i18n', l + '.js'), 'utf8');
    const ctx = { module: { exports: {} }, window: {} };
    vm.createContext(ctx);
    vm.runInContext(code, ctx, { filename: 'i18n/' + l + '.js' });
    dicts[l] = ctx.window.RT_I18N ? ctx.window.RT_I18N[l] : null;
    assert.ok(dicts[l], '字典 ' + l + ' 应成功解析并挂载到 RT_I18N');
  }
  return dicts;
}

// 递归收集目录下所有匹配后缀的文件（跳过 node_modules / tests 不参与 key 提取）
function collectFiles(dir, exts, out) {
  out = out || [];
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) collectFiles(full, exts, out);
    else if (exts.includes(path.extname(name))) out.push(full);
  }
  return out;
}

// 从文件内容提取所有被引用的 i18n key（data-i18n* 属性 + t('...') 调用）
function extractKeys(content) {
  const keys = new Set();
  // data-i18n / data-i18n-ph / data-i18n-aria 携带 key；data-i18n-attr 携带「属性名」不算 key
  const attrRe = /(data-i18n-ph|data-i18n-aria|data-i18n)="([^"]+)"/g;
  let m;
  while ((m = attrRe.exec(content))) keys.add(m[2]);
  // t('key') 或 t("key")（含可选第二参）；动态拼接 key 不被静态捕获（符合预期）
  const tRe = /[^.\w]t\(\s*['"]([^'"]+)['"]/g;
  while ((m = tRe.exec(content))) keys.add(m[1]);
  return [...keys];
}

test('Batch200 #27：6 份字典均可解析（防整份断裂静默回退）', () => {
  for (const l of LANGS) {
    const code = fs.readFileSync(path.join(ROOT, 'i18n', l + '.js'), 'utf8');
    // vm.Script 编译即触发语法校验，语法错误会抛出
    assert.doesNotThrow(() => new vm.Script(code, { filename: 'i18n/' + l + '.js' }),
      '字典 ' + l + ' 应无语法错误');
  }
});

test('Batch200 #27：zh-CN 每个键在其余 5 语言均存在（完整性，零缺失零多余）', () => {
  const dicts = loadDicts();
  const zhKeys = Object.keys(dicts[SRC]).sort();
  assert.ok(zhKeys.length > 0, 'zh-CN 应含有键');
  for (const l of LANGS) {
    if (l === SRC) continue;
    const k = Object.keys(dicts[l]);
    const missing = zhKeys.filter((x) => !(x in dicts[l]));
    const extra = k.filter((x) => !(x in dicts[SRC]));
    assert.strictEqual(missing.length, 0, l + ' 缺失键：' + missing.join(', '));
    assert.strictEqual(extra.length, 0, l + ' 多余键：' + extra.join(', '));
  }
});

test('Batch200 #27：所有页面/脚本引用的 i18n key 在 zh-CN 均存在（无悬空 key，不白屏）', () => {
  // 重新读取 zh-CN 键集用于校验（loadDicts 已在上一用例校验可加载）
  const zhCode = fs.readFileSync(path.join(ROOT, 'i18n', 'zh-CN.js'), 'utf8');
  const zhCtx = { module: { exports: {} }, window: {} };
  vm.createContext(zhCtx);
  vm.runInContext(zhCode, zhCtx, { filename: 'i18n/zh-CN.js' });
  const zhDict = zhCtx.window.RT_I18N['zh-CN'];
  const zhKeySet = new Set(Object.keys(zhDict));

  const files = collectFiles(ROOT, ['.html', '.js']);
  const bad = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    // 字典源文件与测试文件自身不参与 key 引用扫描
    if (rel.startsWith('i18n' + path.sep)) continue;
    if (rel.startsWith('tests' + path.sep)) continue;
    // i18n.js 是多语言引擎本身，注释中示例 t('key')/t('...') 非真实引用，跳过
    if (rel === 'i18n.js') continue;
    const content = fs.readFileSync(f, 'utf8');
    const keys = extractKeys(content);
    for (const key of keys) {
      if (!zhKeySet.has(key)) bad.push(rel + ' → ' + key);
    }
  }
  assert.deepStrictEqual(bad, [], '存在指向 zh-CN 缺失的悬空 key：\n' + bad.join('\n'));
});
