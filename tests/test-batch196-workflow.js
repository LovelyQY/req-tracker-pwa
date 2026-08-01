// Batch 196（#23 工作流管理：基础数据子项 CRUD + 云同步接入）
// 运行环境无 jsdom，以「源码结构 / 静态契约 + 数据模块实测」断言为主，与 191–195 测试风格一致。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ===== #23 权限注册：page_workflow + op_workflow_view/create/edit/delete =====
test('Batch196 #23：权限注册表登记 page_workflow（op_workflow_view/create/edit/delete）', () => {
  const reg = require(path.join(ROOT, 'permissions-registry.js'));
  const codes = reg.flattenRegistryCodes();
  assert.ok(codes.indexOf('page_workflow') >= 0, '应登记页面 page_workflow');
  assert.ok(codes.indexOf('op_workflow_view') >= 0, '应登记操作叶子 op_workflow_view');
  assert.ok(codes.indexOf('op_workflow_create') >= 0, '应登记操作叶子 op_workflow_create');
  assert.ok(codes.indexOf('op_workflow_edit') >= 0, '应登记操作叶子 op_workflow_edit');
  assert.ok(codes.indexOf('op_workflow_delete') >= 0, '应登记操作叶子 op_workflow_delete');
  assert.strictEqual(reg.expandOp('page_workflow', 'view'), 'op_workflow_view', 'expandOp 应正确展开 op_workflow_view');
  assert.strictEqual(reg.expandOp('page_workflow', 'create'), 'op_workflow_create', 'expandOp 应正确展开 op_workflow_create');
  assert.strictEqual(reg.expandOp('page_workflow', 'edit'), 'op_workflow_edit', 'expandOp 应正确展开 op_workflow_edit');
  assert.strictEqual(reg.expandOp('page_workflow', 'delete'), 'op_workflow_delete', 'expandOp 应正确展开 op_workflow_delete');
});

// ===== #23 basic-data.html 注册工作流管理入口 =====
test('Batch196 #23：basic-data.html 注册工作流管理入口（key: workflow.html）', () => {
  const html = read('basic-data.html');
  assert.ok(html.indexOf("href: 'workflow.html'") >= 0 || html.indexOf('href: "workflow.html"') >= 0, 'MODULES 应包含 workflow.html 入口');
  assert.ok(html.indexOf('工作流管理') >= 0, '入口名称应为「工作流管理」');
  assert.ok(html.indexOf('page_workflow_view') >= 0, '入口应带 page_workflow_view 权限');
});

// ===== #23 workflow.html 加载 workflows.js 与 crud 工厂 =====
test('Batch196 #23：workflow.html 加载 workflows.js + crud-factory.js + 权限门控', () => {
  const html = read('workflow.html');
  assert.ok(html.indexOf('workflows.js?v=') >= 0, '应加载 workflows.js');
  assert.ok(html.indexOf('crud-factory.js?v=') >= 0, '应加载 crud-factory.js');
  assert.ok(html.indexOf('data-perm="op_workflow_create"') >= 0, '新增按钮应带 op_workflow_create 权限');
  assert.ok(html.indexOf('data-perm="op_workflow_edit"') >= 0, '编辑按钮应带 op_workflow_edit 权限');
  assert.ok(html.indexOf('data-perm="op_workflow_delete"') >= 0, '删除按钮应带 op_workflow_delete 权限');
  assert.ok(html.indexOf("store: 'RT_WORKFLOWS'") >= 0 || html.indexOf('store:"RT_WORKFLOWS"') >= 0, 'save() 应委托 RT_WORKFLOWS');
});

// ===== #23 workflows.js 数据层契约 =====
test('Batch196 #23：workflows.js 导出 RT_WORKFLOWS 完整 API', () => {
  const api = require(path.join(ROOT, 'workflows.js'));
  ['validateWorkflow', 'createWorkflow', 'updateWorkflow', 'deleteWorkflow', 'getWorkflow', 'getAllWorkflows', 'genId'].forEach((m) => {
    assert.strictEqual(typeof api[m], 'function', 'RT_WORKFLOWS.' + m + ' 应为函数');
  });
  assert.strictEqual(api.STORE, 'workflows', 'STORE 应为 workflows');
});

