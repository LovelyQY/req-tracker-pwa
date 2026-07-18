// changelog.js —— 更新日志表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'，v3）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 记录字段：
//   id           string   32 位自动 ID（由 RT_DB.genId() 生成）
//   version      版本号   string  如 '1.2.53'（按版本去重，唯一）
//   description  更新说明 string  该版本更新内容（取自 CHANGELOG.md 对应条目正文）
//   updateTime   更新时间 number  毫秒时间戳（由 CHANGELOG.md 条目标题日期解析，离线回退当前时间）
//   source       修改来源 string  'changelog' = 由 CHANGELOG.md 解析自动填充
//                                   （含首次历史回填，以及每次发版后 App 重新打开时的自动写入）
//
// 自动填充机制：
//   seedFromChangelog() 读取同源 CHANGELOG.md（与设置页「更新日志」弹窗同一数据源），
//   解析全部「## vX.Y.Z (日期)」带版本号记录，按 version 去重后写入缺失项。
//   因 CHANGELOG.md 在每次发版时由 release.sh 自动追加新条目，故 App 每次打开检测到
//   表中缺失的新版本即自动写入——实现「每次更新产生的更新日志自动填充进数据表」。
//   幂等：已存在的 version 不会重复插入。
(function (root) {
  'use strict';

  var STORE = 'changelog';

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'version', path: 'version' },
        { name: 'updateTime', path: 'updateTime' },
        { name: 'source', path: 'source' }
      ]
    });
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

  // 解析 CHANGELOG.md 文本 → [{ version, description, updateTime }]
  // 标题格式：## vX.Y.Z (YYYY-MM-DD HH:MM)
  function parseChangelog(md) {
    var lines = (md || '').split(/\r?\n/);
    var entries = [];
    var cur = null;
    var reHead = /^##\s+v(\d+\.\d+\.\d+)\s*\(([^)]+)\)/;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(reHead);
      if (m) {
        if (cur) entries.push(cur);
        cur = { version: m[1], dateStr: m[2], descLines: [] };
      } else if (cur) {
        cur.descLines.push(lines[i]);
      }
    }
    if (cur) entries.push(cur);

    return entries.map(function (e) {
      // 与 CHANGELOG 渲染规则一致：过滤独立成行的「同步升级到 vX.Y.Z」及孤行版本号，避免残留/重复
      var desc = (e.descLines || []).join('\n').trim();
      desc = desc.split(/\r?\n/).filter(function (l) {
        var t = (l || '').trim();
        if (/^-?\s*同步升级到\s*v\d+\.\d+\.\d+$/.test(t)) return false;
        if (/^v\d+\.\d+\.\d+$/.test(t)) return false;
        return true;
      }).join('\n').trim();
      if (!desc) desc = '更新版本'; // 与 release.sh 默认说明保持一致
      var ts = Date.parse((e.dateStr || '').replace(' ', 'T'));
      return {
        version: e.version,
        description: desc,
        updateTime: isNaN(ts) ? Date.now() : ts
      };
    });
  }

  // 幂等回填：从 CHANGELOG.md 读取全部带版本号记录，按 version 去重写入缺失项
  function seedFromChangelog() {
    if (typeof fetch !== 'function') return Promise.resolve({ seeded: 0, skipped: 0, total: 0, error: 'no-fetch' });
    return fetch('CHANGELOG.md?_t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('CHANGELOG.md 读取失败: ' + res.status);
        return res.text();
      })
      .then(function (md) {
        var entries = parseChangelog(md);
        if (!entries.length) return { seeded: 0, skipped: 0, total: 0 };
        return openDB().then(function (db) {
          // 先取全部已有 version，确定缺失项（每条缺失项各自开一个事务写入，避免长事务超时）
          return reqToPromise(tx(db, 'readonly').getAll()).then(function (all) {
            var existing = {};
            (Array.isArray(all) ? all : []).forEach(function (r) { if (r && r.version) existing[r.version] = true; });
            var toAdd = entries.filter(function (e) { return !existing[e.version]; });
            var remaining = toAdd.length;
            var seeded = 0;
            var skipped = entries.length - remaining;
            if (remaining === 0) { db.close(); return { seeded: 0, skipped: skipped, total: entries.length }; }
            return new Promise(function (resolve, reject) {
              toAdd.forEach(function (e) {
                var record = {
                  id: root.RT_DB.genId(),
                  version: e.version,
                  description: e.description,
                  updateTime: e.updateTime,
                  source: 'changelog'
                };
                var pr = tx(db, 'readwrite').put(record);
                pr.onsuccess = function () {
                  seeded++;
                  if (seeded === remaining) { db.close(); resolve({ seeded: seeded, skipped: skipped, total: entries.length }); }
                };
                pr.onerror = function () { db.close(); reject(pr.error); };
              });
            });
          });
        });
      });
  }

  // 每次更新自动填充（与 seedFromChangelog 同源同逻辑）：App 启动时调用即可
  function ensureAll() { return seedFromChangelog(); }

  function getAllChangelog() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (b.updateTime || 0) - (a.updateTime || 0); });
        return list;
      });
    });
  }

  function getChangelogByVersion(version) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').index('version').get(version)).then(function (r) { db.close(); return r || null; });
    });
  }

  function countChangelog() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').count()).then(function (n) { db.close(); return n; });
    });
  }

  var api = {
    STORE: STORE,
    parseChangelog: parseChangelog,
    seedFromChangelog: seedFromChangelog,
    ensureAll: ensureAll,
    getAllChangelog: getAllChangelog,
    getChangelogByVersion: getChangelogByVersion,
    countChangelog: countChangelog
  };
  root.RT_CHANGELOG = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
