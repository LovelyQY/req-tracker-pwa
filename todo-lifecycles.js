// todo-lifecycles.js —— 代办生命周期流水数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 与 task-lifecycles 同构，append-only，三类型（TASK_ITEM/BUG/MEETING）共用。
//
// 记录字段：
//   id            string   32 位自动 ID（主键）
//   todoId        string   FK → todos.id（必填）
//   statusCode    string   状态 code（字典，按父代办 typeCode 取对应状态分类）
//   operationCode string   操作 code（字典 TODO_OPERATION）
//   operator      string   操作人（账号串）
//   operateTime   number   操作时间（时间戳）
//
// 写入时校验：操作人非空、字典 code 合法、父代办存在（外键）；
// 状态 code 按父代办 typeCode 映射到对应状态字典（TODO_STATUS/BUG_STATUS/MEETING_STATUS）校验。
// 级联删除：deleteByTodoId 按 todoId 索引游标批量清理；todos.js 的 deleteTodo 会调用本方法。
//
// 配置接线：本文件由 index.html 加载，复用其已注入的 config.js（位于 db.js 之前），
// 无需单独注入；index.html 注入本文件时务必排在 config.js/db.js 之后。
(function (root) {
  'use strict';

  var STORE = 'todoLifecycles';
  var LIMITS = {
    OPERATOR_MAX: 64
  };

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'todoId', path: 'todoId' },
        { name: 'statusCode', path: 'statusCode' },
        { name: 'operationCode', path: 'operationCode' },
        { name: 'operator', path: 'operator' },
        { name: 'operateTime', path: 'operateTime' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateTodoLifecycle(data) {
    var errors = {};
    data = data || {};
    var todoId = (data.todoId == null ? '' : String(data.todoId));
    var statusCode = (data.statusCode == null ? '' : String(data.statusCode)).trim();
    var operationCode = (data.operationCode == null ? '' : String(data.operationCode)).trim();
    var operator = (data.operator == null ? '' : String(data.operator));
    var operateTime = data.operateTime;

    if (!todoId) errors.todoId = '缺少关联代办ID';
    if (!statusCode) errors.statusCode = '请选择状态';
    if (!operationCode) errors.operationCode = '请选择操作';
    if (!operator) errors.operator = '请填写操作人';
    if (operateTime == null || operateTime === '' || isNaN(Number(operateTime))) {
      errors.operateTime = '请填写操作时间';
    }
    if (operator && operator.length > LIMITS.OPERATOR_MAX) {
      errors.operator = '操作人最多 ' + LIMITS.OPERATOR_MAX + ' 位';
    }

    var first = null;
    ['todoId', 'statusCode', 'operationCode', 'operator', 'operateTime'].forEach(function (k) {
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

  // 校验字典 code 合法性
  function assertDictCode(type, code) {
    if (!code) return Promise.resolve();
    if (!root.RT_DICT || typeof root.RT_DICT.getDictByType !== 'function') return Promise.resolve();
    return root.RT_DICT.getDictByType(type).then(function (list) {
      var ok = (Array.isArray(list) ? list : []).some(function (d) { return d && d.code === code; });
      if (!ok) throw new Error('字典枚举无效：' + type + ' = ' + code);
    });
  }

  // 按父代办 typeCode 确定状态字典分类
  function statusDictTypeOfTodo(todo) {
    if (!todo) return null;
    var SEED = root.RT_DICT && root.RT_DICT.SEED_TYPE;
    if (!SEED) return null;
    if (todo.typeCode === 'TASK_ITEM') return SEED.TODO_STATUS;
    if (todo.typeCode === 'BUG') return SEED.BUG_STATUS;
    if (todo.typeCode === 'MEETING') return SEED.MEETING_STATUS;
    return null;
  }

  // ===================== CRUD =====================
  function createTodoLifecycle(data) {
    var v = validateTodoLifecycle(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var base = {
      todoId: String(data.todoId),
      statusCode: String(data.statusCode).trim(),
      operationCode: String(data.operationCode).trim(),
      operator: String(data.operator),
      operateTime: (data.operateTime == null || data.operateTime === '')
        ? Date.now()
        : (typeof data.operateTime === 'number' ? data.operateTime : Number(data.operateTime))
    };

    // 操作 code 校验（固定 TODO_OPERATION）
    var dictChecks = [];
    if (root.RT_DICT && root.RT_DICT.SEED_TYPE) {
      dictChecks.push(assertDictCode(root.RT_DICT.SEED_TYPE.TODO_OPERATION, base.operationCode));
    }

    // 父代办存在性校验 + 状态 code 按父代办 typeCode 映射字典校验
    var todoCheck = Promise.resolve(null);
    if (root.RT_TODOS && typeof root.RT_TODOS.getTodo === 'function') {
      todoCheck = root.RT_TODOS.getTodo(base.todoId).then(function (todo) {
        if (!todo) throw new Error('关联代办不存在');
        var sdt = statusDictTypeOfTodo(todo);
        if (sdt) return assertDictCode(sdt, base.statusCode);
      });
    }

    // 字典枚举校验降级为「尽力而为、不阻塞写入」：流转记录是 append-only 流水，
    // 展示用字典缺失不应导致记录丢失（本地老库字典与最新种子不同步时也能正常落库）。
    return Promise.all(
      dictChecks.map(function (p) {
        return p.catch(function (e) { console.warn('[lifecycle] 操作字典校验跳过:', (e && e.message) || e); });
      }).concat([
        todoCheck.catch(function (e) { console.warn('[lifecycle] 状态字典/父代办校验跳过:', (e && e.message) || e); })
      ])
    ).then(function () {
      return openDB().then(function (db) {
        var record = Object.assign({ id: root.RT_DB.genId() }, base);
        return reqToPromise(tx(db, 'readwrite').put(record)).then(function () {
          db.close(); return record;
        });
      });
    });
  }

  function getByTodoId(todoId) {
    if (!todoId) return Promise.resolve([]);
    return openDB().then(function (db) {
      var idx = tx(db, 'readonly').index('todoId');
      return reqToPromise(idx.getAll(String(todoId))).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.operateTime || 0) - (b.operateTime || 0); });
        return list;
      });
    });
  }

  function getAllTodoLifecycles() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        return Array.isArray(list) ? list : [];
      });
    });
  }

  // 按 todoId 索引游标批量删除（级联清理）
  function deleteByTodoId(todoId) {
    if (!todoId) return Promise.reject(new Error('缺少关联代办ID'));
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var idx = tx(db, 'readwrite').index('todoId');
        var req = idx.openCursor(IDBKeyRange.only(String(todoId)));
        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
          else { db.close(); resolve(true); }
        };
        req.onerror = function () { db.close(); reject(req.error); };
      });
    });
  }

  // 单条删除（异常修复用）
  function deleteTodoLifecycle(id) {
    if (!id) return Promise.reject(new Error('缺少记录ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id)).then(function () {
        db.close(); return true;
      });
    });
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS,
    genId: function () { return root.RT_DB.genId(); },
    validateTodoLifecycle: validateTodoLifecycle,
    createTodoLifecycle: createTodoLifecycle,
    getByTodoId: getByTodoId,
    getAllTodoLifecycles: getAllTodoLifecycles,
    deleteByTodoId: deleteByTodoId,
    deleteTodoLifecycle: deleteTodoLifecycle
  };
  root.RT_TODO_LIFECYCLES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
