// requirement-tasks.js —— 需求任务表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 与「基础主数据」（companies / projects …）同构：实体只存 code，展示文案取自字典表；
// 图片/附件只存「短 ID 数组」，真实字节存于独立库 'req-tracker-pwa' 的 images / attachments
// 表（按 taskId 外键关联，删除任务时级联清理）。
//
// 记录字段：
//   id                string   32 位自动 ID（即「需求任务ID」，始终唯一）
//   taskName          任务名称  string  1–100 位（必填）
//   taskDesc          任务描述  string  选填，0–1000 位
//   taskTypeCode      任务类型code string 必填，取值见字典表 `任务类型`
//   priorityCode      优先级code string 必填，取值见字典表 `优先级`
//   statusCode        任务状态code string 必填，取值见字典表 `任务状态`
//   projectId         所属项目ID string 必填，指向 projects 表（项目再归属部门、公司）
//   projectVersionId  所属项目版本ID string 选填，指向 projectVersions 表（需求组即项目版本），须归属 projectId
//   developerIds      开发人员ID array  选填，元素指向 users 表（支持单个或多个）
//   zentaoId          禅道ID    string  选填（外部系统 ID）
//   zentaoSubId       禅道子ID  string  选填（外部系统子 ID）
//   imageIds          图片     array  选填，元素为 'req-tracker-pwa'.images 表短 id（真实字节另存）
//   attachmentIds     附件     array  选填，元素为 'req-tracker-pwa'.attachments 表短 id
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
//   devSubmitTime / devSubmitBy        开发提交时间 / 开发提交人
//   testStartTime / testStartBy        测试开始时间 / 测试开始人
//   testEndTime  / testEndBy           测试结束时间 / 测试结束人
//   onlineTime   / onlineBy            上线时间   / 上线人
//
// 三种 code 对应的字典枚举已由 dictionary.js 播种（任务类型 / 优先级 / 任务状态），本模块
// 不再重复播种，仅在写入时校验 code 合法性。
//
// 从属关系：任务必须归属某项目；项目版本（需求组）可选，若填须归属该项目；开发人员可选。
// 删除任务时级联删除其关联的图片 / 附件（'req-tracker-pwa' 库），避免孤儿字节。
(function (root) {
  'use strict';

  var STORE = 'requirementTasks';
  var LIMITS = {
    TASK_NAME_MAX: 100,
    TASK_DESC_MAX: 1000,
    ZENTAO_ID_MAX: 64,
    ZENTAO_SUB_ID_MAX: 64,
    ACTOR_MAX: 64
  };

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'projectId', path: 'projectId' },
        { name: 'projectVersionId', path: 'projectVersionId' },
        { name: 'taskTypeCode', path: 'taskTypeCode' },
        { name: 'priorityCode', path: 'priorityCode' },
        { name: 'statusCode', path: 'statusCode' },
        { name: 'zentaoId', path: 'zentaoId' },
        { name: 'zentaoSubId', path: 'zentaoSubId' },
        { name: 'developerIds', path: 'developerIds', opts: { unique: false, multiEntry: true } },
        { name: 'updatedAt', path: 'updatedAt' },
        { name: 'createdAt', path: 'createdAt' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  // 仅校验字段「格式/必填」，字典 code 合法性与外键存在性在 create/update 中异步校验。
  function validateRequirementTask(data) {
    var errors = {};
    data = data || {};
    var taskName = (data.taskName == null ? '' : String(data.taskName)).trim();
    var taskDesc = (data.taskDesc == null ? '' : String(data.taskDesc));
    var taskTypeCode = (data.taskTypeCode == null ? '' : String(data.taskTypeCode)).trim();
    var priorityCode = (data.priorityCode == null ? '' : String(data.priorityCode)).trim();
    var statusCode = (data.statusCode == null ? '' : String(data.statusCode)).trim();
    var projectId = (data.projectId == null ? '' : String(data.projectId));
    var zentaoId = (data.zentaoId == null ? '' : String(data.zentaoId));
    var zentaoSubId = (data.zentaoSubId == null ? '' : String(data.zentaoSubId));

    if (!taskName) errors.taskName = '请输入任务名称';
    else if (taskName.length > LIMITS.TASK_NAME_MAX) errors.taskName = '任务名称最多 ' + LIMITS.TASK_NAME_MAX + ' 位';

    if (taskDesc && taskDesc.length > LIMITS.TASK_DESC_MAX) errors.taskDesc = '任务描述最多 ' + LIMITS.TASK_DESC_MAX + ' 位';

    if (!taskTypeCode) errors.taskTypeCode = '请选择任务类型';
    if (!priorityCode) errors.priorityCode = '请选择优先级';
    if (!statusCode) errors.statusCode = '请选择任务状态';

    if (!projectId) errors.projectId = '请选择所属项目';

    if (zentaoId && zentaoId.length > LIMITS.ZENTAO_ID_MAX) errors.zentaoId = '禅道ID最多 ' + LIMITS.ZENTAO_ID_MAX + ' 位';
    if (zentaoSubId && zentaoSubId.length > LIMITS.ZENTAO_SUB_ID_MAX) errors.zentaoSubId = '禅道子ID最多 ' + LIMITS.ZENTAO_SUB_ID_MAX + ' 位';

    // 生命周期操作人长度约束（非必填）
    ['devSubmitBy', 'testStartBy', 'testEndBy', 'onlineBy'].forEach(function (k) {
      var v = data[k] == null ? '' : String(data[k]);
      if (v && v.length > LIMITS.ACTOR_MAX) errors[k] = (k.replace(/By$/, '') + '人') + '最多 ' + LIMITS.ACTOR_MAX + ' 位';
    });

    var first = null;
    ['taskName', 'taskDesc', 'taskTypeCode', 'priorityCode', 'statusCode', 'projectId', 'zentaoId', 'zentaoSubId',
      'devSubmitBy', 'testStartBy', 'testEndBy', 'onlineBy'].forEach(function (k) {
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

  // 校验字典 code 合法性：code 必须属于给定 type 的已播种枚举
  function assertDictCode(type, code) {
    if (!code) return Promise.resolve();
    return root.RT_DICT.getDictByType(type).then(function (list) {
      var ok = (Array.isArray(list) ? list : []).some(function (d) { return d && d.code === code; });
      if (!ok) throw new Error('字典枚举无效：' + type + ' = ' + code);
    });
  }

  // 校验外键存在性（项目 / 项目版本 / 开发人员）
  function assertForeignKeys(data) {
    var chain = [];
    // 项目必须存在
    chain.push(root.RT_PROJECTS.getProject(String(data.projectId)).then(function (p) {
      if (!p) throw new Error('所属项目不存在');
    }));
    // 项目版本（需求组）选填，若填须存在且归属该项目
    if (data.projectVersionId) {
      chain.push(root.RT_PROJECT_VERSIONS.getProjectVersion(String(data.projectVersionId)).then(function (v) {
        if (!v) throw new Error('所属项目版本（需求组）不存在');
        if (v.projectId && String(data.projectId) && v.projectId !== String(data.projectId)) {
          throw new Error('项目版本（需求组）不归属所选项目');
        }
      }));
    }
    // 开发人员选填，逐个校验存在
    var devIds = Array.isArray(data.developerIds) ? data.developerIds : [];
    devIds.forEach(function (d) {
      if (d) chain.push(root.RT_USERS.getUser(String(d)).then(function (u) {
        if (!u) throw new Error('开发人员不存在：' + d);
      }));
    });
    return Promise.all(chain);
  }

  // 归一化数组字段（imageIds / attachmentIds / developerIds）
  function normalizeIdArray(v) {
    if (!Array.isArray(v)) return [];
    return v.map(function (x) { return x == null ? '' : String(x); }).filter(function (x) { return x; });
  }

  // 归一化生命周期时间/操作人（时间允许 null 或时间戳数字；操作人允许 null 或字符串）
  function pickLifecycle(data) {
    function numOrNull(v) { return (v == null || v === '') ? null : (typeof v === 'number' ? v : Number(v)); }
    function strOrNull(v) { return (v == null || v === '') ? null : String(v); }
    return {
      devSubmitTime: numOrNull(data.devSubmitTime),
      devSubmitBy: strOrNull(data.devSubmitBy),
      testStartTime: numOrNull(data.testStartTime),
      testStartBy: strOrNull(data.testStartBy),
      testEndTime: numOrNull(data.testEndTime),
      testEndBy: strOrNull(data.testEndBy),
      onlineTime: numOrNull(data.onlineTime),
      onlineBy: strOrNull(data.onlineBy)
    };
  }

  // ===================== CRUD =====================
  function createRequirementTask(data, operator) {
    var v = validateRequirementTask(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator.account || operator));
    var base = {
      taskName: String(data.taskName).trim(),
      taskDesc: (data.taskDesc == null ? '' : String(data.taskDesc)).trim(),
      taskTypeCode: String(data.taskTypeCode).trim(),
      priorityCode: String(data.priorityCode).trim(),
      statusCode: String(data.statusCode).trim(),
      projectId: String(data.projectId),
      projectVersionId: data.projectVersionId ? String(data.projectVersionId) : '',
      developerIds: normalizeIdArray(data.developerIds),
      zentaoId: (data.zentaoId == null ? '' : String(data.zentaoId).trim()),
      zentaoSubId: (data.zentaoSubId == null ? '' : String(data.zentaoSubId).trim()),
      imageIds: normalizeIdArray(data.imageIds),
      attachmentIds: normalizeIdArray(data.attachmentIds),
      createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
    };
    Object.assign(base, pickLifecycle(data));

    // 先异步校验字典 code 与外键，再开写事务（避免未提交事务阻塞导致死锁）
    return Promise.all([
      assertDictCode(root.RT_DICT.SEED_TYPE.TASK_TYPE, base.taskTypeCode),
      assertDictCode(root.RT_DICT.SEED_TYPE.PRIORITY, base.priorityCode),
      assertDictCode(root.RT_DICT.SEED_TYPE.TASK_STATUS, base.statusCode),
      assertForeignKeys(base)
    ]).then(function () {
      return openDB().then(function (db) {
        var record = Object.assign({ id: root.RT_DB.genId() }, base);
        return reqToPromise(tx(db, 'readwrite').put(record)).then(function () {
          db.close(); return record;
        });
      });
    }).catch(function (err) { if (err && err.message) throw err; throw err; });
  }

  function updateRequirementTask(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateRequirementTask(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator.account || operator));
    var base = {
      taskName: String(patch.taskName).trim(),
      taskDesc: (patch.taskDesc == null ? '' : String(patch.taskDesc)).trim(),
      taskTypeCode: String(patch.taskTypeCode).trim(),
      priorityCode: String(patch.priorityCode).trim(),
      statusCode: String(patch.statusCode).trim(),
      projectId: String(patch.projectId),
      projectVersionId: patch.projectVersionId ? String(patch.projectVersionId) : '',
      developerIds: normalizeIdArray(patch.developerIds),
      zentaoId: (patch.zentaoId == null ? '' : String(patch.zentaoId).trim()),
      zentaoSubId: (patch.zentaoSubId == null ? '' : String(patch.zentaoSubId).trim()),
      imageIds: normalizeIdArray(patch.imageIds),
      attachmentIds: normalizeIdArray(patch.attachmentIds)
    };
    Object.assign(base, pickLifecycle(patch));

    return Promise.all([
      assertDictCode(root.RT_DICT.SEED_TYPE.TASK_TYPE, base.taskTypeCode),
      assertDictCode(root.RT_DICT.SEED_TYPE.PRIORITY, base.priorityCode),
      assertDictCode(root.RT_DICT.SEED_TYPE.TASK_STATUS, base.statusCode),
      assertForeignKeys(base)
    ]).then(function () {
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

  // 级联删除关联图片 / 附件（'req-tracker-pwa' 库的 images / attachments 表）
  function deleteLinkedMedia(imageIds, attachmentIds) {
    var imgs = normalizeIdArray(imageIds);
    var atts = normalizeIdArray(attachmentIds);
    if (!imgs.length && !atts.length) return Promise.resolve();
    if (!root.RT_IMGSTORE || typeof root.RT_IMGSTORE.openImageDB !== 'function') return Promise.resolve();
    return root.RT_IMGSTORE.openImageDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction([root.RT_IMGSTORE.IMG_STORE, root.RT_IMGSTORE.ATT_STORE], 'readwrite');
        imgs.forEach(function (x) { t.objectStore(root.RT_IMGSTORE.IMG_STORE).delete(x); });
        atts.forEach(function (x) { t.objectStore(root.RT_IMGSTORE.ATT_STORE).delete(x); });
        t.oncomplete = function () { db.close(); resolve(); };
        t.onerror = function () { db.close(); reject(t.error); };
      });
    });
  }

  function deleteRequirementTask(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (old) {
        var imgIds = old ? old.imageIds : null;
        var attIds = old ? old.attachmentIds : null;
        return reqToPromise(tx(db, 'readwrite').delete(id)).then(function () {
          db.close();
          // 级联清理图片 / 附件（不阻塞删除结果）
          var cascade = deleteLinkedMedia(imgIds, attIds).catch(function () { return true; });
          // 级联清理任务生命流程记录（task-lifecycles.js 已加载时才清理，避免循环依赖）
          if (root.RT_TASK_LIFECYCLES && typeof root.RT_TASK_LIFECYCLES.deleteByTaskId === 'function') {
            cascade = cascade.then(function () {
              return root.RT_TASK_LIFECYCLES.deleteByTaskId(id).catch(function () { return true; });
            });
          }
          return cascade.then(function () { return true; });
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function getRequirementTask(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllRequirementTasks() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 按项目聚合（列表按项目分组展示）
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
    validateRequirementTask: validateRequirementTask,
    createRequirementTask: createRequirementTask,
    updateRequirementTask: updateRequirementTask,
    deleteRequirementTask: deleteRequirementTask,
    getRequirementTask: getRequirementTask,
    getAllRequirementTasks: getAllRequirementTasks,
    groupByProject: groupByProject
  };
  root.RT_REQUIREMENT_TASKS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
