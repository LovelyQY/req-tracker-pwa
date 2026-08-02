// Batch 217（#27 任务/代办挂流程）—— 关联流程数据层 + 反向回链 + 6 语言对称 + 发布登记
// 运行环境无 jsdom，以「数据模块实测（内存 mock RT_DB）+ 源码静态契约」断言为主。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---------- 内存 mock RT_DB（按 store 名隔离记录），与 Batch214/215/216 测试同构 ----------
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
// 事务 mock：支持 oncomplete（与 Batch216 同构）
function makeTransaction(name) {
  const os = osFor(name);
  const tx = { objectStore: () => os, _oncomplete: null, _onerror: null };
  Object.defineProperty(tx, 'oncomplete', {
    get() { return tx._oncomplete; },
    set(fn) { tx._oncomplete = fn; Promise.resolve().then(() => { if (tx._oncomplete) tx._oncomplete(); }); }
  });
  Object.defineProperty(tx, 'onerror', {
    get() { return tx._onerror; },
    set(fn) { tx._onerror = fn; }
  });
  return tx;
}
global.RT_DB = {
  genId: () => 'id_' + Math.random().toString(36).slice(2, 10),
  registerStore: () => {},
  openDB: () => Promise.resolve({
    transaction: (name) => makeTransaction(name),
    close: () => {}
  })
};

// 字典 / 外键 mock：使 create/update 的字典码 + 外键校验通过（按 type 返回对应枚举）
function dictList(type) {
  switch (type) {
    case 'TASK_TYPE': return [{ code: 'REQ' }];
    case 'PRIORITY': return [{ code: 'MEDIUM' }];
    case 'TASK_STATUS': return [{ code: 'TS_OPEN' }];
    case 'TODO_TYPE': return [{ code: 'TASK_ITEM' }, { code: 'BUG' }, { code: 'MEETING' }];
    case 'TODO_STATUS': return [{ code: 'TI_OPEN' }];
    case 'BUG_STATUS': return [{ code: 'BU_OPEN' }];
    case 'MEETING_STATUS': return [{ code: 'MT_OPEN' }];
    default: return [];
  }
}
global.RT_DICT = {
  SEED_TYPE: {
    TASK_TYPE: 'TASK_TYPE', PRIORITY: 'PRIORITY', TASK_STATUS: 'TASK_STATUS',
    TODO_TYPE: 'TODO_TYPE', TODO_STATUS: 'TODO_STATUS', BUG_STATUS: 'BUG_STATUS', MEETING_STATUS: 'MEETING_STATUS'
  },
  getDictByType: (type) => Promise.resolve(dictList(type))
};
global.RT_PROJECTS = { getProject: () => Promise.resolve({ id: 'p1', deptId: 'd1' }) };
global.RT_PROJECT_VERSIONS = { getProjectVersion: () => Promise.resolve({ id: 'v1', projectId: 'p1' }) };
global.RT_USERS = { getUser: () => Promise.resolve({ account: 'u1' }) };

// 默认 2 节点工作流（节点1 approver=A，节点2 approver=B），供 process-instances 发起
function workflowNodes() {
  return [
    { id: 'n1', name: '开发', status: 'PENDING', approver: 'A', ops: ['APPROVE', 'REJECT'] },
    { id: 'n2', name: '测试', status: 'PENDING', approver: 'B', ops: ['APPROVE', 'REJECT'] }
  ];
}
global.RT_PROCESSES = {
  getProcess: (id) => Promise.resolve({ id: id, name: '需求交付流程', code: 'PWA217', workflowId: 'wfX' })
};
global.RT_WORKFLOWS = {
  getWorkflow: (id) => Promise.resolve({ id: 'wfX', name: '交付工作流', code: 'WF217', nodes: workflowNodes() })
};

// 加载被测模块（RT_DB 等全局已就绪）
const tasksApi = require(path.join(ROOT, 'requirement-tasks.js'));
const todosApi = require(path.join(ROOT, 'todos.js'));
const instancesApi = require(path.join(ROOT, 'process-instances.js'));

function flush() { return new Promise((r) => setTimeout(r, 5)); }

