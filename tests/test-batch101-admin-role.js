// test-batch101-admin-role.js
// 批次101回归：role.html / permission.html 入口自动播种管理员角色
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
const REG = globalThis.RT_PERM_REGISTRY_API;

globalThis.getCurrentUserAccount = function () { return 'test'; };

const ROLE_NAME = '系统管理员';
const ADMIN_ACCOUNT = 'admin';

// 模拟批次101入口逻辑：role.html + permission.html init() 调用的链
async function entrySeed() {
  if (typeof globalThis.RT_USERS !== 'undefined' && globalThis.RT_USERS.ensureDefaultAdminRole) {
    await globalThis.RT_USERS.ensureDefaultAdminRole({
      account: ADMIN_ACCOUNT, password: '123', nickname: '管理员', operator: 'system'
    });
  }
  if (typeof RT !== 'undefined' && RT.seedMenusFromRegistry) {
    await RT.seedMenusFromRegistry('system');
  }
}

describe('批次101：入口自动播种管理员角色', () => {
  before(async function () {
    await entrySeed();
  });

  test('入口调用后系统管理员角色存在且为系统管理员', async () => {
    const role = await RT.getRoleByName(ROLE_NAME);
    assert.ok(role, '系统管理员角色应存在');
    assert.equal(role.isSystemAdmin, true);
    assert.equal(role.enabled, true);
  });

  test('系统管理员角色拥有全量注册表权限码', async () => {
    const role = await RT.getRoleByName(ROLE_NAME);
    const allCodes = REG.flattenRegistryCodes();
    assert.ok(Array.isArray(role.menuCodes));
    // 不是严格相等但应包含所有注册表 code
    for (const code of allCodes) {
      assert.ok(role.menuCodes.includes(code),
        `系统管理员角色应包含权限码 ${code}`);
    }
  });

  test('admin 账号已绑定系统管理员角色', async () => {
    const admin = await globalThis.RT_USERS.getUserByAccount(ADMIN_ACCOUNT);
    assert.ok(admin, 'admin 账号应存在');
    const role = await RT.getRoleByName(ROLE_NAME);
    assert.ok(admin.roleIds.includes(role.id),
      'admin.roleIds 应包含系统管理员角色 ID');
  });

  test('多次调用入口链幂等 — 角色和绑定都不重复', async () => {
    // 首先确认只有一个系统管理员角色
    const before = await RT.getAllRoles();
    const sysBefore = before.filter(r => r.roleName === ROLE_NAME);
    assert.equal(sysBefore.length, 1);

    // 重复调用
    await entrySeed();

    // 角色数不变
    const after = await RT.getAllRoles();
    const sysAfter = after.filter(r => r.roleName === ROLE_NAME);
    assert.equal(sysAfter.length, 1, '幂等：不应创建第二个系统管理员角色');

    // admin 绑定不重复
    const admin = await globalThis.RT_USERS.getUserByAccount(ADMIN_ACCOUNT);
    const role = await RT.getRoleByName(ROLE_NAME);
    const count = admin.roleIds.filter(id => id === role.id).length;
    assert.equal(count, 1, '幂等：系统管理员角色在 roleIds 中出现恰好 1 次');
  });

  test('menus 完整播种', async () => {
    const menus = await RT.getAllMenus();
    const allCodes = REG.flattenRegistryCodes();
    assert.ok(menus.length >= allCodes.length,
      `menus(${menus.length}) >= 注册表(${allCodes.length})`);
  });
});
