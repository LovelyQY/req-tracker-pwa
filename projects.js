// projects.js —— 项目表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'，v3）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 记录字段：
//   id            string   32 位自动 ID（即「项目ID」，始终唯一）
//   projectName   项目名称  string  1–50 位
//   projectDesc   项目描述  string  非必填，0–200 位
//   deptId        所属部门ID string  必填，指向 departments 表的部门（部门再归属公司）
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
//
// 从属关系：项目必须归属某个部门；部门必须归属某公司。删除项目前无需清理下级
//   （当前无引用项目的子表），直接删除即可。
(function (root) {
  'use strict';

  var STORE = 'projects';
  var LIMITS = { PROJECT_NAME_MAX: 50, PROJECT_DESC_MAX: 200 };
  // 项目状态（文案取自字典表 dict 的 PROJECT_STATUS 类型；实体只存 code）。
  // 与 dictionary.js 的 SEED 保持一致：ACTIVE=进行中 / ARCHIVED=已归档。
  var STATUS = { ACTIVE: '进行中', ARCHIVED: '已归档' };
  var STATUS_CODES = Object.keys(STATUS);
  var DEFAULT_STATUS = 'ACTIVE';

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'deptId', path: 'deptId' },
        { name: 'projectName', path: 'projectName' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateProject(data) {
    var errors = {};
    data = data || {};
    var projectName = (data.projectName == null ? '' : String(data.projectName)).trim();
    var projectDesc = (data.projectDesc == null ? '' : String(data.projectDesc));
    var deptId = (data.deptId == null ? '' : String(data.deptId));

    if (!projectName) errors.projectName = '请输入项目名称';
    else if (projectName.length > LIMITS.PROJECT_NAME_MAX) errors.projectName = '项目名称最多 ' + LIMITS.PROJECT_NAME_MAX + ' 位';

    if (projectDesc && projectDesc.length > LIMITS.PROJECT_DESC_MAX) errors.projectDesc = '项目描述最多 ' + LIMITS.PROJECT_DESC_MAX + ' 位';

    if (!deptId) errors.deptId = '请选择所属部门';

    // 状态：选填，缺省按进行中处理；若传入必须属于已知状态 code
    if (data.statusCode && STATUS_CODES.indexOf(data.statusCode) < 0) {
      errors.statusCode = '项目状态无效';
    }

    var first = null;
    ['projectName', 'projectDesc', 'deptId'].forEach(function (k) {
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

  // ===================== CRUD =====================
  // 注意：跨连接校验（getDept）必须在 openDB() 写事务之前完成，避免开启新连接被
  // 未提交事务阻塞导致死锁（与 departments.js 一致）。
  function createProject(data, operator) {
    var v = validateProject(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    var deptId = String(data.deptId);
    return root.RT_DEPTS.getDept(deptId).then(function (dept) {
      if (!dept) throw new Error('所属部门不存在');
      return openDB().then(function (db) {
        var store = tx(db, 'readwrite');
        var record = {
          id: root.RT_DB.genId(),
          projectName: (data.projectName + '').trim(),
          projectDesc: (data.projectDesc == null ? '' : String(data.projectDesc)).trim(),
          deptId: deptId,
          statusCode: STATUS_CODES.indexOf(data.statusCode) >= 0 ? data.statusCode : DEFAULT_STATUS,
          createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
        };
        return reqToPromise(store.put(record)).then(function () { db.close(); return record; });
      });
    });
  }

  function updateProject(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateProject(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    var deptId = String(patch.deptId);
    return root.RT_DEPTS.getDept(deptId).then(function (dept) {
      if (!dept) throw new Error('所属部门不存在');
      return openDB().then(function (db) {
        var store = tx(db, 'readwrite');
        return reqToPromise(store.get(id)).then(function (old) {
          if (!old) { db.close(); throw new Error('记录不存在'); }
          old.projectName = (patch.projectName + '').trim();
          old.projectDesc = (patch.projectDesc == null ? '' : String(patch.projectDesc)).trim();
          old.deptId = deptId;
          old.statusCode = STATUS_CODES.indexOf(patch.statusCode) >= 0 ? patch.statusCode : (old.statusCode || DEFAULT_STATUS);
          old.updatedBy = op;
          old.updatedAt = Date.now();
          return reqToPromise(store.put(old)).then(function () { db.close(); return old; });
        });
      });
    });
  }

  function deleteProject(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id))
        .then(function () { db.close(); return true; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getProject(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllProjects() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.projectName || '').localeCompare(b.projectName || '', 'zh'); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 按 deptId 分组（用于列表按部门聚合展示）
  function groupByDept(list) {
    var byDept = {};
    (Array.isArray(list) ? list : []).forEach(function (r) {
      (byDept[r.deptId] = byDept[r.deptId] || []).push(r);
    });
    return byDept;
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS,
    STATUS: STATUS,
    STATUS_CODES: STATUS_CODES,
    DEFAULT_STATUS: DEFAULT_STATUS,
    genId: function () { return root.RT_DB.genId(); },
    validateProject: validateProject,
    createProject: createProject, updateProject: updateProject,
    deleteProject: deleteProject, getProject: getProject,
    getAllProjects: getAllProjects, groupByDept: groupByDept
  };
  root.RT_PROJECTS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
