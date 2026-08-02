// Batch 221 #1：应用名「需求任务追踪」→「微枢」全量替换
// 覆盖：产品代码（index / index-nosw / login / manifest / report-task / settings / app.js）
//      + i18n 6 语言 app.title（品牌名：微枢 / 微樞 / Weishu / 미추 / ミシュ）
// 纯静态契约断言（与 test-batch192/200 风格一致，无 jsdom 依赖）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// 产品代码文件（不含 README / plans 等历史设计文档）
const CODE_FILES = [
  'index.html', 'index-nosw.html', 'login/classic.html',
  'manifest.json', 'report-task.html', 'settings.js', 'app.js'
];
const LANGS = ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'];
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch221 #1：产品代码不再含旧应用名（简体 / 繁体）', () => {
  for (const f of CODE_FILES) {
    const c = read(f);
    assert.ok(!c.includes('需求任务追踪'), f + ' 不应含「需求任务追踪」');
    assert.ok(!c.includes('需求任務追蹤'), f + ' 不应含「需求任務追蹤」');
  }
});

test('Batch221 #1：manifest name / short_name 均为「微枢」', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.name, '微枢');
  assert.equal(m.short_name, '微枢');
});

test('Batch221 #1：6 语言 app.title 均为品牌名「微枢」系列', () => {
  const expect = {
    'zh-CN': '微枢', 'zh-HK': '微樞', 'zh-TW': '微樞',
    'en': 'Weishu', 'ko': '미추', 'ja': 'ミシュ'
  };
  for (const [l, title] of Object.entries(expect)) {
    const c = read('i18n/' + l + '.js');
    const re = new RegExp("'app\\.title':\\s*'" + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'");
    assert.ok(re.test(c), l + ' 的 app.title 应为 ' + title);
  }
});