test('Batch196 #23：workflows.js 字段校验（name 必填、长度上限；code 由系统生成不再必填）', () => {
  const api = require(path.join(ROOT, 'workflows.js'));
  const v1 = api.validateWorkflow({});
  assert.strictEqual(v1.ok, false, '空对象应校验失败');
  assert.ok(v1.errors.name, 'name 缺失应报错');

  const v2 = api.validateWorkflow({ name: '需求评审流程', description: '测试', nodes: [{ name: '提交' }, { name: '审批' }] });
  assert.strictEqual(v2.ok, true, '完整合法数据应校验通过');

  const v3 = api.validateWorkflow({ name: 'X'.repeat(51) });
  assert.strictEqual(v3.ok, false, '超长应校验失败');
  assert.ok(v3.errors.name, 'name 超长应报错');
});

// ===== #23 云同步接入（RT_SYNC.MAP + STORE_GLOBAL_TO_COLL + cloud-adapter.WRITE_MAP）=====
test('Batch196 #23：RT_SYNC 注册 workflows 集合与 RT_WORKFLOWS 映射', () => {
  const rtSync = read('RT_SYNC.js');
  assert.ok(rtSync.indexOf("coll: 'workflows'") >= 0, 'MAP 应包含 workflows 集合');
  assert.ok(rtSync.indexOf("'RT_WORKFLOWS': 'workflows'") >= 0, 'STORE_GLOBAL_TO_COLL 应包含 RT_WORKFLOWS');
});

test('Batch196 #23：cloud-adapter WRITE_MAP 注册 RT_WORKFLOWS 写方法', () => {
  const adapter = read('cloud-adapter.js');
  assert.ok(adapter.indexOf('RT_WORKFLOWS:') >= 0, 'WRITE_MAP 应包含 RT_WORKFLOWS');
  assert.ok(adapter.indexOf("create: ['createWorkflow', 'updateWorkflow']") >= 0, '应包含 createWorkflow/updateWorkflow');
  assert.ok(adapter.indexOf("delete: ['deleteWorkflow']") >= 0, '应包含 deleteWorkflow');
});

// ===== #23 i18n 全量覆盖（6 语言 + workflow.* 命名空间）=====
test('Batch196 #23：6 语言字典均含 workflow.* 命名空间 key', () => {
  const langs = ['zh-CN', 'en', 'zh-HK', 'zh-TW', 'ko', 'ja'];
  const keys = ['workflow.title', 'workflow.code', 'workflow.name', 'workflow.targets', 'workflow.nodes', 'workflow.transitions', 'workflow.emptyHint'];
  langs.forEach((lg) => {
    const content = read('i18n/' + lg + '.js');
    keys.forEach((k) => {
      assert.ok(content.indexOf("'" + k + "'") >= 0 || content.indexOf('"' + k + '"') >= 0,
        lg + ' 应含 i18n key: ' + k);
    });
  });
});

// ===== #23 sw.js 预缓存 + release.sh 登记 =====
test('Batch196 #23：sw.js 预缓存与 release.sh 登记 workflow.html', () => {
  const sw = read('sw.js');
  assert.ok(sw.indexOf("'./workflow.html'") >= 0 || sw.indexOf('"./workflow.html"') >= 0, 'sw.js 预缓存应包含 workflow.html');
  const rel = read('release.sh');
  assert.ok(rel.indexOf('workflow.html') >= 0, 'release.sh 应登记 workflow.html');
  assert.ok(rel.indexOf('workflows.js?v=') >= 0, 'release.sh 应为 workflow.html 打 workflows.js?v= 版本');
});
