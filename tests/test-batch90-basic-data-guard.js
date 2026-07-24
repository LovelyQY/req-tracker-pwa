// test-batch90-basic-data-guard.js — 批次90：基础数据各页 data-perm 接线 + 入口守卫
'use strict';
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

function uid() { return Math.random().toString(36).slice(2, 9); }

function makeNode(code) {
  var st = { _d: '' };
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
  var role = await API.createRole({
    roleName: '基础数据只读_' + uid(),
    enabled: true,
    menuCodes: ['op_company_view', 'op_dept_view', 'op_position_view', 'op_project_view', 'op_project_ver_view', 'op_dict_view']
  }, 'tester');
  var u = await USERS.createPerson({ employeeNo: 'E9A_' + uid(), name: '普通用户', departmentId: 'd', personStatusCode: 'REGULAR' }, 'tester');
  await API.saveUserRoles(u.id, [role.id], 'tester');
  return { role: role, user: u };
}

describe('Batch90: 基础数据各页 data-perm 接线', () => {
  test('guard 隐藏用户无权限的按钮（create/edit/delete），保留 view-only', async () => {
    var s = await seedViewer();
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    var nCreate = makeNode('op_company_create');
    var nEdit   = makeNode('op_company_edit');
    var nDelete = makeNode('op_company_delete');
    var nView   = makeNode('op_company_view');
    var root = makeRoot([nCreate, nEdit, nDelete, nView]);

    var hidden = await RT_PERM.guard(root);
    // user has op_company_view only
    assert.equal(hidden, 3, '应隐藏3个按钮（create/edit/delete）');

    assert.ok(isHidden(nCreate), '无 create 权限 → 隐藏');
    assert.ok(isHidden(nEdit), '无 edit 权限 → 隐藏');
    assert.ok(isHidden(nDelete), '无 delete 权限 → 隐藏');
    assert.ok(!isHidden(nView), '有 view 权限 → 可见');

    // cleanup
    await USERS.deleteUser(s.user.id);
    try { await API.deleteRole(s.role.id); } catch (e) { /* 历史引用保护 */ }
  });

  test('admin 看到所有按钮（包括 create/edit/delete）', async () => {
    await API.seedMenusFromRegistry('system');
    globalThis.getCurrentUserAccount = function () { return 'admin'; };
    await RT_PERM.cachePermissions('admin');

    var nodes = [
      makeNode('op_company_create'),
      makeNode('op_company_edit'),
      makeNode('op_company_delete'),
      makeNode('op_dept_create'),
      makeNode('op_position_create'),
      makeNode('op_project_create'),
      makeNode('op_project_ver_create'),
      makeNode('op_dict_view')
    ];
    var root = makeRoot(nodes);
    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 0, 'admin 看到全部按钮');
    nodes.forEach(function (n) {
      assert.ok(!isHidden(n), 'admin 应看到 ' + n.getAttribute('data-perm'));
    });
  });

  test('basic-data 管理员入口（page_role_view / page_perm_view / page_user_view）对普通用户隐藏', async () => {
    var s = await seedViewer();
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    var nRole = makeNode('page_role_view');
    var nPerm = makeNode('page_perm_view');
    var nUser = makeNode('page_user_view');
    var root = makeRoot([nRole, nPerm, nUser]);

    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 3, '普通用户看不到3个管理员入口（无 page_*_view）');

    assert.ok(isHidden(nRole), '角色管理入口隐藏');
    assert.ok(isHidden(nPerm), '权限管理入口隐藏');
    assert.ok(isHidden(nUser), '人员管理入口隐藏');

    // cleanup
    await USERS.deleteUser(s.user.id);
    try { await API.deleteRole(s.role.id); } catch (e) { /* 历史引用保护 */ }
  });

  test('admin 看到所有管理员入口', async () => {
    await API.seedMenusFromRegistry('system');
    globalThis.getCurrentUserAccount = function () { return 'admin'; };
    await RT_PERM.cachePermissions('admin');

    var nodes = [
      makeNode('page_role_view'),
      makeNode('page_perm_view'),
      makeNode('page_user_view')
    ];
    var root = makeRoot(nodes);
    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 0, 'admin 看到所有管理入口');
    nodes.forEach(function (n) {
      assert.ok(!isHidden(n));
    });
  });

  test('多权限码逗号分隔 — 命中任一即可见', async () => {
    var s = await seedViewer();
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    // user has op_dict_view (from seed) but not op_board_task_create
    var n = makeNode('op_dict_view,op_board_task_create');
    var root = makeRoot([n]);

    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 0, '命中 op_dict_view 即可见（OR 逻辑）');
    assert.ok(!isHidden(n));

    // cleanup
    await USERS.deleteUser(s.user.id);
    try { await API.deleteRole(s.role.id); } catch (e) { /* 历史引用保护 */ }
  });
});
