// imgstore.js —— 图片存储共享模块（头像 / 附件的「更小存储」方案）
//
// 与 app.js 的图片存储共用同一套底层：库名 'req-tracker-pwa'、store 'images'。
// 大体积图片（Base64 dataURL）只存进 IndexedDB，记录里仅保留一个短 id 引用，
// 需要显示时再按 id 取出 dataURL。这样 users.avatar 等字段始终保持「短」，
// 不会因头像把记录撑到几万字符。
//
// 相比直接把 dataURL 写进 users 记录：
//   · users.avatar 只存 id（约 40 字符），登录查询 / 列表渲染都更轻；
//   · 头像字节集中存放在 images 表，便于管理与清理；
//   · 兼容旧方案：若 avatar 字段仍是 dataURL（历史数据），resolveAvatar 直接原样返回。
(function (root) {
  'use strict';

  var DB_NAME = 'req-tracker-pwa';
  var DB_VERSION = 4;
  var IMG_STORE = 'images';
  var ATT_STORE = 'attachments';

  function openImageDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('当前环境不支持 IndexedDB')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(IMG_STORE)) {
          db.createObjectStore(IMG_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(ATT_STORE)) {
          db.createObjectStore(ATT_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function dbPutImage(img) {
    return openImageDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IMG_STORE, 'readwrite');
        tx.objectStore(IMG_STORE).put(img);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function dbGetImage(id) {
    return openImageDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IMG_STORE, 'readonly');
        var req = tx.objectStore(IMG_STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function genImageId() {
    return 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // 头像引用解析：把 users.avatar / rt_accounts.avatar 的存储值解析为可显示的 dataURL。
  //   · 历史 dataURL（以 "data:" 开头）→ 直接返回（兼容旧数据）
  //   · 否则视为 images 表 id → 查表取 dataUrl（查不到返回 null，调用方回退默认头像）
  function resolveAvatar(ref) {
    if (!ref) return Promise.resolve(null);
    if (typeof ref === 'string' && ref.indexOf('data:') === 0) return Promise.resolve(ref);
    return dbGetImage(ref).then(function (rec) { return rec ? rec.dataUrl : null; });
  }

  var api = {
    DB_NAME: DB_NAME, IMG_STORE: IMG_STORE, ATT_STORE: ATT_STORE,
    openImageDB: openImageDB, dbPutImage: dbPutImage, dbGetImage: dbGetImage,
    genImageId: genImageId, resolveAvatar: resolveAvatar
  };
  root.RT_IMGSTORE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
