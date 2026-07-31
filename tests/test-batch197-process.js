// Batch 197（#24 流程管理：自定义 TAB 注册 + 关联工作流 + 动态路由）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ===== #24 权限注册：page_process + op_process_view/create/edit/delete =====
test('Batch197 #24：权限注册表登记 page_process（op_process_view/create/edit/delete）', () => {
  const reg = require(path.join(ROOT, 'permissions-registry.js'));
  const codes = reg.flattenRegistryCodes();
  assert.ok(codes.indexOf('page_process') >= 0, '应登记页面 page_process');
  assert.ok(codes.indexOf('op_process_view') >= 0, '应登记操作叶子 op_process_view');
  assert.ok(codes.indexOf('op_process_create') >= 0, '应登记操作叶子 op_process_create');
  assert.ok(codes.indexOf('op_process_edit') >= 0, '应登记操作叶子 op_process_edit');
  assert.ok(codes.indexOf('op_process_delete') >= 0, '应登记操作叶子 op_process_delete');
  assert.strictEqual(reg.expandOp('page_process', 'view'), 'op_process_view');
  assert.strictEqual(reg.expandOp('page_process', 'create'), 'op_process_create');
  assert.strictEqual(reg.expandOp('page_process', 'edit'), 'op_process_edit');
  assert.strictEqual(reg.expandOp('page_process', 'delete'), 'op_process_delete');
});

// ===== #24 basic-data.html 注册流程管理入口 =====
test('Batch197 #24：basic-data.html 注册流程管理入口（href: process.html, perm: page_process_view）', () => {
  const html = read('basic-data.html');
  assert.ok(html.indexOf("'process.html'") >= 0 || html.indexOf('"process.html"') >= 0, 'MODULES 应包含 process.html');
  assert.ok(html.indexOf('流程管理') >= 0, '入口名称应为「流程管理」');
  assert.ok(html.indexOf('page_process_view') >= 0, '入口应带 page_process_view 权限');
});

// ===== #24 process.html 加载 processes.js + workflows.js + crud 工厂 + 权限门控 =====
test('Batch197 #24：process.html 加载 processes.js + workflows.js + crud-factory.js + 权限门控', () => {
  const html = read('process.html');
  assert.ok(html.indexOf('processes.js?v=') >= 0, '应加载 processes.js');
  assert.ok(html.indexOf('workflows.js?v=') >= 0, '应加载 workflows.js（用于填充关联工作流下拉）');
  assert.ok(html.indexOf('crud-factory.js?v=') >= 0, '应加载 crud-factory.js');
  assert.ok(html.indexOf('data-perm="op_process_create"') >= 0, '新增按钮应带 op_process_create 权限');
  assert.ok(html.indexOf('data-perm="op_process_edit"') >= 0, '编辑按钮应带 op_process_edit 权限');
  assert.ok(html.indexOf('data-perm="op_process_delete"') >= 0, '删除按钮应带 op_process_delete 权限');
  assert.ok(html.indexOf("store: 'RT_PROCESSES'") >= 0 || html.indexOf('store:"RT_PROCESSES"') >= 0, 'save() 应委托 RT_PROCESSES');
});

// ===== #24 processes.js 数据层契约 =====
test('Batch197 #24：processes.js 导出 RT_PROCESSES 完整 API 与 PROCESS_TARGETS', () => {
  const api = require(path.join(ROOT, 'processes.js'));
  ['validateProcess', 'createProcess', 'updateProcess', 'deleteProcess', 'getProcess', 'getAllProcesses', 'genId'].forEach((m) => {
    assert.strictEqual(typeof api[m], 'function', 'RT_PROCESSES.' + m + ' 应为函数');
  });
  assert.strictEqual(api.STORE, 'processes', 'STORE 应为 processes');
  assert.ok(Array.isArray(api.PROCESS_TARGETS), 'PROCESS_TARGETS 应为数组');
  assert.ok(api.PROCESS_TARGETS.indexOf('workflow') >= 0, 'PROCESS_TARGETS 应包含 workflow');
});

