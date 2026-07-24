// test-batch89-guard.js
// Verify Batch 89: RT_PERM.guard(root) hides [data-perm] elements the user lacks.
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
const RT_PERM = globalThis.RT_PERM;
const USERS = globalThis.RT_USERS;

function makeNode(code, display) {
  var st = { _d: display || '' };
  return {
    style: {
      get display() { return st._d; },
      set display(v) { st._d = v; }
    },
    _cls: {},
    classList: {
      _s: {},
      add: function (c) { this._s[c] = true; },
      remove: function (c) { delete this._s[c]; },
      contains: function (c) { return !!this._s[c]; }
    },
    getAttribute: function (a) { return a === 'data-perm' ? code : null; }
  };
}
function makeRoot(nodes) { return { querySelectorAll: function () { return nodes; } }; }
function isHidden(n) { return n.style.display === 'none' && n.classList.contains('perm-hidden'); }

async function seedViewer() {
  await API.seedMenusFromRegistry('system');
  var role = await API.createRole({ roleName: '只读看板_' + Math.random().toString(36).slice(2, 7), enabled: true, menuCodes: ['op_board_task_create'] }, 'tester');
  var u = await USERS.createPerson({ employeeNo: 'E89_' + Math.random().toString(36).slice(2, 7), name: '看板员', departmentId: 'd', personStatusCode: 'REGULAR' }, 'tester');
  await API.saveUserRoles(u.id, [role.id], 'tester');
  return { role: role, user: u };
}

describe('Batch89: RT_PERM.guard', () => {
  test('guard hides elements whose code the user lacks; shows those they have', async () => {
    var s = await seedViewer();
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);
    var nCreate = makeNode('op_board_task_create');
    var nDev = makeNode('op_board_task_dev_submit');
    var nEither = makeNode('op_board_task_create,op_board_task_edit');
    var nTodo = makeNode('op_board_todo_task_item_complete');
    var root = makeRoot([nCreate, nDev, nEither, nTodo]);
    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 2, 'two elements lack permission');
    assert.ok(!isHidden(nCreate), 'has op_board_task_create -> visible');
    assert.ok(isHidden(nDev), 'lacks op_board_task_dev_submit -> hidden');
    assert.ok(!isHidden(nEither), 'list含已拥有 code -> visible');
    assert.ok(isHidden(nTodo), 'lacks todo complete -> hidden');
    // 撤销：重新给权限后 guard 应恢复显示
    await API.saveUserRoles(s.user.id, [s.role.id], 'tester'); // no-op keep
    await API.updateRole(s.role.id, { menuCodes: ['op_board_task_create', 'op_board_task_dev_submit', 'op_board_todo_task_item_complete'] }, 'tester');
    RT_PERM.clearPermissionCache();
    await RT_PERM.cachePermissions(s.user.account);
    var hidden2 = await RT_PERM.guard(root);
    assert.equal(hidden2, 0, 'after granting all -> nothing hidden');
    await USERS.deleteUser(s.user.id);
    try { await API.deleteRole(s.role.id); } catch (e) { /* 历史引用保护：角色含 user_role 历史时不强删 */ }
  });

  test('admin account sees everything (guard hides nothing)', async () => {
    await API.seedMenusFromRegistry('system');
    globalThis.getCurrentUserAccount = function () { return 'admin'; };
    await RT_PERM.cachePermissions('admin');
    var nodes = [makeNode('op_board_task_create'), makeNode('op_board_task_dev_submit'), makeNode('op_company_view')];
    var root = makeRoot(nodes);
    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 0, 'admin 跳过 menu.enabled 与 role 拥有，全部可见');
  });
});
