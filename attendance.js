/*
 * attendance.js —— 本地考勤存储（批次 180 新建，批次 181 复用扩展）
 *
 * 职责：
 *   1. 以「日期」为 key 在 IndexedDB 持久化每日打卡记录（clockIn / clockOut 时间戳）。
 *   2. 提供 上班打卡 / 下班打卡 动作（window.RT_ATTENDANCE.clock('in'|'out')）。
 *   3. 提供 今日 / 本周 / 当月 记录聚合，供「首页仪表盘」与「日历考勤」复用。
 *
 * 设计边界（重要）：
 *   - 本模块只负责「打卡记录」这一最小事实表；不感知节假日/补班/调休/请假。
 *   - 节假日与手动调休（day_override）由 批次 181 的日历层在其上叠加推断；
 *     本表预留 override 字段（'work'|'rest'|null）供其写入，避免后续改 schema。
 *   - 请假（leave）为独立事实表（批次 182/183），不在本模块内。
 *   - 全部本地优先，云端同步（阶段 0.6）仅镜像整条记录，不在此处耦合。
 *
 * 通过 window.RT_ATTENDANCE 暴露，app.js 在 DOMContentLoaded 后调用，无加载顺序强依赖。
 */
window.RT_ATTENDANCE = (function () {
  var DB_NAME = 'req-tracker-attendance';
  var STORE = 'records';
  var VER = 1;
  var dbp = null;

  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window) || !window.indexedDB) {
        reject(new Error('当前环境不支持本地数据库（IndexedDB）'));
        return;
      }
      var req = window.indexedDB.open(DB_NAME, VER);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'date' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  // 取得某 mode 的事务对象存储；IndexedDB 必须在同一微任务内打开事务并立即排队请求，
  // 否则事务会因「无挂起请求」提前关闭。故这里直接返回 Promise<store> 并同步发起请求。
  function storeOf(mode) {
    return openDB().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function get(date) {
    return storeOf('readonly').then(function (store) {
      return new Promise(function (res, rej) {
        var r = store.get(date);
        r.onsuccess = function () { res(r.result || null); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function put(rec) {
    return storeOf('readwrite').then(function (store) {
      return new Promise(function (res, rej) {
        var r = store.put(rec);
        r.onsuccess = function () { res(rec); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 本地日期 key：YYYY-MM-DD（用本地时区，避免 toISOString 的 UTC 偏移导致跨日错位）
  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayStr() { return dateKey(new Date()); }

  // 打卡动作：type = 'in' | 'out'
  // 返回写入后的整条记录；状态不合法时 reject（调用方用 toast 提示）。
  function clock(type) {
    var date = todayStr();
    return get(date).then(function (rec) {
      var now = Date.now();
      rec = rec || {
        date: date,
        clockIn: null,
        clockOut: null,
        override: null,   // 'work'|'rest'|null：批次 181 节假日/调休写入
        note: '',
        createdAt: now,
        updatedAt: now
      };
      rec.updatedAt = now;
      if (type === 'in') {
        if (rec.clockIn) throw new Error('今日已上班打卡');
        rec.clockIn = now;
      } else {
        if (!rec.clockIn) throw new Error('请先完成上班打卡');
        if (rec.clockOut) throw new Error('今日已下班打卡');
        rec.clockOut = now;
      }
      return put(rec);
    });
  }

  // 手动调休（批次 181）：写入某天的 override 覆盖节假日推断。
  // val = 'work'（调整为上班）| 'rest'（调整为休息）| null（清除，回落到自动推断）
  // 注意：override 与打卡记录同一条，清除 override 时若该天也无打卡，则保留空壳记录，
  // 由 getMonth/getWeek 的过滤条件自然排除，无需删除，避免与同步层的软删除语义冲突。
  function setOverride(date, val) {
    return get(date).then(function (rec) {
      var now = Date.now();
      rec = rec || {
        date: date, clockIn: null, clockOut: null,
        override: null, note: '', createdAt: now, updatedAt: now
      };
      rec.override = (val === 'work' || val === 'rest') ? val : null;
      rec.updatedAt = now;
      return put(rec);
    });
  }

  // 某天 override 的三态循环：null → 'rest' → 'work' → null
  // 供日历长按/点击切换使用，返回切换后的整条记录。
  function cycleOverride(date) {
    return get(date).then(function (rec) {
      var cur = rec && rec.override ? rec.override : null;
      var next = cur === null ? 'rest' : (cur === 'rest' ? 'work' : null);
      return setOverride(date, next);
    });
  }

  // 打卡状态：'none'（未打卡）| 'working'（已上班·待下班）| 'done'（已完成）
  function statusOf(rec) {
    if (!rec || (!rec.clockIn && !rec.clockOut)) return 'none';
    if (rec.clockIn && !rec.clockOut) return 'working';
    return 'done';
  }

  // 工时（小时）：未下班则按当前时间实时计算（用于「今日工时」实时显示）
  function hoursOf(rec) {
    if (!rec || !rec.clockIn) return 0;
    var end = rec.clockOut || Date.now();
    return Math.max(0, (end - rec.clockIn) / 3600000);
  }

  // 本周记录（周一为一周起点），仅返回有打卡/请假/调休的日期
  function getWeek() {
    var now = new Date();
    var dow = (now.getDay() + 6) % 7; // 周一=0 … 周日=6
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    var keys = [];
    for (var i = 0; i < 7; i++) {
      keys.push(dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
    }
    return Promise.all(keys.map(get)).then(function (list) {
      return list.filter(function (r) { return r && (r.clockIn || r.clockOut || r.override); });
    });
  }

  // 某月记录（含打卡或调休），供迷你月历 / 日历网格标记
  function getMonth(year, month) {
    var days = new Date(year, month + 1, 0).getDate();
    var keys = [];
    for (var d = 1; d <= days; d++) keys.push(year + '-' + pad(month + 1) + '-' + pad(d));
    return Promise.all(keys.map(get)).then(function (list) {
      return list.filter(function (r) { return r && (r.clockIn || r.clockOut || r.override); });
    });
  }

  // 任意日期区间（含首尾）的记录，返回 { 'YYYY-MM-DD': rec }（批次 184 统计报表）
  // keyPath 即 date，故用主键 openCursor + bound 一次游标扫完，避免逐日 get 的 N 次往返。
  function getRange(from, to) {
    return storeOf('readonly').then(function (store) {
      return new Promise(function (res, rej) {
        var map = {};
        var r = store.openCursor(IDBKeyRange.bound(from, to));
        r.onsuccess = function (e) {
          var c = e.target.result;
          if (c) { map[c.value.date] = c.value; c.continue(); }
          else res(map);
        };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  return {
    DB_NAME: DB_NAME,
    STORE: STORE,
    get: get,
    put: put,
    clock: clock,
    setOverride: setOverride,
    cycleOverride: cycleOverride,
    todayStr: todayStr,
    dateKey: dateKey,
    statusOf: statusOf,
    hoursOf: hoursOf,
    getWeek: getWeek,
    getMonth: getMonth,
    getRange: getRange
  };
})();
