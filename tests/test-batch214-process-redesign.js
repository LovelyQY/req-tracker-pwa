// Batch 214（#24 流程管理重构）数据层 + 实例引擎 + i18n + UI 静态契约测试
// 运行环境无 jsdom，以「源码结构 / 静态契约 + 数据模块实测（内存 mock RT_DB）」断言为主。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 内存 mock RT_DB（按 store 名隔离记录），供 processes.js / process-instances.js 数据层测试
const stores = {};
function makeReq(result) {
  const req = {};
  Promise.resolve().then(function () { req.result = result; if (req.onsuccess) req.onsuccess({ result: result }); });
  return req;
}
function osFor(name) {
  const arr = stores[name] || (stores[name] = []);
  return {
    put: (rec) => { const i = arr.findIndex((r) => r.id === rec.id); if (i >= 0) arr[i] = rec; else arr.push(rec); return makeReq(rec); },
    get: (id) => makeReq(arr.find((r) => r.id === id) || null),
    getAll: () => makeReq(arr.slice()),
    delete: (id) => { const i = arr.findIndex((r) => r.id === id); if (i >= 0) arr.splice(i, 1); return makeReq(true); }
  };
}
global.RT_DB = {
  genId: () => 'id_' + Math.random().toString(36).slice(2, 10),
  registerStore: () => {},
  openDB: () => Promise.resolve({
    transaction: (name) => ({ objectStore: () => osFor(name) }),
    close: () => {}
  })
};

const processesApi = require(path.join(ROOT, 'processes.js'));
const instancesApi = require(path.join(ROOT, 'process-instances.js'));
// 工作流 mock（供 startInstance 复制节点）
global.RT_WORKFLOWS = {
  getWorkflow: (id) => Promise.resolve({
    id: id, name: '需求评审流程', code: 'PWA+GZL001',
    nodes: [
      { id: 'n1', name: '主管审批', status: 'PENDING', approver: 'A', ops: ['APPROVE', 'REJECT'] },
      { id: 'n2', name: '总监审批', status: 'PENDING', approver: 'B', ops: ['APPROVE', 'REJECT'] }
    ]
  })
};

// ===== 1. API 导出完整性 =====
test('Batch214 #24：processes.js 导出含 genNextCode/normalizeProcess/validateProcess/FORM_FIELD_TYPES', () => {
  ['validateProcess', 'normalizeProcess', 'genNextCode', 'createProcess', 'updateProcess', 'deleteProcess', 'getProcess', 'getAllProcesses', 'genId'].forEach((m) => {
    assert.strictEqual(typeof processesApi[m], 'function', 'RT_PROCESSES.' + m + ' 应为函数');
  });
  assert.ok(Array.isArray(processesApi.FORM_FIELD_TYPES), 'FORM_FIELD_TYPES 应为数组');
  assert.strictEqual(processesApi.PROCESS_TARGETS, undefined, '已移除 PROCESS_TARGETS（旧 targetKey 白名单）');
});

test('Batch214 #24：process-instances.js 导出含 startInstance/approve/reject/withdraw/transfer/addsign/STATUS', () => {
  ['startInstance', 'approve', 'reject', 'withdraw', 'transfer', 'addsign', 'getInstance', 'getAllInstances', 'listByPending', 'listByInitiator', 'listByStatus', 'deleteInstance'].forEach((m) => {
    assert.strictEqual(typeof instancesApi[m], 'function', 'RT_PROCESS_INSTANCES.' + m + ' 应为函数');
  });
  assert.strictEqual(instancesApi.STATUS.RUNNING, 'RUNNING');
  assert.strictEqual(instancesApi.STATUS.APPROVED, 'APPROVED');
  assert.strictEqual(instancesApi.STATUS.REJECTED, 'REJECTED');
  assert.strictEqual(instancesApi.STATUS.WITHDRAWN, 'WITHDRAWN');
});

// ===== 2. 自动编号 PWA+LCL+NNN =====
test('Batch214 #24：genNextCode 从现有最大号 +1（空库→001，含旧值→006）', async () => {
  assert.strictEqual(await processesApi.genNextCode(), 'PWA+LCL+001');
  await processesApi.createProcess({ name: '流程一', workflowId: 'wf1' }, 'u1');
  assert.strictEqual(await processesApi.genNextCode(), 'PWA+LCL+002');
  // 注入一个旧编码（手动值），不应影响 PWA+LCL 序列最大值
  stores.processes.push({ id: 'old1', code: 'P001', name: '旧', workflowId: 'wf1' });
  stores.processes.push({ id: 'old2', code: 'PWA+LCL+005', name: '五', workflowId: 'wf1' });
  assert.strictEqual(await processesApi.genNextCode(), 'PWA+LCL+006');
});

