// test-batch91-report-profile-guard.js — 批次91：报表/个人/系统页接线 + 抽屉收起
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

async function seedReporter() {
  await API.seedMenusFromRegistry('system');
  // 用户只有 report_task_view 没有其他 report/view
  var role = await API.createRole({
    roleName: '报表查看员_' + uid(),
    enabled: true,
    menuCodes: ['op_report_task_view'] // only task report
  }, 'tester');
  var u = await USERS.createPerson({ employeeNo: 'E9B_' + uid(), name: '报表员', departmentId: 'd', personStatusCode: 'REGULAR' }, 'tester');
  await API.saveUserRoles(u.id, [role.id], 'tester');
  return { role: role, user: u };
}

async function seedProfile() {
  await API.seedMenusFromRegistry('system');
  var role = await API.createRole({
    roleName: '个人编辑员_' + uid(),
    enabled: true,
    menuCodes: ['op_profile_view', 'op_security_view'] // no edit perms
  }, 'tester');
  var u = await USERS.createPerson({ employeeNo: 'E9C_' + uid(), name: '个人查看员', departmentId: 'd', personStatusCode: 'REGULAR' }, 'tester');
  await API.saveUserRoles(u.id, [role.id], 'tester');
  return { role: role, user: u };
}

describe('Batch91: 报表/个人/系统页接线 + 抽屉收起', () => {
  test('报表导出按钮 op_report_*_export — 有 view 无 export 则隐藏', async () => {
    var s = await seedReporter();
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    // user has only op_report_task_view, not _export
    var nExport = makeNode('op_report_task_export');
    var nView = makeNode('op_report_task_view');
    var root = makeRoot([nExport, nView]);

    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 1, '隐藏导出按钮（无 export 权限）');
    assert.ok(isHidden(nExport), '导出按钮隐藏');
    assert.ok(!isHidden(nView), 'view 按钮可见');

    await USERS.deleteUser(s.user.id);
    try { await API.deleteRole(s.role.id); } catch (e) { /* 历史引用保护 */ }
  });

  test('个人编辑按钮 op_profile_edit — 无 edit 权限则隐藏', async () => {
    var s = await seedProfile();
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    var nEdit = makeNode('op_profile_edit');
    var nView = makeNode('op_profile_view');
    var root = makeRoot([nEdit, nView]);

    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 1, '隐藏编辑按钮');
    assert.ok(isHidden(nEdit), '编辑按钮隐藏');
    assert.ok(!isHidden(nView), 'view 按钮可见');

    await USERS.deleteUser(s.user.id);
    try { await API.deleteRole(s.role.id); } catch (e) { /* 历史引用保护 */ }
  });

  test('账号安全编辑按钮 op_security_edit — 无权限则隐藏', async () => {
    var s = await seedProfile(); // has only op_security_view, not _edit
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    var nEdit = makeNode('op_security_edit');
    var nView = makeNode('op_security_view');
    var root = makeRoot([nEdit, nView]);

    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 1, '隐藏安全编辑按钮');
    assert.ok(isHidden(nEdit), '安全编辑按钮隐藏');
    assert.ok(!isHidden(nView), '安全 view 按钮可见');

    await USERS.deleteUser(s.user.id);
    try { await API.deleteRole(s.role.id); } catch (e) { /* 历史引用保护 */ }
  });

  test('抽屉统计报表入口 — 无任何报表 view 则隐藏', async () => {
    await API.seedMenusFromRegistry('system');
    // user with only basic-data view, no report
    var role = await API.createRole({
      roleName: '无报表_' + uid(),
      enabled: true,
      menuCodes: ['op_company_view']
    }, 'tester');
    var u = await USERS.createPerson({ employeeNo: 'E9D_' + uid(), name: '无报表用户', departmentId: 'd', personStatusCode: 'REGULAR' }, 'tester');
    await API.saveUserRoles(u.id, [role.id], 'tester');
    globalThis.getCurrentUserAccount = function () { return u.account; };
    await RT_PERM.cachePermissions(u.account);

    // drawer entry with comma-separated all 4 report views
    var nReport = makeNode('op_report_task_view,op_report_bug_view,op_report_todo_view,op_report_meeting_view');
    var root = makeRoot([nReport]);
    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 1, '无任何报表权限 → 入口隐藏');

    await USERS.deleteUser(u.id);
    try { await API.deleteRole(role.id); } catch (e) { /* 历史引用保护 */ }
  });

  test('抽屉统计报表入口 — 有任一报表 view 则可见', async () => {
    var s = await seedReporter(); // has op_report_task_view
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    var nReport = makeNode('op_report_task_view,op_report_bug_view,op_report_todo_view,op_report_meeting_view');
    var root = makeRoot([nReport]);
    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 0, '有任一报表权限 → 入口可见');
    assert.ok(!isHidden(nReport));

    await USERS.deleteUser(s.user.id);
    try { await API.deleteRole(s.role.id); } catch (e) { /* 历史引用保护 */ }
  });

  test('admin 看到所有报表/个人入口', async () => {
    await API.seedMenusFromRegistry('system');
    globalThis.getCurrentUserAccount = function () { return 'admin'; };
    await RT_PERM.cachePermissions('admin');

    var nodes = [
      makeNode('op_report_task_export'),
      makeNode('op_report_bug_export'),
      makeNode('op_report_todo_export'),
      makeNode('op_report_meeting_export'),
      makeNode('op_profile_edit'),
      makeNode('op_security_edit'),
      makeNode('op_storage_view'),
      makeNode('op_report_task_view,op_report_bug_view,op_report_todo_view,op_report_meeting_view')
    ];
    var root = makeRoot(nodes);
    var hidden = await RT_PERM.guard(root);
    assert.equal(hidden, 0, 'admin 看到所有入口和按钮');
  });
});
