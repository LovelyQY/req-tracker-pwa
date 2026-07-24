// test-batch82-registry.js
// 验证批次 82：权限注册表（RT_PERM_REGISTRY）+ 菜单种子（seedMenusFromRegistry）+ 已配置判定（isCodeConfigured）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

// 设置全局依赖
globalThis.RT_DB = require('../db.js');

// 注册 users store（permissions.js 部分函数依赖）
globalThis.RT_DB.registerStore('users', {
  keyPath: 'id',
  indexes: [
    { name: 'account', path: 'account' },
    { name: 'departmentId', path: 'departmentId' }
  ]
});

globalThis.RT_USERS = {
  getAllUsers: async function () { return []; },
  getUser: async function (id) {
    var db = await globalThis.RT_DB.openDB();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('users', 'readonly');
      var req = tx.objectStore('users').get(id);
      req.onsuccess = function () { db.close(); resolve(req.result || null); };
      req.onerror = function () { db.close(); reject(req.error); };
    });
  }
};
globalThis.getCurrentUserAccount = function () { return 'test-operator'; };

const RT_REG = require('../permissions-registry.js');
const RT_PERMISSIONS = require('../permissions.js');

const SNAKE = /^[a-z][a-z0-9_]*$/;

describe('批次82：权限注册表 + 菜单种子 + 已配置判定', () => {

  // ==================== 注册表结构完整性 ====================
  describe('注册表结构完整性', () => {
    test('展开后 code 总数 = 模块5 + 页面21 + 操作85 = 111', () => {
      const codes = RT_REG.flattenRegistryCodes();
      const mods = codes.filter(c => c.startsWith('mod_'));
      const pages = codes.filter(c => c.startsWith('page_'));
      const ops = codes.filter(c => c.startsWith('op_'));
      assert.equal(mods.length, 5, '模块数应为 5');
      assert.equal(pages.length, 21, '页面数应为 21');
      assert.equal(ops.length, 85, '操作叶子数应为 85');
      assert.equal(codes.length, 111, '总 code 数应为 111');
    });

    test('所有 code 均为 snake_case（全小写，词间单下划线）', () => {
      RT_REG.flattenRegistryCodes().forEach(c => {
        assert.ok(SNAKE.test(c), '非法 code（非 snake_case）: ' + c);
      });
    });

    test('需求任务页含 8 个生命周期操作（对照 TASK_OPERATION）', () => {
      const taskLife = [
        'op_board_task_dev_submit', 'op_board_task_test_start', 'op_board_task_pause',
        'op_board_task_resume', 'op_board_task_test_done', 'op_board_task_online',
        'op_board_task_reset', 'op_board_task_delete'
      ];
      taskLife.forEach(c => assert.ok(RT_REG.isCodeConfigured(c), '缺少任务生命周期操作: ' + c));
      // 仅这 8 个为任务生命周期（special）
      const specials = RT_REG.flattenRegistryCodes()
        .filter(c => c.startsWith('op_board_task_'))
        .filter(c => RT_REG.getRegistryEntry(c).special);
      assert.equal(specials.length, 8, '任务页特殊（生命周期）操作应为 8 个，实际 ' + specials.length);
    });

    test('三种代办类型页面各自独立且按钮集合不同', () => {
      const ti = RT_REG.flattenRegistryCodes().filter(c => c.startsWith('op_board_todo_task_item_'));
      const bug = RT_REG.flattenRegistryCodes().filter(c => c.startsWith('op_board_todo_bug_'));
      const mt = RT_REG.flattenRegistryCodes().filter(c => c.startsWith('op_board_todo_meeting_'));
      assert.equal(ti.length, 7, '任务事项操作数应为 7');
      assert.equal(bug.length, 9, '缺陷追踪操作数应为 9');
      assert.equal(mt.length, 8, '会议操作数应为 8');
      const union = new Set([...ti, ...bug, ...mt]);
      assert.equal(union.size, ti.length + bug.length + mt.length, '三类代办操作集合应互不重叠');
      // 缺陷独有 handoff/online；会议独有 cancel/end；任务事项无 handoff/online/cancel/end
      assert.ok(bug.includes('op_board_todo_bug_handoff'));
      assert.ok(bug.includes('op_board_todo_bug_online'));
      assert.ok(mt.includes('op_board_todo_meeting_cancel'));
      assert.ok(mt.includes('op_board_todo_meeting_end'));
      assert.ok(!ti.includes('op_board_todo_task_item_handoff'));
      assert.ok(!ti.includes('op_board_todo_task_item_online'));
    });

    test('报表四子页各含 view + export（每页 2 操作）', () => {
      ['task', 'bug', 'todo', 'meeting'].forEach(t => {
        const view = 'op_report_' + t + '_view';
        const exp = 'op_report_' + t + '_export';
        assert.ok(RT_REG.isCodeConfigured(view), '缺少 ' + view);
        assert.ok(RT_REG.isCodeConfigured(exp), '缺少 ' + exp);
      });
    });
  });

  // ==================== 展开 / 已配置 / 特殊判定 ====================
  describe('expandOp / isCodeConfigured / isSpecialOp', () => {
    test('expandOp 正确拼装叶子 code', () => {
      assert.equal(RT_REG.expandOp('page_company', 'delete'), 'op_company_delete');
      assert.equal(RT_REG.expandOp('page_company', 'assign_role'), 'op_company_assign_role');
      assert.equal(RT_REG.expandOp('page_board_task', 'dev_submit'), 'op_board_task_dev_submit');
      assert.equal(RT_REG.expandOp('page_board_todo_bug', 'handoff'), 'op_board_todo_bug_handoff');
      // 若动作已带 op_ 前缀也能正确去前缀
      assert.equal(RT_REG.expandOp('page_company', 'op_view'), 'op_company_view');
    });

    test('isCodeConfigured 对注册表内外 code 判定正确', () => {
      assert.equal(RT_REG.isCodeConfigured('op_company_delete'), true);
      assert.equal(RT_REG.isCodeConfigured('mod_basic'), true);
      assert.equal(RT_REG.isCodeConfigured('page_board_task'), true);
      assert.equal(RT_REG.isCodeConfigured('op_not_exist_xyz'), false);
      assert.equal(RT_REG.isCodeConfigured(''), false);
    });

    test('isSpecialOp 区分生命周期操作与基础操作', () => {
      assert.equal(RT_REG.isSpecialOp('dev_submit'), true);
      assert.equal(RT_REG.isSpecialOp('test_start'), true);
      assert.equal(RT_REG.isSpecialOp('handoff'), true);
      assert.equal(RT_REG.isSpecialOp('cancel'), true);
      assert.equal(RT_REG.isSpecialOp('view'), false);
      assert.equal(RT_REG.isSpecialOp('create'), false);
      // delete 在需求任务页即 TASK_OPERATION.DELETE（生命周期操作），故按动作名判定为 true
      assert.equal(RT_REG.isSpecialOp('delete'), true);
      assert.equal(RT_REG.isSpecialOp('op_board_task_dev_submit'), true);
    });

    test('getRegistryEntry 返回正确类型与元信息', () => {
      const op = RT_REG.getRegistryEntry('op_company_delete');
      assert.ok(op && op.type === 'op');
      assert.equal(op.pageCode, 'page_company');
      assert.equal(op.action, 'delete');
      const page = RT_REG.getRegistryEntry('page_board_task');
      assert.ok(page && page.type === 'page');
      const mod = RT_REG.getRegistryEntry('mod_basic');
      assert.ok(mod && mod.type === 'module');
      assert.equal(RT_REG.getRegistryEntry('nope'), null);
    });
  });

  // ==================== buildSeedMenus 树形 parentCode ====================
  describe('buildSeedMenus 树形 parentCode 正确', () => {
    test('节点数与注册表 code 数一致，层级与 parentCode 链正确', () => {
      const nodes = RT_REG.buildSeedMenus();
      assert.equal(nodes.length, 111, '种子节点数应等于注册表 code 数');
      const byCode = {};
      nodes.forEach(n => { byCode[n.menuCode] = n; });

      // 模块：parentCode 空，nodeType module
      const mods = nodes.filter(n => n.nodeType === 'module');
      assert.equal(mods.length, 5);
      mods.forEach(m => assert.equal(m.parentCode, ''));

      // 页面：parentCode 指向存在的模块，nodeType page
      const pages = nodes.filter(n => n.nodeType === 'page');
      assert.equal(pages.length, 21);
      pages.forEach(p => {
        assert.ok(byCode[p.parentCode] && byCode[p.parentCode].nodeType === 'module', '页面 ' + p.menuCode + ' 父节点应为模块');
      });

      // 操作：parentCode 指向存在的页面，nodeType op
      const ops = nodes.filter(n => n.nodeType === 'op');
      assert.equal(ops.length, 85);
      ops.forEach(o => {
        assert.ok(byCode[o.parentCode] && byCode[o.parentCode].nodeType === 'page', '操作 ' + o.menuCode + ' 父节点应为页面');
      });

      // menuName 不为空
      nodes.forEach(n => assert.ok(n.menuName && n.menuName.length > 0, '节点 ' + n.menuCode + ' 缺 menuName'));
    });

    test('典型节点链：op_company_delete → page_company → mod_basic', () => {
      const nodes = RT_REG.buildSeedMenus();
      const byCode = {};
      nodes.forEach(n => { byCode[n.menuCode] = n; });
      const op = byCode['op_company_delete'];
      assert.equal(op.parentNodeCode || op.parentCode, 'page_company');
      assert.equal(byCode['page_company'].parentCode, 'mod_basic');
      assert.equal(byCode['mod_basic'].parentCode, '');
    });
  });

  // ==================== seedMenusFromRegistry 幂等播种 ====================
  describe('seedMenusFromRegistry 幂等播种', () => {
    test('首次播种创建全部节点，二次播种全部跳过（幂等）', async () => {
      const r1 = await RT_PERMISSIONS.seedMenusFromRegistry('system');
      assert.equal(r1.created, 111, '首次应创建 111 个节点，实际 ' + r1.created);
      assert.equal(r1.skipped, 0);

      const r2 = await RT_PERMISSIONS.seedMenusFromRegistry('system');
      assert.equal(r2.created, 0, '二次播种不应再创建');
      assert.equal(r2.skipped, 111, '二次播种应全部跳过');
    });

    test('播种后 menus 表节点数与注册表一致，且全部为已配置 code', async () => {
      await RT_PERMISSIONS.seedMenusFromRegistry('system');
      const all = await RT_PERMISSIONS.getAllMenus();
      assert.equal(all.length, 111, 'menus 表应有 111 个节点');
      all.forEach(m => {
        assert.ok(RT_REG.isCodeConfigured(m.menuCode), '菜单节点 ' + m.menuCode + ' 不在注册表中（应为已配置）');
      });
    });

    test('播种后可构建树：5 个模块根，模块含正确页面，页面含操作', async () => {
      await RT_PERMISSIONS.seedMenusFromRegistry('system');
      const all = await RT_PERMISSIONS.getAllMenus();
      const tree = RT_PERMISSIONS.buildMenuTree(all);
      assert.equal(tree.length, 5, '应有 5 个模块根节点');

      const basic = tree.find(n => n.menuCode === 'mod_basic');
      assert.ok(basic, '应有 mod_basic');
      const companyPage = basic.children.find(p => p.menuCode === 'page_company');
      assert.ok(companyPage, 'mod_basic 下应有 page_company');
      const deleteOp = companyPage.children.find(o => o.menuCode === 'op_company_delete');
      assert.ok(deleteOp, 'page_company 下应有 op_company_delete');
      assert.equal(deleteOp.nodeType, 'op');
    });

    test('重复多次播种后 menus 表行数保持稳定（不重复插入）', async () => {
      await RT_PERMISSIONS.seedMenusFromRegistry('system');
      await RT_PERMISSIONS.seedMenusFromRegistry('system');
      await RT_PERMISSIONS.seedMenusFromRegistry('system');
      const all = await RT_PERMISSIONS.getAllMenus();
      assert.equal(all.length, 111);

      // menuCode 唯一
      const codes = all.map(m => m.menuCode);
      assert.equal(new Set(codes).size, codes.length, 'menuCode 不应重复');
    });
  });
});
