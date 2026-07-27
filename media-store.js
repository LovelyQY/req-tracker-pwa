// media-store.js —— 共享 IndexedDB 媒体存储层（批次 124 抽取）
//
// 将 app.js 与 storage-backup.js 各自重复实现的图片/附件 IndexedDB 存储函数
// 收口为单一共享模块，消除约 120 行重复。本文件以全局函数形式提供（vanilla 环境），
// 在 app.js / storage-backup.js 之前以 <script src="media-store.js?v=..."> 引入即可全局可用。
//
// 库名 / 版本 / store 收口到 config.js（RT_CONFIG.databases.media），避免硬编码散落。
// 对外调用签名（参数、返回值）与抽取前完全一致，引用点无需改动。

const _mediaCfg = (window.RT_CONFIG && window.RT_CONFIG.database && window.RT_CONFIG.database('media')) || {};
const DB_NAME = _mediaCfg.name || 'req-tracker-pwa';
const DB_VERSION = _mediaCfg.version || 4;
const IMG_STORE = (_mediaCfg.stores && _mediaCfg.stores[0]) || 'images';
const ATT_STORE = (_mediaCfg.stores && _mediaCfg.stores[1]) || 'attachments';

// 单例连接缓存：避免重复 open 造成的事务竞争
let _dbPromise = null;
function openImageDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('当前环境不支持 IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IMG_STORE)) {
        db.createObjectStore(IMG_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ATT_STORE)) {
        db.createObjectStore(ATT_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function dbPutImage(img) {
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).put(img);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function dbGetImages(ids) {
  if (!ids || !ids.length) return Promise.resolve([]);
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(IMG_STORE, 'readonly');
    } catch (e) {
      console.warn('dbGetImages: store 不存在，返回空', e);
      return resolve([]);
    }
    const store = tx.objectStore(IMG_STORE);
    const out = [];
    let pending = ids.length;
    ids.forEach((id) => {
      const req = store.get(id);
      req.onsuccess = () => { if (req.result) out.push(req.result); if (--pending === 0) resolve(out); };
      req.onerror = () => { if (--pending === 0) resolve(out); };
    });
  }));
}

function dbPutAttachment(att) {
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(ATT_STORE, 'readwrite');
    tx.objectStore(ATT_STORE).put(att);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function dbGetAttachments(ids) {
  if (!ids || !ids.length) return Promise.resolve([]);
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(ATT_STORE, 'readonly');
    } catch (e) {
      // 极端情况：store 不存在（旧库未升级），视为无附件，避免抛出未处理的拒绝
      console.warn('dbGetAttachments: store 不存在，返回空', e);
      return resolve([]);
    }
    const store = tx.objectStore(ATT_STORE);
    const out = [];
    let pending = ids.length;
    ids.forEach((id) => {
      const req = store.get(id);
      req.onsuccess = () => { if (req.result) out.push(req.result); if (--pending === 0) resolve(out); };
      req.onerror = () => { if (--pending === 0) resolve(out); };
    });
  }));
}

function genImageId() {
  return 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function genAttachId() {
  return 'att-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