// ===== A. 需求任务：processInstanceId 字段 + 关联/解除 =====
test('Batch217 #27：validateRequirementTask 不强制 processInstanceId，且超长被拦截', () => {
  const okNoField = tasksApi.validateRequirementTask({
    taskName: '任务A', taskTypeCode: 'REQ', priorityCode: 'MEDIUM', statusCode: 'TS_OPEN', projectId: 'p1'
  });
  assert.strictEqual(okNoField.ok, true, '无 processInstanceId 时应通过');
  const bad = tasksApi.validateRequirementTask({
    taskName: '任务A', taskTypeCode: 'REQ', priorityCode: 'MEDIUM', statusCode: 'TS_OPEN', projectId: 'p1',
    processInstanceId: 'x'.repeat(100)
  });
  assert.strictEqual(bad.ok, false, 'processInstanceId 超长应被拦截');
  assert.ok(bad.errors.processInstanceId, '应给出 processInstanceId 错误');
});

test('Batch217 #27：createRequirementTask 持久化 processInstanceId → linkProcess/unlinkProcess 改写', async () => {
  const t = await tasksApi.createRequirementTask({
    taskName: '任务A', taskTypeCode: 'REQ', priorityCode: 'MEDIUM', statusCode: 'TS_OPEN', projectId: 'p1',
    processInstanceId: 'inst_seed'
  }, 'u1');
  assert.strictEqual(t.processInstanceId, 'inst_seed', 'create 应原样持久化 processInstanceId');
  const linked = await tasksApi.linkProcess(t.id, 'inst_2', 'u1');
  assert.strictEqual(linked.processInstanceId, 'inst_2', 'linkProcess 应改写为新实例');
  const unlinked = await tasksApi.unlinkProcess(t.id, 'u1');
  assert.strictEqual(unlinked.processInstanceId, '', 'unlinkProcess 应清空');
});

// ===== B. 代办：processInstanceId 字段 + 与 relatedTaskId 并存 =====
test('Batch217 #27：validateTodo 不强制 processInstanceId', () => {
  const ok = todosApi.validateTodo({ typeCode: 'TASK_ITEM', statusCode: 'TI_OPEN', desc: '做点事', projectId: 'p1' });
  assert.strictEqual(ok.ok, true, '无 processInstanceId 时应通过');
  const bad = todosApi.validateTodo({
    typeCode: 'TASK_ITEM', statusCode: 'TI_OPEN', desc: '做点事', projectId: 'p1', processInstanceId: 'y'.repeat(100)
  });
  assert.strictEqual(bad.ok, false, 'processInstanceId 超长应被拦截');
});

test('Batch217 #27：todos create 持久化 processInstanceId（与 relatedTaskId 并存不冲突）', async () => {
  // 先建一个真实需求任务，作为 relatedTaskId 的来源（避免外键校验失败）
  const relTask = await tasksApi.createRequirementTask({
    taskName: '来源任务', taskTypeCode: 'REQ', priorityCode: 'MEDIUM', statusCode: 'TS_OPEN', projectId: 'p1'
  }, 'u1');
  const td = await todosApi.createTodo({
    typeCode: 'TASK_ITEM', statusCode: 'TI_OPEN', desc: '做点事', projectId: 'p1',
    relatedTaskId: relTask.id, processInstanceId: 'inst_seed'
  }, 'u1');
  assert.strictEqual(td.processInstanceId, 'inst_seed', 'processInstanceId 应持久化');
  assert.strictEqual(td.relatedTaskId, relTask.id, 'relatedTaskId 应同时保留');
  const linked = await todosApi.linkProcess(td.id, 'inst_9', 'u1');
  assert.strictEqual(linked.processInstanceId, 'inst_9');
  const unlinked = await todosApi.unlinkProcess(td.id, 'u1');
  assert.strictEqual(unlinked.processInstanceId, '');
});

// ===== C. 流程实例：sourceRef 反向回链 + 关联闭环 =====
test('Batch217 #27：normalizeInstance 默认 sourceRef 为 null', () => {
  const r = instancesApi.normalizeInstance({ id: 'x' });
  assert.strictEqual(r.sourceRef, null, '缺省 sourceRef 应为 null');
});

test('Batch217 #27：linkSourceRef 写入并可回读；传 null 清空', async () => {
  const inst = await instancesApi.startInstance('proc1', {}, 'u1');
  assert.ok(inst.id, 'startInstance 应返回实例');
  assert.strictEqual(inst.nodes.length, 2, '应拷贝 2 个节点（开发→测试）');
  await instancesApi.linkSourceRef(inst.id, { type: 'requirementTask', id: 't_1' }, 'u1');
  const rec = await instancesApi.getInstance(inst.id);
  assert.ok(rec.sourceRef, 'sourceRef 应已写入');
  assert.strictEqual(rec.sourceRef.type, 'requirementTask');
  assert.strictEqual(rec.sourceRef.id, 't_1');
  await instancesApi.linkSourceRef(inst.id, null, 'u1');
  const cleared = await instancesApi.getInstance(inst.id);
  assert.strictEqual(cleared.sourceRef, null, '传 null 应清空 sourceRef');
});

