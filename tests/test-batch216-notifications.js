// Batch 216（#26 消息通知 + 首页待审批数）—— 本地通知数据层 + 审批引擎通知写入 + 首页待审批数
// 运行环境无 jsdom，以「数据模块实测（内存 mock RT_DB）+ 源码静态契约」断言为主。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---------- 内存 mock RT_DB（按 store 名隔离记录），与 Batch214/215 测试同构 ----------
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
// 极简 localStorage（供 notifications.js 的 master 总开关读取）
const memLS = {};
global.localStorage = {
  getItem: (k) => (k in memLS ? memLS[k] : null),
  setItem: (k, v) => { memLS[k] = String(v); },
  removeItem: (k) => { delete memLS[k]; }
};
// 事务 mock：支持 oncomplete（notifications.js markAllRead 等待 wt.oncomplete）
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

// 默认 2 节点工作流（节点1 approver=A，节点2 approver=B），可随用例覆盖
function workflowNodes() {
  return [
    { id: 'n1', name: '主管审批', status: 'PENDING', approver: 'A', ops: ['APPROVE', 'REJECT'] },
    { id: 'n2', name: '总监审批', status: 'PENDING', approver: 'B', ops: ['APPROVE', 'REJECT'] }
  ];
}
global.RT_WORKFLOWS = {
  getWorkflow: () => Promise.resolve({
    id: 'wfX', name: '需求评审流程', code: 'PWA+GZL001', nodes: workflowNodes()
  })
};

const processesApi = require(path.join(ROOT, 'processes.js'));
const instancesApi = require(path.join(ROOT, 'process-instances.js'));
const notifApi = require(path.join(ROOT, 'notifications.js'));

// 刷新宏/微任务，确保引擎内「未 await 的」addNotification 异步写入已落库
function flush() { return new Promise((r) => setTimeout(r, 5)); }

// 清空通知 store（每个用例前清空，隔离断言）
function resetNotifs() { stores['notifications'] = []; }

// ===== A. notifications.js 数据层 API =====
test('Batch216 #26：notifications.js 导出完整 API', () => {
  assert.strictEqual(typeof notifApi.addNotification, 'function', 'addNotification 应为函数');
  assert.strictEqual(typeof notifApi.listByAccount, 'function', 'listByAccount 应为函数');
  assert.strictEqual(typeof notifApi.getUnreadCount, 'function', 'getUnreadCount 应为函数');
  assert.strictEqual(typeof notifApi.markRead, 'function', 'markRead 应为函数');
  assert.strictEqual(typeof notifApi.markAllRead, 'function', 'markAllRead 应为函数');
  assert.strictEqual(typeof notifApi.notifyEnabled, 'function', 'notifyEnabled 应为函数');
  assert.ok(notifApi.TYPES && notifApi.TYPES.APPROVE, 'TYPES 应含 APPROVE');
  assert.strictEqual(notifApi.STORE, 'notifications', 'store 名应为 notifications');
});

test('Batch216 #26：notifyEnabled 默认开启，master=false 时关闭', () => {
  delete memLS['rt_ui_prefs'];
  assert.strictEqual(notifApi.notifyEnabled(), true, '默认应开启');
  memLS['rt_ui_prefs'] = JSON.stringify({ notify: { master: false } });
  assert.strictEqual(notifApi.notifyEnabled(), false, 'master=false 应关闭');
  memLS['rt_ui_prefs'] = JSON.stringify({ notify: { master: true } });
  assert.strictEqual(notifApi.notifyEnabled(), true, 'master=true 应开启');
  delete memLS['rt_ui_prefs'];
});

test('Batch216 #26：addNotification 写入通知（目标非空 + master 开启）', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  const rec = await notifApi.addNotification({
    toAccount: 'B', type: 'APPROVE', titleKey: 'notify.title.approvePending',
    bodyKey: 'notify.body.approvePending', refId: 'inst1', params: { operator: 'A', processName: '评审', nodeName: '总监审批' }
  });
  assert.ok(rec && rec.id, '应返回写入的记录（含 id）');
  assert.strictEqual(rec.toAccount, 'B');
  assert.strictEqual(rec.type, 'APPROVE');
  assert.strictEqual(rec.refType, 'process_instance');
  assert.strictEqual(rec.read, false);
  const list = await notifApi.listByAccount('B');
  assert.strictEqual(list.length, 1, 'B 应收到 1 条通知');
  assert.strictEqual(list[0].id, rec.id);
});

test('Batch216 #26：addNotification 目标为空 / master 关闭 时跳过（返回 null）', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  const r1 = await notifApi.addNotification({ toAccount: '', type: 'APPROVE', titleKey: 'x', bodyKey: 'y' });
  assert.strictEqual(r1, null, '目标为空应返回 null');
  memLS['rt_ui_prefs'] = JSON.stringify({ notify: { master: false } });
  const r2 = await notifApi.addNotification({ toAccount: 'B', type: 'APPROVE', titleKey: 'x', bodyKey: 'y' });
  assert.strictEqual(r2, null, 'master 关闭应返回 null');
  const list = await notifApi.listByAccount('B');
  assert.strictEqual(list.length, 0, '不应写入任何通知');
  delete memLS['rt_ui_prefs'];
});

