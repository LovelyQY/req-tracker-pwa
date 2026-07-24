// test-batch83-rtperm.js
// 验证批次 83：运行时解析 RT_PERM（can / canAny / canAll / getMenuCodes / isAdmin / getDataScope + 会话缓存）
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
const RT_PERM = RT.RT_PERM;

globalThis.getCurrentUserAccount = function () { return 'test-operator'; };

function openUsers() { return globalThis.RT_DB.openDB(); }
function txPut(obj) {
  return new Promise(function (resolve, reject) {
    openUsers().then(function (db) {
      var t = db.transaction('users', 'readwrite');
      t.objectStore('users').put(obj);
      t.oncomplete = function () { db.close(); resolve(obj); };
      t.onerror = function () { db.close(); reject(t.error); };
    });
  });
}
function getByIndex(storeName, indexName, value) {
  return openUsers().then(function (db) {
    return new Promise(function (resolve, reject) {
      var os = db.transaction(storeName, 'readonly').objectStore(storeName);
      var req = os.indexNames.contains(indexName) ? os.index(indexName).getAll(value) : os.getAll();
      req.onsuccess = function () {
        db.close();
        var list = req.result || [];
        if (!os.indexNames.contains(indexName)) list = list.filter(r => String(r[indexName] || '') === String(value || ''));
        resolve(list);
      };
      req.onerror = function () { db.close(); reject(req.error); };
    });
  });
}

globalThis.RT_USERS = {
  getAllUsers: async function () { return getByIndex('users', 'account', undefined); },
  getUser: async function (id) { var l = await getByIndex('users', 'id', id); return l[0] || null; },
  getUserByAccount: async function (account) { var l = await getByIndex('users', 'account', account); return l[0] || null; }
};

// 全局准备一次（角色/用户非幂等，避免重复创建导致唯一性冲突）
var CTX = null;
before(async function () {
  await RT.seedMenusFromRegistry('system');
  const roleA = await RT.createRole({ roleName: '角色A', menuCodes: ['op_company_view', 'op_company_delete'] }, 'system');
  const roleB = await RT.createRole({ roleName: '角色B', menuCodes: ['op_dept_view'] }, 'system');
  const sysRole = await RT.createRole({ roleName: '系统管理员', isSystemAdmin: true, menuCodes: ['op_company_view'] }, 'system');
  const u1 = await txPut({ id: 'u1', account: 'alice', nickname: 'Alice', roleIds: [roleA.id], departmentId: 'dept-1' });
  const u2 = await txPut({ id: 'u2', account: 'bob', nickname: 'Bob', roleIds: [roleA.id, roleB.id], departmentId: 'dept-2' });
  const uSys = await txPut({ id: 'usys', account: 'sysuser', nickname: 'Sys', roleIds: [sysRole.id], departmentId: 'dept-9' });
  CTX = { roleA, roleB, sysRole, u1, u2, uSys };
});

