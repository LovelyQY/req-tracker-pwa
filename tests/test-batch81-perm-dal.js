// test-batch81-perm-dal.js
// 验证批次 81：权限数据层 —— 四表 registerStore + CRUD + 校验 + 追加写历史
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

// 设置全局依赖
globalThis.RT_DB = require('../db.js');

// 注册 users store（saveUserRoles 需要 users 表存在）
globalThis.RT_DB.registerStore('users', {
  keyPath: 'id',
  indexes: [
    { name: 'account', path: 'account' },
    { name: 'departmentId', path: 'departmentId' }
  ]
});

// 辅助：在 users store 中创建测试用户（等待事务提交）
async function ensureTestUser(id, account) {
  var db = await globalThis.RT_DB.openDB();
  return new Promise(function (resolve, reject) {
    var tx = db.transaction('users', 'readwrite');
    var store = tx.objectStore('users');
    var getReq = store.get(id);
    getReq.onsuccess = function () {
      if (getReq.result) { db.close(); resolve(getReq.result); return; }
      var rec = { id: id, account: account || 'testuser', nickname: '测试用户', roleIds: [], departmentId: '' };
      store.put(rec);
      tx.oncomplete = function () { db.close(); resolve(rec); };
    };
    getReq.onerror = function () { db.close(); reject(getReq.error); };
    tx.onerror = function () { db.close(); reject(tx.error); };
  });
}

// 模拟 RT_USERS
globalThis.RT_USERS = {
  getAllUsers: async function () { return []; },
  getUser: async function (id) {
    return ensureTestUser(id);
  }
};

// 模拟 getCurrentUserAccount
globalThis.getCurrentUserAccount = function () { return 'test-operator'; };

const RT_PERMISSIONS = require('../permissions.js');

