// test-batch115-status.js
// 回归批次115「侧边栏状态选择误报登录过期」：
// 根因是 status.html 旧逻辑调用 auth.js v2 中已变为 no-op 的 loadAccounts/saveAccounts，
// 导致查不到当前用户 → 误报「会话已失效」并跳登录页。修复后状态经 RT_USERS.updateStatus 落库（IndexedDB users 表）。
// 本测试校验 updateStatus 能正确写入并回读用户 status 字段，且不污染其它字段。
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

globalThis.RT_DB = require('../db.js');
globalThis.RT_DB.registerStore('users', {
  keyPath: 'id',
  indexes: [
    { name: 'account', path: 'account' },
    { name: 'departmentId', path: 'departmentId' }
  ]
});
require('../permissions-registry.js');
require('../permissions.js');
require('../users.js');
const USERS = globalThis.RT_USERS;

const ADMIN = 'admin';

async function seed() {
  await USERS.ensureDefaultAdminRole({ account: ADMIN, password: '123', nickname: '管理员', operator: 'system' });
}

describe('批次115：updateStatus 落库（修复侧边栏状态误报登录过期）', () => {
  test('updateStatus 写入后 getUserByAccount 可回读 status', async () => {
    await seed();
    await USERS.updateStatus(ADMIN, 'busy', 'tester');
    var u = await USERS.getUserByAccount(ADMIN);
    assert.equal(u.status, 'busy', 'status 应被更新为 busy');

    // 再次切换并回读
    await USERS.updateStatus(ADMIN, 'off', 'tester');
    var u2 = await USERS.getUserByAccount(ADMIN);
    assert.equal(u2.status, 'off', 'status 应被更新为 off');
  });

  test('updateStatus 只改 status，不破坏 account/nickname', async () => {
    await seed();
    var before = await USERS.getUserByAccount(ADMIN);
    await USERS.updateStatus(ADMIN, 'meeting', 'tester');
    var after = await USERS.getUserByAccount(ADMIN);
    assert.equal(after.account, before.account, 'account 不应改变');
    assert.equal(after.nickname, before.nickname, 'nickname 不应改变');
    assert.equal(after.status, 'meeting');
  });

  test('updateStatus 缺少账号应拒绝', async () => {
    await assert.rejects(() => USERS.updateStatus('', 'busy', 'tester'), /缺少账号/);
  });

  test('updateStatus 账号不存在应拒绝', async () => {
    await assert.rejects(() => USERS.updateStatus('no_such_user_115', 'busy', 'tester'), /用户不存在/);
  });
});
