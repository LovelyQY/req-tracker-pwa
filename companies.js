// companies.js —— 公司表数据层（IndexedDB 版）
//
// 存储：IndexedDB 数据库 'req-tracker'，object store 'companies'，keyPath 'id'。
//   与账号库（localStorage 'rt_accounts'）不同，公司表按需求落在 IndexedDB，
//   容量更大、结构更规整，便于后续扩展更多「表」。
//
// 单条记录字段（与需求一致）：
//   id           string   32 位自动生成 ID（统一所有 ID 为 32 位，见 genId）
//   companyName  公司名称  string  1–50 位（上级公司，分公司从属于它）
//   branchName   分公司名称 string  1–50 位（本记录代表的分支）
//   companyCode  公司编码  string  1–10 位（公司级编码，同一公司的各分公司共享）
//   createdBy    创建人    string  （写入时取当前会话账号）
//   createdAt    创建时间  number  （Date.now() 毫秒时间戳）
//   updatedBy    更新人    string
//   updatedAt    更新时间  number
//
// 从属关系：一行 = 一个分公司，通过 companyName + companyCode 从属于其上级公司；
//   同一 companyCode 下的多条记录即构成「某公司的多家分公司」。
//
// 所有写操作（create/update）的 operator 参数取 auth.js 的 getSessionAccount()，
// 由调用方传入；本模块不再直接依赖 auth.js，保持数据层独立、可在 Node 下单测。
(function (root) {
  'use strict';

  var DB_NAME = 'req-tracker';
  var DB_VERSION = 1;
  var STORE = 'companies';

  // 字段长度上限（需求规定）
  var LIMITS = {
    COMPANY_NAME_MAX: 50,
    BRANCH_NAME_MAX: 50,
    COMPANY_CODE_MAX: 10
  };

  // ===================== 32 位 ID 生成 =====================
  // 统一所有 ID 为 32 位：16 字节随机数 → 32 位十六进制小写串（与 UUID v4 去横线后长度一致）。
  function genId() {
    var bytes = new Uint8Array(16);
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
      root.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var s = '';
    for (var j = 0; j < bytes.length; j++) {
      s += ('0' + bytes[j].toString(16)).slice(-2);
    }
    return s; // 固定 32 位
  }

  // ===================== 校验 =====================
  // 返回 { ok, errors:{field:msg}, first:第一个出错字段名 }
  function validateCompany(data) {
    var errors = {};
    data = data || {};
    var companyName = (data.companyName == null ? '' : String(data.companyName)).trim();
    var branchName = (data.branchName == null ? '' : String(data.branchName)).trim();
    var companyCode = (data.companyCode == null ? '' : String(data.companyCode)).trim();

    if (!companyName) errors.companyName = '请输入公司名称';
    else if (companyName.length > LIMITS.COMPANY_NAME_MAX) errors.companyName = '公司名称最多 ' + LIMITS.COMPANY_NAME_MAX + ' 位';

    if (!branchName) errors.branchName = '请输入分公司名称';
    else if (branchName.length > LIMITS.BRANCH_NAME_MAX) errors.branchName = '分公司名称最多 ' + LIMITS.BRANCH_NAME_MAX + ' 位';

    if (!companyCode) errors.companyCode = '请输入公司编码';
    else if (companyCode.length > LIMITS.COMPANY_CODE_MAX) errors.companyCode = '公司编码最多 ' + LIMITS.COMPANY_CODE_MAX + ' 位';

    var first = null;
    ['companyName', 'branchName', 'companyCode'].forEach(function (k) {
      if (errors[k] && !first) first = k;
    });
    return { ok: Object.keys(errors).length === 0, errors: errors, first: first };
  }

  // ===================== IndexedDB 底层 =====================
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('当前环境不支持 IndexedDB'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('companyCode', 'companyCode', { unique: false });
          os.createIndex('companyName', 'companyName', { unique: false });
          os.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(db, mode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }
  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // ===================== CRUD =====================
  // 新增：operator 为当前会话账号（创建人/更新人）
  function createCompany(data, operator) {
    var v = validateCompany(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    var record = {
      id: genId(),
      companyName: (data.companyName + '').trim(),
      branchName: (data.branchName + '').trim(),
      companyCode: (data.companyCode + '').trim(),
      createdBy: op,
      createdAt: now,
      updatedBy: op,
      updatedAt: now
    };
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').put(record)).then(function () {
        db.close();
        return record;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 更新：仅改公司名称/分公司名称/公司编码，保留创建人/创建时间，刷新更新人/更新时间
  function updateCompany(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateCompany(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      var store = tx(db, 'readwrite');
      return reqToPromise(store.get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('记录不存在'); }
        old.companyName = (patch.companyName + '').trim();
        old.branchName = (patch.branchName + '').trim();
        old.companyCode = (patch.companyCode + '').trim();
        old.updatedBy = op;
        old.updatedAt = Date.now();
        return reqToPromise(store.put(old)).then(function () {
          db.close();
          return old;
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function deleteCompany(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id)).then(function () {
        db.close();
        return true;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function getCompany(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) {
        db.close();
        return r || null;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 取全部，按 公司名称升序 → 分公司名称升序（便于按公司分组稳定展示）
  function getAllCompanies() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) {
          var c = (a.companyName || '').localeCompare(b.companyName || '', 'zh');
          if (c !== 0) return c;
          return (a.branchName || '').localeCompare(b.branchName || '', 'zh');
        });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 按公司编码分组（用于前端展示从属关系）
  function groupByCompany(list) {
    var groups = {};
    (Array.isArray(list) ? list : []).forEach(function (r) {
      var key = (r.companyCode || '').trim() || '（未编码）';
      (groups[key] = groups[key] || []).push(r);
    });
    return groups;
  }

  var api = {
    DB_NAME: DB_NAME,
    STORE: STORE,
    LIMITS: LIMITS,
    genId: genId,
    validateCompany: validateCompany,
    createCompany: createCompany,
    updateCompany: updateCompany,
    deleteCompany: deleteCompany,
    getCompany: getCompany,
    getAllCompanies: getAllCompanies,
    groupByCompany: groupByCompany
  };

  // 挂全局，供各页面复用
  root.RT_COMPANIES = api;

  // Node 单测支持
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
