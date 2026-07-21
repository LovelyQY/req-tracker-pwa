// todos.js —— 代办表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 与 requirementTasks 同构：单表 + typeCode 分流（TASK_ITEM/BUG/MEETING），
// 类型差异字段可空（稀疏列）。实体只存 code，展示文案取自字典表。
//
// 记录字段：
//   id                string   32 位自动 ID
//   typeCode          string   代办类型：TASK_ITEM(任务事项) / BUG(缺陷追踪) / MEETING(会议)
//   statusCode        string   按 typeCode 取对应状态字典
//
//   —— 任务事项 / 缺陷追踪 共用 ——
//   desc              任务描述 / BUG 描述  string  1–500（必填）
//
//   —— 会议专属 ——
//   name              会议名称  string  1–100（MEETING 必填）
//   meetingTime       会议时间  number  时间戳
//   location          会议地点  string  选填，0–100
//   minutes           会议纪要  string  选填，0–2000
//
//   —— 缺陷追踪 专属 ——
//   feedbackBy        反馈人员  string  账号串
//   feedbackTime      反馈时间  number  时间戳
//   relatedTaskId     关联任务ID string  FK→requirementTasks.id（选填）
//   handoffTime/handoffBy  转交时间/转交人
//   onlineTime/onlineBy    上线时间/上线人
//
//   —— 通用（三类型共用）——
//   remark            备注     string  选填，0–500
//   projectId         所属项目ID string  必填，FK→projects
//   projectVersionId  所属项目版本ID string 选填，FK→projectVersions，须归属 projectId
//   relatedDevIds     关联开发ID array  multiEntry 索引，指向 users 表
//   startTime/startBy         开始时间/开始人
//   completeTime/completeBy   完成时间/完成人
//   createdBy/createdAt/updatedBy/updatedAt  审计字段
//
// code 对应的字典枚举已由 dictionary.js 播种，本模块仅在写入时校验 code 合法性。
// 从属关系：代办必须归属某项目；项目版本可选，若填须归属该项目；关联开发人员可选。
// 删除代办时级联删除其关联的 todoLifecycles 记录。
(function (root) {
  'use strict';

  var STORE = 'todos';
  var LIMITS = {
    DESC_MAX: 500,
    NAME_MAX: 100,
    REMARK_MAX: 500,
    LOCATION_MAX: 100,
    MINUTES_MAX: 2000,
    ACTOR_MAX: 64,
    PROJECT_ID_MAX: 64,
    RELATED_TASK_ID_MAX: 64
  };

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'typeCode', path: 'typeCode' },
        { name: 'statusCode', path: 'statusCode' },
        { name: 'projectId', path: 'projectId' },
        { name: 'projectVersionId', path: 'projectVersionId' },
        { name: 'relatedDevIds', path: 'relatedDevIds', opts: { unique: false, multiEntry: true } },
        { name: 'relatedTaskId', path: 'relatedTaskId' },
        { name: 'updatedAt', path: 'updatedAt' },
        { name: 'createdAt', path: 'createdAt' },
        { name: 'meetingTime', path: 'meetingTime' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateTodo(data) {
    var errors = {};
    data = data || {};
    var typeCode = (data.typeCode == null ? '' : String(data.typeCode)).trim();
    var statusCode = (data.statusCode == null ? '' : String(data.statusCode)).trim();
    var desc = (data.desc == null ? '' : String(data.desc));
    var name = (data.name == null ? '' : String(data.name)).trim();
    var remark = (data.remark == null ? '' : String(data.remark));
    var projectId = (data.projectId == null ? '' : String(data.projectId));
    var location = (data.location == null ? '' : String(data.location));
    var minutes = (data.minutes == null ? '' : String(data.minutes));
    var relatedTaskId = (data.relatedTaskId == null ? '' : String(data.relatedTaskId));

    if (!typeCode) errors.typeCode = '请选择代办类型';

    // 按 typeCode 动态必填校验
    if (typeCode === 'TASK_ITEM' || typeCode === 'BUG') {
      if (!desc || !desc.trim()) errors.desc = '请输入描述';
      else if (desc.length > LIMITS.DESC_MAX) errors.desc = '描述最多 ' + LIMITS.DESC_MAX + ' 位';
    }
    if (typeCode === 'MEETING') {
      if (!name) errors.name = '请输入会议名称';
      else if (name.length > LIMITS.NAME_MAX) errors.name = '会议名称最多 ' + LIMITS.NAME_MAX + ' 位';
      if (location && location.length > LIMITS.LOCATION_MAX) errors.location = '会议地点最多 ' + LIMITS.LOCATION_MAX + ' 位';
      if (minutes && minutes.length > LIMITS.MINUTES_MAX) errors.minutes = '会议纪要最多 ' + LIMITS.MINUTES_MAX + ' 位';
    }

    if (!statusCode) errors.statusCode = '请选择状态';
    if (!projectId) errors.projectId = '请选择所属项目';

    if (remark && remark.length > LIMITS.REMARK_MAX) errors.remark = '备注最多 ' + LIMITS.REMARK_MAX + ' 位';
    if (relatedTaskId && relatedTaskId.length > LIMITS.RELATED_TASK_ID_MAX) errors.relatedTaskId = '关联任务ID最多 ' + LIMITS.RELATED_TASK_ID_MAX + ' 位';

    // 生命周期操作人长度约束（非必填）
    ['startBy', 'completeBy', 'handoffBy', 'onlineBy', 'feedbackBy'].forEach(function (k) {
      var v = data[k] == null ? '' : String(data[k]);
      if (v && v.length > LIMITS.ACTOR_MAX) errors[k] = (k.replace(/By$/, '') + '人') + '最多 ' + LIMITS.ACTOR_MAX + ' 位';
    });

    var first = null;
    ['typeCode', 'statusCode', 'desc', 'name', 'projectId', 'remark', 'relatedTaskId',
      'startBy', 'completeBy', 'handoffBy', 'onlineBy', 'feedbackBy'].forEach(function (k) {
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

  // 按 typeCode 确定状态字典分类
  function statusDictType(typeCode) {
    var SEED = root.RT_DICT && root.RT_DICT.SEED_TYPE;
    if (!SEED) return null;
    if (typeCode === 'TASK_ITEM') return SEED.TODO_STATUS;
    if (typeCode === 'BUG') return SEED.BUG_STATUS;
    if (typeCode === 'MEETING') return SEED.MEETING_STATUS;
    return null;
  }

  // 校验外键存在性（项目 / 项目版本 / 关联开发人员 / 关联任务）
  function assertForeignKeys(data) {
    var chain = [];
    // 项目必须存在
    if (root.RT_PROJECTS && typeof root.RT_PROJECTS.getProject === 'function') {
      chain.push(root.RT_PROJECTS.getProject(String(data.projectId)).then(function (p) {
        if (!p) throw new Error('所属项目不存在');
      }));
    }
    // 项目版本选填，若填须存在且归属该项目
    if (data.projectVersionId && root.RT_PROJECT_VERSIONS && typeof root.RT_PROJECT_VERSIONS.getProjectVersion === 'function') {
      chain.push(root.RT_PROJECT_VERSIONS.getProjectVersion(String(data.projectVersionId)).then(function (v) {
        if (!v) throw new Error('所属项目版本不存在');
        if (v.projectId && String(data.projectId) && v.projectId !== String(data.projectId)) {
          throw new Error('项目版本不归属所选项目');
        }
      }));
    }
    // 关联开发人员选填，逐个校验存在
    var devIds = Array.isArray(data.relatedDevIds) ? data.relatedDevIds : [];
    if (root.RT_USERS && typeof root.RT_USERS.getUser === 'function') {
      devIds.forEach(function (d) {
        if (d) chain.push(root.RT_USERS.getUser(String(d)).then(function (u) {
          if (!u) throw new Error('开发人员不存在：' + d);
        }));
      });
    }
    // 关联任务选填，须存在
    if (data.relatedTaskId && root.RT_REQUIREMENT_TASKS && typeof root.RT_REQUIREMENT_TASKS.getRequirementTask === 'function') {
      chain.push(root.RT_REQUIREMENT_TASKS.getRequirementTask(String(data.relatedTaskId)).then(function (t) {
        if (!t) throw new Error('关联任务不存在');
      }));
    }
    return Promise.all(chain);
  }

  // 归一化数组字段
  function normalizeIdArray(v) {
    if (!Array.isArray(v)) return [];
    return v.map(function (x) { return x == null ? '' : String(x); }).filter(function (x) { return x; });
  }

  // 归一化生命周期时间/操作人
  function pickLifecycle(data) {
    function numOrNull(v) { return (v == null || v === '') ? null : (typeof v === 'number' ? v : Number(v)); }
    function strOrNull(v) { return (v == null || v === '') ? null : String(v.account || v); }
    return {
      startTime: numOrNull(data.startTime),
      startBy: strOrNull(data.startBy),
      completeTime: numOrNull(data.completeTime),
      completeBy: strOrNull(data.completeBy),
      handoffTime: numOrNull(data.handoffTime),
      handoffBy: strOrNull(data.handoffBy),
      onlineTime: numOrNull(data.onlineTime),
      onlineBy: strOrNull(data.onlineBy)
    };
  }

  // ===================== CRUD =====================
  function createTodo(data, operator) {
    var v = validateTodo(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator.account || operator));
    var typeCode = String(data.typeCode).trim();
    var base = {
      typeCode: typeCode,
      statusCode: String(data.statusCode).trim(),
      desc: (data.desc == null ? '' : String(data.desc)),
      name: (data.name == null ? '' : String(data.name)).trim(),
      remark: (data.remark == null ? '' : String(data.remark)),
      projectId: String(data.projectId),
      projectVersionId: data.projectVersionId ? String(data.projectVersionId) : '',
      relatedDevIds: normalizeIdArray(data.relatedDevIds),
      relatedTaskId: (data.relatedTaskId == null ? '' : String(data.relatedTaskId).trim()),
      feedbackBy: (data.feedbackBy == null ? '' : String(data.feedbackBy)),
      feedbackTime: (data.feedbackTime == null || data.feedbackTime === '') ? null : (typeof data.feedbackTime === 'number' ? data.feedbackTime : Number(data.feedbackTime)),
      meetingTime: (data.meetingTime == null || data.meetingTime === '') ? null : (typeof data.meetingTime === 'number' ? data.meetingTime : Number(data.meetingTime)),
      location: (data.location == null ? '' : String(data.location)),
      minutes: (data.minutes == null ? '' : String(data.minutes)),
      createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
    };
    Object.assign(base, pickLifecycle(data));

    // 先异步校验字典 code 与外键，再开写事务（避免未提交事务阻塞导致死锁）
    var dictChecks = [
      assertDictCode(root.RT_DICT && root.RT_DICT.SEED_TYPE && root.RT_DICT.SEED_TYPE.TODO_TYPE, base.typeCode)
    ];
    var sdt = statusDictType(typeCode);
    if (sdt) dictChecks.push(assertDictCode(sdt, base.statusCode));

    return Promise.all(dictChecks).then(function () {
      return assertForeignKeys(base);
    }).then(function () {
      return openDB().then(function (db) {
        var record = Object.assign({ id: root.RT_DB.genId() }, base);
        return reqToPromise(tx(db, 'readwrite').put(record)).then(function () {
          db.close(); return record;
        });
      });
    }).catch(function (err) { if (err && err.message) throw err; throw err; });
  }

  function updateTodo(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateTodo(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator.account || operator));
    var typeCode = String(patch.typeCode).trim();
    var base = {
      typeCode: typeCode,
      statusCode: String(patch.statusCode).trim(),
      desc: (patch.desc == null ? '' : String(patch.desc)),
      name: (patch.name == null ? '' : String(patch.name)).trim(),
      remark: (patch.remark == null ? '' : String(patch.remark)),
      projectId: String(patch.projectId),
      projectVersionId: patch.projectVersionId ? String(patch.projectVersionId) : '',
      relatedDevIds: normalizeIdArray(patch.relatedDevIds),
      relatedTaskId: (patch.relatedTaskId == null ? '' : String(patch.relatedTaskId).trim()),
      feedbackBy: (patch.feedbackBy == null ? '' : String(patch.feedbackBy)),
      feedbackTime: (patch.feedbackTime == null || patch.feedbackTime === '') ? null : (typeof patch.feedbackTime === 'number' ? patch.feedbackTime : Number(patch.feedbackTime)),
      meetingTime: (patch.meetingTime == null || patch.meetingTime === '') ? null : (typeof patch.meetingTime === 'number' ? patch.meetingTime : Number(patch.meetingTime)),
      location: (patch.location == null ? '' : String(patch.location)),
      minutes: (patch.minutes == null ? '' : String(patch.minutes))
    };
    Object.assign(base, pickLifecycle(patch));

    var dictChecks = [
      assertDictCode(root.RT_DICT && root.RT_DICT.SEED_TYPE && root.RT_DICT.SEED_TYPE.TODO_TYPE, base.typeCode)
    ];
    var sdt = statusDictType(typeCode);
    if (sdt) dictChecks.push(assertDictCode(sdt, base.statusCode));

    return Promise.all(dictChecks).then(function () {
      return assertForeignKeys(base);
    }).then(function () {
      return openDB().then(function (db) {
        return reqToPromise(tx(db, 'readwrite').get(id)).then(function (old) {
          if (!old) { db.close(); throw new Error('记录不存在'); }
          Object.assign(old, base);
          old.updatedBy = op;
          old.updatedAt = Date.now();
          return reqToPromise(tx(db, 'readwrite').put(old)).then(function () { db.close(); return old; });
        });
      });
    });
  }

  function deleteTodo(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (old) {
        return reqToPromise(tx(db, 'readwrite').delete(id)).then(function () {
          db.close();
          // 级联清理 todoLifecycles
          var cascade = Promise.resolve();
          if (root.RT_TODO_LIFECYCLES && typeof root.RT_TODO_LIFECYCLES.deleteByTodoId === 'function') {
            cascade = root.RT_TODO_LIFECYCLES.deleteByTodoId(id).catch(function () { return true; });
          }
          return cascade.then(function () { return true; });
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function getTodo(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllTodos() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 按项目聚合
  function groupByProject(list) {
    var byProject = {};
    (Array.isArray(list) ? list : []).forEach(function (r) {
      (byProject[r.projectId] = byProject[r.projectId] || []).push(r);
    });
    return byProject;
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS,
    genId: function () { return root.RT_DB.genId(); },
    validateTodo: validateTodo,
    createTodo: createTodo,
    updateTodo: updateTodo,
    deleteTodo: deleteTodo,
    getTodo: getTodo,
    getAllTodos: getAllTodos,
    groupByProject: groupByProject
  };
  root.RT_TODOS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