test('Batch217 #27：关联闭环 —— 任务.linkProcess + 实例.linkSourceRef 双向一致', async () => {
  const t = await tasksApi.createRequirementTask({
    taskName: '任务B', taskTypeCode: 'REQ', priorityCode: 'MEDIUM', statusCode: 'TS_OPEN', projectId: 'p1'
  }, 'u1');
  const inst = await instancesApi.startInstance('proc2', {}, 'u1');
  await tasksApi.linkProcess(t.id, inst.id, 'u1');
  await instancesApi.linkSourceRef(inst.id, { type: 'requirementTask', id: t.id }, 'u1');

  const taskReload = await tasksApi.getRequirementTask(t.id);
  assert.strictEqual(taskReload.processInstanceId, inst.id, '任务侧应记录实例 ID');

  const instReload = await instancesApi.getInstance(inst.id);
  assert.ok(instReload.sourceRef, '实例侧应记录回链');
  assert.strictEqual(instReload.sourceRef.type, 'requirementTask');
  assert.strictEqual(instReload.sourceRef.id, t.id, '回链 id 应与任务 id 一致');
});

test('Batch217 #27：关联闭环（代办侧）双向一致', async () => {
  const td = await todosApi.createTodo({ typeCode: 'TASK_ITEM', statusCode: 'TI_OPEN', desc: '代办X', projectId: 'p1' }, 'u1');
  const inst = await instancesApi.startInstance('proc3', {}, 'u1');
  await todosApi.linkProcess(td.id, inst.id, 'u1');
  await instancesApi.linkSourceRef(inst.id, { type: 'todo', id: td.id }, 'u1');

  const tdReload = await todosApi.getTodo(td.id);
  assert.strictEqual(tdReload.processInstanceId, inst.id);
  const instReload = await instancesApi.getInstance(inst.id);
  assert.strictEqual(instReload.sourceRef.type, 'todo');
  assert.strictEqual(instReload.sourceRef.id, td.id);
});

// ===== D. i18n 6 语言对称 =====
test('Batch217 #27：6 语言含关联流程新增 key 且 key 集合与 zh-CN 一致', () => {
  global.window = global; // i18n 语言文件挂到 window.RT_I18N
  const langs = ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'];
  const dicts = {};
  langs.forEach((lg) => { dicts[lg] = require(path.join(ROOT, 'i18n', lg + '.js')); });
  const newKeys = [
    'common.processStatus', 'common.noLinkedProcess',
    'process.linkTitle', 'process.linkHint', 'process.sourceRef', 'process.sourceTask', 'process.sourceTodo',
    'process.nodeStatus.pending', 'process.nodeStatus.inProgress', 'process.nodeStatus.done',
    'process.nodeStatus.rejected', 'process.nodeStatus.withdrawn',
    'task.linkProcess', 'task.viewProcess', 'task.unlinkProcess'
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

// ===== E. 发布登记（release.sh 须含 processes.js / workflows.js 的 index.html ?v= bump）=====
test('Batch217 #27：release.sh 已登记 index.html 的 processes.js / workflows.js ?v= bump', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'release.sh'), 'utf8');
  assert.ok(/INDEX_APP=/.test(sh), 'release.sh 应含 INDEX_APP 变量');
  const m = sh.match(/INDEX_APP="([^"]+)"/);
  assert.ok(m, '应能从 release.sh 解析 INDEX_APP 变量');
  assert.ok(m[1].includes('index.html'), 'INDEX_APP 应包含 index.html');
  const idxBlock = sh.slice(sh.indexOf('INDEX_APP='), sh.indexOf('REPORT_PAGE='));
  assert.ok(/processes\.js\?v=\$NEW_VER/.test(idxBlock), 'INDEX_APP 块应 bump processes.js ?v=');
  assert.ok(/workflows\.js\?v=\$NEW_VER/.test(idxBlock), 'INDEX_APP 块应 bump workflows.js ?v=');
});

test('Batch217 #27：index.html 已引入 processes.js / workflows.js（且带 ?v=）', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/processes\.js\?v=[0-9]+\.[0-9]+\.[0-9]+/.test(html), 'index.html 应引用 processes.js?v=');
  assert.ok(/workflows\.js\?v=[0-9]+\.[0-9]+\.[0-9]+/.test(html), 'index.html 应引用 workflows.js?v=');
});
