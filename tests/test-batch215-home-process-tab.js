// Batch 215（#25 首页「流程」TAB）—— 数据层 listByActor + UI 静态契约 + i18n 6 语对称
// 运行环境无 jsdom，以「数据模块实测（内存 mock RT_DB）+ 源码静态契约」断言为主。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 内存 mock RT_DB（按 store 名隔离记录），与 Batch214 测试一致
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
global.RT_WORKFLOWS = {
  getWorkflow: (id) => Promise.resolve({
    id: id, name: '需求评审流程', code: 'PWA+GZL001',
    nodes: [
      { id: 'n1', name: '主管审批', status: 'PENDING', approver: 'A', ops: ['APPROVE', 'REJECT'] },
      { id: 'n2', name: '总监审批', status: 'PENDING', approver: 'B', ops: ['APPROVE', 'REJECT'] }
    ]
  })
};

// ===== 1. listByActor 导出 =====
test('Batch215 #25：process-instances.js 导出含 listByActor', () => {
  assert.strictEqual(typeof instancesApi.listByActor, 'function', 'RT_PROCESS_INSTANCES.listByActor 应为函数');
});

// ===== 2. listByActor 正确性（我只处理 · 已审批）=====
test('Batch215 #25：listByActor 仅返回「本人以非 SUBMIT 动作处理过」且去重的实例', async () => {
  const p = await processesApi.createProcess({ name: '评审', workflowId: 'wfX' }, 'u1');

  // 实例1：u1 发起，B 审批通过 1 个节点
  const i1 = await instancesApi.startInstance(p.id, {}, 'u1');
  await instancesApi.approve(i1.id, 'B', '同意');
  // 实例2：u2 发起，C 审批
  const i2 = await instancesApi.startInstance(p.id, {}, 'u2');
  await instancesApi.approve(i2.id, 'C', '同意');
  // 实例3：u3 发起，尚无人审批（RUNNING，仅 SUBMIT）
  const i3 = await instancesApi.startInstance(p.id, {}, 'u3');

  const byB = await instancesApi.listByActor('B');
  assert.ok(byB.some((r) => r.id === i1.id), 'B 应出现在「我已处理」（审批过 i1）');
  assert.ok(!byB.some((r) => r.id === i2.id), 'B 不应出现（未处理 i2）');
  assert.ok(!byB.some((r) => r.id === i3.id), 'B 不应出现（i3 仅 SUBMIT，无动作）');

  // u1 仅为发起人（SUBMIT），不应出现在「我已处理」
  const byU1 = await instancesApi.listByActor('u1');
  assert.ok(!byU1.some((r) => r.id === i1.id), 'u1 仅为发起人不计入「我已处理」');

  // 「我已处理」排除仅 SUBMIT 的 i3
  const byU2 = await instancesApi.listByActor('u2');
  assert.ok(!byU2.some((r) => r.id === i3.id), 'i3 仅 SUBMIT 不应被任何 actor 命中');
});

test('Batch215 #25：listByActor 去重（同一实例多动作仅出现一次）', async () => {
  const p = await processesApi.createProcess({ name: '评审2', workflowId: 'wfY' }, 'u9');
  const i = await instancesApi.startInstance(p.id, {}, 'u9');
  await instancesApi.approve(i.id, 'A', '一审');
  await instancesApi.approve(i.id, 'A', '二审推进'); // A 两次动作
  const byA = await instancesApi.listByActor('A');
  const hit = byA.filter((r) => r.id === i.id);
  assert.strictEqual(hit.length, 1, 'A 同一实例多次处理应去重为 1 条');
});

// ===== 3. index.html 静态契约 =====
test('Batch215 #25：index.html 含流程 TAB 按钮 + view-process 容器 + process-instances.js 引用', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/data-view="process"/.test(html), '应含 data-view="process" 的 TAB 按钮');
  assert.ok(/data-i18n="tab\.process"/.test(html), '流程 TAB 应走 data-i18n="tab.process"');
  assert.ok(/id="view-process"/.test(html), '应含 id="view-process" 视图容器');
  assert.ok(/process-instances\.js/.test(html), '首页应引用 process-instances.js（数据层）');
});

// ===== 4. app.js 静态契约 =====
test('Batch215 #25：app.js 含 renderProcessTab + switchView 的 process 分支 + 字面 i18n key', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.ok(/function renderProcessTab\(\)/.test(src), 'app.js 应定义 renderProcessTab');
  assert.ok(/view === 'process'/.test(src), 'switchView 应有 view === "process" 分支');
  // 字面 i18n key（杜绝 t('process.status.'+x) 动态拼接，满足 Batch200 静态扫描）
  ['process.tabPending', 'process.tabHandled', 'process.tabDone',
    'process.handledEmpty', 'process.filterPlaceholder', 'process.goApprove',
    'process.currentNode', 'process.initiator', 'process.pendingEmpty', 'process.doneEmpty'].forEach((k) => {
    assert.ok(src.includes("'" + k + "'"), 'app.js 应字面引用 key: ' + k);
  });
});

// ===== 5. i18n 6 语言对称 =====
test('Batch215 #25：6 语言含首页流程 TAB 新增 key 且 key 集合与 zh-CN 一致', () => {
  const langs = ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'];
  const dicts = {};
  langs.forEach((lg) => { dicts[lg] = require(path.join(ROOT, 'i18n', lg + '.js')); });
  const newKeys = [
    'tab.process',
    'process.tabHandled', 'process.handledEmpty', 'process.filterPlaceholder', 'process.goApprove'
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

// ===== 6. 发布登记（release.sh 须含首页 process-instances.js 的 ?v= bump）=====
test('Batch215 #25：release.sh 已登记 index.html 的 process-instances.js ?v= bump', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'release.sh'), 'utf8');
  // 首页「流程」TAB 引用 process-instances.js，须随发版升版，否则全站 ?v= 漂移自检拦截
  assert.ok(/PROCESS_INSTANCES_HOME_PAGES/.test(sh), 'release.sh 应含 PROCESS_INSTANCES_HOME_PAGES 登记（首页 TAB 引用）');
  // 该循环须覆盖 index.html（以及 index-nosw.html）
  const m = sh.match(/PROCESS_INSTANCES_HOME_PAGES="([^"]+)"/);
  assert.ok(m, '应能从 release.sh 解析 PROCESS_INSTANCES_HOME_PAGES 变量');
  assert.ok(m[1].includes('index.html'), 'PROCESS_INSTANCES_HOME_PAGES 应包含 index.html');
  assert.ok(/process-instances\.js/.test(sh), 'release.sh 应引用 process-instances.js（含首页 bump 正则）');
});
