// test-batch207-perm-restructure.js
// Batch 207（#14 权限管理重构）：注册表重构为「看板 / 设置」两模块树，
// 菜单名与顺序对齐导航；叶子权限码保持历史稳定（现有 data-perm 全部命中）。
// 覆盖：纯注册表结构 + 种子 parentCode 链 + 旧模块清理（DB 播种迁移）。
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

const REG = require('../permissions-registry.js');
const RT_REG = globalThis.RT_PERM_REGISTRY_API;

// ============ 纯注册表结构（无需 DB） ============
describe('批次207 #14：注册表两模块树（看板 / 设置）', () => {
  test('RT_PERM_REGISTRY 仅含两模块：mod_board(看板) / mod_settings(设置)，顺序一致', () => {
    const codes = RT_REG.flattenRegistryCodes();
    const mods = RT_REG.RT_PERM_REGISTRY;
    assert.equal(mods.length, 2, '顶层应仅 2 个模块');
    assert.equal(mods[0].code, 'mod_board');
    assert.equal(mods[0].name, '看板');
    assert.equal(mods[1].code, 'mod_settings');
    assert.equal(mods[1].name, '设置');
  });

  test('看板模块含：首页 / 任务 / 代办(分组) / 日历 / 反馈', () => {
    const board = RT_REG.RT_PERM_REGISTRY[0];
    const childCodes = board.children.map(c => c.code);
    assert.ok(childCodes.indexOf('page_home') >= 0, '应有 首页');
    assert.ok(childCodes.indexOf('page_board_task') >= 0, '应有 任务');
    assert.ok(childCodes.indexOf('page_todo') >= 0, '应有 代办（分组页）');
    assert.ok(childCodes.indexOf('page_calendar') >= 0, '应有 日历');
    assert.ok(childCodes.indexOf('page_feedback') >= 0, '应有 反馈');
    // 代办分组下含三种代办页面
    const todo = board.children.find(c => c.code === 'page_todo');
    const todoKids = todo.children.map(c => c.code).sort();
    assert.deepEqual(todoKids, ['page_board_todo_bug', 'page_board_todo_meeting', 'page_board_todo_task_item']);
  });

  test('设置模块含：个人信息 / 账号与安全 / 基础数据(分组) / 统计报表(分组) / 存储与备份 / 设置 / 关于', () => {
    const settings = RT_REG.RT_PERM_REGISTRY[1];
    const childCodes = settings.children.map(c => c.code);
    ['page_profile', 'page_security', 'page_basic_data', 'page_report', 'page_storage', 'page_settings', 'page_about']
      .forEach(function (c) {
        assert.ok(childCodes.indexOf(c) >= 0, '设置下应含 ' + c);
      });
    // 基础数据分组含 12 个基础页面
    const basic = settings.children.find(c => c.code === 'page_basic_data');
    const basicKids = basic.children.map(c => c.code).sort();
    assert.deepEqual(basicKids, [
      'page_company', 'page_dept', 'page_dict', 'page_icon_manager', 'page_perm',
      'page_position', 'page_process', 'page_process_instance', 'page_project', 'page_project_ver', 'page_role', 'page_user', 'page_workflow'
    ]);
    // 统计报表分组含 5 个统计页面
    const report = settings.children.find(c => c.code === 'page_report');
    const reportKids = report.children.map(c => c.code).sort();
    assert.deepEqual(reportKids, [
      'page_report_bug', 'page_report_meeting', 'page_report_stats', 'page_report_task', 'page_report_todo'
    ]);
  });

  test('buildSeedMenus 的 parentCode 链正确（支持分组嵌套）', () => {
    const nodes = RT_REG.buildSeedMenus();
    const byCode = {};
    nodes.forEach(n => { byCode[n.menuCode] = n; });
    assert.equal(byCode['page_company'].parentCode, 'page_basic_data');
    assert.equal(byCode['page_basic_data'].parentCode, 'mod_settings');
    assert.equal(byCode['page_board_task'].parentCode, 'mod_board');
    assert.equal(byCode['page_board_todo_task_item'].parentCode, 'page_todo');
    assert.equal(byCode['page_todo'].parentCode, 'mod_board');
    assert.equal(byCode['page_calendar'].parentCode, 'mod_board');
    assert.equal(byCode['page_feedback'].parentCode, 'mod_board');
    assert.equal(byCode['page_report_task'].parentCode, 'page_report');
    assert.equal(byCode['page_report'].parentCode, 'mod_settings');
    assert.equal(byCode['page_profile'].parentCode, 'mod_settings');
    assert.equal(byCode['page_security'].parentCode, 'mod_settings');
    assert.equal(byCode['page_settings'].parentCode, 'mod_settings');
    assert.equal(byCode['page_about'].parentCode, 'mod_settings');
    assert.equal(byCode['op_company_delete'].parentCode, 'page_company');
    // 每个种子节点带数字 sortOrder
    nodes.forEach(n => assert.equal(typeof n.sortOrder, 'number', '节点 ' + n.menuCode + ' 应有 sortOrder'));
  });

  test('历史 op 叶子 code 全部保留（现有各页 data-perm 仍命中注册表）', () => {
    const codes = RT_REG.flattenRegistryCodes();
    const legacy = [
      'op_company_view', 'op_company_delete', 'op_dept_view', 'op_position_edit',
      'op_user_create', 'op_user_assign_role', 'op_role_delete', 'op_perm_enable',
      'op_project_ver_create', 'op_board_task_create', 'op_board_task_dev_submit',
      'op_board_todo_task_item_create', 'op_board_todo_bug_handoff', 'op_board_todo_meeting_cancel',
      'op_report_task_view', 'op_report_bug_export', 'op_report_stats_export',
      'op_process_delete', 'op_workflow_edit', 'op_icon_manager_edit',
      'op_security_edit', 'op_storage_view', 'op_feedback_list', 'op_profile_edit'
    ];
    legacy.forEach(function (c) {
      assert.ok(codes.indexOf(c) >= 0, '历史 code 必须保留：' + c);
      assert.equal(RT_REG.isCodeConfigured(c), true, c + ' 应为已配置');
    });
    // 旧顶层模块码已移除
    ['mod_basic', 'mod_report', 'mod_me', 'mod_sys', 'mod_feedback'].forEach(function (c) {
      assert.equal(codes.indexOf(c) >= 0, false, '旧模块 ' + c + ' 应从注册表移除');
    });
  });
});

