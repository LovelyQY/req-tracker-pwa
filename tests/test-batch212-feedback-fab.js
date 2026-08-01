// Batch 212（#22 反馈页「我要反馈」按钮失效 → 右下角 FAB ＋ 跳设置-意见反馈）
// 静态契约（无 jsdom）：断言 app.js 反馈 TAB FAB 行为与失效按钮移除，与 194/191/192 风格一致。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const js = read('app.js');

// ===== #22 反馈 TAB FAB ＋ 显示 =====
test('Batch212 #22：switchView 在反馈(feedback)视图也显示右下角 FAB ＋', () => {
  assert.ok(/const showFab = \(view === 'task' \|\| view === 'todo' \|\| view === 'feedback'\)/.test(js), 'showFab 条件应包含 feedback 视图');
  assert.ok(/fab\.style\.display = showFab \? 'flex' : 'none'/.test(js), 'FAB 应按 showFab 显示/隐藏');
});

test('Batch212 #22：反馈视图 FAB aria-label 用 fab.newFeedback（其余视图用 fab.newTask）', () => {
  assert.ok(/t\(view === 'feedback' \? 'fab\.newFeedback' : 'fab\.newTask'\)/.test(js), 'FAB aria-label 应按视图取 fab.newFeedback / fab.newTask');
  assert.ok(/'fab\.newFeedback'/.test(js), 'app.js 应引用 fab.newFeedback i18n 键');
});

// ===== #22 FAB 点击跳设置-意见反馈子页 =====
test('Batch212 #22：反馈视图 FAB 点击 navTo 到设置-意见反馈子页(settings.html#help-feedback)', () => {
  assert.ok(/if \(currentView === 'feedback'\) \{ navTo\('settings\.html#help-feedback'\); return; \}/.test(js), 'FAB 点击在 feedback 视图应 navTo 到 settings.html#help-feedback');
});

// ===== #22 移除失效「我要反馈」按钮 =====
test('Batch212 #22：renderFeedbackTab 移除失效的「我要反馈」按钮(navTo settings.html#help)', () => {
  assert.ok(/async function renderFeedbackTab\(\)/.test(js), 'renderFeedbackTab 应存在');
  assert.ok(!/class="btn btn-primary fb-new"/.test(js), '应移除 .fb-new 失效按钮');
  assert.ok(!/onclick="navTo\('settings\.html#help'\)"/.test(js), '应移除跳 #help 的失效 onclick');
});

test('Batch212 #22：反馈空态文案改为引导点击右下角 ＋', () => {
  assert.ok(/点击右下角 ＋ 提交第一条反馈/.test(js), '空态应引导使用右下角 FAB ＋ 提交反馈');
});

// ===== 跳转目标可达：settings.js 将 #help-feedback 映射为意见反馈子视图 =====
test('Batch212 #22：设置页 hash #help-feedback 映射为意见反馈子视图(renderFeedback)', () => {
  const sjs = read('settings.js');
  assert.ok(/function renderFeedback\(\)/.test(sjs), 'settings.js 应定义 renderFeedback（意见反馈子视图）');
  assert.ok(/else if \(h === 'help-feedback'\) renderFeedback\(\)/.test(sjs), 'handleRoute 应将 #help-feedback 路由到 renderFeedback');
});
