// companies.js —— 公司表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'，v3）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 记录字段：
//   id           string   32 位自动 ID（即「公司ID」，始终唯一）
//   companyName  公司名称  string  1–50 位
//   companyType  公司类型  string  '总公司' | '分公司'
//   companyCode  公司编码  string  1–10 位
//   parentId     所属公司ID string  分公司必填，指向父总公司的 id；总公司为空
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
//
// 从属关系：分公司.parentId === 总公司.id。写操作校验 parent 存在且为总公司、不为自身、
//   被转分公司的总公司不得还有下属分公司。
(function (root) {
  'use strict';

  var STORE = 'companies';
  var LIMITS = { COMPANY_NAME_MAX: 50, COMPANY_CODE_MAX: 10 };
  var COMPANY_TYPES = ['总公司', '分公司'];

  // 注册 store（db.js 首次打开时创建；升级到 v3 时清空旧的（含旧 branchName 字段）数据）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'companyType', path: 'companyType' },
        { name: 'parentId', path: 'parentId' },
        { name: 'companyCode', path: 'companyCode' },
        { name: 'updatedAt', path: 'updatedAt' }
      ],
      onUpgrade: function (os, tx, oldVersion) { if (oldVersion < 3) os.clear(); }
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateCompany(data) {
    var errors = {};
    data = data || {};
    var companyName = (data.companyName == null ? '' : String(data.companyName)).trim();
    var companyType = (data.companyType == null ? '' : String(data.companyType));
    var companyCode = (data.companyCode == null ? '' : String(data.companyCode)).trim();
    var parentId = (data.parentId == null ? '' : String(data.parentId));

    if (!companyName) errors.companyName = '请输入公司名称';
    else if (companyName.length > LIMITS.COMPANY_NAME_MAX) errors.companyName = '公司名称最多 ' + LIMITS.COMPANY_NAME_MAX + ' 位';

    if (COMPANY_TYPES.indexOf(companyType) < 0) errors.companyType = '请选择公司类型';

    if (!companyCode) errors.companyCode = '请输入公司编码';
    else if (companyCode.length > LIMITS.COMPANY_CODE_MAX) errors.companyCode = '公司编码最多 ' + LIMITS.COMPANY_CODE_MAX + ' 位';

    if (companyType === '分公司' && !parentId) errors.parent = '请选择所属公司';

    var first = null;
    ['companyName', 'companyType', 'companyCode', 'parent'].forEach(function (k) {
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

  // ===================== CRUD =====================
  function createCompany(data, operator) {
    var v = validateCompany(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    var parentId = (data.companyType === '分公司') ? String(data.parentId) : '';
    return openDB().then(function (db) {
      var store = tx(db, 'readwrite');
      var chain = Promise.resolve();
      if (data.companyType === '分公司') {
        chain = reqToPromise(store.get(parentId)).then(function (parent) {
          if (!parent) throw new Error('所属公司不存在');
          if (parent.companyType !== '总公司') throw new Error('所属公司必须是总公司');
        });
      }
      return chain.then(function () {
        var record = {
          id: root.RT_DB.genId(),
          companyName: (data.companyName + '').trim(),
          companyType: data.companyType,
          companyCode: (data.companyCode + '').trim(),
          parentId: parentId,
          createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
        };
        return reqToPromise(store.put(record)).then(function () { db.close(); return record; });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function updateCompany(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateCompany(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    var newType = patch.companyType;
    var newParent = (newType === '分公司') ? String(patch.parentId) : '';
    return openDB().then(function (db) {
      var store = tx(db, 'readwrite');
      return reqToPromise(store.get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('记录不存在'); }
        if (newType === '分公司') {
          if (newParent === id) { db.close(); throw new Error('不能选择自身作为所属公司'); }
          if (!(old.companyType === '分公司' && old.parentId === newParent)) {
            return reqToPromise(store.get(newParent)).then(function (parent) {
              if (!parent) { db.close(); throw new Error('所属公司不存在'); }
              if (parent.companyType !== '总公司') { db.close(); throw new Error('所属公司必须是总公司'); }
            }).then(function () {
              return countChildren(id).then(function (n) {
                if (n > 0) { db.close(); throw new Error('该公司下还有分公司，不能转为分公司'); }
              });
            });
          }
        }
        old.companyName = (patch.companyName + '').trim();
        old.companyType = newType;
        old.companyCode = (patch.companyCode + '').trim();
        old.parentId = newParent;
        old.updatedBy = op;
        old.updatedAt = Date.now();
        return reqToPromise(store.put(old)).then(function () { db.close(); return old; });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function deleteCompany(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return countChildren(id).then(function (n) {
      if (n > 0) return Promise.reject(new Error('请先删除其下属分公司'));
      return openDB().then(function (db) {
        return reqToPromise(tx(db, 'readwrite').delete(id))
          .then(function () { db.close(); return true; })
          .catch(function (err) { db.close(); throw err; });
      });
    });
  }

  function getCompany(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllCompanies() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.companyName || '').localeCompare(b.companyName || '', 'zh'); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 构建层级：总公司为根，分公司挂到 parentId 对应的父下（两级）
  function buildHierarchy(list) {
    list = Array.isArray(list) ? list : [];
    var byId = {};
    list.forEach(function (r) { byId[r.id] = r; r.children = []; });
    var roots = [];
    list.forEach(function (r) {
      if (r.companyType === '分公司' && r.parentId && byId[r.parentId]) byId[r.parentId].children.push(r);
      else roots.push(r);
    });
    return roots;
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS, COMPANY_TYPES: COMPANY_TYPES,
    genId: function () { return root.RT_DB.genId(); },
    validateCompany: validateCompany,
    createCompany: createCompany, updateCompany: updateCompany,
    deleteCompany: deleteCompany, getCompany: getCompany,
    getAllCompanies: getAllCompanies, buildHierarchy: buildHierarchy, countChildren: countChildren
  };
  root.RT_COMPANIES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