// ============ DB 播种迁移（重挂父节点 + 清理旧模块） ============
globalThis.RT_DB = require('../db.js');
globalThis.RT_DB.registerStore('users', {
  keyPath: 'id',
  indexes: [
    { name: 'account', path: 'account' },
    { name: 'departmentId', path: 'departmentId' }
  ]
});
require('../users.js');
const RT = require('../permissions.js');
const RT_PERM = RT.RT_PERM;
globalThis.getCurrentUserAccount = function () { return 'test-operator'; };

describe('批次207 #14：播种迁移（旧数据重挂到新树 + 清理旧模块）', () => {
  before(async function () {
    await globalThis.RT_USERS.ensureDefaultAdminRole({
      account: 'admin', password: '123', nickname: '管理员', operator: 'system'
    });
    await RT.seedMenusFromRegistry('system');
  });

  test('menus 总数为 141，且全部为已配置 code', async () => {
    const all = await RT.getAllMenus();
    assert.equal(all.length, 141, 'menus 总数应为 141（2 模块 + 33 页面 + 106 操作）');
    all.forEach(m => assert.ok(RT_REG.isCodeConfigured(m.menuCode), '菜单 ' + m.menuCode + ' 应在注册表中'));
  });

  test('旧模块 mod_basic/mod_report/mod_me/mod_sys/mod_feedback 已被清理', async () => {
    const all = await RT.getAllMenus();
    const codes = all.map(m => m.menuCode);
    ['mod_basic', 'mod_report', 'mod_me', 'mod_sys', 'mod_feedback'].forEach(function (c) {
      assert.equal(codes.indexOf(c) >= 0, false, '应已清理旧模块 ' + c);
    });
  });

  test('树仅 2 根（看板 / 设置），且 公司管理 重挂到 基础数据 分组页下', async () => {
    const all = await RT.getAllMenus();
    const tree = RT.buildMenuTree(all);
    assert.equal(tree.length, 2, '应仅 2 个模块根');
    const settings = tree.find(n => n.menuCode === 'mod_settings');
    assert.ok(settings, '应有 mod_settings 根');
    const basic = settings.children.find(p => p.menuCode === 'page_basic_data');
    assert.ok(basic, 'mod_settings 下应有 page_basic_data');
    const company = basic.children.find(p => p.menuCode === 'page_company');
    assert.ok(company, 'page_basic_data 下应有 page_company（已重挂）');
    const delOp = company.children.find(o => o.menuCode === 'op_company_delete');
    assert.ok(delOp, 'page_company 下应有 op_company_delete');
    // 反馈已重挂到看板
    const board = tree.find(n => n.menuCode === 'mod_board');
    assert.ok(board.children.find(p => p.menuCode === 'page_feedback'), '看板下应有 page_feedback（已重挂）');
  });

  test('幂等：再次播种不新增、不重复（清理旧模块仍稳定）', async () => {
    const before = (await RT.getAllMenus()).length;
    assert.equal(before, 141);
    await RT.seedMenusFromRegistry('system');
    const after = (await RT.getAllMenus()).length;
    assert.equal(after, before, '重复播种后菜单数应保持不变');
  });

  test('admin 对重挂后的 op 仍拥有权限', async () => {
    assert.equal(await RT_PERM.can('admin', 'op_company_delete'), true);
    assert.equal(await RT_PERM.can('admin', 'op_board_todo_bug_handoff'), true);
    assert.equal(await RT_PERM.can('admin', 'op_report_stats_export'), true);
  });
});
