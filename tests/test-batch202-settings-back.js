// Batch 202（#3/#7/#8/#9/#10/#11 设置页返回按钮失效）
// 根因：settings.js 整体包在 IIFE 内，settingsPageBack() 未暴露到全局，
//       而 settings.html 内联 onclick="settingsPageBack()" 只能访问全局作用域 → 静默失败（"无反应"）。
// 处置：settings.js 末尾 root.settingsPageBack = settingsPageBack 暴露到 window/root。
// 契约：① 源码定义 function settingsPageBack；② 暴露 root.settingsPageBack（内联 onclick 可见）；③ HTML 内联调用存在。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'settings.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');

test('Batch202：settings.js 定义 settingsPageBack 并暴露到全局（内联 onclick 可见）', () => {
  assert.ok(/function\s+settingsPageBack\s*\(/.test(SRC), 'settings.js 应定义 function settingsPageBack');
  assert.ok(/root\.settingsPageBack\s*=\s*settingsPageBack/.test(SRC),
    'settingsPageBack 应暴露到 root（root.settingsPageBack = settingsPageBack），否则内联 onclick 调用失败');
  assert.ok(/onclick="settingsPageBack\(\)"/.test(HTML), 'settings.html 返回按钮应调用 settingsPageBack()');
});
