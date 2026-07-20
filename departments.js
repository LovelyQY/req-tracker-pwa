// departments.js —— 部门表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'，v3）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 记录字段：
//   id           string   32 位自动 ID（即「部门ID」，始终唯一）
//   deptName     部门名称  string  1–50 位
//   deptCode     部门编码  string  1–10 位
//   companyId    所属公司ID string  必填，指向 companies 表的公司（总公司/分公司均可）
//   parentId     上级部门ID string  可选，指向同公司内的上级部门（自引用邻接表，支持多级）；顶级部门为空
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
//
// 从属关系：部门必须归属某个公司；上级部门必须是同一公司内的部门；删除前须先删除其下级部门。
(function (root) {
  'use strict';

  var STORE = 'departments';
  var LIMITS = { DEPT_NAME_MAX: 50, DEPT_CODE_MAX: 10 };

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'deptCode', path: 'deptCode' },
        { name: 'companyId', path: 'companyId' },
        { name: 'parentId', path: 'parentId' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateDept(data) {
    var errors = {};
    data = data || {};
    var deptName = (data.deptName == null ? '' : String(data.deptName)).trim();
    var deptCode = (data.deptCode == null ? '' : String(data.deptCode)).trim();
    var companyId = (data.companyId == null ? '' : String(data.companyId));
    var parentId = (data.parentId == null ? '' : String(data.parentId)).trim();

    if (!deptName) errors.deptName = '请输入部门名称';
    else if (deptName.length > LIMITS.DEPT_NAME_MAX) errors.deptName = '部门名称最多 ' + LIMITS.DEPT_NAME_MAX + ' 位';

    if (!deptCode) errors.deptCode = '请输入部门编码';
    else if (deptCode.length > LIMITS.DEPT_CODE_MAX) errors.deptCode = '部门编码最多 ' + LIMITS.DEPT_CODE_MAX + ' 位';

    if (!companyId) errors.companyId = '请选择所属公司';

    // 编辑场景：parentId 不能是自身（直接自环）
    if (parentId && data._selfId && parentId === String(data._selfId)) {
      errors.parentId = '不能选择自身作为上级部门';
    }

    var first = null;
    ['deptName', 'deptCode', 'companyId', 'parentId'].forEach(function (k) {
      if (errors[k] && !first) first = k;
    });
    return { ok: Object.keys(errors).length === 0, errors: errors, first: first };
  }

  // ===================== IndexedDB 底层（委托 db.js）=====================
  function openDB() { return root.RT_DB.openDB(); }
  function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function countChildren(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').index('parentId').getAll(id))
        .then(function (list) { db.close(); return (Array.isArray(list) ? list : []).length; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  // 防环：判断 ancestorId 是否为 deptId 的后代（从 ancestorId 沿 parentId 向上爬，遇到 deptId 即为其后代）
  function isDescendant(deptId, ancestorId, all) {
    var byId = {};
    all.forEach(function (r) { byId[r.id] = r; });
    var cur = byId[ancestorId];
    var guard = 0;
    while (cur && guard < 200) {
      if (cur.id === deptId) return true;
      cur = cur.parentId ? byId[cur.parentId] : null;
      guard++;
    }
    return false;
  }

  // ===================== CRUD =====================
  function createDept(data, operator) {
    var v = validateDept(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    var companyId = String(data.companyId);
    var parentId = (data.parentId && data.parentId.trim && data.parentId.trim()) ? String(data.parentId).trim() : '';
    // 先跨连接完成存在性校验（不持有写事务，避免打开新连接时与未提交事务相互阻塞导致死锁）
    return root.RT_COMPANIES.getCompany(companyId).then(function (company) {
      if (!company) throw new Error('所属公司不存在');
      if (!parentId) return null;
      return root.RT_DEPTS.getDept(parentId);
    }).then(function (parent) {
      if (parentId) {
        if (!parent) throw new Error('上级部门不存在');
        if (parent.companyId !== companyId) throw new Error('上级部门必须属于同一公司');
      }
      // 校验通过后再开连接写入
      return openDB().then(function (db) {
        var store = tx(db, 'readwrite');
        var record = {
          id: root.RT_DB.genId(),
          deptName: (data.deptName + '').trim(),
          deptCode: (data.deptCode + '').trim(),
          companyId: companyId,
          parentId: parentId,
          createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
        };
        return reqToPromise(store.put(record)).then(function () { db.close(); return record; });
      });
    });
  }

  function updateDept(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateDept(Object.assign({}, patch, { _selfId: id }));
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    var companyId = String(patch.companyId);
    var parentId = (patch.parentId && patch.parentId.trim && patch.parentId.trim()) ? String(patch.parentId).trim() : '';
    // 先跨连接完成校验（防环需读取全量部门，亦在事务外进行，避免死锁）
    return Promise.resolve()
      .then(function () {
        if (!parentId) return;
        if (parentId === id) throw new Error('不能选择自身作为上级部门');
        return Promise.all([
          root.RT_COMPANIES.getCompany(companyId),
          root.RT_DEPTS.getDept(parentId),
          getAllDepartments()
        ]).then(function (res) {
          var company = res[0], parent = res[1], all = res[2];
          if (!company) throw new Error('所属公司不存在');
          if (!parent) throw new Error('上级部门不存在');
          if (parent.companyId !== companyId) throw new Error('上级部门必须属于同一公司');
          if (isDescendant(id, parentId, all)) throw new Error('上级部门不能是自身的下级部门');
        });
      })
      .then(function () {
        return openDB().then(function (db) {
          var store = tx(db, 'readwrite');
          return reqToPromise(store.get(id)).then(function (old) {
            if (!old) { db.close(); throw new Error('记录不存在'); }
            old.deptName = (patch.deptName + '').trim();
            old.deptCode = (patch.deptCode + '').trim();
            old.companyId = companyId;
            old.parentId = parentId;
            old.updatedBy = op;
            old.updatedAt = Date.now();
            return reqToPromise(store.put(old)).then(function () { db.close(); return old; });
          });
        });
      });
  }

  function deleteDept(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return countChildren(id).then(function (n) {
      if (n > 0) return Promise.reject(new Error('请先删除其下级部门'));
      return openDB().then(function (db) {
        return reqToPromise(tx(db, 'readwrite').delete(id))
          .then(function () { db.close(); return true; })
          .catch(function (err) { db.close(); throw err; });
      });
    });
  }

  function getDept(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllDepartments() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.deptName || '').localeCompare(b.deptName || '', 'zh'); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 按 companyId 分组
  function groupByCompany(list) {
    var byCompany = {};
    (Array.isArray(list) ? list : []).forEach(function (r) {
      (byCompany[r.companyId] = byCompany[r.companyId] || []).push(r);
    });
    return byCompany;
  }

  // 构建层级：parentId 指向同列表内某部门则挂为子级（支持多级）；无 parentId 或父缺失者为根
  function buildHierarchy(list) {
    list = Array.isArray(list) ? list : [];
    var byId = {};
    list.forEach(function (r) { byId[r.id] = r; r.children = []; });
    var roots = [];
    list.forEach(function (r) {
      if (r.parentId && byId[r.parentId]) byId[r.parentId].children.push(r);
      else roots.push(r);
    });
    return roots;
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS,
    genId: function () { return root.RT_DB.genId(); },
    validateDept: validateDept,
    createDept: createDept, updateDept: updateDept,
    deleteDept: deleteDept, getDept: getDept,
    getAllDepartments: getAllDepartments,
    countChildren: countChildren,
    groupByCompany: groupByCompany, buildHierarchy: buildHierarchy
  };
  root.RT_DEPTS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