test('Batch197 #24：processes.js 字段校验（code/name/workflowId/targetKey 必填）', () => {
  const api = require(path.join(ROOT, 'processes.js'));
  const v1 = api.validateProcess({});
  assert.strictEqual(v1.ok, false, '空对象应校验失败');
  assert.ok(v1.errors.code, 'code 缺失应报错');
  assert.ok(v1.errors.name, 'name 缺失应报错');
  assert.ok(v1.errors.workflowId, 'workflowId 缺失应报错');
  assert.ok(v1.errors.targetKey, 'targetKey 缺失应报错');

  const v2 = api.validateProcess({ code: 'P01', name: '需求流程', workflowId: 'abc123', targetKey: 'workflow', iconKey: 'process', sort: 1, enabled: true });
  assert.strictEqual(v2.ok, true, '完整合法数据应校验通过');

  const v3 = api.validateProcess({ code: 'P01', name: '需求流程', workflowId: 'abc', targetKey: 'invalid_key' });
  assert.strictEqual(v3.ok, false, 'targetKey 不在白名单应校验失败');
});

// ===== #24 云同步：RT_SYNC + cloud-adapter 注册 processes =====
test('Batch197 #24：RT_SYNC 注册 processes 集合与 RT_PROCESSES 映射', () => {
  const rtSync = read('RT_SYNC.js');
  assert.ok(rtSync.indexOf("coll: 'processes'") >= 0, 'MAP 应包含 processes 集合');
  assert.ok(rtSync.indexOf("'RT_PROCESSES': 'processes'") >= 0, 'STORE_GLOBAL_TO_COLL 应包含 RT_PROCESSES');
});

test('Batch197 #24：cloud-adapter WRITE_MAP 注册 RT_PROCESSES 写方法', () => {
  const adapter = read('cloud-adapter.js');
  assert.ok(adapter.indexOf('RT_PROCESSES:') >= 0, 'WRITE_MAP 应包含 RT_PROCESSES');
  assert.ok(adapter.indexOf("create: ['createProcess', 'updateProcess']") >= 0, '应包含 createProcess/updateProcess');
  assert.ok(adapter.indexOf("delete: ['deleteProcess']") >= 0, '应包含 deleteProcess');
});

// ===== #24 app.js 动态 TAB 注册（registerProcessTabs + renderProcessView + switchView 分支）=====
test('Batch197 #24：app.js 包含 registerProcessTabs / renderProcessView / switchView 流程分支', () => {
  const app = read('app.js');
  assert.ok(app.indexOf('function registerProcessTabs()') >= 0, 'app.js 应包含 registerProcessTabs 函数');
  assert.ok(app.indexOf('function renderProcessView(processId)') >= 0, 'app.js 应包含 renderProcessView 函数');
  assert.ok(app.indexOf("indexOf('process_')") >= 0 && app.indexOf('renderProcessView') > 0, 'switchView 应包含 process_ 前缀分支');
  assert.ok(app.indexOf("registerProcessTabs()") >= 0, 'init 中应调用 registerProcessTabs()');
});

// ===== #24 release.sh 登记 + sw.js 预缓存 =====
test('Batch197 #24：release.sh 登记 process.html + sw.js 预缓存', () => {
  const rel = read('release.sh');
  assert.ok(rel.indexOf('process.html') >= 0, 'release.sh 应登记 process.html');
  assert.ok(rel.indexOf('processes.js?v=') >= 0, 'release.sh 应为 process.html 打 processes.js?v= 版本');
  const sw = read('sw.js');
  assert.ok(sw.indexOf("'./process.html'") >= 0 || sw.indexOf('"./process.html"') >= 0, 'sw.js 预缓存应包含 process.html');
});
