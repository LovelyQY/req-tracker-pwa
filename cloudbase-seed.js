// cloudbase-seed.js —— 阶段 0.4 数据播种（首次同步把本地 IndexedDB 上传云端）
//
// 设计要点：
//  1. 匿名登录拿到 uid；每条上传文档带 _owner = uid，与云端 CUSTOM 规则
//     （auth.uid == doc._owner）匹配，实现「用户隔离」。
//  2. 集合 -> 本地来源映射：user 类（含 0.4 重新归类的 companies/depts/positions）
//     全部按 _owner 隔离，匿名即可读写；其余集合（roles/menus/...、login_logs 等）
//     暂无本地可播种数据，跳过。
//  3. 幂等：云端 _id 直接取本地记录主键 id，用 doc(id).set() 做 upsert；
//     重跑只覆盖本人文档，绝不会覆盖他人数据（他人文档 _owner 不同，写被规则拒绝）。
//  4. 自包含：直接用原始 IndexedDB 按「真实版本」打开库，不依赖各数据模块的
//     registerStore（设置页未加载它们，但 IndexedDB 持久化跨页面已落地）。
//  5. attachments 含 dataUrl 二进制，播种时剥离（本体走云存储，属 0.6 范畴）。
//
// 触发：设置页「云端同步 → 首次数据播种」按钮（settings.html + settings.js）。
(function (root) {
  'use strict';

  var RT_SEED = {
    _busy: false,
    _lastResult: null
  };

  // ===== 集合 -> 本地读取来源 =====
  // db:'main' 走 RT_CONFIG.databases.main；db:'media' 走 media（req-tracker-pwa）
  // store: 本地 IndexedDB object store 名（与云端集合名可能不同）
  var MAP = [
    { coll: 'users',            db: 'main',  store: 'users' },
    { coll: 'requirements',     db: 'main',  store: 'requirementTasks' },
    { coll: 'projects',         db: 'main',  store: 'projects' },
    { coll: 'project_versions', db: 'main',  store: 'projectVersions' },
    { coll: 'task_lifecycles',  db: 'main',  store: 'taskLifecycles' },
    { coll: 'todo_lifecycles',  db: 'main',  store: 'todoLifecycles' },
    { coll: 'companies',        db: 'main',  store: 'companies' },
    { coll: 'depts',            db: 'main',  store: 'departments' },
    { coll: 'positions',        db: 'main',  store: 'positions' },
    // 附件：仅播种元数据，剥离 dataUrl 二进制（0.6 走云存储）
    { coll: 'attachments',      db: 'media', store: 'attachments', stripBinary: true }
  ];

  var BINARY_KEYS = ['dataUrl', 'data', 'blob', 'base64', 'buffer', 'file', 'arrayBuffer'];

  function genId() {
    var bytes = new Uint8Array(16);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    var s = '';
    for (var j = 0; j < bytes.length; j++) s += ('0' + bytes[j].toString(16)).slice(-2);
    return s;
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // 按真实版本打开 IndexedDB（不指定版本则探测已有版本，避免版本过低报错）
  function openIDB(name) {
    return new Promise(function (resolve, reject) {
      var p = indexedDB.open(name);
      p.onsuccess = function () {
        var ver = p.result.version || 1;
        p.result.close();
        var r = indexedDB.open(name, ver);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
        r.onupgradeneeded = function (e) { resolve(e.target.result); };
      };
      p.onerror = function () { reject(p.error); };
    });
  }

  // 读取本地某个 store 的全部记录
  function loadLocal(m) {
    var cfg = (m.db === 'media')
      ? (root.RT_CONFIG && root.RT_CONFIG.database && root.RT_CONFIG.database('media'))
      : (root.RT_CONFIG && root.RT_CONFIG.database && root.RT_CONFIG.database('main'));
    if (!cfg || !cfg.name) return Promise.resolve([]);
    return openIDB(cfg.name).then(function (db) {
      return new Promise(function (resolve, reject) {
        if (!db.objectStoreNames.contains(m.store)) { db.close(); resolve([]); return; }
        var tx;
        try { tx = db.transaction(m.store, 'readonly'); }
        catch (e) { db.close(); resolve([]); return; }
        reqToPromise(tx.objectStore(m.store).getAll()).then(function (list) {
          db.close();
          resolve(Array.isArray(list) ? list : []);
        }).catch(function (e) { db.close(); reject(e); });
      });
    });
  }

  // 把本地记录转换为云端文档：补 _owner / 元数据；剥离二进制
  function prepareDoc(rec, m, uid) {
    var d = {};
    for (var k in rec) {
      if (!Object.prototype.hasOwnProperty.call(rec, k)) continue;
      var v = rec[k];
      if (m.stripBinary && BINARY_KEYS.indexOf(k) >= 0) continue;       // 剥离二进制
      if (m.stripBinary && typeof v === 'string' && v.length > 1000000) continue; // 超大字符串也不传
      d[k] = v;
    }
    var now = Date.now();
    d._owner = uid;
    d._localId = (rec.id != null) ? String(rec.id) : genId();
    d._createdAt = (typeof rec._createdAt === 'number') ? rec._createdAt
                 : (typeof rec.createdAt === 'number') ? rec.createdAt : now;
    d._updatedAt = now;
    d._updatedBy = uid;
    d._deleted = false;
    return d;
  }

  // 播种单个集合：分批 upsert（doc(id).set），带进度回调
  function seedCollection(m, uid, onProgress) {
    var cb = root.RT_CLOUD.database();
    if (!cb) return Promise.reject(new Error('CloudBase 数据库未初始化'));
    return loadLocal(m).then(function (list) {
      list = list || [];
      var total = list.length;
      if (!total) return { coll: m.coll, total: 0, ok: 0, fail: 0, skipped: true };
      var BATCH = 20, done = 0, ok = 0, fail = 0;
      var chain = Promise.resolve();
      for (var i = 0; i < total; i += BATCH) {
        (function (start) {
          chain = chain.then(function () {
            var s = list.slice(start, start + BATCH);
            var o = s.map(function (rec) {
              var doc = prepareDoc(rec, m, uid);
              var id = (rec.id != null) ? String(rec.id) : genId();
              return cb.collection(m.coll).doc(id).set(doc).then(function () { ok++; })
                .catch(function () { fail++; });
            });
            return Promise.all(o).then(function () {
              done += s.length;
              if (onProgress) onProgress({ coll: m.coll, done: done, total: total, ok: ok, fail: fail });
            });
          });
        })(i);
      }
      return chain.then(function () { return { coll: m.coll, total: total, ok: ok, fail: fail }; });
    });
  }

  function ensureLogin() {
    if (root.RT_CLOUD.uid()) return Promise.resolve(root.RT_CLOUD.uid());
    return root.RT_CLOUD.loginAnonymously();
  }

  // 是否已有播种记录（用于 UI 提示「已播种过」）
  RT_SEED.hasSeeded = function () {
    var uid = root.RT_CLOUD.uid();
    if (!uid) return Promise.resolve(false);
    var cb = root.RT_CLOUD.database();
    if (!cb) return Promise.resolve(false);
    return cb.collection('sync_logs').where({ _owner: uid, type: 'seed' }).count().then(function (r) {
      return (r && r.total) ? r.total > 0 : false;
    }).catch(function () { return false; });
  };

  // 主入口：确保匿名登录 -> 逐集合播种 -> 写 sync_logs
  // opts: { onProgress(fn), onDone(fn), onError(fn) }
  RT_SEED.seed = function (opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};
    var onDone = opts.onDone || function () {};
    var onError = opts.onError || function () {};
    if (this._busy) { onError(new Error('播种进行中，请勿重复触发')); return Promise.reject(new Error('busy')); }
    this._busy = true;

    var self = this;
    var results = [];
    return ensureLogin().then(function (uid) {
      onProgress({ phase: 'login', uid: uid, done: 0, total: 0, ok: 0, fail: 0 });
      // 顺序处理各集合，控制写压力
      var chain = Promise.resolve();
      MAP.forEach(function (m) {
        chain = chain.then(function () {
          return seedCollection(m, uid, onProgress).then(function (r) {
            results.push(r);
            onProgress({ phase: 'collection', coll: r.coll, done: r.total, total: r.total, ok: r.ok, fail: r.fail });
          });
        });
      });
      return chain;
    }).then(function () {
      // 写一条播种审计
      var cb = root.RT_CLOUD.database();
      var uid = root.RT_CLOUD.uid();
      var doc = {
        _owner: uid, _localId: genId(), _createdAt: Date.now(), _updatedAt: Date.now(),
        _updatedBy: uid, _deleted: false,
        type: 'seed', at: Date.now(), env: root.RT_CLOUD.envId(),
        collections: results, note: '0.4 首次数据播种'
      };
      return cb.collection('sync_logs').add(doc).then(function () { return results; }).catch(function () { return results; });
    }).then(function (res) {
      self._busy = false;
      self._lastResult = res;
      onDone(res);
      return res;
    }).catch(function (e) {
      self._busy = false;
      onError(e);
      throw e;
    });
  };

  RT_SEED.isBusy = function () { return this._busy; };
  RT_SEED.lastResult = function () { return this._lastResult; };
  RT_SEED.MAP = MAP;

  root.RT_SEED = RT_SEED;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
