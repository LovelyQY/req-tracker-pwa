// Batch 203（#12 帮助与反馈拆为两个独立子视图 / #7 通知仅留两模块）
// 静态契约测试：验证 settings.html 子视图拆分、settings.js 路由与导出、i18n 补齐。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Batch203 #12：settings.html 帮助区已拆分为两个独立子视图（不再有单一 helpView）', () => {
  const html = read('settings.html');
  // 旧的单子视图应移除
  assert.ok(!html.includes('id="helpView"'), '不应再保留单一 helpView 子视图');
  // 新的两个子视图应存在
  assert.ok(html.includes('id="help-usageView"'), '应存在 使用说明 子视图 help-usageView');
  assert.ok(html.includes('id="help-feedbackView"'), '应存在 意见反馈 子视图 help-feedbackView');
  // 使用说明模块仅在使用说明子视图（含 helpSearch / helpList / helpTags）
  assert.ok(/id="help-usageView"[\s\S]*?id="helpSearch"/.test(html), 'help-usageView 应含搜索框');
  assert.ok(/id="help-usageView"[\s\S]*?id="helpList"/.test(html), 'help-usageView 应含文档列表');
  // 意见反馈模块仅在意见反馈子视图（含反馈表单 + 我的反馈记录）
  assert.ok(/id="help-feedbackView"[\s\S]*?id="fbContent"/.test(html), 'help-feedbackView 应含反馈表单');
  assert.ok(/id="help-feedbackView"[\s\S]*?id="myFeedbackList"/.test(html), 'help-feedbackView 应含我的反馈记录');
  // 使用说明子视图不应混入反馈表单（确认真正拆分，而非简单复制）
  const usageBlock = html.slice(html.indexOf('id="help-usageView"'), html.indexOf('id="help-feedbackView"'));
  assert.ok(!usageBlock.includes('id="fbContent"'), '使用说明子视图不应含反馈表单');
  const fbBlock = html.slice(html.indexOf('id="help-feedbackView"'));
  assert.ok(!fbBlock.includes('id="helpSearch"'), '意见反馈子视图不应含帮助搜索框');
});

test('Batch203 #12：settings.js 帮助分组拆为两个 hash 入口（help-usage / help-feedback）', () => {
  const js = read('settings.js');
  // GROUPS 帮助分组下两个条目
  assert.ok(/hash: 'help-usage'/.test(js), '应有 help-usage 条目');
  assert.ok(/hash: 'help-feedback'/.test(js), '应有 help-feedback 条目');
  // 不再有旧的单一 help hash
  assert.ok(!/hash: 'help'/.test(js), '不应再保留 hash: \'help\'');
  // handleRoute 路由到两个渲染函数
  assert.ok(/else if \(h === 'help-usage'\) renderHelpUsage\(\)/.test(js), 'handleRoute 应路由 help-usage → renderHelpUsage');
  assert.ok(/else if \(h === 'help-feedback'\) renderFeedback\(\)/.test(js), 'handleRoute 应路由 help-feedback → renderFeedback');
});

test('Batch203 #12：settings.js 拆分出的 renderHelpUsage / renderFeedback 均定义并导出', () => {
  const js = read('settings.js');
  assert.ok(/function renderHelpUsage\(\)/.test(js), '应定义 renderHelpUsage');
  assert.ok(/function renderFeedback\(\)/.test(js), '应定义 renderFeedback');
  // 旧的 renderHelp 应移除（避免重复/歧义）
  assert.ok(!/function renderHelp\(\)/.test(js), '不应再保留 function renderHelp');
  // 导出对象
  const exportBlock = js.slice(js.indexOf('root.RT_SETTINGS_PAGE = {'));
  assert.ok(/renderHelpUsage: renderHelpUsage/.test(exportBlock), '应在 RT_SETTINGS_PAGE 导出 renderHelpUsage');
  assert.ok(/renderFeedback: renderFeedback/.test(exportBlock), '应在 RT_SETTINGS_PAGE 导出 renderFeedback');
  assert.ok(!/renderHelp: renderHelp/.test(exportBlock), '导出不应再含 renderHelp');
});

test('Batch203 #12：i18n 补齐 使用说明 / 意见反馈 入口键（6 语言）', () => {
  const langs = ['zh-CN', 'en', 'zh-HK', 'zh-TW', 'ja', 'ko'];
  const keys = ['settings.helpUsage', 'settings.helpUsageDesc', 'settings.helpFeedback', 'settings.helpFeedbackDesc'];
  langs.forEach((lc) => {
    const js = read('i18n/' + lc + '.js');
    keys.forEach((k) => {
      assert.ok(new RegExp("'" + k + "':").test(js), '[' + lc + '] 应含 i18n 键 ' + k);
    });
  });
});

test('Batch203 #7：通知子视图仅含 消息通知 + 提示音 两模块（无其它非通知模块）', () => {
  const html = read('settings.html');
  const start = html.indexOf('id="gen-notifyView"');
  const end = html.indexOf('id="gen-uiView"');
  assert.ok(start >= 0 && end > start, 'gen-notifyView 应位于 gen-uiView 之前');
  const block = html.slice(start, end);
  // 两大模块标题存在
  assert.ok(/data-i18n="settings.notificationGroup"|消息通知/.test(block), '应含 消息通知 模块');
  assert.ok(/data-i18n="settings.ringtone"|提示音/.test(block), '应含 提示音 模块');
  // 关键控件齐全
  assert.ok(block.includes('id="ntMaster"'), '应含 消息通知 总开关');
  assert.ok(block.includes('id="ntRingtone"'), '应含 提示音 选择');
  assert.ok(block.includes('onclick="RT_SETTINGS_PAGE.previewRingtone()"'), '应含 试听提示音');
});
