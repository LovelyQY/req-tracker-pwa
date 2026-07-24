// permissions.js —— 权限数据层（RBAC 角色/权限 + 人员角色分配）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块注册四个 store：
//   roles           — 角色表（含去范式化 menuCodes）
//   menus           — 权限/菜单表（邻接表树，parentCode 链接键）
//   role_permission — 角色-权限关系历史表（追加写，append-only）
//   user_role       — 人员-角色关系历史表（追加写，append-only）
//
// 设计原则：
//   - 所有主键 id 为 RT_DB.genId() 32 位十六进制串（遵循 RULES）
//   - 历史表仅追加写（不 UPDATE / 不 DELETE），当前态去范式化到 roles.menuCodes / users.roleIds
//   - menus 树自引用用 menuCode（D1 已确认，业务稳定标识比 32 位 id 更适合树关联）
//   - 审计字段：createdBy/updatedBy 写入用 getCurrentUserAccount()，种子用 'system'
//   - 长度上限：ID 类字段用专用 *_ID_MAX（≥32，建议 64），不复用 EMPLOYEE_NO_MAX / ACCOUNT_MAX
//
// 批次 81：数据层 CRUD + 校验 + 追加写历史逻辑
(function (root) {
  'use strict';

  // ===================== 常量 =====================
  var STORE_ROLES            = 'roles';
  var STORE_MENUS            = 'menus';
  var STORE_ROLE_PERMISSION  = 'role_permission';
  var STORE_USER_ROLE        = 'user_role';

  var LIMITS = {
    ROLE_NAME_MAX:  30,
    MENU_CODE_MAX:  64,
    MENU_NAME_MAX:  50,
    ROLE_ID_MAX:    64,
    MENU_ID_MAX:    64,
    USER_ID_MAX:    64
  };

  var NODE_TYPES = ['module', 'page', 'op'];

  // ===================== 注册四个 store =====================
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE_ROLES, {
      keyPath: 'id',
      indexes: [
        { name: 'roleName', path: 'roleName' },
        { name: 'enabled',  path: 'enabled' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
    root.RT_DB.registerStore(STORE_MENUS, {
      keyPath: 'id',
      indexes: [
        { name: 'menuCode',  path: 'menuCode' },
        { name: 'parentCode', path: 'parentCode' },
        { name: 'enabled',   path: 'enabled' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
    root.RT_DB.registerStore(STORE_ROLE_PERMISSION, {
      keyPath: 'id',
      indexes: [
        { name: 'roleId',     path: 'roleId' },
        { name: 'menuCode',   path: 'menuCode' },
        { name: 'snapshotId', path: 'snapshotId' },
        { name: 'updatedAt',  path: 'updatedAt' }
      ]
    });
    root.RT_DB.registerStore(STORE_USER_ROLE, {
      keyPath: 'id',
      indexes: [
        { name: 'userId',     path: 'userId' },
        { name: 'roleId',     path: 'roleId' },
        { name: 'snapshotId', path: 'snapshotId' },
        { name: 'updatedAt',  path: 'updatedAt' }
      ]
    });
  }

  // ===================== IndexedDB 底层 =====================
  function openDB() { return root.RT_DB.openDB(); }

  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror  = function () { reject(request.error); };
    });
  }

  // 获取当前登录操作人
  function currentOperator() {
    try {
      if (root.getCurrentUserAccount && typeof root.getCurrentUserAccount === 'function') {
        return root.getCurrentUserAccount();
      }
    } catch (e) {}
    return '';
  }

  // ===================== 校验函数 =====================

  // 校验角色数据
  // strict=true: 全量校验（create 场景）；strict=false: 按需校验（update patch 场景）
  function validateRole(data, strict) {
    var errors = {};
    data = data || {};
    var roleName = (data.roleName == null ? '' : String(data.roleName)).trim();
    var menuCodes = data.menuCodes;
    var enabled   = data.enabled;
    var isSystemAdmin = data.isSystemAdmin;
    var hasRoleName = Object.prototype.hasOwnProperty.call(data, 'roleName');

    if (strict !== false || hasRoleName) {
      if (!roleName) {
        errors.roleName = '请输入角色名称';
      } else if (roleName.length > LIMITS.ROLE_NAME_MAX) {
        errors.roleName = '角色名称最多 ' + LIMITS.ROLE_NAME_MAX + ' 位';
      }
    }

    if (menuCodes !== undefined && !Array.isArray(menuCodes)) {
      errors.menuCodes = '权限码必须为数组';
    }

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      errors.enabled = '启停状态类型不正确';
    }

    if (isSystemAdmin !== undefined && typeof isSystemAdmin !== 'boolean') {
      errors.isSystemAdmin = '系统管理员标记类型不正确';
    }

    var first = null;
    ['roleName', 'menuCodes', 'enabled', 'isSystemAdmin'].forEach(function (k) {
      if (errors[k] && !first) first = k;
    });
    return { ok: Object.keys(errors).length === 0, errors: errors, first: first };
  }

  // 校验菜单/权限节点数据
  // strict=true: 全量校验（create 场景）；strict=false: 按需校验（update patch 场景）
  function validateMenu(data, strict) {
    var errors = {};
    data = data || {};
    var menuCode   = (data.menuCode == null ? '' : String(data.menuCode)).trim();
    var menuName   = (data.menuName == null ? '' : String(data.menuName)).trim();
    var parentCode = (data.parentCode == null ? '' : String(data.parentCode)).trim();
    var nodeType   = (data.nodeType == null ? '' : String(data.nodeType));
    var enabled    = data.enabled;
    var hasMenuCode = Object.prototype.hasOwnProperty.call(data, 'menuCode');
    var hasMenuName = Object.prototype.hasOwnProperty.call(data, 'menuName');
    var hasNodeType = Object.prototype.hasOwnProperty.call(data, 'nodeType');

    if (strict !== false || hasMenuCode) {
      if (!menuCode) {
        errors.menuCode = '请输入菜单编号';
      } else if (menuCode.length > LIMITS.MENU_CODE_MAX) {
        errors.menuCode = '菜单编号最多 ' + LIMITS.MENU_CODE_MAX + ' 位';
      }
    }

    if (strict !== false || hasMenuName) {
      if (!menuName) {
        errors.menuName = '请输入菜单名称';
      } else if (menuName.length > LIMITS.MENU_NAME_MAX) {
        errors.menuName = '菜单名称最多 ' + LIMITS.MENU_NAME_MAX + ' 位';
      }
    }

    if (strict !== false || hasNodeType) {
      if (NODE_TYPES.indexOf(nodeType) < 0) {
        errors.nodeType = '请选择节点类型（module / page / op）';
      }
    }

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      errors.enabled = '启停状态类型不正确';
    }

    // parentCode 不能等于自身 menuCode（直接自环）
    if (parentCode && parentCode === menuCode) {
      errors.parentCode = '不能选择自身作为父节点';
    }

    var first = null;
    ['menuCode', 'menuName', 'nodeType', 'parentCode', 'enabled'].forEach(function (k) {
      if (errors[k] && !first) first = k;
    });
    return { ok: Object.keys(errors).length === 0, errors: errors, first: first };
  }

  // ===================== 辅助函数 =====================

  // 按索引查询全表（在已有 db 连接上）
  function queryByIndex(db, storeName, indexName, value) {
    var os = db.transaction(storeName, 'readonly').objectStore(storeName);
    if (os.indexNames.contains(indexName)) {
      return reqToPromise(os.index(indexName).getAll(value))
        .then(function (list) { return Array.isArray(list) ? list : []; });
    }
    return reqToPromise(os.getAll()).then(function (list) {
      list = Array.isArray(list) ? list : [];
      return list.filter(function (r) {
        return String(r[indexName] || '').trim() === String(value || '').trim();
      });
    });
  }

  // 防环：判断 ancestorCode 是否为 nodeCode 的后代
  // 从 ancestorCode 沿 parentCode 向上爬，遇到 nodeCode 即为其后代
  function isDescendant(nodeCode, ancestorCode, all) {
    var byCode = {};
    all.forEach(function (r) { if (r.menuCode) byCode[r.menuCode] = r; });
    var cur = byCode[ancestorCode];
    var guard = 0;
    while (cur && guard < 200) {
      if (cur.menuCode === nodeCode) return true;
      cur = cur.parentCode ? byCode[cur.parentCode] : null;
      guard++;
    }
    return false;
  }

  // ===================== Roles CRUD =====================

  // 检查 roleName 唯一性（排除自身 id）
  function checkRoleNameUnique(db, roleName, excludeId) {
    return queryByIndex(db, STORE_ROLES, 'roleName', roleName).then(function (list) {
      if (excludeId) list = list.filter(function (r) { return r.id !== excludeId; });
      if (list.length > 0) throw new Error('角色名称已存在');
      return true;
    });
  }

  function createRole(data, operator) {
    var v = validateRole(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? currentOperator() : String(operator));
    var now = Date.now();
    var roleName = (data.roleName + '').trim();
    return openDB().then(function (db) {
      return checkRoleNameUnique(db, roleName).then(function () {
        var record = {
          id: root.RT_DB.genId(),
          roleName: roleName,
          menuCodes: Array.isArray(data.menuCodes) ? data.menuCodes.slice() : [],
          isSystemAdmin: data.isSystemAdmin === true,
          enabled: data.enabled !== false,   // 默认 true
          createdBy: op, createdAt: now,
          updatedBy: op, updatedAt: now
        };
        var store = db.transaction(STORE_ROLES, 'readwrite').objectStore(STORE_ROLES);
        return reqToPromise(store.put(record)).then(function () {
          db.close();
          return record;
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function updateRole(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少角色 ID'));
    var v = validateRole(patch, false);  // 按需校验（update patch）
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? currentOperator() : String(operator));
    return openDB().then(function (db) {
      return reqToPromise(db.transaction(STORE_ROLES, 'readonly').objectStore(STORE_ROLES).get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('角色不存在'); }
        // 系统管理员角色不可停用
        if (old.isSystemAdmin && patch.enabled === false) {
          db.close();
          throw new Error('系统管理员角色不可停用');
        }
        // roleName 唯一性
        var chain = Promise.resolve();
        if (patch.roleName !== undefined) {
          var newName = (patch.roleName + '').trim();
          if (newName !== old.roleName) {
            chain = checkRoleNameUnique(db, newName, id);
          }
        }
        return chain.then(function () {
          if (patch.roleName !== undefined) old.roleName = (patch.roleName + '').trim();
          if (patch.menuCodes !== undefined) old.menuCodes = Array.isArray(patch.menuCodes) ? patch.menuCodes.slice() : old.menuCodes;
          if (patch.enabled !== undefined) old.enabled = patch.enabled;
          if (patch.isSystemAdmin !== undefined) old.isSystemAdmin = patch.isSystemAdmin;
          old.updatedBy = op;
          old.updatedAt = Date.now();
          var writeStore = db.transaction(STORE_ROLES, 'readwrite').objectStore(STORE_ROLES);
          return reqToPromise(writeStore.put(old)).then(function () {
            db.close();
            return old;
          });
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function deleteRole(id) {
    if (!id) return Promise.reject(new Error('缺少角色 ID'));
    return openDB().then(function (db) {
      var store = db.transaction(STORE_ROLES, 'readwrite').objectStore(STORE_ROLES);
      return reqToPromise(store.get(id)).then(function (role) {
        if (!role) { db.close(); throw new Error('角色不存在'); }
        if (role.isSystemAdmin) { db.close(); throw new Error('系统管理员角色不可删除'); }
        // 检查是否还有人员引用
        return Promise.all([
          // 检查 users 表中 roleIds 引用
          root.RT_USERS && root.RT_USERS.getAllUsers ? root.RT_USERS.getAllUsers() : Promise.resolve([]),
          // 检查 user_role 历史表引用
          queryByIndex(db, STORE_USER_ROLE, 'roleId', id)
        ]).then(function (res) {
          var allUsers = res[0] || [];
          var userRoleRows = res[1] || [];
          var refUsers = allUsers.filter(function (u) {
            return Array.isArray(u.roleIds) && u.roleIds.indexOf(id) >= 0;
          });
          if (refUsers.length > 0 || userRoleRows.length > 0) {
            db.close();
            throw new Error('该角色仍有人员引用，无法删除（当前引用 ' + refUsers.length + ' 人，历史引用 ' + userRoleRows.length + ' 条）');
          }
          return reqToPromise(store.delete(id)).then(function () {
            db.close();
            return true;
          });
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function getRole(id) {
    if (!id) return Promise.resolve(null);
    return openDB().then(function (db) {
      return reqToPromise(db.transaction(STORE_ROLES, 'readonly').objectStore(STORE_ROLES).get(id))
        .then(function (r) { db.close(); return r || null; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getAllRoles() {
    return openDB().then(function (db) {
      return reqToPromise(db.transaction(STORE_ROLES, 'readonly').objectStore(STORE_ROLES).getAll())
        .then(function (list) {
          db.close();
          list = Array.isArray(list) ? list : [];
          list.sort(function (a, b) { return (a.roleName || '').localeCompare(b.roleName || '', 'zh'); });
          return list;
        })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  // 按角色名查询
  function getRoleByName(roleName) {
    roleName = (roleName == null ? '' : String(roleName)).trim();
    if (!roleName) return Promise.resolve(null);
    return openDB().then(function (db) {
      return queryByIndex(db, STORE_ROLES, 'roleName', roleName)
        .then(function (list) { db.close(); return list[0] || null; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  // ===================== Menus CRUD =====================

  // 检查 menuCode 唯一性（排除自身 id）
  function checkMenuCodeUnique(db, menuCode, excludeId) {
    return queryByIndex(db, STORE_MENUS, 'menuCode', menuCode).then(function (list) {
      if (excludeId) list = list.filter(function (r) { return r.id !== excludeId; });
      if (list.length > 0) throw new Error('菜单编号已存在');
      return true;
    });
  }

  function createMenu(data, operator) {
    var v = validateMenu(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? currentOperator() : String(operator));
    var now = Date.now();
    var menuCode   = (data.menuCode + '').trim();
    var parentCode = (data.parentCode == null ? '' : String(data.parentCode)).trim();
    return openDB().then(function (db) {
      return checkMenuCodeUnique(db, menuCode).then(function () {
        // 校验 parentCode 存在性
        var chain = Promise.resolve();
        if (parentCode) {
          chain = queryByIndex(db, STORE_MENUS, 'menuCode', parentCode).then(function (list) {
            if (list.length === 0) throw new Error('父节点不存在');
            return list[0];
          });
        }
        return chain.then(function (parent) {
          // 验证 nodeType 层级：page 的父必须是 module，op 的父必须是 page
          if (parentCode && parent) {
            if (data.nodeType === 'page' && parent.nodeType !== 'module') {
              throw new Error('page 类型节点的父节点必须为 module');
            }
            if (data.nodeType === 'op' && parent.nodeType !== 'page') {
              throw new Error('op 类型节点的父节点必须为 page');
            }
          }
          var record = {
            id: root.RT_DB.genId(),
            menuCode: menuCode,
            menuName: (data.menuName + '').trim(),
            parentCode: parentCode,
            nodeType: data.nodeType,
            enabled: data.enabled !== false,
            createdBy: op, createdAt: now,
            updatedBy: op, updatedAt: now
          };
          var store = db.transaction(STORE_MENUS, 'readwrite').objectStore(STORE_MENUS);
          return reqToPromise(store.put(record)).then(function () {
            db.close();
            return record;
          });
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function updateMenu(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少菜单 ID'));
    var v = validateMenu(patch, false);  // 按需校验（update patch）
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? currentOperator() : String(operator));
    return openDB().then(function (db) {
      var store = db.transaction(STORE_MENUS, 'readwrite').objectStore(STORE_MENUS);
      return reqToPromise(store.get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('菜单节点不存在'); }
        var newMenuCode = (patch.menuCode !== undefined ? String(patch.menuCode).trim() : old.menuCode);
        var newParentCode = (patch.parentCode !== undefined ? String(patch.parentCode).trim() : old.parentCode);
        // menuCode 唯一性
        var chain = Promise.resolve();
        if (newMenuCode !== old.menuCode) {
          chain = checkMenuCodeUnique(db, newMenuCode, id);
        }
        return chain.then(function () {
          // 防环：新 parentCode 不能是自身的后代
          if (newParentCode && newParentCode !== old.parentCode) {
            return queryByIndex(db, STORE_MENUS, 'menuCode', newParentCode).then(function (list) {
              if (list.length === 0) throw new Error('父节点不存在');
              return getAllMenus().then(function (all) {
                if (isDescendant(newMenuCode, newParentCode, all)) {
                  throw new Error('父节点不能是自身的后代');
                }
              });
            });
          }
        }).then(function () {
          old.menuCode   = newMenuCode;
          old.menuName   = (patch.menuName !== undefined ? String(patch.menuName).trim() : old.menuName);
          old.parentCode = newParentCode;
          old.nodeType   = (patch.nodeType !== undefined ? patch.nodeType : old.nodeType);
          old.enabled    = (patch.enabled !== undefined ? patch.enabled : old.enabled);
          old.updatedBy  = op;
          old.updatedAt  = Date.now();
          return reqToPromise(store.put(old)).then(function () {
            db.close();
            return old;
          });
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function deleteMenu(id) {
    if (!id) return Promise.reject(new Error('缺少菜单 ID'));
    return openDB().then(function (db) {
      var store = db.transaction(STORE_MENUS, 'readwrite').objectStore(STORE_MENUS);
      return reqToPromise(store.get(id)).then(function (menu) {
        if (!menu) { db.close(); throw new Error('菜单节点不存在'); }
        // 检查子节点：复用当前 readwrite 事务内查询
        if (store.indexNames.contains('parentCode')) {
          return reqToPromise(store.index('parentCode').getAll(menu.menuCode)).then(function (children) {
            if (children.length > 0) { db.close(); throw new Error('请先删除其下级节点'); }
            return reqToPromise(store.delete(id)).then(function () {
              db.close();
              return true;
            });
          });
        }
        // 回退：全表扫描
        return reqToPromise(store.getAll()).then(function (all) {
          var children = (Array.isArray(all) ? all : []).filter(function (r) { return r.parentCode === menu.menuCode; });
          if (children.length > 0) { db.close(); throw new Error('请先删除其下级节点'); }
          return reqToPromise(store.delete(id)).then(function () {
            db.close();
            return true;
          });
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function getMenu(id) {
    if (!id) return Promise.resolve(null);
    return openDB().then(function (db) {
      return reqToPromise(db.transaction(STORE_MENUS, 'readonly').objectStore(STORE_MENUS).get(id))
        .then(function (r) { db.close(); return r || null; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getMenuByCode(menuCode) {
    menuCode = (menuCode == null ? '' : String(menuCode)).trim();
    if (!menuCode) return Promise.resolve(null);
    return openDB().then(function (db) {
      return queryByIndex(db, STORE_MENUS, 'menuCode', menuCode)
        .then(function (list) { db.close(); return list[0] || null; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getAllMenus() {
    return openDB().then(function (db) {
      return reqToPromise(db.transaction(STORE_MENUS, 'readonly').objectStore(STORE_MENUS).getAll())
        .then(function (list) {
          db.close();
          list = Array.isArray(list) ? list : [];
          list.sort(function (a, b) { return (a.menuCode || '').localeCompare(b.menuCode || ''); });
          return list;
        })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  // 构建菜单树（邻接表 → 树形，按 parentCode 关联）
  function buildMenuTree(list) {
    list = Array.isArray(list) ? list : [];
    var byCode = {};
    list.forEach(function (r) { if (r.menuCode) byCode[r.menuCode] = r; r.children = []; });
    var roots = [];
    list.forEach(function (r) {
      if (r.parentCode && byCode[r.parentCode]) {
        byCode[r.parentCode].children.push(r);
      } else {
        roots.push(r);
      }
    });
    return roots;
  }

  // ===================== 注册表幂等播种 =====================

  // 从权限注册表（permissions-registry.js 的 RT_PERM_REGISTRY_API.buildSeedMenus）幂等播种 menus。
  // - 按 menuCode 去重：已有节点跳过（保留用户可能改动的 enabled 等），仅补缺失节点；
  // - 自顶向下（module → page → op）保证父节点先存在，满足 createMenu 的 parentCode 校验；
  // - operator 默认 'system'（种子数据）。
  function seedMenusFromRegistry(operator) {
    var op = (operator == null ? 'system' : String(operator));
    var nodes = (root.RT_PERM_REGISTRY_API && typeof root.RT_PERM_REGISTRY_API.buildSeedMenus === 'function')
      ? root.RT_PERM_REGISTRY_API.buildSeedMenus()
      : [];
    nodes = Array.isArray(nodes) ? nodes : [];
    var stats = { created: 0, skipped: 0, total: nodes.length };

    function step(i) {
      if (i >= nodes.length) return Promise.resolve(stats);
      var node = nodes[i];
      return getMenuByCode(node.menuCode).then(function (existing) {
        if (existing) { stats.skipped++; return step(i + 1); }
        return createMenu(node, op).then(function () {
          stats.created++;
          return step(i + 1);
        });
      });
    }
    return step(0);
  }

  // ===================== 角色-权限关系（追加写历史）=====================

  // 保存角色权限：生成新 snapshotId，批量追加写 role_permission，覆盖 roles.menuCodes
  function saveRolePermissions(roleId, menuCodes, operator) {
    if (!roleId) return Promise.reject(new Error('缺少角色 ID'));
    var codes = Array.isArray(menuCodes) ? menuCodes.slice() : [];
    var op = (operator == null ? currentOperator() : String(operator));
    var snapshotId = root.RT_DB.genId();
    var now = Date.now();

    // 第一步：先读取角色（只读事务）
    return getRole(roleId).then(function (role) {
      if (!role) throw new Error('角色不存在');

      // 第二步：读取所有菜单（获取 menuCode → menuId 映射）
      return getAllMenus().then(function (allMenus) {
        var menuCodeToId = {};
        (Array.isArray(allMenus) ? allMenus : []).forEach(function (m) {
          if (m.menuCode) menuCodeToId[m.menuCode] = m.id;
        });

        // 第三步：在一个读写事务中完成所有写入
        return openDB().then(function (db) {
          // 使用一个事务覆盖 roles + role_permission 两个 store
          var tx = db.transaction([STORE_ROLES, STORE_ROLE_PERMISSION], 'readwrite');
          var roleStore = tx.objectStore(STORE_ROLES);
          var rpStore = tx.objectStore(STORE_ROLE_PERMISSION);

          return reqToPromise(roleStore.get(roleId)).then(function (currentRole) {
            if (!currentRole) { db.close(); throw new Error('角色不存在'); }
            currentRole.menuCodes = codes;
            currentRole.updatedBy = op;
            currentRole.updatedAt = now;
            reqToPromise(roleStore.put(currentRole)); // fire-and-forget in same tx

            // 批量写入 role_permission 历史行（即使 codes 为空也至少写一行占位，保证有快照可追溯）
            var writePromises;
            if (codes.length === 0) {
              // 写入一行占位记录，表示"清空权限"快照
              writePromises = [reqToPromise(rpStore.put({
                id: root.RT_DB.genId(),
                roleId: roleId,
                menuCode: '',
                menuId: '',
                snapshotId: snapshotId,
                createdBy: op, createdAt: now,
                updatedBy: op, updatedAt: now
              }))];
            } else {
              writePromises = codes.map(function (code) {
              var row = {
                id: root.RT_DB.genId(),
                roleId: roleId,
                menuCode: code,
                menuId: menuCodeToId[code] || '',
                snapshotId: snapshotId,
                createdBy: op, createdAt: now,
                updatedBy: op, updatedAt: now
              };
              return reqToPromise(rpStore.put(row));
            });
            }

            return Promise.all(writePromises).then(function () {
              // 等待事务完成
              return new Promise(function (resolve, reject) {
                tx.oncomplete = function () { db.close(); resolve({ roleId: roleId, snapshotId: snapshotId, menuCodes: codes }); };
                tx.onerror = function () { db.close(); reject(tx.error); };
              });
            });
          });
        });
      });
    });
  }

  // 获取角色的当前生效权限码集合（直接从 roles.menuCodes 读取，不去范式化回查历史表）
  function getRoleMenuCodes(roleId) {
    if (!roleId) return Promise.resolve([]);
    return getRole(roleId).then(function (role) {
      return role && Array.isArray(role.menuCodes) ? role.menuCodes.slice() : [];
    });
  }

  // 查询角色权限历史（按 snapshotId 分组，审计用）
  function getRolePermissionHistory(roleId) {
    if (!roleId) return Promise.resolve([]);
    return openDB().then(function (db) {
      return queryByIndex(db, STORE_ROLE_PERMISSION, 'roleId', roleId)
        .then(function (rows) {
          db.close();
          // 按 snapshotId 分组
          var groups = {};
          rows.forEach(function (r) {
            var sid = r.snapshotId || 'unknown';
            if (!groups[sid]) groups[sid] = [];
            groups[sid].push(r);
          });
          return groups;
        })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  // ===================== 人员-角色关系（追加写历史）=====================

  // 保存人员角色：生成新 snapshotId，批量追加写 user_role，覆盖 users.roleIds
  function saveUserRoles(userId, roleIds, operator) {
    if (!userId) return Promise.reject(new Error('缺少用户 ID'));
    var ids = Array.isArray(roleIds) ? roleIds.slice() : [];
    var op = (operator == null ? currentOperator() : String(operator));
    var snapshotId = root.RT_DB.genId();
    var now = Date.now();

    // 第一步：先读用户（确保存在）
    return (root.RT_USERS && root.RT_USERS.getUser ? root.RT_USERS.getUser(userId) : Promise.resolve(null))
      .then(function (user) {
        if (!user) throw new Error('用户不存在');

        // 第二步：校验 roleIds 存在
        var chain = Promise.resolve();
        if (ids.length > 0) {
          chain = getAllRoles().then(function (allRoles) {
            var existingIds = {};
            (Array.isArray(allRoles) ? allRoles : []).forEach(function (r) { existingIds[r.id] = true; });
            for (var i = 0; i < ids.length; i++) {
              if (!existingIds[ids[i]]) throw new Error('角色 ' + ids[i] + ' 不存在');
            }
          });
        }
        return chain.then(function () {
          // 第三步：在一个读写事务中完成 users + user_role 写入
          return openDB().then(function (db) {
            var tx = db.transaction(['users', STORE_USER_ROLE], 'readwrite');
            var userStore = tx.objectStore('users');
            var urStore = tx.objectStore(STORE_USER_ROLE);

            return reqToPromise(userStore.get(userId)).then(function (currentUser) {
              if (!currentUser) { db.close(); throw new Error('用户不存在'); }
              currentUser.roleIds = ids;
              currentUser.updatedBy = op;
              currentUser.updatedAt = now;
              reqToPromise(userStore.put(currentUser)); // fire-and-forget in same tx

              var writePromises = ids.map(function (rid) {
                var row = {
                  id: root.RT_DB.genId(),
                  userId: userId,
                  roleId: rid,
                  snapshotId: snapshotId,
                  createdBy: op, createdAt: now,
                  updatedBy: op, updatedAt: now
                };
                return reqToPromise(urStore.put(row));
              });

              return Promise.all(writePromises).then(function () {
                return new Promise(function (resolve, reject) {
                  tx.oncomplete = function () { db.close(); resolve({ userId: userId, snapshotId: snapshotId, roleIds: ids }); };
                  tx.onerror = function () { db.close(); reject(tx.error); };
                });
              });
            });
          });
        });
      });
  }

  // 获取用户当前角色 ID 集合（从 users.roleIds 读取）
  function getUserRoleIds(userId) {
    if (!userId) return Promise.resolve([]);
    if (root.RT_USERS && root.RT_USERS.getUser) {
      return root.RT_USERS.getUser(userId).then(function (user) {
        return user && Array.isArray(user.roleIds) ? user.roleIds.slice() : [];
      });
    }
    return Promise.resolve([]);
  }

  // 查询人员角色历史（按 snapshotId 分组）
  function getUserRoleHistory(userId) {
    if (!userId) return Promise.resolve([]);
    return openDB().then(function (db) {
      return queryByIndex(db, STORE_USER_ROLE, 'userId', userId)
        .then(function (rows) {
          db.close();
          var groups = {};
          rows.forEach(function (r) {
            var sid = r.snapshotId || 'unknown';
            if (!groups[sid]) groups[sid] = [];
            groups[sid].push(r);
          });
          return groups;
        })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  // ===================== 运行时解析 RT_PERM =====================
  // 提供登录态下的权限判定（§1.4）：
  //   can / canAny / canAll / getMenuCodes / isAdmin / getDataScope
  //   cachePermissions / clearPermissionCache（登录成功与角色变更时调用）
  //
  // 判权顺序（落实 §1.2 停用优先 / §1.5 admin 全部）：
  //   1) isAdmin 短路 → true（admin 账号或拥有系统管理员角色，绕过 menu.enabled，最高权限）
  //   2) 否则：code ∈ 用户有效权限集（users.roleIds→roles.menuCodes 去重）且对应 menu.enabled !== false
  //      → 命中返回 true；menu.enabled === false 时全局不生效（停用优先，高于角色拥有）
  //
  // 会话缓存：cachePermissions 预热「有效 code 集合 + 各 menu.enabled 映射」并写入 sessionStorage；
  //   角色/权限变更时调用 clearPermissionCache() 失效重算，避免每次判权读库。

  var CACHE_KEY = 'rt_perm_cache_v1';
  var _permCache = null; // { account, codes:[], isAdmin, departmentId, enabledMap:{} }

  function _persistCache(cache) {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage) {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      }
    } catch (e) { /* sessionStorage 可能不可用，忽略 */ }
  }

  function clearPermissionCache() {
    _permCache = null;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage) {
        sessionStorage.removeItem(CACHE_KEY);
      }
    } catch (e) {}
  }

  // 计算某账号的有效权限集（users.roleIds → roles.menuCodes 去重展开）
  function computeEffective(account) {
    var base = { codes: [], isAdmin: (account === 'admin'), userId: null, departmentId: '' };
    if (!root.RT_USERS || typeof root.RT_USERS.getUserByAccount !== 'function') {
      return Promise.resolve(base);
    }
    return root.RT_USERS.getUserByAccount(account).then(function (user) {
      if (!user) return base;
      var roleIds = Array.isArray(user.roleIds) ? user.roleIds : [];
      var isAdmin = (account === 'admin');
      return getAllRoles().then(function (roles) {
        var roleMap = {};
        (Array.isArray(roles) ? roles : []).forEach(function (r) { roleMap[r.id] = r; });
        var codes = [];
        roleIds.forEach(function (rid) {
          var role = roleMap[rid];
          if (!role) return;
          if (role.isSystemAdmin) isAdmin = true;
          if (Array.isArray(role.menuCodes)) codes = codes.concat(role.menuCodes);
        });
        // 去重
        var seen = {}; var out = [];
        codes.forEach(function (c) { if (!seen[c]) { seen[c] = true; out.push(c); } });
        return { codes: out, isAdmin: isAdmin, userId: user.id, departmentId: user.departmentId || '' };
      });
    });
  }

  // 预热缓存（计算有效 code 集 + 各 menu.enabled 映射）
  function cachePermissions(account) {
    if (account == null) account = (root.getCurrentUserAccount ? root.getCurrentUserAccount() : '');
    return computeEffective(account).then(function (eff) {
      return getAllMenus().then(function (menus) {
        var enabledMap = {};
        (Array.isArray(menus) ? menus : []).forEach(function (m) {
          enabledMap[m.menuCode] = (m.enabled !== false);
        });
        _permCache = {
          account: account,
          codes: eff.codes,
          isAdmin: eff.isAdmin,
          departmentId: eff.departmentId || '',
          enabledMap: enabledMap
        };
        _persistCache(_permCache);
        return _permCache;
      });
    });
  }

  function _tryLoadFromSession(account) {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage) {
        var raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.account === account) { _permCache = parsed; return true; }
        }
      }
    } catch (e) {}
    return false;
  }

  // 确保缓存就绪（命中内存 / sessionStorage / 重新计算）
  function ensureCache(account) {
    if (account == null) account = (root.getCurrentUserAccount ? root.getCurrentUserAccount() : '');
    if (_permCache && _permCache.account === account) return Promise.resolve(_permCache);
    if (_tryLoadFromSession(account)) return Promise.resolve(_permCache);
    return cachePermissions(account);
  }

  // 命中判定（已假定非 admin；停用优先通过 enabledMap 体现）
  function _hit(cache, code) {
    if (!code) return false;
    if (cache.codes.indexOf(code) < 0) return false;
    // menu 不存在（enabledMap 无记录）→ 视为未配置，不生效
    if (!Object.prototype.hasOwnProperty.call(cache.enabledMap, code)) return false;
    return cache.enabledMap[code] !== false;
  }

  function can(account, code) {
    if (!code) return Promise.resolve(false);
    return ensureCache(account).then(function (c) {
      if (c.isAdmin) return true; // admin 短路，绕过 menu.enabled（最高权限）
      return _hit(c, code);
    });
  }

  function canAny(account, codes) {
    var list = Array.isArray(codes) ? codes : [];
    return ensureCache(account).then(function (c) {
      if (c.isAdmin) return true;
      for (var i = 0; i < list.length; i++) { if (_hit(c, list[i])) return true; }
      return false;
    });
  }

  function canAll(account, codes) {
    var list = Array.isArray(codes) ? codes : [];
    return ensureCache(account).then(function (c) {
      if (c.isAdmin) return true;
      if (list.length === 0) return true; // 空集 vacuously true
      for (var i = 0; i < list.length; i++) { if (!_hit(c, list[i])) return false; }
      return true;
    });
  }

  function getMenuCodes(account) {
    return ensureCache(account).then(function (c) { return c.codes.slice(); });
  }

  function isAdmin(account) {
    if (account === 'admin') return Promise.resolve(true);
    return ensureCache(account).then(function (c) { return !!c.isAdmin; });
  }

  // 数据权限范围（§1.5）：默认含下级部门（includeSub:true）
  // 管理员 deptId 为 null 表示可见全部数据（跳过部门过滤，D6）
  function getDataScope(account) {
    return ensureCache(account).then(function (c) {
      if (c.isAdmin) {
        return { deptId: null, includeSub: true, isAdmin: true };
      }
      return { deptId: c.departmentId || null, includeSub: true, isAdmin: false };
    });
  }

  // 同步取值（缓存已预热时）；未缓存返回 null，由调用方决定回退策略
  function getCachedCodes(account) {
    if (account == null) account = (root.getCurrentUserAccount ? root.getCurrentUserAccount() : '');
    if (_permCache && _permCache.account === account) return _permCache.codes.slice();
    return null;
  }
  function isAdminCached(account) {
    if (account == null) account = (root.getCurrentUserAccount ? root.getCurrentUserAccount() : '');
    if (_permCache && _permCache.account === account) return !!_permCache.isAdmin;
    return null;
  }

  // 运行时守卫：扫描 [data-perm]，无权限则隐藏（display:none + .perm-hidden）。
  // data-perm 支持单个 code 或逗号分隔的 code 列表（任一命中即可见）。
  // 仅切换本函数设置的 display，避免覆盖元素原有内联样式；缓存未命中时自动预热。
  function guard(rootEl) {
    var doc = rootEl || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.querySelectorAll !== 'function') return Promise.resolve(0);
    var nodes = doc.querySelectorAll('[data-perm]');
    if (!nodes || !nodes.length) return Promise.resolve(0);
    var account = (typeof root.getCurrentUserAccount === 'function' ? root.getCurrentUserAccount()
      : (typeof getSessionAccount === 'function' ? getSessionAccount() : '')) || '';
    return ensureCache(account).then(function (cache) {
      var hidden = 0;
      Array.prototype.forEach.call(nodes, function (node) {
        var spec = node.getAttribute('data-perm') || '';
        var codes = spec.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        var ok = !!cache.isAdmin; // admin 全部可见（绕过 menu.enabled，最高权限）
        if (!ok) {
          for (var i = 0; i < codes.length; i++) { if (_hit(cache, codes[i])) { ok = true; break; } }
        }
        if (ok) {
          if (node.style.display === 'none') node.style.display = '';
          node.classList.remove('perm-hidden');
        } else {
          node.style.display = 'none';
          node.classList.add('perm-hidden');
          hidden++;
        }
      });
      return hidden;
    });
  }

  var RT_PERM = {
    can: can,
    canAny: canAny,
    canAll: canAll,
    getMenuCodes: getMenuCodes,
    isAdmin: isAdmin,
    getDataScope: getDataScope,
    cachePermissions: cachePermissions,
    clearPermissionCache: clearPermissionCache,
    getCachedCodes: getCachedCodes,
    isAdminCached: isAdminCached,
    guard: guard
  };

  // ===================== 导出 API =====================
  var api = {
    STORE_ROLES: STORE_ROLES,
    STORE_MENUS: STORE_MENUS,
    STORE_ROLE_PERMISSION: STORE_ROLE_PERMISSION,
    STORE_USER_ROLE: STORE_USER_ROLE,
    LIMITS: LIMITS,
    NODE_TYPES: NODE_TYPES,
    genId: function () { return root.RT_DB.genId(); },

    // 校验
    validateRole: validateRole,
    validateMenu: validateMenu,

    // 角色 CRUD
    createRole: createRole,
    updateRole: updateRole,
    deleteRole: deleteRole,
    getRole: getRole,
    getAllRoles: getAllRoles,
    getRoleByName: getRoleByName,

    // 菜单 CRUD
    createMenu: createMenu,
    updateMenu: updateMenu,
    deleteMenu: deleteMenu,
    getMenu: getMenu,
    getMenuByCode: getMenuByCode,
    getAllMenus: getAllMenus,
    buildMenuTree: buildMenuTree,
    seedMenusFromRegistry: seedMenusFromRegistry,

    // 角色-权限关系
    saveRolePermissions: saveRolePermissions,
    getRoleMenuCodes: getRoleMenuCodes,
    getRolePermissionHistory: getRolePermissionHistory,

    // 人员-角色关系
    saveUserRoles: saveUserRoles,
    getUserRoleIds: getUserRoleIds,
    getUserRoleHistory: getUserRoleHistory,

    // 运行时解析
    RT_PERM: RT_PERM
  };

  root.RT_PERMISSIONS = api;
  root.RT_PERM = RT_PERM;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
