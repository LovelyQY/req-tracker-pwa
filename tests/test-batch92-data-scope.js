// test-batch92-data-scope.js — 批次92：数据权限核心（部门子树 + 列表过滤）
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
require('../config.js');
require('../permissions-registry.js');
require('../permissions.js');
require('../departments.js');
require('../users.js');
require('../companies.js');
require('../projects.js');
require('../requirement-tasks.js');

const RT_PERM = globalThis.RT_PERM;
const RT_DEPTS = globalThis.RT_DEPTS;
const RT_USERS = globalThis.RT_USERS;
const RT_PROJECTS = globalThis.RT_PROJECTS;
const RT_TASKS = globalThis.RT_REQUIREMENT_TASKS;
const RT_PERMISSIONS = globalThis.RT_PERMISSIONS;
const RT_COMPANIES = globalThis.RT_COMPANIES;

function uid() { return Math.random().toString(36).slice(2, 9); }

// ---- helpers ----
async function seedDepts() {
  var prefix = uid().slice(0, 5);
  // Create company
  var co = await RT_COMPANIES.createCompany({ companyName: '公司_' + prefix, companyType: '总公司', companyCode: 'C' + prefix.slice(0, 4) }, 'tester');
  // Create departments with hierarchy
  var root = await RT_DEPTS.createDept({ deptName: '根部门_' + prefix, deptCode: 'DR' + prefix.slice(0, 3), companyId: co.id, parentId: '' }, 'tester');
  var child1 = await RT_DEPTS.createDept({ deptName: '子部门A_' + prefix, deptCode: 'DA' + prefix.slice(0, 3), companyId: co.id, parentId: root.id }, 'tester');
  var child2 = await RT_DEPTS.createDept({ deptName: '子部门B_' + prefix, deptCode: 'DB' + prefix.slice(0, 3), companyId: co.id, parentId: root.id }, 'tester');
  var grandchild = await RT_DEPTS.createDept({ deptName: '孙部门_' + prefix, deptCode: 'DG' + prefix.slice(0, 3), companyId: co.id, parentId: child1.id }, 'tester');
  var other = await RT_DEPTS.createDept({ deptName: '其他部门_' + prefix, deptCode: 'DO' + prefix.slice(0, 3), companyId: co.id, parentId: '' }, 'tester');
  return { company: co, root: root, child1: child1, child2: child2, grandchild: grandchild, other: other };
}

async function seedUserInDept(deptId, perms) {
  var u = await RT_USERS.createPerson({ employeeNo: 'E92_' + uid(), name: '测试用户', departmentId: deptId, personStatusCode: 'REGULAR' }, 'tester');
  // Assign role with specified perms
  var role = await RT_PERMISSIONS.createRole({ roleName: '角色_' + uid(), enabled: true, menuCodes: perms || [] }, 'tester');
  await RT_PERMISSIONS.saveUserRoles(u.id, [role.id], 'tester');
  return { user: u, role: role };
}

