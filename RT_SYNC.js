// RT_SYNC.js —— 阶段 0.5 同步引擎雏形（pull / push / 软删除 / LWW）
//
// 设计要点：
//  1. 本地写先入「outbox 队列」（localStorage），联网时 flush 到云端；离线不丢。
//  2. push：每条本地记录用 doc(id).set() upsert（云端 _id = 本地主键 id），
//     写 _owner=uid / _updatedAt / _updatedBy；删除走软删 update({_deleted:true})。
//  3. pull：按 `_updatedAt > lastSyncTs && _owner==uid` 拉取，逐条以「记录级 LWW」
//     （云端 _updatedAt 大于本地 updatedAt 才覆盖）合并进本地；_deleted:true 则删本地。
//  4. 检查点 lastSyncTs：pull 后推进到 now，再 flush，再推进到 now，避免把自己刚 push 的
//     记录又拉回来（其 _updatedAt <= now，下轮 pull 不会命中）。
//  5. 接入点：crud-factory.js 的 crudSave / crudDelete 在本地写成功后调用 RT_SYNC.enqueue()；
//     其余模块（users/requirements/todos…）的接入属 0.6。引擎 pull 覆盖全部用户集合。
//  6. 自包含：直接按真实版本开 IndexedDB，不依赖各数据模块的 registerStore。
//
// 触发：设置页「云端同步 → 立即同步」；写入时联网自动 flush；online 事件触发 flush。
(function (root) {
  'use strict';

  var RT_SYNC = { _busy: false, _lastResult: null };

  // ===== 集合 -> 本地来源（与 cloudbase-seed.js 对齐；pull / push 读本地都用它）=====
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
    { coll: 'attachments',      db: 'media', store: 'attachments' },
    { coll: 'workflows',        db: 'main',  store: 'workflows' },
    { coll: 'processes',       db: 'main',  store: 'processes' }
  ];

  // crud-factory / cloud-adapter 传进来的「数据模块全局名」-> 云端集合名
  // （阶段 0.6：补齐 users / requirements / todos，与 MAP 对齐）
  var STORE_GLOBAL_TO_COLL = {
    'RT_USERS': 'users',
    'RT_COMPANIES': 'companies',
    'RT_DEPTS': 'depts',
    'RT_POSITIONS': 'positions',
    'RT_PROJECTS': 'projects',
    'RT_PROJECT_VERSIONS': 'project_versions',
    'RT_REQUIREMENT_TASKS': 'requirements',
    'RT_TODOS': 'todos',
    'RT_WORKFLOWS': 'workflows',
    'RT_PROCESSES': 'processes'
  };

  var QUEUE_KEY = 'rt_sync_queue_v1';
  var LAST_KEY_PREFIX = 'rt_sync_last_v1_';
  var MAX_ATTEMPTS = 12;

  function collMeta(coll) {
    for (var i = 0; i < MAP.length; i++) if (MAP[i].coll === coll) return MAP[i];
    return null;
  }
  function dbCfg(db) {
    return (root.RT_CONFIG && root.RT_CONFIG.database && root.RT_CONFIG.database(db)) || null;
  }

  // ===== 底层 IndexedDB（自包含，按真实版本打开）=====
  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
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
  function getLocalRecord(coll, id) {
    var m = collMeta(coll); if (!m) return Promise.resolve(null);
    var cfg = dbCfg(m.db); if (!cfg || !cfg.name) return Promise.resolve(null);
    return openIDB(cfg.name).then(function (db) {
      return new Promise(function (res, rej) {
        if (!db.objectStoreNames.contains(m.store)) { db.close(); res(null); return; }
        var tx = db.transaction(m.store, 'readonly');
        reqToPromise(tx.objectStore(m.store).get(id)).then(function (rec) {
          db.close(); res(rec || null);
        }).catch(function (e) { db.close(); rej(e); });
      });
    });
  }
  function putLocalRecord(coll, rec) {
    var m = collMeta(coll); if (!m) return Promise.resolve(false);
    var cfg = dbCfg(m.db); if (!cfg || !cfg.name) return Promise.resolve(false);
    return openIDB(cfg.name).then(function (db) {
      return new Promise(function (res, rej) {
        if (!db.objectStoreNames.contains(m.store)) { db.close(); res(false); return; }
        var tx = db.transaction(m.store, 'readwrite');
        tx.objectStore(m.store).put(rec);
        tx.oncomplete = function () { db.close(); res(true); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }
  function deleteLocalRecord(coll, id) {
    var m = collMeta(coll); if (!m) return Promise.resolve(false);
    var cfg = dbCfg(m.db); if (!cfg || !cfg.name) return Promise.resolve(false);
    return openIDB(cfg.name).then(function (db) {
      return new Promise(function (res, rej) {
        if (!db.objectStoreNames.contains(m.store)) { db.close(); res(false); return; }
        var tx = db.transaction(m.store, 'readwrite');
        tx.objectStore(m.store).delete(id);
        tx.oncomplete = function () { db.close(); res(true); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }

  // ===== 队列 / 检查点 =====
  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') || []; }
    catch (e) { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
  }
  function lastKey() {
    var uid = (root.RT_CLOUD && root.RT_CLOUD.uid()) || '';
    return LAST_KEY_PREFIX + uid;
  }
  function getLastSync() {
    try { return parseInt(localStorage.getItem(lastKey()) || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function setLastSync(ts) {
    try { localStorage.setItem(lastKey(), String(ts)); } catch (e) {}
  }

  function online() {
    return (typeof navigator === 'undefined') ? true : (navigator.onLine !== false);
  }

  // 由 crud-factory 调用：本地写成功后入队
  // storeGlobal: 'RT_COMPANIES' 等；id: 记录主键；op: 'put' | 'delete'
  RT_SYNC.enqueue = function (storeGlobal, id, op) {
    var coll = STORE_GLOBAL_TO_COLL[storeGlobal];
    if (!coll) return; // 未接入的集合忽略（0.6 扩展）
    if (id == null) return;
    var q = readQueue();
    // 去重：同 coll+id 只保留最新一次 put；delete 覆盖 put
    q = q.filter(function (e) { return !(e.coll === coll && String(e.id) === String(id)); });
    q.push({ coll: coll, id: String(id), op: op, ts: Date.now(), attempts: 0 });
    writeQueue(q);
    scheduleFlush();
  };

  var _flushTimer = null;
  function scheduleFlush() {
    if (_flushTimer) return;
    _flushTimer = setTimeout(function () {
      _flushTimer = null;
      if (online()) flush().catch(function () {});
    }, 1200);
  }

  function ensureLogin() {
    if (!root.RT_CLOUD || !root.RT_CLOUD.envId()) return Promise.reject(new Error('云端未启用'));
    if (root.RT_CLOUD.uid()) return Promise.resolve(root.RT_CLOUD.uid());
    return root.RT_CLOUD.loginAnonymously();
  }

  function preparePushDoc(rec, uid) {
    var d = {};
    for (var k in rec) {
      if (!Object.prototype.hasOwnProperty.call(rec, k)) continue;
      d[k] = rec[k];
    }
    var now = Date.now();
    d._owner = uid;
    d._localId = (rec.id != null) ? String(rec.id) : '';
    d._updatedAt = (typeof rec.updatedAt === 'number') ? rec.updatedAt : now;
    d._updatedBy = uid;
    d._createdAt = (typeof rec._createdAt === 'number') ? rec._createdAt
                 : (typeof rec.createdAt === 'number') ? rec.createdAt : d._updatedAt;
    d._deleted = false;
    return d;
  }

  // 把队列中的操作推到云端
  function flush() {
    var q = readQueue();
    if (!q.length) return Promise.resolve({ pushed: 0, deleted: 0, remaining: 0 });
    return ensureLogin().then(function (uid) {
      var cb = root.RT_CLOUD.database();
      if (!cb) return Promise.resolve({ pushed: 0, deleted: 0, remaining: q.length });
      var remaining = q.slice();
      var pushed = 0, deleted = 0, failed = 0;
      return remaining.reduce(function (chain, item) {
        return chain.then(function () {
          if (item.op === 'delete') {
            return pushDelete(cb, item, uid).then(function (ok) {
              if (ok) { markDone(item); deleted++; } else { item.attempts++; failed++; }
            }).catch(function () { item.attempts++; failed++; });
          }
          // put：重新读本地最新值再上传（本地可能又改过）
          return getLocalRecord(item.coll, item.id).then(function (rec) {
            if (!rec) { // 本地已无此记录（可能已被删），改为软删
              return pushDelete(cb, item, uid).then(function (ok) {
                if (ok) { markDone(item); deleted++; } else { item.attempts++; failed++; }
              }).catch(function () { item.attempts++; failed++; });
            }
            var doc = preparePushDoc(rec, uid);
            return cb.collection(item.coll).doc(String(item.id)).set(doc).then(function () {
              markDone(item); pushed++;
            }).catch(function () { item.attempts++; failed++; });
          });
        });
      }, Promise.resolve()).then(function () {
        // 丢弃超过重试上限的项，避免队列无限增长
        var qq = readQueue().filter(function (e) { return e.attempts <= MAX_ATTEMPTS; });
        writeQueue(qq);
        return { pushed: pushed, deleted: deleted, remaining: qq.length, failed: failed };
      });
    });
  }
  function markDone(item) {
    var q = readQueue();
    var kept = [];
    for (var i = 0; i < q.length; i++) {
      var e = q[i];
      if (e.coll === item.coll && String(e.id) === String(item.id)) continue; // 移除该条
      kept.push(e);
    }
    writeQueue(kept);
  }
  function pushDelete(cb, item, uid) {
    var now = Date.now();
    return cb.collection(item.coll).doc(String(item.id)).update({
      _deleted: true, _updatedAt: now, _updatedBy: uid
    }).then(function () { return true; }).catch(function () {
      // 云端无此文档（从未 push 过）：建一个最小墓碑，供其他设备 pull 时软删
      return cb.collection(item.coll).doc(String(item.id)).set({
        _owner: uid, _localId: String(item.id), _updatedAt: now, _updatedBy: uid,
        _createdAt: now, _deleted: true
      }).then(function () { return true; }).catch(function () { return false; });
    });
  }

  // 拉取云端变更并合并到本地
  function pull() {
    var since = getLastSync();
    return ensureLogin().then(function (uid) {
      var cb = root.RT_CLOUD.database();
      if (!cb) return Promise.resolve({ pulled: 0, deletedLocal: 0 });
      var _ = cb.command;
      var pulled = 0, deletedLocal = 0;
      return MAP.reduce(function (chain, m) {
        return chain.then(function () {
          return pullCollection(cb, _, m.coll, uid, since, function (doc) {
            if (doc._deleted === true) {
              if (doc._id != null) {
                // 仅当本地存在且未更新于云端删除时间时才删，避免覆盖本地新编辑
                return getLocalRecord(m.coll, doc._id).then(function (local) {
                  if (!local) return;
                  if (local.updatedAt == null || doc._updatedAt >= local.updatedAt) {
                    deletedLocal++;
                    return deleteLocalRecord(m.coll, doc._id);
                  }
                });
              }
              return;
            }
            return mergeLocal(m.coll, doc);
          }).then(function (n) { pulled += (n || 0); });
        });
      }, Promise.resolve()).then(function () { return { pulled: pulled, deletedLocal: deletedLocal }; });
    });
  }
  function pullCollection(cb, _, coll, uid, since, onItem) {
    var BATCH = 1000, skip = 0, total = 0;
    function page() {
      return cb.collection(coll).where({ _owner: uid, _updatedAt: _.gt(since) })
        .limit(BATCH).skip(skip).get().then(function (res) {
          var list = (res && res.data) || [];
          for (var i = 0; i < list.length; i++) onItem(list[i]);
          total += list.length;
          if (list.length === BATCH && skip < 9000) { skip += BATCH; return page(); }
          return total;
        });
    }
    return page();
  }
  function mergeLocal(coll, doc) {
    var id = (doc._id != null) ? doc._id : doc.id;
    if (id == null) return Promise.resolve(false);
    return getLocalRecord(coll, id).then(function (local) {
      var merged;
      if (!local) merged = Object.assign({}, doc);
      else if ((doc._updatedAt || 0) > (local.updatedAt || 0)) merged = Object.assign({}, local, doc);
      else return Promise.resolve(false); // 本地更新时间更新，保留本地（LWW）
      merged.updatedAt = doc._updatedAt || merged.updatedAt || Date.now();
      if (merged.id == null) merged.id = id;
      return putLocalRecord(coll, merged).then(function () { return true; });
    });
  }

  // 手动「立即同步」：pull -> 推进检查点 -> flush -> 再推进检查点
  RT_SYNC.syncNow = function (opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};
    var onDone = opts.onDone || function () {};
    var onError = opts.onError || function () {};
    if (this._busy) { onError(new Error('同步进行中')); return Promise.reject(new Error('busy')); }
    this._busy = true;
    var self = this;
    var summary = { pulled: 0, deletedLocal: 0, pushed: 0, deleted: 0, remaining: 0, lastSync: 0 };
    return ensureLogin().then(function () {
      onProgress({ phase: 'pull' });
      return pull();
    }).then(function (r) {
      summary.pulled = r.pulled; summary.deletedLocal = r.deletedLocal;
      setLastSync(Date.now()); // pull 完成即推进，避免把刚 push 的又拉回
      onProgress({ phase: 'push' });
      return flush();
    }).then(function (r) {
      summary.pushed = r.pushed; summary.deleted = r.deleted; summary.remaining = r.remaining;
      setLastSync(Date.now());
      summary.lastSync = getLastSync();
      self._busy = false;
      self._lastResult = summary;
      onDone(summary);
      return summary;
    }).catch(function (e) {
      self._busy = false;
      onError(e);
      throw e;
    });
  };

  RT_SYNC.getQueueLength = function () { return readQueue().length; };
  RT_SYNC.getLastSync = function () { return getLastSync(); };
  RT_SYNC.isBusy = function () { return this._busy; };
  RT_SYNC.online = online;
  RT_SYNC.lastResult = function () { return this._lastResult; };

  // 初始化：载入检查点、监听网络
  function init() {
    if (root.RT_CLOUD && root.RT_CLOUD.envId()) {
      if (typeof window !== 'undefined') {
        window.addEventListener('online', function () { if (online()) flush().catch(function () {}); });
      }
      // 启动即尝试把离线期累积的队列 flush 出去（联网时）
      if (online() && readQueue().length) scheduleFlush();
    }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  root.RT_SYNC = RT_SYNC;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