// ===== 3. validateProcess =====
test('Batch214 #24：validateProcess 名称/工作流必填、表单模板（select 需选项）', () => {
  let v = processesApi.validateProcess({ name: '', workflowId: '' });
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.name && v.errors.workflowId, '缺名称/工作流应报错');

  v = processesApi.validateProcess({ name: 'X', workflowId: 'wf', formTemplate: [{ label: '选项', type: 'select', options: [] }] });
  assert.strictEqual(v.ok, false, 'select 类型缺选项应报错');

  v = processesApi.validateProcess({ name: 'X', workflowId: 'wf', formTemplate: [{ label: '原因', type: 'text' }] });
  assert.strictEqual(v.ok, true, '合法定义应通过');
});

// ===== 4. 软迁移 normalizeProcess =====
test('Batch214 #24：normalizeProcess 丢弃 targetKey、补 formTemplate 数组', () => {
  const r = processesApi.normalizeProcess({ id: 'p1', name: 'P', targetKey: 'report-task', formTemplate: undefined });
  assert.strictEqual(r.targetKey, undefined, 'targetKey 应被丢弃');
  assert.ok(Array.isArray(r.formTemplate), 'formTemplate 应回退为空数组');
  const r2 = processesApi.normalizeProcess({ id: 'p2', name: 'P', formTemplate: [{ label: 'L', type: 'text' }] });
  assert.ok(r2.formTemplate[0].id, '字段应自动补 id');
});

// ===== 5. startInstance =====
test('Batch214 #24：startInstance 复制节点、状态 RUNNING、首节点 IN_PROGRESS、历史 SUBMIT', async () => {
  const p = await processesApi.createProcess({ name: '需求评审', workflowId: 'wfX', formTemplate: [{ label: '原因', type: 'text' }] }, 'u1');
  const inst = await instancesApi.startInstance(p.id, { f1: '紧急' }, 'u1');
  assert.strictEqual(inst.status, 'RUNNING');
  assert.strictEqual(inst.currentNodeIdx, 0);
  assert.strictEqual(inst.nodes.length, 2, '应复制 2 个节点');
  assert.strictEqual(inst.nodes[0].status, 'IN_PROGRESS');
  assert.strictEqual(inst.initiator, 'u1');
  assert.strictEqual(inst.history[0].action, 'SUBMIT');
  assert.strictEqual(inst.processName, '需求评审');
});

// ===== 6. 审批推进 approve → APPROVED =====
test('Batch214 #24：approve 逐节点推进，末节点→APPROVED', async () => {
  const p = await processesApi.createProcess({ name: '评审', workflowId: 'wfX' }, 'u1');
  const inst = await instancesApi.startInstance(p.id, {}, 'u1');
  await instancesApi.approve(inst.id, 'A', '同意1');
  let cur = await instancesApi.getInstance(inst.id);
  assert.strictEqual(cur.currentNodeIdx, 1);
  assert.strictEqual(cur.nodes[0].status, 'DONE');
  await instancesApi.approve(inst.id, 'B', '同意2');
  cur = await instancesApi.getInstance(inst.id);
  assert.strictEqual(cur.status, 'APPROVED');
});

// ===== 7. reject / withdraw =====
test('Batch214 #24：reject→REJECTED；withdraw→WITHDRAWN', async () => {
  const p = await processesApi.createProcess({ name: '评审', workflowId: 'wfX' }, 'u1');
  const inst = await instancesApi.startInstance(p.id, {}, 'u1');
  await instancesApi.reject(inst.id, 'A', '不符');
  let cur = await instancesApi.getInstance(inst.id);
  assert.strictEqual(cur.status, 'REJECTED');

  const inst2 = await instancesApi.startInstance(p.id, {}, 'u2');
  await instancesApi.withdraw(inst2.id, 'u2', '撤回');
  cur = await instancesApi.getInstance(inst2.id);
  assert.strictEqual(cur.status, 'WITHDRAWN');
});