describe('Batch92: 数据权限核心', () => {
  test('getVisibleDeptIds — 管理员返回 null（全量）', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    globalThis.getCurrentUserAccount = function () { return 'admin'; };
    var ids = await RT_PERM.getVisibleDeptIds('admin');
    assert.equal(ids, null, 'admin → null = 全量');
  });

  test('getVisibleDeptIds — 普通用户返回自身 + 所有下级部门', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var depts = await seedDepts();
    var s = await seedUserInDept(depts.root.id, []);
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    var ids = await RT_PERM.getVisibleDeptIds(s.user.account);
    assert.ok(ids instanceof Set, '返回 Set');
    assert.equal(ids.size, 4, '根部门 + 2子 + 1孙 = 4');
    assert.ok(ids.has(depts.root.id), '含自身');
    assert.ok(ids.has(depts.child1.id), '含子部门A');
    assert.ok(ids.has(depts.child2.id), '含子部门B');
    assert.ok(ids.has(depts.grandchild.id), '含孙部门');
    assert.ok(!ids.has(depts.other.id), '不含兄弟部门');

    // Cleanup
    await RT_USERS.deleteUser(s.user.id);
    try { await RT_PERMISSIONS.deleteRole(s.role.id); } catch (e) {}
  });

  test('getVisibleDeptIds — 叶子部门用户只看到自身', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var depts = await seedDepts();
    var s = await seedUserInDept(depts.grandchild.id, []);
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    var ids = await RT_PERM.getVisibleDeptIds(s.user.account);
    assert.equal(ids.size, 1, '叶子部门 → 仅自身');
    assert.ok(ids.has(depts.grandchild.id));

    await RT_USERS.deleteUser(s.user.id);
    try { await RT_PERMISSIONS.deleteRole(s.role.id); } catch (e) {}
  });

  test('getAllDepartments(deptFilter) — 按部门集合过滤', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var depts = await seedDepts();
    var filter = new Set([depts.child1.id, depts.child2.id]);

    var list = await RT_DEPTS.getAllDepartments(filter);
    assert.equal(list.length, 2, '只返回过滤后的 2 个部门');
    var ids = list.map(function (d) { return d.id; });
    assert.ok(ids.indexOf(depts.child1.id) !== -1);
    assert.ok(ids.indexOf(depts.child2.id) !== -1);
    assert.ok(ids.indexOf(depts.root.id) === -1, '根部门被过滤');
    assert.ok(ids.indexOf(depts.other.id) === -1, '其他部门被过滤');
  });

  test('getAllDepartments() — 无参数时返回全部（向后兼容）', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var depts = await seedDepts();
    var list = await RT_DEPTS.getAllDepartments();
    assert.ok(list.length >= 5, '无 filter 返回全部部门');
  });

  test('getAllUsers(deptFilter) — 按部门过滤用户', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var depts = await seedDepts();
    var s1 = await seedUserInDept(depts.child1.id, []);
    var s2 = await seedUserInDept(depts.other.id, []);

    var filter = new Set([depts.child1.id, depts.child2.id]);
    var list = await RT_USERS.getAllUsers(filter);
    var ids = list.map(function (u) { return u.id; });
    assert.ok(ids.indexOf(s1.user.id) !== -1, '用户1在可见部门');
    assert.ok(ids.indexOf(s2.user.id) === -1, '用户2在其他部门→过滤');

    await RT_USERS.deleteUser(s1.user.id);
    await RT_USERS.deleteUser(s2.user.id);
    try { await RT_PERMISSIONS.deleteRole(s1.role.id); } catch (e) {}
    try { await RT_PERMISSIONS.deleteRole(s2.role.id); } catch (e) {}
  });

  test('getAllProjects(deptFilter) — 按部门过滤项目', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var depts = await seedDepts();
    var p1 = await RT_PROJECTS.createProject({ projectName: '项目A_' + uid(), projectCode: 'PA', deptId: depts.child1.id }, 'tester');
    var p2 = await RT_PROJECTS.createProject({ projectName: '项目B_' + uid(), projectCode: 'PB', deptId: depts.other.id }, 'tester');

    var filter = new Set([depts.child1.id, depts.child2.id]);
    var list = await RT_PROJECTS.getAllProjects(filter);
    var ids = list.map(function (p) { return p.id; });
    assert.ok(ids.indexOf(p1.id) !== -1, '项目1在可见部门');
    assert.ok(ids.indexOf(p2.id) === -1, '项目2在其他部门→过滤');

    await RT_PROJECTS.deleteProject(p1.id);
    await RT_PROJECTS.deleteProject(p2.id);
  });

  test('featureFlag dataPermission 默认开启', () => {
    var cfg = globalThis.RT_CONFIG;
    assert.ok(cfg, 'RT_CONFIG 存在');
    assert.ok(cfg.featureFlags, 'featureFlags 存在');
    assert.strictEqual(cfg.featureFlags.dataPermission, true, 'dataPermission 默认开启');
  });
});
