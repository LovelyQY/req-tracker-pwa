// companies.js —— 公司表数据层（IndexedDB 版，v2 层级结构）
//
// 存储：IndexedDB 数据库 'req-tracker'，object store 'companies'，keyPath 'id'。
//   与账号库（localStorage 'rt_accounts'）不同，公司表落在 IndexedDB，容量大、结构规整。
//
// v2 设计（自引用邻接表 / 组织树）：
//   每一家公司都是一行；分公司通过「所属公司ID(parentId)」指向其父总公司。
//   两级结构：总公司(type=总公司, parentId 为空) → 分公司(type=分公司, parentId=总公司 id)。
//
// 单条记录字段：
//   id           string   32 位自动生成 ID（统一所有 ID 为 32 位，即「公司ID」，始终唯一）
//   companyName  公司名称  string  1–50 位
//   companyType  公司类型  string  '总公司' | '分公司'
//   companyCode  公司编码  string  1–10 位
//   parentId     所属公司ID string  分公司必填，指向父总公司的 id；总公司为空
//   createdBy    创建人    string  （写入时取当前会话账号）
//   createdAt    创建时间  number  （Date.now() 毫秒时间戳）
//   updatedBy    更新人    string
//   updatedAt    更新时间  number
//
// 从属关系：分公司.parentId === 总公司.id。写操作时校验 parent 必须存在且为总公司、
//   不为自身、且被转为分公司的总公司不得还有下属分公司（保持层级完整）。
//
// 升级：DB_VERSION 1→2。v1 数据含 branchName 字段、与新结构不兼容，升级时清空旧 store。
//
// 所有写操作的 operator 取 auth.js 的 getSessionAccount()，由调用方传入；本模块不直接依赖 auth.js。
(function (root) {
  'use strict';

  var DB_NAME = 'req-tracker';
  var DB_VERSION = 2;
  var STORE = 'companies';

  var LIMITS = { COMPANY_NAME_MAX: 50, COMPANY_CODE_MAX: 10 };
  var COMPANY_TYPES = ['总公司', '分公司'];

  // ===================== 32 位 ID 生成 =====================
  // 统一所有 ID 为 32 位：16 字节随机数 → 32 位十六进制小写串。
  function genId() {
    var bytes = new Uint8Array(16);
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
      root.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var s = '';
    for (var j = 0; j < bytes.length; j++) s += ('0' + bytes[j].toString(16)).slice(-2);
    return s; // 固定 32 位
  }

  // ===================== 校验 =====================
  // 仅做字段格式校验（同步）；跨行的 parent 存在性/类型在写时异步校验。
  // 返回 { ok, errors:{field:msg}, first:第一个出错字段名 }
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

  // ===================== IndexedDB 底层 =====================
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('当前环境不支持 IndexedDB')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        var os;
        if (!db.objectStoreNames.contains(STORE)) {
          os = db.createObjectStore(STORE, { keyPath: 'id' });
        } else {
          os = e.target.transaction.objectStore(STORE);
          if (e.oldVersion < 2) os.clear(); // 旧 schema（含 branchName）不兼容，清空
        }
        if (!os.indexNames.contains('companyType')) os.createIndex('companyType', 'companyType', { unique: false });
        if (!os.indexNames.contains('parentId')) os.createIndex('parentId', 'parentId', { unique: false });
        if (!os.indexNames.contains('companyCode')) os.createIndex('companyCode', 'companyCode', { unique: false });
        if (!os.indexNames.contains('updatedAt')) os.createIndex('updatedAt', 'updatedAt', { unique: false });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // 统计某公司的直接下属数量（parentId === id）
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
          id: genId(),
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
        // 转分公司时：不能选自身；所属公司须存在且为总公司；且自身不得还有下属分公司
        if (newType === '分公司') {
          if (newParent === id) { db.close(); throw new Error('不能选择自身作为所属公司'); }
          if (old.id && newParent === old.parentId && old.companyType === '分公司') {
            // 仍是无变化的分公司，跳过 parent 存在性复查
          } else {
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

  // 取全部，按 公司名称升序
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
    DB_NAME: DB_NAME, STORE: STORE, DB_VERSION: DB_VERSION,
    LIMITS: LIMITS, COMPANY_TYPES: COMPANY_TYPES,
    genId: genId, validateCompany: validateCompany,
    createCompany: createCompany, updateCompany: updateCompany,
    deleteCompany: deleteCompany, getCompany: getCompany,
    getAllCompanies: getAllCompanies, buildHierarchy: buildHierarchy, countChildren: countChildren
  };
  root.RT_COMPANIES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
