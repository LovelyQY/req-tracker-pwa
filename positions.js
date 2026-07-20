// positions.js —— 职位表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'，v3）。本模块注册 'positions' store。
// 职位为扁平主数据（无层级），记录字段：
//   id            string   32 位自动 ID（即「职位ID」）
//   positionName  职位名称  string  1–50 位（必填）
//   positionCode  职位编码  string  1–10 位（必填）
//   levelCode     职级 code  string  选填，取值见字典表 职级 类型（STAFF 普通员工 / SUPERVISOR 主管 等）；实体只存 code
//   positionLevel 职级文案  string  选填，展示用（由页面写入字典 name，供不加载字典的场景直接读）
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
(function (root) {
  'use strict';

  var STORE = 'positions';
  var LIMITS = { POSITION_NAME_MAX: 50, POSITION_CODE_MAX: 10, LEVEL_CODE_MAX: 64 };

  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'positionCode', path: 'positionCode' },
        { name: 'positionLevel', path: 'positionLevel' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  function validatePosition(data) {
    var errors = {};
    data = data || {};
    var positionName = (data.positionName == null ? '' : String(data.positionName)).trim();
    var positionCode = (data.positionCode == null ? '' : String(data.positionCode)).trim();
    var levelCode = (data.levelCode == null ? '' : String(data.levelCode)).trim();

    if (!positionName) errors.positionName = '请输入职位名称';
    else if (positionName.length > LIMITS.POSITION_NAME_MAX) errors.positionName = '职位名称最多 ' + LIMITS.POSITION_NAME_MAX + ' 位';

    if (!positionCode) errors.positionCode = '请输入职位编码';
    else if (positionCode.length > LIMITS.POSITION_CODE_MAX) errors.positionCode = '职位编码最多 ' + LIMITS.POSITION_CODE_MAX + ' 位';

    if (levelCode.length > LIMITS.LEVEL_CODE_MAX) errors.levelCode = '职级 code 过长';

    var first = null;
    ['positionName', 'positionCode', 'levelCode'].forEach(function (k) {
      if (errors[k] && !first) first = k;
    });
    return { ok: Object.keys(errors).length === 0, errors: errors, first: first };
  }

  function openDB() { return root.RT_DB.openDB(); }
  function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function createPosition(data, operator) {
    var v = validatePosition(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    // ★ 用 try/finally 统一释放 db 连接，杜绝连接泄漏导致后续 openDB 被 blocked
    return openDB().then(function (db) {
      var closed = false;
      function safeClose(){ if (closed) return; closed = true; try { db.close(); } catch (_) {} }
      function onErr(err){ safeClose(); throw err; }
      try {
        var record = {
          id: root.RT_DB.genId(),
          positionName: (data.positionName + '').trim(),
          positionCode: (data.positionCode + '').trim(),
          levelCode: (data.levelCode == null ? '' : String(data.levelCode)).trim(),
          positionLevel: (data.positionLevel == null ? '' : String(data.positionLevel)).trim(),
          createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
        };
        return reqToPromise(tx(db, 'readwrite').put(record)).then(function () { safeClose(); return record; }, onErr);
      } catch (syncErr) {
        safeClose();
        throw syncErr;
      }
    });
  }

  function updatePosition(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validatePosition(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    // ★ try/finally 保护 db 连接
    return openDB().then(function (db) {
      var closed = false;
      function safeClose(){ if (closed) return; closed = true; try { db.close(); } catch (_) {} }
      function onErr(err){ safeClose(); throw err; }
      try {
        return reqToPromise(tx(db, 'readwrite').get(id)).then(function (old) {
          if (!old) throw new Error('记录不存在');
          old.positionName = (patch.positionName + '').trim();
          old.positionCode = (patch.positionCode + '').trim();
          old.levelCode = (patch.levelCode == null ? '' : String(patch.levelCode)).trim();
          old.positionLevel = (patch.positionLevel == null ? '' : String(patch.positionLevel)).trim();
          old.updatedBy = op;
          old.updatedAt = Date.now();
          return reqToPromise(tx(db, 'readwrite').put(old)).then(function () { safeClose(); return old; }, onErr);
        }, onErr);
      } catch (syncErr) {
        safeClose();
        throw syncErr;
      }
    });
  }

  function deletePosition(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      var closed = false;
      function safeClose(){ if (closed) return; closed = true; try { db.close(); } catch (_) {} }
      function onErr(err){ safeClose(); throw err; }
      try {
        return reqToPromise(tx(db, 'readwrite').delete(id))
          .then(function () { safeClose(); return true; }, onErr);
      } catch (syncErr) { safeClose(); throw syncErr; }
    });
  }

  function getPosition(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllPositions() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.positionName || '').localeCompare(b.positionName || '', 'zh'); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS,
    genId: function () { return root.RT_DB.genId(); },
    validatePosition: validatePosition,
    createPosition: createPosition, updatePosition: updatePosition,
    deletePosition: deletePosition, getPosition: getPosition, getAllPositions: getAllPositions
  };
  root.RT_POSITIONS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
