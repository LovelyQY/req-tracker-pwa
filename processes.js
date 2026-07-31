// processes.js —— 流程表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 记录字段：
//   id            string   32 位自动 ID（即「流程ID」，始终唯一）
//   code          流程编码    string  1–10 位
//   name          流程名称（主页TAB显示名）  string  1–30 位
//   description   描述        string  最多 200 位（可空）
//   workflowId    关联工作流ID  string  （从 RT_WORKFLOWS 选择，外键）
//   targetKey     关联页面 key  string  （从 PROCESS_TARGETS 白名单选择，如 'workflow'/'report-task'）
//   iconKey       图标 key     string  （默认 'process'，从 RT_PAGE_ICONS 选择）
//   sort          TAB 排序权重  number
//   enabled       是否启用      boolean （默认 true，false 则不显示 TAB）
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
//
// 流程为独立定义，删除无子项依赖。
(function (root) {
  'use strict';

  var STORE = 'processes';
  var LIMITS = { CODE_MAX: 10, NAME_MAX: 30, DESC_MAX: 200 };
  var PROCESS_TARGETS = ['workflow', 'report-task', 'report-todo', 'report-bug', 'report-meeting', 'report-stats'];

  // 注册 store（db.js 首次打开时创建；升级时探测缺失 store 自动补建）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'code', path: 'code' },
        { name: 'enabled', path: 'enabled' },
        { name: 'sort', path: 'sort' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateProcess(data) {
    var errors = {};
    data = data || {};
    var code = (data.code == null ? '' : String(data.code)).trim();
    var name = (data.name == null ? '' : String(data.name)).trim();
    var description = (data.description == null ? '' : String(data.description)).trim();
    var workflowId = (data.workflowId == null ? '' : String(data.workflowId));
    var targetKey = (data.targetKey == null ? '' : String(data.targetKey));
    var iconKey = (data.iconKey == null ? '' : String(data.iconKey)).trim();
    if (!iconKey) iconKey = 'process';

    if (!code) errors.code = '请输入流程编码';
    else if (code.length > LIMITS.CODE_MAX) errors.code = '流程编码最多 ' + LIMITS.CODE_MAX + ' 位';

    if (!name) errors.name = '请输入流程名称';
    else if (name.length > LIMITS.NAME_MAX) errors.name = '流程名称最多 ' + LIMITS.NAME_MAX + ' 位';

    if (description.length > LIMITS.DESC_MAX) errors.description = '描述最多 ' + LIMITS.DESC_MAX + ' 位';

    if (!workflowId) errors.workflowId = '请选择关联工作流';

    if (!targetKey) errors.targetKey = '请选择关联页面';
    else if (PROCESS_TARGETS.indexOf(targetKey) < 0) errors.targetKey = '关联页面必须是已有页面';

    if (!iconKey) errors.iconKey = '请选择图标';

    var first = null;
    ['code', 'name', 'description', 'workflowId', 'targetKey', 'iconKey'].forEach(function (k) {
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

  function normEnabled(v) {
    if (v === true || v === 'true' || v === 1 || v === '1') return true;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true; // 默认启用
  }
  function normSort(v) {
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  // ===================== CRUD =====================
  function createProcess(data, operator) {
    var v = validateProcess(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      var record = {
        id: root.RT_DB.genId(),
        code: (data.code + '').trim(),
        name: (data.name + '').trim(),
        description: (data.description == null ? '' : String(data.description)).trim(),
        workflowId: String(data.workflowId),
        targetKey: String(data.targetKey),
        iconKey: ((data.iconKey == null ? '' : String(data.iconKey)).trim() || 'process'),
        sort: normSort(data.sort),
        enabled: normEnabled(data.enabled),
        createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
      };
      return reqToPromise(tx(db, 'readwrite').put(record)).then(function () { db.close(); return record; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function updateProcess(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateProcess(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('记录不存在'); }
        old.code = (patch.code + '').trim();
        old.name = (patch.name + '').trim();
        old.description = (patch.description == null ? '' : String(patch.description)).trim();
        old.workflowId = String(patch.workflowId);
        old.targetKey = String(patch.targetKey);
        old.iconKey = ((patch.iconKey == null ? '' : String(patch.iconKey)).trim() || 'process');
        old.sort = normSort(patch.sort);
        old.enabled = normEnabled(patch.enabled);
        old.updatedBy = op;
        old.updatedAt = Date.now();
        return reqToPromise(tx(db, 'readwrite').put(old)).then(function () { db.close(); return old; });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function deleteProcess(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id))
        .then(function () { db.close(); return true; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getProcess(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllProcesses() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) {
          var sa = (a.sort == null ? 0 : Number(a.sort)) || 0;
          var sb = (b.sort == null ? 0 : Number(b.sort)) || 0;
          if (sa !== sb) return sa - sb;
          return (a.name || '').localeCompare(b.name || '', 'zh');
        });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS, PROCESS_TARGETS: PROCESS_TARGETS,
    genId: function () { return root.RT_DB.genId(); },
    validateProcess: validateProcess,
    createProcess: createProcess, updateProcess: updateProcess,
    deleteProcess: deleteProcess, getProcess: getProcess,
    getAllProcesses: getAllProcesses
  };
  root.RT_PROCESSES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