// 辅助：按索引查询
async function getByIndex(storeName, indexName, value) {
  const db = await globalThis.RT_DB.openDB();
  return new Promise((resolve, reject) => {
    const os = db.transaction(storeName, 'readonly').objectStore(storeName);
    let req;
    if (os.indexNames.contains(indexName)) {
      req = os.index(indexName).getAll(value);
    } else {
      req = os.getAll();
    }
    req.onsuccess = () => {
      db.close();
      let list = req.result || [];
      if (!os.indexNames.contains(indexName)) {
        list = list.filter(r => String(r[indexName] || '') === String(value || ''));
      }
      resolve(list);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// 用 error.message 匹配的 rejects 封装
async function rejectsWith(block, pattern) {
  try {
    await block();
    throw new Error('Expected rejection but none occurred');
  } catch (e) {
    if (e.message === 'Expected rejection but none occurred') throw e;
    if (!pattern.test(e.message)) {
      throw new Error('Expected error matching ' + pattern + ' but got: ' + e.message);
    }
  }
}

describe('批次81：权限数据层（四表 CRUD + 校验 + 追加写历史）', () => {

  // ==================== 校验 ====================
  describe('validateRole', () => {
    test('有效角色数据通过校验', () => {
      const v = RT_PERMISSIONS.validateRole({ roleName: '测试角色', enabled: true });
      assert.ok(v.ok);
    });

    test('角色名称为空时报错', () => {
      const v = RT_PERMISSIONS.validateRole({ roleName: '' });
      assert.ok(!v.ok);
      assert.ok(v.errors.roleName);
    });

    test('角色名称超长时报错', () => {
      const v = RT_PERMISSIONS.validateRole({ roleName: 'A'.repeat(31) });
      assert.ok(!v.ok);
      assert.ok(v.errors.roleName);
    });

    test('menuCodes 非数组时报错', () => {
      const v = RT_PERMISSIONS.validateRole({ roleName: '测试', menuCodes: 'not-array' });
      assert.ok(!v.ok);
      assert.ok(v.errors.menuCodes);
    });

    test('enabled 类型不对时报错', () => {
      const v = RT_PERMISSIONS.validateRole({ roleName: '测试', enabled: 'yes' });
      assert.ok(!v.ok);
      assert.ok(v.errors.enabled);
    });

    test('update patch 模式（strict=false）不校验未提供的字段', () => {
      const v = RT_PERMISSIONS.validateRole({ enabled: false }, false);
      assert.ok(v.ok, 'patch 模式应跳过未提供字段的校验');
    });
  });

  describe('validateMenu', () => {
    test('有效菜单数据通过校验', () => {
      const v = RT_PERMISSIONS.validateMenu({ menuCode: 'mod_test', menuName: '测试模块', nodeType: 'module' });
      assert.ok(v.ok);
    });

    test('menuCode 为空时报错', () => {
      const v = RT_PERMISSIONS.validateMenu({ menuCode: '', menuName: '测试', nodeType: 'page' });
      assert.ok(!v.ok);
      assert.ok(v.errors.menuCode);
    });

    test('nodeType 非法时报错', () => {
      const v = RT_PERMISSIONS.validateMenu({ menuCode: 'x', menuName: 'x', nodeType: 'invalid' });
      assert.ok(!v.ok);
      assert.ok(v.errors.nodeType);
    });

    test('parentCode 等于自身 menuCode 时报错（自环）', () => {
      const v = RT_PERMISSIONS.validateMenu({ menuCode: 'self', menuName: '自环', nodeType: 'page', parentCode: 'self' });
      assert.ok(!v.ok);
      assert.ok(v.errors.parentCode);
    });

    test('update patch 模式跳过未提供字段', () => {
      const v = RT_PERMISSIONS.validateMenu({ menuName: '新名' }, false);
      assert.ok(v.ok, 'patch 模式应跳过 menuCode/nodeType 校验');
    });
  });

  // ==================== 角色 CRUD ====================
  describe('角色 CRUD', () => {
    test('createRole 创建角色成功', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '开发组长', menuCodes: ['op_view'], enabled: true }, 'admin');
      assert.ok(role.id);
      assert.equal(typeof role.id, 'string');
      assert.equal(role.id.length, 32, 'ID 应为 32 位十六进制');
      assert.equal(role.roleName, '开发组长');
      assert.deepEqual(role.menuCodes, ['op_view']);
      assert.equal(role.enabled, true);
      assert.equal(role.isSystemAdmin, false);
      assert.equal(role.createdBy, 'admin');
    });

    test('createRole roleName 唯一性校验', async () => {
      await RT_PERMISSIONS.createRole({ roleName: '唯一角色' }, 'admin');
      await rejectsWith(
        () => RT_PERMISSIONS.createRole({ roleName: '唯一角色' }, 'admin'),
        /角色名称已存在/
      );
    });

    test('createRole 默认值', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '默认值角色' });
      assert.equal(role.enabled, true);
      assert.equal(role.isSystemAdmin, false);
      assert.deepEqual(role.menuCodes, []);
    });

    test('getRole 查询角色', async () => {
      const created = await RT_PERMISSIONS.createRole({ roleName: '查询角色' }, 'admin');
      const role = await RT_PERMISSIONS.getRole(created.id);
      assert.ok(role);
      assert.equal(role.roleName, '查询角色');
    });

    test('getRole 不存在时返回 null', async () => {
      const role = await RT_PERMISSIONS.getRole('nonexistent');
      assert.equal(role, null);
    });

    test('getAllRoles 返回所有角色（按名称排序）', async () => {
      await RT_PERMISSIONS.createRole({ roleName: 'BBB角色' }, 'admin');
      await RT_PERMISSIONS.createRole({ roleName: 'AAA角色' }, 'admin');
      const all = await RT_PERMISSIONS.getAllRoles();
      assert.ok(all.length >= 2);
      for (let i = 1; i < all.length; i++) {
        assert.ok((all[i-1].roleName || '').localeCompare(all[i].roleName || '', 'zh') <= 0);
      }
    });

    test('updateRole 更新角色', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '旧名称' }, 'admin');
      const updated = await RT_PERMISSIONS.updateRole(role.id, { roleName: '新名称', menuCodes: ['op_create', 'op_edit'] }, 'admin');
      assert.equal(updated.roleName, '新名称');
      assert.deepEqual(updated.menuCodes, ['op_create', 'op_edit']);
      assert.equal(updated.updatedBy, 'admin');
    });

    test('updateRole 系统管理员角色不可停用', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '系统管理员', isSystemAdmin: true }, 'system');
      await rejectsWith(
        () => RT_PERMISSIONS.updateRole(role.id, { enabled: false }, 'admin'),
        /系统管理员角色不可停用/
      );
    });

    test('updateRole 不存在的角色报错', async () => {
      await rejectsWith(
        () => RT_PERMISSIONS.updateRole('nonexistent', { roleName: 'x' }, 'admin'),
        /角色不存在/
      );
    });

    test('deleteRole 删除无引用的角色', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '待删除角色' }, 'admin');
      const result = await RT_PERMISSIONS.deleteRole(role.id);
      assert.equal(result, true);
      const deleted = await RT_PERMISSIONS.getRole(role.id);
      assert.equal(deleted, null);
    });

    test('deleteRole 系统管理员角色不可删除', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '不可删系统管理员', isSystemAdmin: true }, 'system');
      await rejectsWith(
        () => RT_PERMISSIONS.deleteRole(role.id),
        /系统管理员角色不可删除/
      );
    });

    test('getRoleByName 按名称查询', async () => {
      await RT_PERMISSIONS.createRole({ roleName: '按名查找' }, 'admin');
      const found = await RT_PERMISSIONS.getRoleByName('按名查找');
      assert.ok(found);
      assert.equal(found.roleName, '按名查找');
    });
  });

  // ==================== 菜单 CRUD ====================
  describe('菜单 CRUD', () => {
    test('createMenu 创建菜单节点', async () => {
      const menu = await RT_PERMISSIONS.createMenu({
        menuCode: 'mod_basic', menuName: '基础数据', nodeType: 'module'
      }, 'system');
      assert.ok(menu.id);
      assert.equal(menu.id.length, 32);
      assert.equal(menu.menuCode, 'mod_basic');
      assert.equal(menu.menuName, '基础数据');
      assert.equal(menu.nodeType, 'module');
      assert.equal(menu.parentCode, '');
      assert.equal(menu.enabled, true);
    });

    test('createMenu menuCode 唯一性', async () => {
      await RT_PERMISSIONS.createMenu({ menuCode: 'unique_code', menuName: '唯一', nodeType: 'op' }, 'system');
      await rejectsWith(
        () => RT_PERMISSIONS.createMenu({ menuCode: 'unique_code', menuName: '重复', nodeType: 'op' }, 'system'),
        /菜单编号已存在/
      );
    });

    test('createMenu parentCode 不存在时报错', async () => {
      await rejectsWith(
        () => RT_PERMISSIONS.createMenu({ menuCode: 'orphan', menuName: '孤儿', nodeType: 'page', parentCode: 'no_such' }, 'system'),
        /父节点不存在/
      );
    });

    test('createMenu 带 parentCode 创建子节点', async () => {
      const parent = await RT_PERMISSIONS.createMenu({ menuCode: 'mod_parent', menuName: '父模块', nodeType: 'module' }, 'system');
      const child = await RT_PERMISSIONS.createMenu({
        menuCode: 'page_child', menuName: '子页面', nodeType: 'page', parentCode: 'mod_parent'
      }, 'system');
      assert.equal(child.parentCode, 'mod_parent');
    });

    test('getMenu 查询菜单', async () => {
      const m = await RT_PERMISSIONS.createMenu({ menuCode: 'mod_get', menuName: '查询测试', nodeType: 'module' }, 'system');
      const found = await RT_PERMISSIONS.getMenu(m.id);
      assert.ok(found);
      assert.equal(found.menuCode, 'mod_get');
    });

    test('getMenuByCode 按 code 查询', async () => {
      await RT_PERMISSIONS.createMenu({ menuCode: 'mod_bycode', menuName: '按码查询', nodeType: 'module' }, 'system');
      const found = await RT_PERMISSIONS.getMenuByCode('mod_bycode');
      assert.ok(found);
      assert.equal(found.menuName, '按码查询');
    });

    test('getAllMenus 返回所有菜单', async () => {
      await RT_PERMISSIONS.createMenu({ menuCode: 'mod_a', menuName: 'A', nodeType: 'module' }, 'system');
      await RT_PERMISSIONS.createMenu({ menuCode: 'mod_b', menuName: 'B', nodeType: 'module' }, 'system');
      const all = await RT_PERMISSIONS.getAllMenus();
      assert.ok(all.length >= 2);
    });

    test('updateMenu 更新菜单', async () => {
      const m = await RT_PERMISSIONS.createMenu({ menuCode: 'old_code', menuName: '旧名', nodeType: 'op' }, 'system');
      const updated = await RT_PERMISSIONS.updateMenu(m.id, { menuName: '新名', enabled: false }, 'admin');
      assert.equal(updated.menuName, '新名');
      assert.equal(updated.enabled, false);
      assert.equal(updated.updatedBy, 'admin');
    });

    test('updateMenu menuCode 更新为已存在值时报错', async () => {
      await RT_PERMISSIONS.createMenu({ menuCode: 'existing_code', menuName: '已存在', nodeType: 'page' }, 'system');
      const m = await RT_PERMISSIONS.createMenu({ menuCode: 'another_code', menuName: '另一个', nodeType: 'page' }, 'system');
      await rejectsWith(
        () => RT_PERMISSIONS.updateMenu(m.id, { menuCode: 'existing_code' }, 'admin'),
        /菜单编号已存在/
      );
    });

    test('deleteMenu 删除无子节点的菜单', async () => {
      const m = await RT_PERMISSIONS.createMenu({ menuCode: 'to_delete', menuName: '待删', nodeType: 'op' }, 'system');
      const result = await RT_PERMISSIONS.deleteMenu(m.id);
      assert.equal(result, true);
      const deleted = await RT_PERMISSIONS.getMenu(m.id);
      assert.equal(deleted, null);
    });

    test('deleteMenu 有子节点时报错', async () => {
      const parent = await RT_PERMISSIONS.createMenu({ menuCode: 'has_child', menuName: '有子节点', nodeType: 'module' }, 'system');
      await RT_PERMISSIONS.createMenu({ menuCode: 'child_node', menuName: '子节点', nodeType: 'page', parentCode: 'has_child' }, 'system');
      await rejectsWith(
        () => RT_PERMISSIONS.deleteMenu(parent.id),
        /请先删除其下级节点/
      );
    });

    test('buildMenuTree 构建树形结构', async () => {
      const m1 = await RT_PERMISSIONS.createMenu({ menuCode: 'tree_mod', menuName: '模块', nodeType: 'module' }, 'system');
      const m2 = await RT_PERMISSIONS.createMenu({ menuCode: 'tree_page', menuName: '页面', nodeType: 'page', parentCode: 'tree_mod' }, 'system');
      const m3 = await RT_PERMISSIONS.createMenu({ menuCode: 'tree_op', menuName: '操作', nodeType: 'op', parentCode: 'tree_page' }, 'system');
      const all = await RT_PERMISSIONS.getAllMenus();
      const tree = RT_PERMISSIONS.buildMenuTree(all);
      const root = tree.find(n => n.menuCode === 'tree_mod');
      assert.ok(root);
      assert.equal(root.children.length, 1);
      assert.equal(root.children[0].menuCode, 'tree_page');
      assert.equal(root.children[0].children.length, 1);
      assert.equal(root.children[0].children[0].menuCode, 'tree_op');
    });
  });

  // ==================== 角色-权限关系（追加写）====================
  describe('角色-权限关系（追加写历史）', () => {
    test('saveRolePermissions 追加写并覆盖 roles.menuCodes', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '权限测试角色' }, 'admin');
      const m1 = await RT_PERMISSIONS.createMenu({ menuCode: 'rp_op_view', menuName: '查看', nodeType: 'op' }, 'system');
      const m2 = await RT_PERMISSIONS.createMenu({ menuCode: 'rp_op_edit', menuName: '编辑', nodeType: 'op' }, 'system');

      const result = await RT_PERMISSIONS.saveRolePermissions(role.id, ['rp_op_view', 'rp_op_edit'], 'admin');
      assert.ok(result.snapshotId);
      assert.deepEqual(result.menuCodes, ['rp_op_view', 'rp_op_edit']);

      const updated = await RT_PERMISSIONS.getRole(role.id);
      assert.deepEqual(updated.menuCodes, ['rp_op_view', 'rp_op_edit']);

      const rpRows = await getByIndex('role_permission', 'roleId', role.id);
      assert.equal(rpRows.length, 2, '应写入 2 行');
      assert.ok(rpRows.every(r => r.snapshotId === result.snapshotId));
    });

    test('saveRolePermissions 多次保存后历史行递增', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '历史递增角色' }, 'admin');
      await RT_PERMISSIONS.createMenu({ menuCode: 'hist_op_a', menuName: 'A', nodeType: 'op' }, 'system');
      await RT_PERMISSIONS.createMenu({ menuCode: 'hist_op_b', menuName: 'B', nodeType: 'op' }, 'system');

      await RT_PERMISSIONS.saveRolePermissions(role.id, ['hist_op_a'], 'admin');
      const after1 = await getByIndex('role_permission', 'roleId', role.id);
      assert.equal(after1.length, 1);

      await RT_PERMISSIONS.saveRolePermissions(role.id, ['hist_op_a', 'hist_op_b'], 'admin');
      const after2 = await getByIndex('role_permission', 'roleId', role.id);
      assert.equal(after2.length, 3, '历史行累计 1+2=3 行');

      const roleNow = await RT_PERMISSIONS.getRole(role.id);
      assert.deepEqual(roleNow.menuCodes, ['hist_op_a', 'hist_op_b']);
    });

    test('getRoleMenuCodes 获取当前权限码', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '获取权限码角色' }, 'admin');
      await RT_PERMISSIONS.saveRolePermissions(role.id, ['rp_op_view'], 'admin');
      const codes = await RT_PERMISSIONS.getRoleMenuCodes(role.id);
      assert.deepEqual(codes, ['rp_op_view']);
    });

    test('getRolePermissionHistory 按 snapshotId 分组', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '历史分组角色' }, 'admin');
      const m1 = await RT_PERMISSIONS.createMenu({ menuCode: 'hist_grp_a', menuName: 'A', nodeType: 'op' }, 'system');

      const r1 = await RT_PERMISSIONS.saveRolePermissions(role.id, ['hist_grp_a'], 'admin');
      const r2 = await RT_PERMISSIONS.saveRolePermissions(role.id, [], 'admin');

      const history = await RT_PERMISSIONS.getRolePermissionHistory(role.id);
      const snapIds = Object.keys(history);
      assert.ok(snapIds.length >= 2, '至少两个快照，实际: ' + snapIds.length);
      assert.ok(snapIds.includes(r1.snapshotId));
      assert.ok(snapIds.includes(r2.snapshotId));
    });

    test('saveRolePermissions 不存在的角色报错', async () => {
      await rejectsWith(
        () => RT_PERMISSIONS.saveRolePermissions('nonexistent', ['rp_op_view'], 'admin'),
        /角色不存在/
      );
    });
  });

  // ==================== 人员-角色关系（追加写）====================
  describe('人员-角色关系（追加写历史）', () => {
    test('saveUserRoles 追加写并覆盖 users.roleIds', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '用户角色分配' }, 'admin');
      const userId = 'test-user-save-roles-001';
      await ensureTestUser(userId);

      const result = await RT_PERMISSIONS.saveUserRoles(userId, [role.id], 'admin');
      assert.ok(result.snapshotId);
      assert.deepEqual(result.roleIds, [role.id]);

      const urRows = await getByIndex('user_role', 'userId', userId);
      assert.equal(urRows.length, 1);
      assert.equal(urRows[0].roleId, role.id);
    });

    test('saveUserRoles 不存在的角色报错', async () => {
      const userId = 'test-user-bad-role';
      await ensureTestUser(userId);
      await rejectsWith(
        () => RT_PERMISSIONS.saveUserRoles(userId, ['nonexistent-role-id'], 'admin'),
        /不存在/
      );
    });

    test('getUserRoleIds 获取用户当前角色', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '获取角色ID' }, 'admin');
      const userId = 'test-user-get-roles';
      await ensureTestUser(userId);
      await RT_PERMISSIONS.saveUserRoles(userId, [role.id], 'admin');

      const ids = await RT_PERMISSIONS.getUserRoleIds(userId);
      assert.deepEqual(ids, [role.id]);
    });

    test('getUserRoleHistory 按 snapshotId 分组', async () => {
      const role1 = await RT_PERMISSIONS.createRole({ roleName: '历史角色1' }, 'admin');
      const role2 = await RT_PERMISSIONS.createRole({ roleName: '历史角色2' }, 'admin');
      const userId = 'test-user-history-roles';
      await ensureTestUser(userId);

      const r1 = await RT_PERMISSIONS.saveUserRoles(userId, [role1.id], 'admin');
      const r2 = await RT_PERMISSIONS.saveUserRoles(userId, [role1.id, role2.id], 'admin');

      const history = await RT_PERMISSIONS.getUserRoleHistory(userId);
      const snapIds = Object.keys(history);
      assert.ok(snapIds.length >= 2);
      assert.ok(snapIds.includes(r1.snapshotId));
      assert.ok(snapIds.includes(r2.snapshotId));
    });
  });

  // ==================== 完整性验证 ====================
  describe('完整性验证', () => {
    test('所有新表主键 id 均为 32 位十六进制', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: 'ID验证角色' }, 'admin');
      assert.equal(role.id.length, 32);
      assert.ok(/^[0-9a-f]{32}$/.test(role.id));

      const menu = await RT_PERMISSIONS.createMenu({ menuCode: 'id_check_menu', menuName: 'ID验证', nodeType: 'module' }, 'system');
      assert.equal(menu.id.length, 32);
      assert.ok(/^[0-9a-f]{32}$/.test(menu.id));
    });

    test('审计字段正确写入', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '审计角色' }, 'custom-op');
      assert.equal(role.createdBy, 'custom-op');
      assert.equal(role.updatedBy, 'custom-op');
      assert.ok(typeof role.createdAt === 'number');
      assert.ok(typeof role.updatedAt === 'number');
    });

    test('LIMITS 使用专用上限（不复用 EMPLOYEE_NO_MAX）', () => {
      assert.equal(RT_PERMISSIONS.LIMITS.ROLE_NAME_MAX, 30);
      assert.equal(RT_PERMISSIONS.LIMITS.MENU_CODE_MAX, 64);
      assert.equal(RT_PERMISSIONS.LIMITS.ROLE_ID_MAX, 64);
      assert.equal(RT_PERMISSIONS.LIMITS.MENU_ID_MAX, 64);
      assert.equal(RT_PERMISSIONS.LIMITS.USER_ID_MAX, 64);
      assert.ok(RT_PERMISSIONS.LIMITS.ROLE_ID_MAX >= 32);
      assert.ok(RT_PERMISSIONS.LIMITS.MENU_ID_MAX >= 32);
    });

    test('历史表旧行 snapshotId 不变（append-only）', async () => {
      const role = await RT_PERMISSIONS.createRole({ roleName: '追加写验证' }, 'admin');
      await RT_PERMISSIONS.createMenu({ menuCode: 'append_op_a', menuName: 'A', nodeType: 'op' }, 'system');

      const r1 = await RT_PERMISSIONS.saveRolePermissions(role.id, ['append_op_a'], 'admin');
      await RT_PERMISSIONS.saveRolePermissions(role.id, [], 'admin');

      const allRows = await getByIndex('role_permission', 'roleId', role.id);
      const firstRows = allRows.filter(r => r.snapshotId === r1.snapshotId);
      assert.equal(firstRows.length, 1, '第一次快照的 1 行应仍存在');
      assert.equal(firstRows[0].menuCode, 'append_op_a');
    });
  });
});
