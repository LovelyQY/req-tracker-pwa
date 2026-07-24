// test-batch95-utf8.js
// 批次95回归：验证所有源文件不含 U+FFFD 替换字符
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FF = Buffer.from([0xef, 0xbf, 0xbd]); // U+FFFD in UTF-8

const EXTS = ['.html', '.js', '.css', '.md', '.json', '.sh'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'plans']);
const SKIP_FILES = new Set(['package-lock.json']);

function* scanFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* scanFiles(full);
    } else if (EXTS.some(ext => entry.name.endsWith(ext))) {
      yield full;
    }
  }
}

describe('批次95回归：全站无 U+FFFD 替换字符', () => {
  test('所有源文件均不含 U+FFFD（\\xef\\xbf\\xbd）', () => {
    const bad = [];
    const root = path.resolve(__dirname, '..');
    for (const f of scanFiles(root)) {
      const buf = fs.readFileSync(f);
      const count = (buf.length - buf.indexOf(FF) >= 0)
        ? [...buf].filter((_, i) => buf[i] === FF[0] && buf[i + 1] === FF[1] && buf[i + 2] === FF[2]).length
        : 0;
      // Simpler: use indexOf loop
      let c = 0, idx = 0;
      while ((idx = buf.indexOf(FF, idx)) >= 0) { c++; idx += 3; }
      if (c > 0) bad.push({ file: path.relative(root, f), count: c });
    }
    assert.equal(bad.length, 0,
      '以下文件含 U+FFFD:\n' + bad.map(b => `  ${b.file}: ${b.count} 处`).join('\n'));
  });

  test('关键文件不含 U+FFFD（抽样校验）', () => {
    const files = ['role.js', 'about.html', 'login/classic.html', 'app.js', 'permissions.js'];
    const root = path.resolve(__dirname, '..');
    for (const f of files) {
      const buf = fs.readFileSync(path.join(root, f));
      let c = 0, idx = 0;
      while ((idx = buf.indexOf(FF, idx)) >= 0) { c++; idx += 3; }
      assert.equal(c, 0, `${f} 应无 U+FFFD，实际 ${c} 处`);
    }
  });

  test('RULES.md §6 已存在', () => {
    const root = path.resolve(__dirname, '..');
    const rules = fs.readFileSync(path.join(root, 'RULES.md'), 'utf-8');
    assert.ok(rules.includes('§6'), 'RULES.md 应包含 §6 文件编码规则');
    assert.ok(rules.includes('U+FFFD'), 'RULES.md 应提及 U+FFFD');
  });
});
