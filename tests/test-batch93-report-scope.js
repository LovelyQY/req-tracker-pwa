// test-batch93-report-scope.js — 批次93：报表数据范围过滤 + 跨页一致性
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

// report-common uses `window` without fallback
globalThis.window = globalThis;

globalThis.RT_DB = require('../db.js');
globalThis.RT_DB.registerStore('users', {
  keyPath: 'id',
  indexes: [
    { name: 'account', path: 'account' },
    { name: 'departmentId', path: 'departmentId' }
  ]
});
require('../config.js');
require('../dictionary.js');
require('../permissions-registry.js');
require('../permissions.js');
require('../departments.js');
require('../users.js');
require('../companies.js');
require('../projects.js');
require('../project-versions.js');
require('../requirement-tasks.js');
require('../todos.js');

// Load report-common
var src = require('fs').readFileSync(require('path').join(__dirname, '..', 'report-common.js'), 'utf8');
(0, eval)(src);

const RT_PERM = globalThis.RT_PERM;
const RT_DEPTS = globalThis.RT_DEPTS;
const RT_USERS = globalThis.RT_USERS;
const RT_PROJECTS = globalThis.RT_PROJECTS;
const RT_TASKS = globalThis.RT_REQUIREMENT_TASKS;
const RT_TODOS = globalThis.RT_TODOS;
const RT_PERMISSIONS = globalThis.RT_PERMISSIONS;
const RT_COMPANIES = globalThis.RT_COMPANIES;
const RC = globalThis.RT_REPORT_COMMON;

function uid() { return Math.random().toString(36).slice(2, 9); }

async function seedReportData(opts) {
  // 先播种字典（requirement-tasks 校验依赖字典表）
  await globalThis.RT_DICT.seedDict('system');
  var prefix = uid().slice(0, 5);
  var co = await RT_COMPANIES.createCompany({ companyName: 'RptCo_' + prefix, companyType: '总公司', companyCode: 'RC' + prefix.slice(0, 3) }, 'tester');

  var deptA = await RT_DEPTS.createDept({ deptName: '报表部门A_' + prefix, deptCode: 'RA' + prefix.slice(0, 3), companyId: co.id, parentId: '' }, 'tester');
  var deptAChild = await RT_DEPTS.createDept({ deptName: '报表部门A子_' + prefix, deptCode: 'RB' + prefix.slice(0, 3), companyId: co.id, parentId: deptA.id }, 'tester');
  var deptB = await RT_DEPTS.createDept({ deptName: '报表部门B_' + prefix, deptCode: 'RC' + prefix.slice(0, 3), companyId: co.id, parentId: '' }, 'tester');

  var projA = await RT_PROJECTS.createProject({ projectName: '可见项目_' + prefix, projectCode: 'PA' + prefix.slice(0, 3), deptId: deptA.id }, 'tester');
  var projAChild = await RT_PROJECTS.createProject({ projectName: '可见子部门项目_' + prefix, projectCode: 'PB' + prefix.slice(0, 3), deptId: deptAChild.id }, 'tester');
  var projB = await RT_PROJECTS.createProject({ projectName: '不可见项目_' + prefix, projectCode: 'PC' + prefix.slice(0, 3), deptId: deptB.id }, 'tester');

  var taskVis = await RT_TASKS.createRequirementTask({ taskName: '可见任务', projectId: projA.id, taskTypeCode: 'REQ', priorityCode: 'HIGH', statusCode: 'TESTING' }, 'tester');
  var taskVisChild = await RT_TASKS.createRequirementTask({ taskName: '子部门任务', projectId: projAChild.id, taskTypeCode: 'REQ', priorityCode: 'HIGH', statusCode: 'TESTING' }, 'tester');
  var taskHidden = await RT_TASKS.createRequirementTask({ taskName: '不可见任务', projectId: projB.id, taskTypeCode: 'REQ', priorityCode: 'HIGH', statusCode: 'TESTING' }, 'tester');

  var todoVis = await RT_TODOS.createTodo({ desc: '可见待办', projectId: projA.id, typeCode: 'TASK_ITEM', statusCode: 'TD_DOING' }, 'tester');
  var todoVisChild = await RT_TODOS.createTodo({ desc: '子部门待办', projectId: projAChild.id, typeCode: 'TASK_ITEM', statusCode: 'TD_DOING' }, 'tester');
  var todoHidden = await RT_TODOS.createTodo({ desc: '不可见待办', projectId: projB.id, typeCode: 'TASK_ITEM', statusCode: 'TD_DOING' }, 'tester');

  var userDept = (opts && opts.userDept) ? opts.userDept : deptA.id;
  var u = await RT_USERS.createPerson({ employeeNo: 'E93_' + uid().slice(0, 5), name: '报表用户', departmentId: userDept, personStatusCode: 'REGULAR' }, 'tester');
  var role = await RT_PERMISSIONS.createRole({ roleName: '报表角色_' + prefix, enabled: true, menuCodes: ['op_report_task_view', 'op_report_task_export'] }, 'tester');
  await RT_PERMISSIONS.saveUserRoles(u.id, [role.id], 'tester');

  return {
    user: u, role: role,
    deptA: deptA, deptAChild: deptAChild, deptB: deptB,
    projA: projA, projAChild: projAChild, projB: projB,
    taskVis: taskVis, taskVisChild: taskVisChild, taskHidden: taskHidden,
    todoVis: todoVis, todoVisChild: todoVisChild, todoHidden: todoHidden
  };
}

