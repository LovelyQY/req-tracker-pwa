// test-batch88-user-roles.js
// Verify Batch 88: user role assignment (saveUserRoles appends history + overwrites users.roleIds).
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
const API = globalThis.RT_PERMISSIONS;
const USERS = globalThis.RT_USERS;

function uid() { return Math.random().toString(36).slice(2, 9); }

async function setup() {
  await API.seedMenusFromRegistry('system');
  var s = uid();
  var ra = await API.createRole({ roleName: '测试角色A_' + s, enabled: true, menuCodes: [] }, 'tester');
  var rb = await API.createRole({ roleName: '测试角色B_' + s, enabled: false, menuCodes: [] }, 'tester');
  var person = await USERS.createPerson({ employeeNo: 'E88_' + s, name: '八八', departmentId: 'dept_x', personStatusCode: 'REGULAR' }, 'tester');
  return { ra: ra, rb: rb, person: person };
}
async function cleanup(ra, rb, person) {
  try { if (person) await USERS.deleteUser(person.id); } catch (e) {}
  try { if (ra) await API.deleteRole(ra.id); } catch (e) {}
  try { if (rb) await API.deleteRole(rb.id); } catch (e) {}
}
function historyStats(hist) {
  var keys = Object.keys(hist || {});
  var total = keys.reduce(function (n, k) { return n + (Array.isArray(hist[k]) ? hist[k].length : 0); }, 0);
  return { snapshots: keys.length, rows: total };
}

describe('Batch88: user role assignment', () => {
  test('saveUserRoles overwrites users.roleIds + appends user_role history', async () => {
    var s = await setup();
    try {
      await API.saveUserRoles(s.person.id, [s.ra.id], 'tester');
      var ids = await API.getUserRoleIds(s.person.id);
      assert.deepEqual(ids, [s.ra.id]);
      var h1 = historyStats(await API.getUserRoleHistory(s.person.id));
      assert.equal(h1.snapshots, 1, 'first assignment -> 1 snapshot');
      assert.equal(h1.rows, 1, 'first snapshot has 1 role row');

      // 再次保存（追加第二个角色）应新增一条历史，roleIds 覆盖为最新集合
      await API.saveUserRoles(s.person.id, [s.ra.id, s.rb.id], 'tester');
      var ids2 = await API.getUserRoleIds(s.person.id);
      assert.deepEqual(ids2.sort(), [s.ra.id, s.rb.id].sort());
      var h2 = historyStats(await API.getUserRoleHistory(s.person.id));
      assert.equal(h2.snapshots, 2, 'second assignment -> 2 snapshots (append-only)');
      assert.equal(h2.rows, 3, 'total rows = 1 (first) + 2 (second)');

      // users 表实际写入 roleIds
      var u = await USERS.getUser(s.person.id);
      assert.deepEqual((u.roleIds || []).sort(), [s.ra.id, s.rb.id].sort());
    } finally {
      await cleanup(s.ra, s.rb, s.person);
    }
  });

  test('validatePerson tolerates optional roleIds (选填兼容)', () => {
    var v1 = USERS.validatePerson({ employeeNo: 'E1', name: '张三', departmentId: 'd', roleIds: ['x'] });
    assert.ok(v1.ok, 'roleIds 可选，不应影响校验');
    var v2 = USERS.validatePerson({ employeeNo: 'E1', name: '张三', departmentId: 'd' });
    assert.ok(v2.ok);
    var v3 = USERS.validatePerson({ employeeNo: '', name: '', departmentId: '' });
    assert.ok(!v3.ok, '缺必填项仍应失败');
  });

  test('picker shows only enabled roles (getAllRoles 含全部，页面按 enabled 过滤)', async () => {
    var s = await setup();
    try {
      var all = await API.getAllRoles();
      assert.ok(all.some(function (r) { return r.id === s.ra.id; }), 'allRoles 含启用角色');
      assert.ok(all.some(function (r) { return r.id === s.rb.id; }), 'allRoles 含禁用角色（页面侧再过滤）');
      // 页面逻辑：仅启用角色可分配
      var enabled = all.filter(function (r) { return r.enabled !== false; });
      assert.ok(enabled.some(function (r) { return r.id === s.ra.id; }), '启用角色在可分配列表');
      assert.ok(!enabled.some(function (r) { return r.id === s.rb.id; }), '禁用角色不在可分配列表');
    } finally {
      await cleanup(s.ra, s.rb, s.person);
    }
  });
});
