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
    // 批次191 #12：department/user/report-meeting/account 原共用同一「人形」SVG，去重为各自语义图标
    'department': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v4M12 11H5v6M12 11h7v6"/></svg>',
    'position': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>',
    'user': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    'project': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>',
    'project-version': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M11 18H8a2 2 0 0 1-2-2V9"/></svg>',
    'role': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    'permission': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.5 12.5 21 2M16 7l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
    'dictionary': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    'report-task': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>',
    'report-todo': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    'report-bug': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="12" rx="4"/><path d="M12 2v4M5 9l3 2M19 9l-3 2M4 16l4-1M20 16l-4-1"/></svg>',
    'report-meeting': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="6" rx="2"/><circle cx="7" cy="5" r="2"/><circle cx="17" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg>',
    // 批次191 #12：icon-manager 与 theme 原共用同一「月亮星」SVG，去重为各自语义图标
    'icon-manager': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    // 批次155：存储与备份双入口图标（与现有 14 个图标统一 stroke 风格；可经图标管理页预览/编辑/导出）
    'backup': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/></svg>',
    'storage': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
    // 批次163：补 3 个"入口/品牌"图标（取现有 SVG 归一化：currentColor + 22×22；与首页/登录页/PWA 桌面同源）
    //  index ← index.html:59 .brand-icon icon-task（首页左上角）；login ← login/classic.html:90 .logo（登录页产品/项目图标，原页面本就共用同一剪贴板图形）
    'index': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>',
    'login': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/></svg>',
    //  pwa ← login/classic.html:94 .ic 品牌圆+笑意（应用/PWA 桌面品牌图标；已去 url(#appIconGrad) 改用 currentColor）
    'pwa': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>',
    // 批次174：设置中心 hub 图标（与现有 14+ 个图标统一 stroke 风格；可经图标管理页预览/编辑/导出）
    'settings': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    'account': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="7" r="3"/><path d="M6.5 19a5.5 5.5 0 0 1 11 0"/></svg>',
    'security': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    'device': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M12 18h.01"/></svg>',
    'general': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/></svg>',
    'notification': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    'theme': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    'download': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
    'cloud-sync': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>',
    'help': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    // 批次191 #25：补齐前向兼容图标（KEY_LABELS 已含对应中文标签），引用到未注册 key 时不再渲染空白
    'workflow': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="12" r="3"/><path d="M6 9v6M9 6h3a3 3 0 0 1 3 3v0M9 18h3a3 3 0 0 0 3-3"/></svg>',
    'process': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    'weather': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
    'ticket': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4Z"/><path d="M13 5v14"/></svg>'
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
