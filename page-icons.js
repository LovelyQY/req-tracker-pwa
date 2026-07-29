// page-icons.js -- shared page-icon module (batch 142 extract + batch 148 IDB override)
// Stage 1 (batch 142): built-in default icons only (extracted byte-identically from
//   basic-data.html MODULES x9 + report.html REPORT_MODULES x4).
// Stage 2 (batch 148): IndexedDB override layer (_overrides loaded from IDB on init();
//   set/reset/resetAll write back). Store 'page_icons' (keyPath 'key') lives in the main
//   'req-tracker' DB (its version was bumped 3 -> 4 to host this store).
//
// API:
//   RT_PAGE_ICONS.init()        -> Promise; load all overrides from IDB into memory (idempotent)
//   RT_PAGE_ICONS.get(key)      -> effective SVG (override first, else default)  [sync]
//   RT_PAGE_ICONS.list()        -> [{ key, svg, source }], source: 'override' | 'default'  [sync]
//   RT_PAGE_ICONS.set(key,svg)  -> Promise; persist override to IDB + update memory
//   RT_PAGE_ICONS.reset(key)    -> Promise; delete one key override (back to default)
//   RT_PAGE_ICONS.resetAll()    -> Promise; clear all overrides
//   RT_PAGE_ICONS.sanitize(svg) -> strip <script> / on* handlers / external href+src (XSS guard)
(function (root) {
  'use strict';

  var defaults = {
    'company': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></svg>',
    'department': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'position': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>',
    'user': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'project': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>',
    'project-version': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M11 18H8a2 2 0 0 1-2-2V9"/></svg>',
    'role': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    'permission': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.5 12.5 21 2M16 7l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
    'dictionary': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    'report-task': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>',
    'report-todo': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    'report-bug': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="12" rx="4"/><path d="M12 2v4M5 9l3 2M19 9l-3 2M4 16l4-1M20 16l-4-1"/></svg>',
    'report-meeting': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'icon-manager': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>',
    // 批次155：存储与备份双入口图标（与现有 14 个图标统一 stroke 风格；可经图标管理页预览/编辑/导出）
    'backup': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/></svg>',
    'storage': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>'
  };

  var STORE = 'page_icons';
  var _overrides = {};
  var _initialized = false;
  var _dbPromise = null;

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // ---- IndexedDB helpers (lazy store registration + safe transaction) ----
  function ensureRegistered() {
    if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
      root.RT_DB.registerStore(STORE, { keyPath: 'key' });
    }
  }
  function openStore() {
    ensureRegistered();
    if (!_dbPromise) {
      if (!root.RT_DB || typeof root.RT_DB.openDB !== 'function') {
        return Promise.reject(new Error('RT_DB 未加载'));
      }
      _dbPromise = root.RT_DB.openDB();
    }
    return _dbPromise;
  }
  // Run fn(os) inside a single transaction; resolve with the request result on tx complete.
  // (Creates the transaction and issues the request synchronously in one microtask so the
  //  IndexedDB transaction stays active — avoids the classic promise + IDB inactivity pitfall.)
  function withStore(mode, fn) {
    return openStore().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var os = t.objectStore(STORE);
        var captured;
        var req = fn(os);
        if (req && typeof req.addEventListener === 'function') {
          req.addEventListener('success', function () { captured = req.result; });
        }
        t.oncomplete = function () { resolve(captured); };
        t.onerror = function () { reject(t.error || (req && req.error)); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  // ---- XSS 净化（写库前对用户 SVG 做一次清洗）----
  function sanitize(svg) {
    if (typeof svg !== 'string') return '';
    var s = svg;
    // 1) 去掉 <script>...</script> 及其内容
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    // 2) 去掉所有 on* 事件属性（onload / onclick / onerror ...）
    s = s.replace(/\s+on[a-z]+\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/gi, '');
    // 3) 去掉外部引用：href / xlink:href / src 指向 http(s):// 或协议相对 //
    s = s.replace(/\s+(xlink:href|href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi, function (m, attr, q, val) {
      var v = val || '';
      if (/^https?:\/\//i.test(v) || /^\/\//.test(v)) return '';
      return m;
    });
    return s;
  }

  function get(key) {
    if (has(_overrides, key)) return _overrides[key];
    return defaults[key] || '';
  }
  function list() {
    return Object.keys(defaults).map(function (k) {
      var ov = has(_overrides, k);
      return { key: k, svg: ov ? _overrides[k] : defaults[k], source: ov ? 'override' : 'default' };
    });
  }

  // 写回：内存立即生效；IDB 持久化失败不阻断 UI（内存覆盖仍可用）。
  function set(key, svg) {
    _overrides[key] = svg;
    if (!root.RT_DB || typeof root.RT_DB.openDB !== 'function') return Promise.resolve();
    return withStore('readwrite', function (os) { return os.put({ key: key, svg: svg }); })
      .catch(function () { /* 持久化失败时仍保留内存覆盖 */ });
  }
  function reset(key) {
    delete _overrides[key];
    if (!root.RT_DB || typeof root.RT_DB.openDB !== 'function') return Promise.resolve();
    return withStore('readwrite', function (os) { return os.delete(key); })
      .catch(function () {});
  }
  function resetAll() {
    for (var k in _overrides) delete _overrides[k];
    if (!root.RT_DB || typeof root.RT_DB.openDB !== 'function') return Promise.resolve();
    return withStore('readwrite', function (os) { return os.clear(); })
      .catch(function () {});
  }
  // 加载覆盖层到内存（幂等：仅首次真正读库）。
  function init() {
    if (_initialized) return Promise.resolve();
    if (!root.RT_DB || typeof root.RT_DB.openDB !== 'function') { _initialized = true; return Promise.resolve(); }
    return withStore('readonly', function (os) { return os.getAll(); })
      .then(function (rows) {
        (rows || []).forEach(function (rec) {
          if (rec && rec.key && typeof rec.svg === 'string') _overrides[rec.key] = rec.svg;
        });
        _initialized = true;
      })
      .catch(function () { _initialized = true; });
  }

  var api = {
    get: get, list: list, set: set, reset: reset, resetAll: resetAll,
    init: init, sanitize: sanitize,
    _defaults: defaults, _overrides: _overrides
  };
  root.RT_PAGE_ICONS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
