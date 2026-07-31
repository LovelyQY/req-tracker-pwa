// Batch 194（#9 反馈类型 chip 单选 / #20 反馈处理模式 / #21 设置页「我的反馈记录」）
// 运行环境无 jsdom，以「源码结构 / 静态契约 + 注册表实测」断言为主，与 191/192/193 测试风格一致。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ===== #9 反馈类型 chip 单选（修复「选中无效果」） =====
test('Batch194 #9：settings.js 定义 onFbTypeClick 并在 init 绑定 #fbTypeRow 单击', () => {
  const js = read('settings.js');
  assert.ok(/function onFbTypeClick\(e\)/.test(js), '应定义 onFbTypeClick 处理函数');
  // init() 内取出 #fbTypeRow 并 addEventListener('click', onFbTypeClick)
  assert.ok(/\$\('fbTypeRow'\)/.test(js), 'init 应取到 #fbTypeRow');
  assert.ok(/fbRow\.addEventListener\('click', onFbTypeClick\)/.test(js), 'init 应将 onFbTypeClick 绑到 #fbTypeRow');
  // 处理函数行为：行内 .lang-btn 单选（仅被点中的高亮）
  assert.ok(/closest\('\.lang-btn'\)/.test(js), 'onFbTypeClick 应按 .lang-btn 解析目标');
  assert.ok(/classList\.toggle\('active', btns\[i\] === b\)/.test(js), 'onFbTypeClick 应为单选（仅点击项 active）');
});

// ===== #20 反馈处理模式：权限码注册 + 处理写回契约 =====
test('Batch194 #20：权限注册表登记 op_feedback_list（含 page_feedback / mod_feedback）', () => {
  const reg = require(path.join(ROOT, 'permissions-registry.js'));
  const codes = reg.flattenRegistryCodes();
  assert.ok(codes.indexOf('mod_feedback') >= 0, '应登记模块 mod_feedback');
  assert.ok(codes.indexOf('page_feedback') >= 0, '应登记页面 page_feedback');
  assert.ok(codes.indexOf('op_feedback_list') >= 0, '应登记操作叶子 op_feedback_list（查看全部/处理）');
  // 展开路径验证：expandOp(page_feedback, list) === op_feedback_list
  assert.strictEqual(reg.expandOp('page_feedback', 'list'), 'op_feedback_list', 'expandOp 应正确展开 op_feedback_list');
});

test('Batch194 #20：app.js renderFeedbackTab 进入「处理模式」并受 op_feedback_list 守卫', () => {
  const js = read('app.js');
  assert.ok(/async function renderFeedbackTab\(\)/.test(js), '应存在 async renderFeedbackTab');
  assert.ok(/RT_PERM\.can\(acct, 'op_feedback_list'\)/.test(js), '处理模式应经 RT_PERM.can(acct, "op_feedback_list") 判定');
  // 无权限时按 _owner 过滤本人反馈
  assert.ok(/\(r\._owner \|\| 'local'\) === acct/.test(js), '无权限时应按 _owner 过滤本人反馈');
  // 处理模式下渲染控件（状态/处理人/回复/保存）
  assert.ok(/fbItemHtml\(r, canHandle\)/.test(js), 'fbItemHtml 应接收 canHandle 标志');
  assert.ok(/class="fb-status" data-fbid=/.test(js), '应渲染状态选择框');
  assert.ok(/class="fb-handler" data-fbid=/.test(js), '应渲染处理人输入框');
  assert.ok(/class="fb-reply-input" data-fbid=/.test(js), '应渲染回复输入框');
  assert.ok(/class="btn btn-primary fb-save" data-fbid=/.test(js), '应渲染保存处理按钮');
});

test('Batch194 #20：app.js 提供 updateFeedback 将处理状态写回 IDB /feedback store', () => {
  const js = read('app.js');
  assert.ok(/function updateFeedback\(id, patch\)/.test(js), '应定义 updateFeedback(id, patch)');
  assert.ok(/indexedDB\.open\('req-tracker-feedback', 1\)/.test(js), 'updateFeedback 应打开 req-tracker-feedback 库');
  assert.ok(/store\.put\(rec\)/.test(js), 'updateFeedback 应通过 store.put 回写记录');
  assert.ok(/store\.get\(id\)/.test(js), 'updateFeedback 应先 get 原记录再 put');
  assert.ok(/updatedAt = Date\.now\(\)/.test(js), 'updateFeedback 应写入 updatedAt 时间戳');
  // 保存按钮点击 → 调用 updateFeedback 回写
  assert.ok(/updateFeedback\(id, \{ status: status, handler: handler, reply: reply \}\)/.test(js), '保存处理应回写 status/handler/reply');
});

// ===== #21 设置页「我的反馈记录」 =====
test('Batch194 #21：settings.html 提供 #myFeedbackList 容器（紧邻反馈表单）', () => {
  const html = read('settings.html');
  assert.ok(/id="myFeedbackList"/.test(html), '应设置页 #myFeedbackList 容器');
  assert.ok(/id="myFeedbackList" class="fb-list"/.test(html), '#myFeedbackList 应使用 .fb-list 容器类');
});

test('Batch194 #21：settings.js 提供 renderMyFeedback 并按当前用户渲染（接入 renderHelp + 导出）', () => {
  const js = read('settings.js');
  assert.ok(/function renderMyFeedback\(\)/.test(js), '应定义 renderMyFeedback');
  // 按当前用户 _owner 过滤（与提交时 _owner = getSessionAccount() || 'local' 对齐）
  assert.ok(/\(r\._owner \|\| 'local'\) === acct/.test(js), 'renderMyFeedback 应按 _owner 过滤本人');
  // 批次 203 #12：renderFeedback（意见反馈子视图）进入时刷新
  assert.ok(/renderMyFeedback\(\);/.test(js), 'renderFeedback 应调用 renderMyFeedback 刷新');
  // 导出到 RT_SETTINGS_PAGE 供其它页面/测试调用
  assert.ok(/renderMyFeedback: renderMyFeedback/.test(js), '应在 RT_SETTINGS_PAGE 导出 renderMyFeedback');
  // 复用设置页内联可用类（.set-row / .help-item-tag / .empty-tip），而非外部 .fb-*
  assert.ok(/class="set-row"|class="help-item-tag"|class="empty-tip"/.test(js), '应复用设置页内联可用类渲染');
});
