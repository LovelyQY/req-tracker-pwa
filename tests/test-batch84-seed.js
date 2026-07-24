// test-batch84-seed.js
// Verify Batch 84: system-admin default role seeding + startup wiring.
// Focus: idempotency (repeated calls do not duplicate role/menu/binding),
// and `admin` resolves as isAdmin true + can(<any code>) true after seeding.
const { test, describe, before } = require('node:test');
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
const RT = require('../permissions.js');
require('../users.js');
const RT_PERM = RT.RT_PERM;
const REG = globalThis.RT_PERM_REGISTRY_API;

globalThis.getCurrentUserAccount = function () { return 'test-operator'; };

const ROLE_NAME = '系统管理员';
const ADMIN_ACCOUNT = 'admin';

// Mirror login/classic.html seedPermissionBasics(): role first, then menus.
async function seedPermissionBasics() {
  await globalThis.RT_USERS.ensureDefaultAdminRole({
    account: ADMIN_ACCOUNT, password: '123', nickname: '管理员', operator: 'system'
  });
  await RT.seedMenusFromRegistry('system');
}

function sameSet(a, b) {
  a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
  if (a.length !== b.length) return false;
  var sa = {}; a.forEach(function (x) { sa[x] = 1; });
  for (var i = 0; i < b.length; i++) { if (!sa[b[i]]) return false; }
  return true;
}

describe('批次84：系统管理员默认角色播种 + 启动串联', () => {

  before(async function () {
    await seedPermissionBasics();
  });

  describe('播种基线', () => {
    test('存在唯一「系统管理员」角色且为系统管理员/启用/全量权限', async () => {
      const all = await RT.getAllRoles();
      const sysRoles = all.filter(r => r.roleName === ROLE_NAME);
      assert.equal(sysRoles.length, 1, '应仅有 1 个系统管理员角色');
      const role = sysRoles[0];
      assert.equal(role.isSystemAdmin, true);
      assert.equal(role.enabled, true);
      const allCodes = REG.flattenRegistryCodes();
      assert.equal(sameSet(role.menuCodes, allCodes), true, 'menuCodes 应等于注册表全量 code');
    });

    test('admin 账号存在且已绑定系统管理员角色（roleIds 不重复）', async () => {
      const admin = await globalThis.RT_USERS.getUserByAccount(ADMIN_ACCOUNT);
      assert.ok(admin, 'admin 账号应存在');
      assert.ok(Array.isArray(admin.roleIds), 'roleIds 应为数组');
      const role = await RT.getRoleByName(ROLE_NAME);
      const count = admin.roleIds.filter(id => id === role.id).length;
      assert.equal(count, 1, '系统管理员角色在 roleIds 中应恰好出现 1 次（去重）');
    });

    test('menus 已按注册表全量播种（5 模块 + 21 页面 + 85 操作 = 111）', async () => {
      const menus = await RT.getAllMenus();
      assert.equal(menus.length, 111, 'menus 总数应为 111');
      const codes = menus.map(m => m.menuCode).sort();
      const allCodes = REG.flattenRegistryCodes().sort();
      assert.equal(sameSet(codes, allCodes), true, 'menuCode 集合应等于注册表全量 code');
    });
  });

  describe('幂等：重复调用不重复', () => {
    test('多次调用 ensureDefaultAdminRole：角色仍唯一、绑定仍唯一', async () => {
      const before = await RT.getRoleByName(ROLE_NAME);
      assert.ok(before);
      for (let i = 0; i < 3; i++) {
        await globalThis.RT_USERS.ensureDefaultAdminRole({ account: ADMIN_ACCOUNT, operator: 'system' });
      }
      const all = await RT.getAllRoles();
      const sysRoles = all.filter(r => r.roleName === ROLE_NAME);
      assert.equal(sysRoles.length, 1, '重复调用后系统管理员角色仍唯一');
      const admin = await globalThis.RT_USERS.getUserByAccount(ADMIN_ACCOUNT);
      const count = admin.roleIds.filter(id => id === before.id).length;
      assert.equal(count, 1, '重复调用后绑定仍唯一');
      assert.equal(sameSet(sysRoles[0].menuCodes, REG.flattenRegistryCodes()), true, '权限集保持全量');
    });

    test('多次调用 seedMenusFromRegistry：菜单数不变（不重复播种）', async () => {
      const before = (await RT.getAllMenus()).length;
      assert.equal(before, 111);
      for (let i = 0; i < 3; i++) {
        await RT.seedMenusFromRegistry('system');
      }
      const after = (await RT.getAllMenus()).length;
      assert.equal(after, before, '重复播种后菜单数应保持不变');
    });
  });

  describe('admin 权限解析', () => {
    test("RT_PERM.isAdmin('admin') 为 true", async () => {
      assert.equal(await RT_PERM.isAdmin(ADMIN_ACCOUNT), true);
    });
    test('RT_PERM.can 任意注册表 code 均为 true', async () => {
      const codes = ['op_company_delete', 'op_board_task_dev_submit', 'op_board_todo_bug_handoff', 'op_report_task_export', 'op_me_profile_edit'];
      for (const c of codes) {
        assert.equal(await RT_PERM.can(ADMIN_ACCOUNT, c), true, 'admin 应具有 code: ' + c);
      }
    });
    test('getDataScope：admin 为全量（deptId=null, includeSub=true）', async () => {
      const scope = await RT_PERM.getDataScope(ADMIN_ACCOUNT);
      assert.equal(scope.deptId, null, 'admin 数据范围应为全量');
      assert.equal(scope.includeSub, true);
    });
  });
});
