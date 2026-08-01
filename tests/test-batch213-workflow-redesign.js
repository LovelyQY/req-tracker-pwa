// Batch 213（#23 工作流管理重构）数据层 + 字典 + UI 静态契约测试
// 运行环境无 jsdom，以「源码结构 / 静态契约 + 数据模块实测（内存 mock RT_DB）」断言为主。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 内存 mock RT_DB，供 workflows.js 数据层测试（不依赖真实 IndexedDB）
// 注意：workflows.js 的 reqToPromise 依赖带 onsuccess/onerror 的「请求对象」，
// 故 objectStore 各方法返回模拟 IDBRequest（下一微任务触发 onsuccess）。
const records = [];
function makeReq(result) {
  const req = {};
  Promise.resolve().then(function () { req.result = result; if (req.onsuccess) req.onsuccess({ result: result }); });
  return req;
}
global.RT_DB = {
  genId: () => 'id_' + Math.random().toString(36).slice(2, 10),
  registerStore: () => {},
  openDB: () => Promise.resolve({
    transaction: () => ({
      objectStore: () => ({
        put: (rec) => { records.push(rec); return makeReq(rec); },
        get: (id) => makeReq(records.find((r) => r.id === id) || null),
        getAll: () => makeReq(records.slice()),
        delete: (id) => { const i = records.findIndex((r) => r.id === id); if (i >= 0) records.splice(i, 1); return makeReq(true); }
      })
    }),
    close: () => {}
  })
};

const api = require(path.join(ROOT, 'workflows.js'));

// ===== 1. API 导出完整性 =====
test('Batch213 #23：workflows.js 导出含 genNextCode/normalizeNode/NODE_OPS/NODE_STATUS_DEFAULT', () => {
  ['validateWorkflow', 'createWorkflow', 'updateWorkflow', 'deleteWorkflow', 'getWorkflow', 'getAllWorkflows', 'genNextCode', 'normalizeNode', 'genId'].forEach((m) => {
    assert.strictEqual(typeof api[m], 'function', 'RT_WORKFLOWS.' + m + ' 应为函数');
  });
  assert.ok(Array.isArray(api.NODE_OPS) && api.NODE_OPS.length === 6, 'NODE_OPS 应为 6 项');
  assert.strictEqual(api.NODE_STATUS_DEFAULT, 'PENDING', '默认节点状态应为 PENDING');
  assert.strictEqual(api.CODE_PREFIX + api.WF_PREFIX, 'PWAGZL', '编码前缀应为 PWAGZL');
});

// ===== 2. validateWorkflow：code 系统生成，不再必填；name 必填 =====
test('Batch213 #23：validateWorkflow code 不再必填、name 必填', () => {
  const v = api.validateWorkflow({});
  assert.strictEqual(v.ok, false, '空对象应校验失败');
  assert.ok(v.errors.name, 'name 缺失应报错');
  assert.strictEqual(api.validateWorkflow({ name: '需求评审流程' }).ok, true, '仅 name 应校验通过');
});

// ===== 3. normalizeNode 软迁移（字符串→结构化 / 对象补全）=====
test('Batch213 #23：normalizeNode 字符串→结构化、对象补全缺省字段', () => {
  const a = api.normalizeNode('提交');
  assert.strictEqual(a.name, '提交');
  assert.strictEqual(a.status, 'PENDING');
  assert.strictEqual(a.approver, '');
  assert.deepStrictEqual(a.ops, []);

  const b = api.normalizeNode({ name: '审批', status: 'DONE', approver: 'u1', ops: ['APPROVE'] });
  assert.strictEqual(b.status, 'DONE');
  assert.strictEqual(b.approver, 'u1');
  assert.deepStrictEqual(b.ops, ['APPROVE']);
});

// ===== 4. genNextCode：PWA+GZL+NNN 自动编号（从最大号+1）=====
test('Batch213 #23：genNextCode 自动编号 PWA+GZL+NNN（从最大号+1）', async () => {
  records.length = 0;
  records.push({ id: 'a', code: 'PWAGZL001' });
  records.push({ id: 'b', code: 'PWAGZL005' });
  const code = await api.genNextCode();
  assert.strictEqual(code, 'PWAGZL006', '应取最大号+1');

  records.length = 0;
  const first = await api.genNextCode();
  assert.strictEqual(first, 'PWAGZL001', '空库应从 001 起');
});

