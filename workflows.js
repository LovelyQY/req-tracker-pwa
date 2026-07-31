// workflows.js —— 工作流表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 记录字段：
//   id            string   32 位自动 ID（即「工作流ID」，始终唯一）
//   code          工作流编码  string  1–10 位
//   name          工作流名称  string  1–50 位
//   description   描述        string  最多 200 位（可空）
//   targets       关联对象类型  string[]  取自 ['task','todo','bug','meeting']
//   nodes         节点名称列表  string[]  如 ['提交','审批','完成']
//   transitions   流转规则列表  string[]  如 ['提交→审批','审批→完成']
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
//
// 工作流为独立定义，删除无子项依赖。
(function (root) {
  'use strict';

  var STORE = 'workflows';
  var LIMITS = { CODE_MAX: 10, NAME_MAX: 50, DESC_MAX: 200 };
  var TARGETS = ['task', 'todo', 'bug', 'meeting'];
  var TARGET_LABELS = { task: '需求任务', todo: '待办', bug: '缺陷', meeting: '会议' };

  // 注册 store（db.js 首次打开时创建）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'code', path: 'code' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateWorkflow(data) {
    var errors = {};
    data = data || {};
    var code = (data.code == null ? '' : String(data.code)).trim();
    var name = (data.name == null ? '' : String(data.name)).trim();
    var description = (data.description == null ? '' : String(data.description)).trim();

    if (!code) errors.code = '请输入工作流编码';
    else if (code.length > LIMITS.CODE_MAX) errors.code = '工作流编码最多 ' + LIMITS.CODE_MAX + ' 位';

    if (!name) errors.name = '请输入工作流名称';
    else if (name.length > LIMITS.NAME_MAX) errors.name = '工作流名称最多 ' + LIMITS.NAME_MAX + ' 位';

    if (description.length > LIMITS.DESC_MAX) errors.description = '描述最多 ' + LIMITS.DESC_MAX + ' 位';

    var first = null;
    ['code', 'name', 'description'].forEach(function (k) {
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

  function asArray(v) {
    if (Array.isArray(v)) return v.map(function (x) { return String(x); });
    return [];
  }

  // ===================== CRUD =====================
  function createWorkflow(data, operator) {
    var v = validateWorkflow(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      var record = {
        id: root.RT_DB.genId(),
        code: (data.code + '').trim(),
        name: (data.name + '').trim(),
        description: (data.description == null ? '' : String(data.description)).trim(),
        targets: asArray(data.targets),
        nodes: asArray(data.nodes),
        transitions: asArray(data.transitions),
        createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
      };
      return reqToPromise(tx(db, 'readwrite').put(record)).then(function () { db.close(); return record; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function updateWorkflow(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateWorkflow(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('记录不存在'); }
        old.code = (patch.code + '').trim();
        old.name = (patch.name + '').trim();
        old.description = (patch.description == null ? '' : String(patch.description)).trim();
        old.targets = asArray(patch.targets);
        old.nodes = asArray(patch.nodes);
        old.transitions = asArray(patch.transitions);
        old.updatedBy = op;
        old.updatedAt = Date.now();
        return reqToPromise(tx(db, 'readwrite').put(old)).then(function () { db.close(); return old; });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function deleteWorkflow(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id))
        .then(function () { db.close(); return true; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getWorkflow(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllWorkflows() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'zh'); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS, TARGETS: TARGETS, TARGET_LABELS: TARGET_LABELS,
    genId: function () { return root.RT_DB.genId(); },
    validateWorkflow: validateWorkflow,
    createWorkflow: createWorkflow, updateWorkflow: updateWorkflow,
    deleteWorkflow: deleteWorkflow, getWorkflow: getWorkflow,
    getAllWorkflows: getAllWorkflows
  };
  root.RT_WORKFLOWS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