test('Batch216 #26：未读计数 + markRead + markAllRead', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  await notifApi.addNotification({ toAccount: 'C', type: 'APPROVE', titleKey: 'a', bodyKey: 'b', refId: 'i1' });
  await notifApi.addNotification({ toAccount: 'C', type: 'REJECTED', titleKey: 'c', bodyKey: 'd', refId: 'i2' });
  let n = await notifApi.getUnreadCount('C');
  assert.strictEqual(n, 2, 'C 应有 2 条未读');
  const list = await notifApi.listByAccount('C');
  await notifApi.markRead(list[0].id);
  n = await notifApi.getUnreadCount('C');
  assert.strictEqual(n, 1, 'markRead 后剩 1 条未读');
  const cnt = await notifApi.markAllRead('C');
  assert.strictEqual(cnt, 1, 'markAllRead 应返回剩余未读数 1');
  n = await notifApi.getUnreadCount('C');
  assert.strictEqual(n, 0, '全部已读后未读为 0');
});

// ===== B. 审批引擎写入通知（writeFlowNotification 注入）=====
// 用例构造：发起人 u1，节点1 approver=A，节点2 approver=B
async function makeInstance() {
  const p = await processesApi.createProcess({ name: '评审', workflowId: 'wfX' }, 'u1');
  const i = await instancesApi.startInstance(p.id, {}, 'u1');
  return i;
}
async function lastNotif() {
  const all = (stores['notifications'] || []).slice();
  return all.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))[0] || null;
}

test('Batch216 #26：approve 推进中 → 下一节点审批人收到 APPROVE 通知', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  const i = await makeInstance();
  await instancesApi.approve(i.id, 'A', '同意');
  await flush();
  const n = await lastNotif();
  assert.ok(n, '应写入 1 条通知');
  assert.strictEqual(n.toAccount, 'B', '下一审批人 B 应为接收人');
  assert.strictEqual(n.type, 'APPROVE', '推进中类型为 APPROVE');
  assert.strictEqual(n.titleKey, 'notify.title.approvePending');
  assert.strictEqual(n.refId, i.id, 'refId 应为流程实例 id');
  assert.strictEqual(n.params.nodeName, '总监审批', 'params.nodeName 应为下一节点名');
  assert.strictEqual(n.params.operator, 'A');
});

test('Batch216 #26：approve 终态（末节点） → 发起人收到 APPROVED 通知', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  const i = await makeInstance();
  await instancesApi.approve(i.id, 'A', '一审');
  await instancesApi.approve(i.id, 'B', '终审');
  await flush();
  const all = stores['notifications'] || [];
  assert.strictEqual(all.length, 2, '应写入 2 条通知（推进中 + 终态）');
  const n = all.find((r) => r.type === 'APPROVED');
  assert.ok(n, '应存在 APPROVED 类型通知');
  assert.strictEqual(n.toAccount, 'u1', '发起人 u1 应为接收人');
  assert.strictEqual(n.titleKey, 'notify.title.approved');
  assert.strictEqual(n.params.nodeName, undefined, '终态通知不含 nodeName');
});

test('Batch216 #26：reject → 发起人收到 REJECTED 通知', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  const i = await makeInstance();
  await instancesApi.reject(i.id, 'A', '不通过');
  await flush();
  const n = await lastNotif();
  assert.ok(n, '应写入通知');
  assert.strictEqual(n.toAccount, 'u1', '发起人 u1 应为接收人');
  assert.strictEqual(n.type, 'REJECTED');
  assert.strictEqual(n.titleKey, 'notify.title.rejected');
});

test('Batch216 #26：transfer → 被转办人收到 TRANSFER 通知', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  const i = await makeInstance();
  await instancesApi.transfer(i.id, 'A', 'C', '转给 C');
  await flush();
  const n = await lastNotif();
  assert.ok(n, '应写入通知');
  assert.strictEqual(n.toAccount, 'C', '被转办人 C 应为接收人');
  assert.strictEqual(n.type, 'TRANSFER');
  assert.strictEqual(n.titleKey, 'notify.title.transfer');
});

test('Batch216 #26：addsign → 被加签人收到 ADDSIGN 通知', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  const i = await makeInstance();
  await instancesApi.addsign(i.id, 'A', 'D', '加签 D');
  await flush();
  const n = await lastNotif();
  assert.ok(n, '应写入通知');
  assert.strictEqual(n.toAccount, 'D', '被加签人 D 应为接收人');
  assert.strictEqual(n.type, 'ADDSIGN');
  assert.strictEqual(n.titleKey, 'notify.title.addsign');
});