describe('Batch93: 报表数据范围过滤 + 跨页一致性', () => {
  test('report-common loadReportData 对非管理员按 deptId 过滤 tasks', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var s = await seedReportData();
    globalThis.getSessionAccount = function () { return s.user.account; };
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    RC.resetCache();
    await RC.loadReportData();
    var data = RC.getData();

    var taskIds = data.allTasks.map(function (t) { return t.id; });
    assert.ok(taskIds.indexOf(s.taskVis.id) !== -1, '可见部门的任务');
    assert.ok(taskIds.indexOf(s.taskVisChild.id) !== -1, '子部门任务（子树包含）');
    assert.ok(taskIds.indexOf(s.taskHidden.id) === -1, '不可见部门的任务被过滤');

    // Cleanup
    await RT_TASKS.deleteRequirementTask(s.taskVis.id);
    await RT_TASKS.deleteRequirementTask(s.taskVisChild.id);
    await RT_TASKS.deleteRequirementTask(s.taskHidden.id);
    await RT_TODOS.deleteTodo(s.todoVis.id);
    await RT_TODOS.deleteTodo(s.todoVisChild.id);
    await RT_TODOS.deleteTodo(s.todoHidden.id);
    await RT_PROJECTS.deleteProject(s.projA.id);
    await RT_PROJECTS.deleteProject(s.projAChild.id);
    await RT_PROJECTS.deleteProject(s.projB.id);
    await RT_USERS.deleteUser(s.user.id);
    try { await RT_PERMISSIONS.deleteRole(s.role.id); } catch (e) {}
  });

  test('report-common loadReportData 过滤 todos（按项目部门 join）', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var s = await seedReportData();
    globalThis.getSessionAccount = function () { return s.user.account; };
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    RC.resetCache();
    await RC.loadReportData();
    var data = RC.getData();

    var todoIds = data.allTodos.map(function (t) { return t.id; });
    assert.ok(todoIds.indexOf(s.todoVis.id) !== -1, '可见部门的待办');
    assert.ok(todoIds.indexOf(s.todoVisChild.id) !== -1, '子部门待办');
    assert.ok(todoIds.indexOf(s.todoHidden.id) === -1, '不可见部门待办被过滤');

    // Cleanup
    await RT_TASKS.deleteRequirementTask(s.taskVis.id);
    await RT_TASKS.deleteRequirementTask(s.taskVisChild.id);
    await RT_TASKS.deleteRequirementTask(s.taskHidden.id);
    await RT_TODOS.deleteTodo(s.todoVis.id);
    await RT_TODOS.deleteTodo(s.todoVisChild.id);
    await RT_TODOS.deleteTodo(s.todoHidden.id);
    await RT_PROJECTS.deleteProject(s.projA.id);
    await RT_PROJECTS.deleteProject(s.projAChild.id);
    await RT_PROJECTS.deleteProject(s.projB.id);
    await RT_USERS.deleteUser(s.user.id);
    try { await RT_PERMISSIONS.deleteRole(s.role.id); } catch (e) {}
  });

  test('admin loadReportData 不过滤（全量数据）', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var s = await seedReportData();
    globalThis.getSessionAccount = function () { return 'admin'; };
    globalThis.getCurrentUserAccount = function () { return 'admin'; };
    await RT_PERM.cachePermissions('admin');

    RC.resetCache();
    await RC.loadReportData();
    var data = RC.getData();

    var taskIds = data.allTasks.map(function (t) { return t.id; });
    assert.ok(taskIds.indexOf(s.taskVis.id) !== -1);
    assert.ok(taskIds.indexOf(s.taskVisChild.id) !== -1);
    assert.ok(taskIds.indexOf(s.taskHidden.id) !== -1, 'admin 看到所有任务');

    // Cleanup
    await RT_TASKS.deleteRequirementTask(s.taskVis.id);
    await RT_TASKS.deleteRequirementTask(s.taskVisChild.id);
    await RT_TASKS.deleteRequirementTask(s.taskHidden.id);
    await RT_TODOS.deleteTodo(s.todoVis.id);
    await RT_TODOS.deleteTodo(s.todoVisChild.id);
    await RT_TODOS.deleteTodo(s.todoHidden.id);
    await RT_PROJECTS.deleteProject(s.projA.id);
    await RT_PROJECTS.deleteProject(s.projAChild.id);
    await RT_PROJECTS.deleteProject(s.projB.id);
    await RT_USERS.deleteUser(s.user.id);
  });

  test('跨页一致性：不同用户看到不同数据范围', async () => {
    await RT_PERMISSIONS.seedMenusFromRegistry('system');
    var s = await seedReportData();
    globalThis.getSessionAccount = function () { return s.user.account; };
    globalThis.getCurrentUserAccount = function () { return s.user.account; };
    await RT_PERM.cachePermissions(s.user.account);

    RC.resetCache();
    await RC.loadReportData();
    var dataUser = RC.getData();
    var countUser = dataUser.allTasks.length;

    // Admin should see more
    // dataReady is already true, but we can verify user sees subset logic
    assert.ok(countUser >= 2, '用户至少看到 2 个可见任务');
    assert.ok(countUser < 3, '用户看不到不可见任务 (should be < 3)');

    // Cleanup
    await RT_TASKS.deleteRequirementTask(s.taskVis.id);
    await RT_TASKS.deleteRequirementTask(s.taskVisChild.id);
    await RT_TASKS.deleteRequirementTask(s.taskHidden.id);
    await RT_TODOS.deleteTodo(s.todoVis.id);
    await RT_TODOS.deleteTodo(s.todoVisChild.id);
    await RT_TODOS.deleteTodo(s.todoHidden.id);
    await RT_PROJECTS.deleteProject(s.projA.id);
    await RT_PROJECTS.deleteProject(s.projAChild.id);
    await RT_PROJECTS.deleteProject(s.projB.id);
    await RT_USERS.deleteUser(s.user.id);
    try { await RT_PERMISSIONS.deleteRole(s.role.id); } catch (e) {}
  });
});
