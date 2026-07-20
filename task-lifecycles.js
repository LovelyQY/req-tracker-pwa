// task-lifecycles.js —— 任务生命流程表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 这是「需求任务」的流水审计表：每次状态流转（开发提交 / 测试开始 / 暂停 / 暂停恢复 /
// 测试完成 / 上线 / 重置）追加一行，append-only，不更新、不删除单条（除非随任务级联清理）。
//
// 记录字段：
//   id            string   32 位自动 ID（流程记录ID，唯一）
//   taskId        任务ID    string  必填，指向 requirementTasks 表（任务再归属项目 / 项目版本）
//   statusCode    任务状态code string 必填，取值见字典表 `任务状态`（TODO/SUBMITTED/TESTING/TESTED/ONLINE）
//   operationCode 操作code  string  必填，取值见字典表 `任务操作管理`（DEV_SUBMIT/TEST_START/PAUSE/RESUME/TEST_DONE/ONLINE/RESET）
//   operator      操作人    string  选填（缺省空串），执行该操作的用户
//   operateTime   操作时间  number  毫秒时间戳，缺省为写入当前时间
//
// 两种 code 均取自字典表（已由 dictionary.js 播种），本模块仅在写入时校验合法性。
// 外键：taskId 必须指向存在的需求任务（RT_REQUIREMENT_TASKS）。
// 删除需求任务时，由 requirement-tasks.js 调用本模块的 deleteByTaskId 级联清理。
(function (root) {
  'use strict';

  var STORE = 'taskLifecycles';
  var LIMITS = { OPERATOR_MAX: 64 };

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'taskId', path: 'taskId' },
        { name: 'statusCode', path: 'statusCode' },
        { name: 'operationCode', path: 'operationCode' },
        { name: 'operator', path: 'operator' },
        { name: 'operateTime', path: 'operateTime' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateTaskLifecycle(data) {
    var errors = {};
    data = data || {};
    var taskId = (data.taskId == null ? '' : String(data.taskId));
    var statusCode = (data.statusCode == null ? '' : String(data.statusCode)).trim();
    var operationCode = (data.operationCode == null ? '' : String(data.operationCode)).trim();
    var operator = (data.operator == null ? '' : String(data.operator));

    if (!taskId) errors.taskId = '请关联任务ID';
    if (!statusCode) errors.statusCode = '请选择任务状态';
    if (!operationCode) errors.operationCode = '请选择操作';
    if (operator && operator.length > LIMITS.OPERATOR_MAX) errors.operator = '操作人最多 ' + LIMITS.OPERATOR_MAX + ' 位';

    var first = null;
    ['taskId', 'statusCode', 'operationCode', 'operator'].forEach(function (k) {
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

  function assertDictCode(type, code) {
    if (!code) return Promise.resolve();
    return root.RT_DICT.getDictByType(type).then(function (list) {
      var ok = (Array.isArray(list) ? list : []).some(function (d) { return d && d.code === code; });
      if (!ok) throw new Error('字典枚举无效：' + type + ' = ' + code);
    });
  }

  function assertTaskExists(taskId) {
    if (!root.RT_REQUIREMENT_TASKS || typeof root.RT_REQUIREMENT_TASKS.getRequirementTask !== 'function') {
      return Promise.resolve(); // 模块未加载时跳过外键校验（运行时由页面保证依赖已加载）
    }
    return root.RT_REQUIREMENT_TASKS.getRequirementTask(String(taskId)).then(function (t) {
      if (!t) throw new Error('关联的需求任务不存在');
    });
  }

  // ===================== CRUD（append-only 流水）=====================
  function createTaskLifecycle(data) {
    var v = validateTaskLifecycle(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var base = {
      taskId: String(data.taskId),
      statusCode: String(data.statusCode).trim(),
      operationCode: String(data.operationCode).trim(),
      operator: (data.operator == null ? '' : String(data.operator)),
      operateTime: (data.operateTime == null || data.operateTime === '')
        ? now
        : (typeof data.operateTime === 'number' ? data.operateTime : Number(data.operateTime))
    };

    return Promise.all([
      assertDictCode(root.RT_DICT.SEED_TYPE.TASK_STATUS, base.statusCode),
      assertDictCode(root.RT_DICT.SEED_TYPE.TASK_OPERATION, base.operationCode),
      assertTaskExists(base.taskId)
    ]).then(function () {
      return openDB().then(function (db) {
        var record = Object.assign({ id: root.RT_DB.genId() }, base);
        return reqToPromise(tx(db, 'readwrite').put(record)).then(function () { db.close(); return record; });
      });
    });
  }

  // 按任务聚合（时间升序，即流程顺序）
  function getByTaskId(taskId) {
    if (!taskId) return Promise.resolve([]);
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').index('taskId').getAll(String(taskId))).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.operateTime || 0) - (b.operateTime || 0); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function getAllTaskLifecycles() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.operateTime || 0) - (b.operateTime || 0); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 级联删除：按 taskId 清理某任务的全部流程记录（删除需求任务时调用）
  function deleteByTaskId(taskId) {
    if (!taskId) return Promise.resolve();
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, 'readwrite');
        var idx = t.objectStore(STORE).index('taskId');
        var req = idx.openCursor(IDBKeyRange.only(String(taskId)));
        req.onsuccess = function (e) {
          var cur = e.target.result;
          if (cur) { cur.delete(); cur.continue(); }
        };
        t.oncomplete = function () { db.close(); resolve(); };
        t.onerror = function () { db.close(); reject(t.error); };
      });
    });
  }

  // 删除单条（一般不应调用；流水表 append-only，仅用于异常修复）
  function deleteTaskLifecycle(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id))
        .then(function () { db.close(); return true; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS,
    genId: function () { return root.RT_DB.genId(); },
    validateTaskLifecycle: validateTaskLifecycle,
    createTaskLifecycle: createTaskLifecycle,
    getByTaskId: getByTaskId,
    getAllTaskLifecycles: getAllTaskLifecycles,
    deleteByTaskId: deleteByTaskId,
    deleteTaskLifecycle: deleteTaskLifecycle
  };
  root.RT_TASK_LIFECYCLES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