describe('批次83：运行时解析 RT_PERM', () => {

  describe('isAdmin', () => {
    test("account==='admin' 直接为 true", async () => {
      assert.equal(await RT_PERM.isAdmin('admin'), true);
    });
    test('普通账号为 false', async () => {
      assert.equal(await RT_PERM.isAdmin(CTX.u1.account), false);
    });
    test('拥有系统管理员角色的用户为 true', async () => {
      assert.equal(await RT_PERM.isAdmin(CTX.uSys.account), true);
    });
  });

  describe('can / 普通用户按 roleIds→menuCodes 命中', () => {
    test('拥有角色包含 code → true；不包含 → false', async () => {
      assert.equal(await RT_PERM.can(CTX.u1.account, 'op_company_view'), true);
      assert.equal(await RT_PERM.can(CTX.u1.account, 'op_company_delete'), true);
      assert.equal(await RT_PERM.can(CTX.u1.account, 'op_dept_view'), false);   // 不在角色A
      assert.equal(await RT_PERM.can(CTX.u1.account, 'op_company_create'), false);
    });

    test('多角色并集生效（用户同时拥有角色A+角色B）', async () => {
      assert.equal(await RT_PERM.can(CTX.u2.account, 'op_company_view'), true);  // 角色A
      assert.equal(await RT_PERM.can(CTX.u2.account, 'op_dept_view'), true);    // 角色B
    });

    test('未登录/未知账号 → 全部 false', async () => {
      assert.equal(await RT_PERM.can('ghost', 'op_company_view'), false);
      assert.equal(await RT_PERM.can('', 'op_company_view'), false);
    });
  });

  describe('canAny / canAll', () => {
    test('canAny：命中任一即为 true', async () => {
      assert.equal(await RT_PERM.canAny(CTX.u1.account, ['op_company_delete', 'op_dept_view']), true);
      assert.equal(await RT_PERM.canAny(CTX.u1.account, ['op_dept_view', 'op_project_view']), false);
    });
    test('canAll：全部命中才为 true', async () => {
      assert.equal(await RT_PERM.canAll(CTX.u1.account, ['op_company_view', 'op_company_delete']), true);
      assert.equal(await RT_PERM.canAll(CTX.u1.account, ['op_company_view', 'op_dept_view']), false);
      assert.equal(await RT_PERM.canAll(CTX.u1.account, []), true); // 空集 vacuously true
    });
  });

  describe('停用优先（menu.enabled=false 全局不生效）', () => {
    test('普通用户：禁用菜单后 can 返回 false（即使角色已勾选）', async () => {
      const menu = await RT.getMenuByCode('op_company_delete');
      await RT.updateMenu(menu.id, { enabled: false }, 'system');
      RT_PERM.clearPermissionCache(); // 失效重算
      assert.equal(await RT_PERM.can(CTX.u1.account, 'op_company_delete'), false);
      // 同角色下未禁用的 op_company_view 仍 true
      assert.equal(await RT_PERM.can(CTX.u1.account, 'op_company_view'), true);
    });

    test('admin 绕过 menu.enabled（最高权限，停用不拦截 admin）', async () => {
      const menu = await RT.getMenuByCode('op_company_delete');
      await RT.updateMenu(menu.id, { enabled: false }, 'system');
      RT_PERM.clearPermissionCache();
      assert.equal(await RT_PERM.can('admin', 'op_company_delete'), true);
    });
  });

  describe('getMenuCodes', () => {
    test('返回用户有效权限码并集（去重）', async () => {
      const codes = await RT_PERM.getMenuCodes(CTX.u2.account);
      assert.ok(codes.indexOf('op_company_view') >= 0);
      assert.ok(codes.indexOf('op_dept_view') >= 0);
      assert.equal(new Set(codes).size, codes.length, '不应有重复');
    });
  });

  describe('getDataScope（数据权限范围）', () => {
    test('普通用户返回 { deptId, includeSub:true }', async () => {
      const scope = await RT_PERM.getDataScope(CTX.u1.account);
      assert.equal(scope.deptId, 'dept-1');
      assert.equal(scope.includeSub, true);
      assert.equal(scope.isAdmin, false);
    });
    test('admin 返回 deptId=null（可见全部数据，跳过部门过滤）', async () => {
      const scope = await RT_PERM.getDataScope('admin');
      assert.equal(scope.deptId, null);
      assert.equal(scope.includeSub, true);
      assert.equal(scope.isAdmin, true);
    });
  });

  describe('会话缓存 cachePermissions / clearPermissionCache', () => {
    test('登录后 cachePermissions 预热，getCachedCodes 可同步取值', async () => {
      const cache = await RT_PERM.cachePermissions(CTX.u1.account);
      assert.ok(Array.isArray(cache.codes));
      assert.equal(RT_PERM.getCachedCodes(CTX.u1.account).length, cache.codes.length);
      assert.equal(RT_PERM.isAdminCached(CTX.u1.account), false);
    });

    test('角色变更后 clearPermissionCache 失效，重新 can 反映最新角色', async () => {
      // 用独立用户，避免污染共享 CTX.u1
      const roleB = CTX.roleB;
      const u3 = await txPut({ id: 'u3', account: 'carol', nickname: 'Carol', roleIds: [CTX.roleA.id], departmentId: 'dept-3' });
      await RT_PERM.cachePermissions(u3.account);
      assert.equal(await RT_PERM.can(u3.account, 'op_dept_view'), false);
      const user = await globalThis.RT_USERS.getUser(u3.id);
      await txPut(Object.assign({}, user, { roleIds: user.roleIds.concat([roleB.id]) }));
      RT_PERM.clearPermissionCache(); // 角色变更 → 失效
      assert.equal(await RT_PERM.can(u3.account, 'op_dept_view'), true);
    });

    test('clearPermissionCache 后 getCachedCodes 返回 null', async () => {
      await RT_PERM.cachePermissions(CTX.u1.account);
      RT_PERM.clearPermissionCache();
      assert.equal(RT_PERM.getCachedCodes(CTX.u1.account), null);
    });
  });
});