// ===== 5. createWorkflow：code 自动生成 + nodes 结构化 =====
test('Batch213 #23：createWorkflow 自动生成 code、结构化 nodes', async () => {
  records.length = 0;
  const rec = await api.createWorkflow({ name: '需求评审', description: 'd', nodes: [{ name: '提交' }, { name: '审批' }] }, 'admin');
  assert.ok(/^PWAGZL\d{3}$/.test(rec.code), 'code 应为 PWAGZL+3 位');
  assert.strictEqual(rec.nodes.length, 2, '应写入 2 个结构化节点');
  assert.strictEqual(rec.nodes[0].name, '提交');
  assert.strictEqual(rec.nodes[0].status, 'PENDING');
  assert.deepStrictEqual(rec.nodes[0].ops, []);
  assert.strictEqual(rec.createdBy, 'admin');
});

// ===== 6. i18n 6 语言含新增节点状态/操作集 key =====
test('Batch213 #23：6 语言字典均含 workflow 节点状态/审批人/操作集 key', () => {
  const langs = ['zh-CN', 'en', 'zh-HK', 'zh-TW', 'ko', 'ja'];
  const keys = ['workflow.nodeStatus', 'workflow.approver', 'workflow.ops', 'workflow.addNode', 'workflow.nodeName', 'workflow.op.submit', 'workflow.op.approve', 'workflow.op.reject'];
  langs.forEach((lg) => {
    const c = fs.readFileSync(path.join(ROOT, 'i18n/' + lg + '.js'), 'utf8');
    keys.forEach((k) => {
      assert.ok(c.indexOf("'" + k + "'") >= 0 || c.indexOf('"' + k + '"') >= 0, lg + ' 应含 i18n key: ' + k);
    });
  });
});

// ===== 7. dictionary.js 注册 WF_NODE_STATUS 并含 5 条节点状态种子 =====
test('Batch213 #23：dictionary.js 注册 WF_NODE_STATUS 并含 5 条节点状态种子', () => {
  const d = fs.readFileSync(path.join(ROOT, 'dictionary.js'), 'utf8');
  assert.ok(d.indexOf("WF_NODE_STATUS: '工作流节点状态'") >= 0, 'SEED_TYPE 应含 WF_NODE_STATUS');
  ['PENDING', 'IN_PROGRESS', 'DONE', 'REJECTED', 'WITHDRAWN'].forEach((c) => {
    assert.ok(d.indexOf("code: '" + c + "'") >= 0, '应含节点状态种子 ' + c);
  });
});

// ===== 8. workflow.html 静态契约（加载/节点可视化/编码只读）=====
test('Batch213 #23：workflow.html 加载 dictionary/users/workflows + 节点可视化 + 编码只读', () => {
  const html = fs.readFileSync(path.join(ROOT, 'workflow.html'), 'utf8');
  assert.ok(html.indexOf('dictionary.js?v=') >= 0, '应加载 dictionary.js（读 WF_NODE_STATUS）');
  assert.ok(html.indexOf('users.js?v=') >= 0, '应加载 users.js（审批人下拉）');
  assert.ok(html.indexOf('workflows.js?v=') >= 0, '应加载 workflows.js');
  assert.ok(html.indexOf('crud-factory.js?v=') >= 0, '应加载 crud-factory.js');
  assert.ok(html.indexOf('data-perm="op_workflow_create"') >= 0, '新增按钮应带 op_workflow_create');
  assert.ok(html.indexOf("store: 'RT_WORKFLOWS'") >= 0, 'save() 应委托 RT_WORKFLOWS');
  assert.ok(html.indexOf('id="nodeList"') >= 0, '应有节点列表容器');
  assert.ok(html.indexOf('function addNode') >= 0, '应有 addNode');
  assert.ok(html.indexOf('class="add-node-btn"') >= 0, '应有添加节点按钮');
  assert.ok(/id="f-code"[^>]*readonly/.test(html), '编码输入框应为只读（自动生成）');
  assert.ok(html.indexOf('WF_NODE_STATUS') >= 0, 'ensureOptions 应读取 WF_NODE_STATUS 字典');
  // 移除 targets/transitions 文本区
  assert.ok(html.indexOf('f-transitions') < 0, '应移除流转规则文本区');
  assert.ok(html.indexOf('f-targets') < 0, '应移除关联对象多选');
});
