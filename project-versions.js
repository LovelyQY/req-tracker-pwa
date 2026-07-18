// project-versions.js —— 项目版本表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'，v3）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 记录字段：
//   id            string   32 位自动 ID（即「版本ID」，始终唯一）
//   versionName   版本名称  string  1–50 位
//   versionDesc   版本描述  string  非必填，0–200 位
//   projectId     所属项目ID string  必填，指向 projects 表的项目（项目再归属部门、公司）
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
//
// 从属关系：版本必须归属某个项目；项目必须归属某部门。删除版本前无需清理下级
//   （当前无引用版本的子表），直接删除即可。
(function (root) {
  'use strict';

  var STORE = 'projectVersions';
  var LIMITS = { VERSION_NAME_MAX: 50, VERSION_DESC_MAX: 200 };

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'projectId', path: 'projectId' },
        { name: 'versionName', path: 'versionName' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateProjectVersion(data) {
    var errors = {};
    data = data || {};
    var versionName = (data.versionName == null ? '' : String(data.versionName)).trim();
    var versionDesc = (data.versionDesc == null ? '' : String(data.versionDesc));
    var projectId = (data.projectId == null ? '' : String(data.projectId));

    if (!versionName) errors.versionName = '请输入版本名称';
    else if (versionName.length > LIMITS.VERSION_NAME_MAX) errors.versionName = '版本名称最多 ' + LIMITS.VERSION_NAME_MAX + ' 位';

    if (versionDesc && versionDesc.length > LIMITS.VERSION_DESC_MAX) errors.versionDesc = '版本描述最多 ' + LIMITS.VERSION_DESC_MAX + ' 位';

    if (!projectId) errors.projectId = '请选择所属项目';

    var first = null;
    ['versionName', 'versionDesc', 'projectId'].forEach(function (k) {
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
  // 注意：跨连接校验（getProject）必须在 openDB() 写事务之前完成，避免开启新连接被
  // 未提交事务阻塞导致死锁（与 departments.js / projects.js 一致）。
  function createProjectVersion(data, operator) {
    var v = validateProjectVersion(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    var projectId = String(data.projectId);
    return root.RT_PROJECTS.getProject(projectId).then(function (project) {
      if (!project) throw new Error('所属项目不存在');
      return openDB().then(function (db) {
        var store = tx(db, 'readwrite');
        var record = {
          id: root.RT_DB.genId(),
          versionName: (data.versionName + '').trim(),
          versionDesc: (data.versionDesc == null ? '' : String(data.versionDesc)).trim(),
          projectId: projectId,
          createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
        };
        return reqToPromise(store.put(record)).then(function () { db.close(); return record; });
      });
    });
  }

  function updateProjectVersion(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateProjectVersion(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    var projectId = String(patch.projectId);
    return root.RT_PROJECTS.getProject(projectId).then(function (project) {
      if (!project) throw new Error('所属项目不存在');
      return openDB().then(function (db) {
        var store = tx(db, 'readwrite');
        return reqToPromise(store.get(id)).then(function (old) {
          if (!old) { db.close(); throw new Error('记录不存在'); }
          old.versionName = (patch.versionName + '').trim();
          old.versionDesc = (patch.versionDesc == null ? '' : String(patch.versionDesc)).trim();
          old.projectId = projectId;
          old.updatedBy = op;
          old.updatedAt = Date.now();
          return reqToPromise(store.put(old)).then(function () { db.close(); return old; });
        });
      });
    });
  }

  function deleteProjectVersion(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id))
        .then(function () { db.close(); return true; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getProjectVersion(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r || null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllProjectVersions() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.versionName || '').localeCompare(b.versionName || '', 'zh'); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // 按 projectId 分组（用于列表按项目聚合展示）
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
    validateProjectVersion: validateProjectVersion,
    createProjectVersion: createProjectVersion, updateProjectVersion: updateProjectVersion,
    deleteProjectVersion: deleteProjectVersion, getProjectVersion: getProjectVersion,
    getAllProjectVersions: getAllProjectVersions, groupByProject: groupByProject
  };
  root.RT_PROJECT_VERSIONS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
