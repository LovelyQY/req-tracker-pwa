// cloud-adapter.js —— 阶段 0.6：各数据模块 cloud 适配层（RT_CLOUD_ADAPTER）
//
// 职责（对齐 CloudBase 后端化方案 §3.3 / §5.2 / §5.3）：
//   1. 数据模块写操作后自动入同步队列（RT_SYNC.enqueue），
//      无需改动各业务模块内部逻辑——统一在「适配层」包裹其 create/update/delete。
//   2. 媒体（头像/附件）解析接入云存储回退：RT_IMGSTORE.resolveAvatar 在
//      本地缓存未命中后查询云存储，再无则回退默认头像；dbPutImage 写入本地后
//      best-effort 镜像到云存储。
//
// 设计要点：
//   · 包裹发生在 DOMContentLoaded（各 defer 数据模块均已就绪），对页面透明。
//   · 集合映射集中在 RT_SYNC.STORE_GLOBAL_TO_COLL（与 RT_SYNC 对齐），
//     本层只负责「调用 enqueue(storeGlobal, id, op)」，op = 'put' | 'delete'。
//   · 任何单模块包裹失败不影响其它模块；enqueue 内部已按 coll+id 去重，
//     与 crud-factory 现有 5 页 enqueue 并存安全（重复入队会被去重）。

(function (root) {
  'use strict';

  // 数据模块全局名 -> { coll, create:[写方法], delete:[删方法] }
  // coll 仅用于可读性；真正映射由 RT_SYNC.STORE_GLOBAL_TO_COLL 决定。
  var WRITE_MAP = {
    RT_USERS:             { coll: 'users',            create: ['createPerson', 'updatePerson', 'updateProfile', 'updateStatus'], delete: ['deleteUser'] },
    RT_COMPANIES:         { coll: 'companies',         create: ['createCompany', 'updateCompany'],                                   delete: ['deleteCompany'] },
    RT_DEPTS:             { coll: 'depts',             create: ['createDept', 'updateDept'],                                         delete: ['deleteDept'] },
    RT_POSITIONS:         { coll: 'positions',          create: ['createPosition', 'updatePosition'],                                delete: ['deletePosition'] },
    RT_PROJECTS:          { coll: 'projects',          create: ['createProject', 'updateProject'],                                   delete: ['deleteProject'] },
    RT_PROJECT_VERSIONS:  { coll: 'project_versions',  create: ['createProjectVersion', 'updateProjectVersion'],                     delete: ['deleteProjectVersion'] },
    RT_REQUIREMENT_TASKS: { coll: 'requirements',      create: ['createRequirementTask', 'updateRequirementTask'],                   delete: ['deleteRequirementTask'] },
    RT_TODOS:             { coll: 'todos',             create: ['createTodo', 'updateTodo'],                                         delete: ['deleteTodo'] }
  };

  // 入队（统一出口；RT_SYNC 未就绪时安全跳过）
  function notify(storeGlobal, id, op) {
    try {
      if (root.RT_SYNC && typeof root.RT_SYNC.enqueue === 'function') {
        root.RT_SYNC.enqueue(storeGlobal, id, op);
      }
    } catch (e) { /* 入队失败不影响本地写 */ }
  }

  // 包裹单个模块的写方法：原方法 resolve 后调用 enqueue(storeGlobal, id, op)
  //   create 类：id 取返回记录的 .id（兜底取首个参数）
  //   delete 类：id 取首个参数（即被删 id），op='delete'
  function wrapWrite(api, storeGlobal, spec) {
    if (!api || typeof api !== 'object') return;
    (spec.create || []).forEach(function (name) {
      var orig = api[name];
      if (typeof orig !== 'function') return;
      api[name] = function () {
        var self = this, args = Array.prototype.slice.call(arguments);
        return orig.apply(self, args).then(function (rec) {
          notify(storeGlobal, (rec && rec.id != null) ? rec.id : args[0], 'put');
          return rec;
        });
      };
    });
    (spec.delete || []).forEach(function (name) {
      var orig = api[name];
      if (typeof orig !== 'function') return;
      api[name] = function () {
        var self = this, args = Array.prototype.slice.call(arguments);
        return orig.apply(self, args).then(function () {
          notify(storeGlobal, args[0], 'delete');
          return true;
        });
      };
    });
  }

  // 包裹所有已加载的数据模块（幂等：_wired 标记避免重复包裹造成双重 enqueue）
  var _wired = false;
  function wireAll() {
    if (_wired) return;
    Object.keys(WRITE_MAP).forEach(function (g) {
      var api = root[g];
      if (api && typeof api === 'object') {
        try { wrapWrite(api, g, WRITE_MAP[g]); } catch (e) {}
      }
    });
    _wired = true;
  }

  // 媒体解析接入云存储（先本地缓存 → 云存储 → 默认头像由调用方处理）
  function applyMediaCloud() {
    var IMG = root.RT_IMGSTORE;
    if (!IMG || typeof IMG !== 'object') return;

    // 1) resolveAvatar：dataURL 原样返回；本地 id 查本地缓存；未命中再查云存储
    IMG.resolveAvatar = function (ref) {
      if (!ref) return Promise.resolve(null);
      if (typeof ref === 'string' && ref.indexOf('data:') === 0) return Promise.resolve(ref);
      return Promise.resolve(ref).then(function (r) {
        return (IMG.dbGetImage ? IMG.dbGetImage(r) : Promise.resolve(null));
      }).then(function (rec) {
        if (rec && rec.dataUrl) return rec.dataUrl;
        if (root.RT_CLOUD_STORAGE && typeof root.RT_CLOUD_STORAGE.resolveAvatarUrl === 'function') {
          return root.RT_CLOUD_STORAGE.resolveAvatarUrl(ref);
        }
        return null;
      });
    };

    // 2) dbPutImage：本地写入后 best-effort 镜像到云存储（不阻塞、失败静默）
    var _origPut = IMG.dbPutImage;
    if (typeof _origPut === 'function') {
      IMG.dbPutImage = function (img) {
        var p = _origPut.apply(IMG, arguments);
        try {
          if (root.RT_CLOUD_STORAGE && typeof root.RT_CLOUD_STORAGE.uploadMedia === 'function'
              && img && img.id != null && typeof img.dataUrl === 'string') {
            root.RT_CLOUD_STORAGE.uploadMedia(img.dataUrl, img.taskId || img.kind || 'image', img.id)
              .catch(function () {});
          }
        } catch (e) {}
        return p;
      };
    }
  }

  var api = {
    WRITE_MAP: WRITE_MAP,
    wrapWrite: wrapWrite,
    notify: notify,
    notifyWrite: function (storeGlobal, id, op) { notify(storeGlobal, id, op); },
    wireAll: wireAll,
    applyMediaCloud: applyMediaCloud,
    isWired: function () { return _wired; }
  };

  root.RT_CLOUD_ADAPTER = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // 浏览器：DOM 就绪后统一包裹（此时各 defer 数据模块已定义）
  if (typeof document !== 'undefined') {
    var _init = function () {
      try { wireAll(); } catch (e) {}
      try { applyMediaCloud(); } catch (e) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
    else _init();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
