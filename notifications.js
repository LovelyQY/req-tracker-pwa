// notifications.js —— 消息通知数据层（IndexedDB，基于共享 db.js）
//
// 本地优先（决策 A）：通知为应用内通知，仅本地存储 + 首页角标/红点，
// 不接入云端跨设备同步（RT_SYNC / cloud-adapter 无需改动）。
//
// 写入点：审批引擎（process-instances.js 的 approve/reject/transfer/addsign）
//   动作完成后向「目标审批人（或发起人，终态）」写一条本地通知。
// 读取点：首页通知中心（app.js renderNotifyTab）—— 列表 / 未读红点 / 全部已读。
//
// 通知记录字段：
//   id          string  32 位自动 ID
//   toAccount   string  接收人账号（目标审批人 / 发起人）
//   type        string  动作类型：APPROVE / APPROVED / REJECTED / TRANSFER / ADDSIGN
//   titleKey    string  i18n 标题 key（渲染时 t(titleKey, params)）
//   bodyKey     string  i18n 正文 key（渲染时 t(bodyKey, params)）
//   params      object  插值参数 { operator, processName, nodeName }
//   refType     string  关联类型：'process_instance'
//   refId       string  关联 ID（流程实例 id）
//   read        boolean 是否已读
//   createdAt   number  时间戳
//
// master 总开关（设置页「通知」）：localStorage['rt_ui_prefs'].notify.master === false 时不写入。
(function (root) {
  'use strict';

  var STORE = 'notifications';
  // 动作类型（与审批引擎动作枚举对齐）
  var TYPES = {
    APPROVE: 'APPROVE',       // 同意（推进中）→ 通知下一审批人
    APPROVED: 'APPROVED',     // 审批通过（终态）→ 通知发起人
    REJECTED: 'REJECTED',     // 驳回（终态）→ 通知发起人
    TRANSFER: 'TRANSFER',     // 转办 → 通知被转办人
    ADDSIGN: 'ADDSIGN'        // 加签 → 通知被加签人
  };

  // master 总开关注册键（与 settings.js 的 rt_ui_prefs.notify 对齐）
  var PREFS_KEY = 'rt_ui_prefs';

  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'toAccount', path: 'toAccount' },
        { name: 'read', path: 'read' },
        { name: 'createdAt', path: 'createdAt' }
      ]
    });
  }

  function now() { return Date.now(); }

  // master 总开关：关闭（=== false）时不写入任何通知
  function notifyEnabled() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(PREFS_KEY);
      if (!raw) return true; // 默认开启
      var p = JSON.parse(raw);
      return !p || !p.notify || p.notify.master !== false;
    } catch (e) { return true; }
  }

  // ===================== IndexedDB 底层（委托 db.js，与 process-instances.js 同构）=====================
  function openDB() { return root.RT_DB.openDB(); }
  function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }
  function getRec(db, id) {
    return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { return r || null; });
  }
  function saveRec(db, rec) {
    return reqToPromise(tx(db, 'readwrite').put(rec)).then(function () { db.close(); return rec; })
      .catch(function (err) { db.close(); throw err; });
  }

  // ===================== 写入 =====================
  // payload: { toAccount, type, titleKey, bodyKey, params, refType, refId }
  // 返回创建的通知记录；master 关闭 / 目标为空 时返回 null（不写入）
  function addNotification(payload) {
    payload = payload || {};
    var to = (payload.toAccount == null ? '' : String(payload.toAccount));
    if (!to) return Promise.resolve(null);          // 目标为空，跳过
    if (!notifyEnabled()) return Promise.resolve(null); // master 关闭，跳过
    if (!root.RT_DB || !root.RT_DB.genId) return Promise.resolve(null);
    var rec = {
      id: root.RT_DB.genId(),
      toAccount: to,
      type: payload.type || TYPES.APPROVE,
      titleKey: payload.titleKey || '',
      bodyKey: payload.bodyKey || '',
      params: payload.params || {},
      refType: payload.refType || 'process_instance',
      refId: (payload.refId == null ? '' : String(payload.refId)),
      read: false,
      createdAt: now()
    };
    return openDB().then(function (db) { return saveRec(db, rec); });
  }

  // ===================== 查询 =====================
  function listByAccount(account) {
    var a = (account == null ? '' : String(account));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = (Array.isArray(list) ? list : []).filter(function (r) { return r && r.toAccount === a; });
        list.sort(function (x, y) { return (y.createdAt || 0) - (x.createdAt || 0); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }
  function getUnreadCount(account) {
    return listByAccount(account).then(function (list) {
      return list.filter(function (r) { return !r.read; }).length;
    });
  }
  function getById(id) {
    return openDB().then(function (db) { return getRec(db, id).then(function (r) { db.close(); return r; }); });
  }
  function markRead(id) {
    return openDB().then(function (db) {
      return getRec(db, id).then(function (r) {
        if (!r) { db.close(); return null; }
        r.read = true;
        return saveRec(db, r);
      });
    });
  }
  function markAllRead(account) {
    var a = (account == null ? '' : String(account));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        var targets = (Array.isArray(list) ? list : []).filter(function (r) { return r && r.toAccount === a && !r.read; });
        if (!targets.length) { db.close(); return 0; }
        var os = tx(db, 'readwrite');
        targets.forEach(function (r) { r.read = true; os.put(r); });
        return new Promise(function (resolve, reject) {
          var wt = db.transaction(STORE, 'readwrite');
          wt.oncomplete = function () { db.close(); resolve(targets.length); };
          wt.onerror = function () { db.close(); reject(wt.error); };
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  var api = {
    STORE: STORE,
    TYPES: TYPES,
    PREFS_KEY: PREFS_KEY,
    notifyEnabled: notifyEnabled,
    addNotification: addNotification,
    listByAccount: listByAccount,
    getUnreadCount: getUnreadCount,
    getById: getById,
    markRead: markRead,
    markAllRead: markAllRead
  };

  root.RT_NOTIFICATIONS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