// ===== 8. transfer / addsign =====
test('Batch214 #24：transfer 改当前节点审批人；addsign 插入加签节点', async () => {
  const p = await processesApi.createProcess({ name: '评审', workflowId: 'wfX' }, 'u1');
  const inst = await instancesApi.startInstance(p.id, {}, 'u1');
  await instancesApi.transfer(inst.id, 'A', 'C', '转办');
  let cur = await instancesApi.getInstance(inst.id);
  assert.strictEqual(cur.nodes[0].approver, 'C');

  await instancesApi.addsign(inst.id, 'C', 'D', '加签');
  cur = await instancesApi.getInstance(inst.id);
  assert.strictEqual(cur.nodes.length, 3, '加签后应多一个节点');
  assert.ok(cur.nodes[1].approver === 'D', '加签节点审批人应为 D');
});

// ===== 9. 查询 =====
test('Batch214 #24：listByPending / listByInitiator 过滤正确', async () => {
  const p = await processesApi.createProcess({ name: '评审', workflowId: 'wfX' }, 'u1');
  await instancesApi.startInstance(p.id, {}, 'u1'); // 当前节点审批人 A
  const pending = await instancesApi.listByPending('A');
  assert.ok(pending.length >= 1, 'A 应有待审批实例（共享 mock 下 >=1）');
  const mine = await instancesApi.listByInitiator('u1');
  assert.ok(mine.length >= 1, 'u1 应有发起实例');
});

// ===== 10. i18n 6 语言 key 对称 =====
test('Batch214 #24：6 语言含新增 process.* key 且 key 集合一致', () => {
  const langs = ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'];
  const dicts = {};
  langs.forEach((lg) => { dicts[lg] = require(path.join(ROOT, 'i18n', lg + '.js')); });
  const newKeys = [
    'process.codeAuto', 'process.formTemplate', 'process.addField', 'process.removeField',
    'process.fieldLabel', 'process.fieldType', 'process.fieldOptions', 'process.fieldRequired', 'process.fieldPlaceholder',
    'process.field.text', 'process.field.textarea', 'process.field.select', 'process.field.multiselect', 'process.field.image', 'process.field.attachment',
    'process.instanceCenter', 'process.selectProcess', 'process.selectProcessPlaceholder', 'process.startInstance', 'process.formData', 'process.submitInstance',
    'process.tabPending', 'process.tabInitiated', 'process.tabDone', 'process.pendingEmpty', 'process.initiatedEmpty', 'process.doneEmpty',
    'process.currentNode', 'process.nodeProgress', 'process.history', 'process.action.transferTo', 'process.action.addsignTo',
    'process.comment', 'process.commentPlaceholder', 'process.status.running', 'process.status.approved', 'process.status.rejected', 'process.status.withdrawn',
    'process.initiator', 'process.approver', 'process.workflowRef'
  ];
  newKeys.forEach((k) => {
    langs.forEach((lg) => assert.ok(dicts[lg][k] != null, lg + ' 缺少 key: ' + k));
  });
  const base = Object.keys(dicts['zh-CN']).sort().join(',');
  langs.forEach((lg) => {
    const k = Object.keys(dicts[lg]).sort().join(',');
    assert.strictEqual(k, base, lg + ' 的 key 集合应与 zh-CN 一致');
  });
});

// ===== 11. 权限注册表含 page_process_instance =====
test('Batch214 #24：permissions-registry 含 page_process_instance（view/create/approve）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'permissions-registry.js'), 'utf8');
  assert.ok(src.includes("page_process_instance"), '应注册 page_process_instance');
  assert.ok(src.includes("'approve'"), '应含 approve 操作');
});

// ===== 12. UI 静态契约 =====
test('Batch214 #24：process.html 编码只读 + 移除 targetKey + 表单模板容器', () => {
  const html = fs.readFileSync(path.join(ROOT, 'process.html'), 'utf8');
  assert.ok(/id="f-code"[^>]*readonly/.test(html), '流程编码应只读');
  assert.ok(html.includes('id="formTemplate"'), '应包含表单模板容器');
  assert.ok(!/targetKey/i.test(html), '不应再出现 targetKey');
});

test('Batch214 #24：process-instances.html 存在且引用 process-instances.js + RT_PROCESS_INSTANCES', () => {
  const html = fs.readFileSync(path.join(ROOT, 'process-instances.html'), 'utf8');
  assert.ok(html.includes('process-instances.js'), '应引用 process-instances.js');
  assert.ok(html.includes('RT_PROCESS_INSTANCES'), '应使用 RT_PROCESS_INSTANCES');
});

test('Batch214 #24：app.js 不再注入 per-process home TAB（registerProcessTabs 为空操作）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.ok(!/proc\.targetKey/.test(src), 'app.js 不应再引用 targetKey');
  assert.ok(/function registerProcessTabs\(\)/.test(src), 'registerProcessTabs 应保留（空操作）');
});
