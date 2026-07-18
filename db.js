// db.js —— 共享 IndexedDB 数据库（所有「基础数据」模块共用一个库）
//
// 为什么需要它：多个数据模块（companies / positions …）各自打开同一个
// IndexedDB 数据库。IndexedDB 按「数据库版本」升级，若各模块各自声明版本，
// 先加载的页面会锁定版本，导致后加载页面的 object store 建不出来。
// 因此由本模块统一拥有数据库（名称、版本、升级逻辑），各数据模块只通过
// registerStore() 注册自己的 store 与索引；任一模块首次打开即创建全部已注册 store。
//
// 注册示例：
//   RT_DB.registerStore('companies', {
//     keyPath: 'id',
//     indexes: [{ name:'companyType', path:'companyType' }],
//     onUpgrade: function(os, tx, oldVersion){ if (oldVersion < 2) os.clear(); }
//   });
(function (root) {
  'use strict';

  var DB_NAME = 'req-tracker';
  var DB_VERSION_BASE = 3; // v2: companies；v3: 引入 positions / departments 等更多基础数据模块
  // 运行时实际使用的版本号（初始化为 BASE，探测到更高已有版本时自动提升，避免
  // 「requested version (X) is less than existing version (Y)」错误）
  var DB_VERSION = DB_VERSION_BASE;
  var REGISTRY = {};

  // 数据模块在加载时注册自己的 store 定义
  function registerStore(name, def) {
    REGISTRY[name] = def || {};
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('当前环境不支持 IndexedDB')); return; }

      // 版本冲突防护：先探测当前数据库已有版本，再以 max(BASE, 已有版本) 打开，
      // 避免「requested version (3) is less than existing version (7)」这类错误。
      var probeReq = indexedDB.open(DB_NAME);
      probeReq.onsuccess = function () {
        var existingVer = probeReq.result.version;
        probeReq.result.close();
        DB_VERSION = Math.max(DB_VERSION_BASE, existingVer);
        tryOpen();
      };
      probeReq.onerror = function () {
        DB_VERSION = DB_VERSION_BASE;
        tryOpen();
      };
      probeReq.onblocked = function () {
        probeReq.result && probeReq.result.close();
        DB_VERSION = DB_VERSION_BASE;
        tryOpen();
      };

      function tryOpen() {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          var oldV = e.oldVersion;
          Object.keys(REGISTRY).forEach(function (name) {
            var def = REGISTRY[name];
            var os;
            if (!db.objectStoreNames.contains(name)) {
              os = db.createObjectStore(name, def.keyPath ? { keyPath: def.keyPath } : { keyPath: 'id' });
            } else {
              os = e.target.transaction.objectStore(name);
              if (typeof def.onUpgrade === 'function') def.onUpgrade(os, e.target.transaction, oldV);
            }
            (def.indexes || []).forEach(function (ix) {
              if (!os.indexNames.contains(ix.name)) os.createIndex(ix.name, ix.path, ix.opts || { unique: false });
            });
          });
        };
        req.onsuccess = function () {
          var db = req.result;
          // 确保所有已注册 store 都已存在。跨页面懒注册场景下，先加载的页面可能没建出
          // 后注册模块的 store；此时自增版本并重开，触发 onupgradeneeded 补齐缺失 store。
          var missing = Object.keys(REGISTRY).filter(function (n) { return !db.objectStoreNames.contains(n); });
          if (missing.length) { db.close(); DB_VERSION++; tryOpen(); return; }
          resolve(db);
        };
        req.onerror = function () {
          // 兜底：若仍因版本过低失败（如探测被 onblocked 打断、缓存旧脚本等），
          // 直接从错误信息里解析「已有版本」，抬升到其之上重试，保证数据库一定打得开。
          var msg = (req.error && req.error.message) || '';
          var m = msg.match(/requested version\s*\(\s*(\d+)\s*\)\s*is less than(?: the)? existing version\s*\(\s*(\d+)\s*\)/i);
          if (m) {
            var existVer = parseInt(m[2], 10);
            DB_VERSION = Math.max(DB_VERSION, existVer + 1);
            tryOpen();
            return;
          }
          reject(req.error);
        };
      }
    });
  }

  // 统一所有 ID 为 32 位：16 字节随机数 → 32 位十六进制小写串
  function genId() {
    var bytes = new Uint8Array(16);
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
      root.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var s = '';
    for (var j = 0; j < bytes.length; j++) s += ('0' + bytes[j].toString(16)).slice(-2);
    return s; // 固定 32 位
  }

  var api = { DB_NAME: DB_NAME, DB_VERSION: DB_VERSION, registerStore: registerStore, openDB: openDB, genId: genId };
  root.RT_DB = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