test('Batch216 #26：自通知跳过（target === 操作者）', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  const i = await makeInstance();
  await instancesApi.transfer(i.id, 'A', 'A', '转给自己'); // 目标 == 操作者
  await flush();
  assert.strictEqual((stores['notifications'] || []).length, 0, '转办给自己不应写通知');
});

test('Batch216 #26：master 关闭时引擎不写通知', async () => {
  resetNotifs();
  memLS['rt_ui_prefs'] = JSON.stringify({ notify: { master: false } });
  const i = await makeInstance();
  await instancesApi.approve(i.id, 'A', '同意');
  await flush();
  assert.strictEqual((stores['notifications'] || []).length, 0, 'master 关闭不应写通知');
  delete memLS['rt_ui_prefs'];
});

test('Batch216 #26：withdraw 不写通知（仅 4 个动作写通知）', async () => {
  resetNotifs();
  delete memLS['rt_ui_prefs'];
  const i = await makeInstance();
  await instancesApi.withdraw(i.id, 'u1', '撤回');
  await flush();
  assert.strictEqual((stores['notifications'] || []).length, 0, '撤回不应写通知');
});

// ===== C. 首页待审批数（listByPending 驱动）=====
test('Batch216 #26：listByPending 正确反映「待我审批」数量（首页角标数据源）', async () => {
  resetNotifs();
  const p = await processesApi.createProcess({ name: '评审2', workflowId: 'wfX' }, 'u9');
  const i = await instancesApi.startInstance(p.id, {}, 'u9');
  let pendingA = await instancesApi.listByPending('A');
  assert.ok(pendingA.some((r) => r.id === i.id), 'A 为节点1审批人时应出现在待我审批');
  await instancesApi.approve(i.id, 'A', '通过');
  pendingA = await instancesApi.listByPending('A');
  assert.ok(!pendingA.some((r) => r.id === i.id), 'A 处理后不应再出现在待我审批');
  const pendingB = await instancesApi.listByPending('B');
  assert.ok(pendingB.some((r) => r.id === i.id), '流转到 B 后 B 应出现在待我审批');
});

// ===== D. i18n 6 语言对称 =====
test('Batch216 #26：6 语言含消息通知/待审批新增 key 且 key 集合与 zh-CN 一致', () => {
  const langs = ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'];
  const dicts = {};
  langs.forEach((lg) => { dicts[lg] = require(path.join(ROOT, 'i18n', lg + '.js')); });
  const newKeys = [
    'tab.notify', 'notify.title', 'notify.empty', 'notify.markAllRead', 'home.pendingApproval',
    'notify.title.approvePending', 'notify.title.approved', 'notify.title.rejected',
    'notify.title.transfer', 'notify.title.addsign',
    'notify.body.approvePending', 'notify.body.approved', 'notify.body.rejected',
    'notify.body.transfer', 'notify.body.addsign',
    'notify.time.justNow', 'notify.time.minutesAgo', 'notify.time.hoursAgo',
    'notify.time.daysAgo', 'notify.time.earlier'
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

// ===== E. 发布登记（release.sh 须含 notifications.js 的 ?v= bump）=====
test('Batch216 #26：release.sh 已登记 notifications.js ?v= bump（首页 + 流程审批中心）', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'release.sh'), 'utf8');
  assert.ok(/NOTIFICATION_PAGES/.test(sh), 'release.sh 应含 NOTIFICATION_PAGES 登记');
  const m = sh.match(/NOTIFICATION_PAGES="([^"]+)"/);
  assert.ok(m, '应能从 release.sh 解析 NOTIFICATION_PAGES 变量');
  assert.ok(m[1].includes('index.html'), 'NOTIFICATION_PAGES 应包含 index.html');
  assert.ok(m[1].includes('process-instances.html'), 'NOTIFICATION_PAGES 应包含 process-instances.html');
  assert.ok(/notifications\.js/.test(sh), 'release.sh 应引用 notifications.js（含 bump 正则）');
  // 最终一致性校验断言
  assert.ok(/notifications\.js\?v=\(index\.html\)/.test(sh), 'release.sh 应有 notifications.js?(index.html) 断言');
  assert.ok(/notifications\.js\?v=\(process-instances\.html\)/.test(sh), 'release.sh 应有 notifications.js?(process-instances.html) 断言');
});

// ===== F. 权限注册表（page_notification）=====
test('Batch216 #26：permissions-registry.js 已登记 page_notification（通知）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'permissions-registry.js'), 'utf8');
  assert.ok(/code:\s*'page_notification'/.test(src), '应登记 page_notification');
  assert.ok(/page_notification[\s\S]*?name:\s*'通知'/.test(src), 'page_notification 名称应为「通知」');
  assert.ok(/page_notification[\s\S]*?op:\s*'view'/.test(src), 'page_notification 应含 view 操作');
});
