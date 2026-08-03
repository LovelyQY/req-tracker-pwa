/*
 * leave.js —— 按小时请假（批次 182 新建）
 *
 * 职责：
 *   1. 以「记录」为粒度在 IndexedDB 持久化请假条（同一天可多条，如上午 2h + 下午 1h）。
 *   2. 提供 增 / 改 / 删 / 按日查 / 按月查。
 *   3. 提供统一工时公式，供日历、首页、统计报表（批次 184）复用。
 *
 * 工时公式（全站唯一口径）：
 *   实际工时 = 出勤段时长 − (请假段 ∩ 出勤段) 的时长
 *   —— 取「交集」而非直接减请假时长，因为请假可能落在出勤段之外
 *      （例：18:00 下班后请假 19:00-20:00，不该扣减当日工时）。
 *   —— 未下班时出勤段末端取当前时刻，与 attendance.hoursOf 保持一致。
 *
 * 设计边界：
 *   - 与 attendance 是两张独立事实表，互不写入；仅在计算层交汇。
 *   - 时间统一用「当日 0 点起的分钟数」(0–1440) 存储，避免时区与跨日歧义；
 *     不支持跨天请假（跨天请按天拆成多条），这是「按小时请假」的语义边界。
 *   - 本地优先，云端同步（阶段 0.6）镜像整条记录。
 *
 * 通过 window.RT_LEAVE 暴露。
 */
window.RT_LEAVE = (function () {
  var DB_NAME = 'req-tracker-leave';
  var STORE = 'records';
  var VER = 1;
  var dbp = null;

  // 请假类型注册表：唯一出处，表单 chips 与展示标签都从这里取
  // 批次 227 #3：新增 外出(outing)/出差(travel) 作为请假子类型（复用请假弹窗与存储），
  // 并补充各类型 color（日历色点唯一权威源，不写死 CSS）；noDeduct 类型不扣减工作工时。
  var TYPES = [
    { key: 'personal', label: '事假', color: '#fa8c16' },
    { key: 'sick', label: '病假', color: '#ff7a45' },
    { key: 'annual', label: '年假', color: '#1677ff' },
    { key: 'other', label: '其他', color: '#8c8c8c' },
    { key: 'outing', label: '外出', color: '#faad14', noDeduct: true },
    { key: 'travel', label: '出差', color: '#722ed1', noDeduct: true }
  ];

  // 类型展示色（同步权威源）：优先读字典 LEAVE_TYPE（运行时可被运维字典覆盖），回退 TYPES[].color
  function colorOf(type) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === type) return TYPES[i].color || '#8c8c8c';
    return '#8c8c8c';
  }
  // 是否扣减工时：默认 true，noDeduct 类型（外出/出差）返回 false
  function isDeducting(type) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === type) return !TYPES[i].noDeduct;
    return true; // 未知类型默认按扣减处理，避免漏扣
  }
  // 异步取全类型色表 { key: color }：优先字典 LEAVE_TYPE，再叠加 TYPES 兜底
  function colors() {
    var fb = {};
    TYPES.forEach(function (t) { if (t.color) fb[t.key] = t.color; });
    if (window.RT_DICT && typeof window.RT_DICT.getDictByType === 'function' && window.RT_DICT.SEED_TYPE) {
      var dtype = window.RT_DICT.SEED_TYPE.LEAVE_TYPE;
      if (dtype) {
        return window.RT_DICT.getDictByType(dtype).then(function (list) {
          (list || []).forEach(function (r) { if (r.code && r.color) fb[r.code] = r.color; });
          return fb;
        }).catch(function () { return fb; });
      }
    }
    return Promise.resolve(fb);
  }

  function typeLabel(key) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === key) return TYPES[i].label;
    return '其他';
  }

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
          var s = db.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('date', 'date', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  function storeOf(mode) {
    return openDB().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function genId() {
    return 'lv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ---- 时间工具：'HH:MM' ⇄ 分钟数 ----
  function hmToMin(hm) {
    var m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return NaN;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return NaN;
    return h * 60 + mi;
  }
  function minToHm(min) {
    if (typeof min !== 'number' || isNaN(min)) return '';
    var h = Math.floor(min / 60), mi = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }
  // 时长文案：150 → "2.5 小时"；45 → "45 分钟"
  function fmtDuration(min) {
    if (!min || min <= 0) return '0 分钟';
    if (min % 60 === 0) return (min / 60) + ' 小时';
    if (min < 60) return min + ' 分钟';
    return (Math.round(min / 6) / 10) + ' 小时';
  }

  function getByDate(date) {
    return storeOf('readonly').then(function (store) {
      return new Promise(function (res, rej) {
        var out = [];
        var idx = store.index('date');
        var r = idx.openCursor(IDBKeyRange.only(date));
        r.onsuccess = function (e) {
          var c = e.target.result;
          if (c) { out.push(c.value); c.continue(); }
          else { out.sort(function (a, b) { return a.startMin - b.startMin; }); res(out); }
        };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  // 某月全部请假条 → { 'YYYY-MM-DD': [rec, ...] }
  function getMonth(year, month) {
    var mm = (month + 1 < 10 ? '0' : '') + (month + 1);
    return getRange(year + '-' + mm + '-01', year + '-' + mm + '-31');
  }

  // 任意日期区间的请假（含首尾），返回 { 'YYYY-MM-DD': [记录…按开始时间升序] }（批次 184）
  function getRange(from, to) {
    return storeOf('readonly').then(function (store) {
      return new Promise(function (res, rej) {
        var map = {};
        var idx = store.index('date');
        var r = idx.openCursor(IDBKeyRange.bound(from, to));
        r.onsuccess = function (e) {
          var c = e.target.result;
          if (c) {
            var v = c.value;
            (map[v.date] = map[v.date] || []).push(v);
            c.continue();
          } else {
            Object.keys(map).forEach(function (k) {
              map[k].sort(function (a, b) { return a.startMin - b.startMin; });
            });
            res(map);
          }
        };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  /*
   * 新增 / 更新。rec 需含 date / type / startMin / endMin，可选 reason / id。
   * 校验：起止合法、结束晚于开始、与同日已有请假不重叠（重叠会导致工时重复扣减）。
   */
  function save(rec) {
    if (!rec || !rec.date) return Promise.reject(new Error('缺少日期'));
    var s = rec.startMin, e = rec.endMin;
    if (typeof s !== 'number' || typeof e !== 'number' || isNaN(s) || isNaN(e)) {
      return Promise.reject(new Error('请填写有效的起止时间'));
    }
    if (e <= s) return Promise.reject(new Error('结束时间必须晚于开始时间'));
    return getByDate(rec.date).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (rec.id && list[i].id === rec.id) continue;      // 编辑自身不算冲突
        if (s < list[i].endMin && e > list[i].startMin) {   // 半开区间相交判定
          throw new Error('与已有请假 ' + minToHm(list[i].startMin) + '–' + minToHm(list[i].endMin) + ' 时间重叠');
        }
      }
      var now = Date.now();
      var out = {
        id: rec.id || genId(),
        date: rec.date,
        type: rec.type || 'personal',
        startMin: s,
        endMin: e,
        minutes: e - s,
        reason: String(rec.reason || '').slice(0, 200),
        createdAt: rec.createdAt || now,
        updatedAt: now
      };
      return storeOf('readwrite').then(function (store) {
        return new Promise(function (res, rej) {
          var r = store.put(out);
          r.onsuccess = function () { res(out); };
          r.onerror = function () { rej(r.error); };
        });
      });
    });
  }

  function remove(id) {
    return storeOf('readwrite').then(function (store) {
      return new Promise(function (res, rej) {
        var r = store.delete(id);
        r.onsuccess = function () { res(true); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  // 当日请假总时长（分钟），不考虑是否落在出勤段内
  // 批次 227 #3：noDeduct 类型（外出/出差）不计入请假时长（仅作当日颜色标记，不扣工时）
  function totalMinutes(list) {
    return (list || []).reduce(function (n, r) {
      if (isDeducting(r.type) === false) return n;
      return n + (r.minutes || 0);
    }, 0);
  }

  /*
   * ★ 全站唯一工时口径（批次 182 起，184 统计报表复用）。
   * attRec：attendance 记录（可为 null）；leaves：当日请假条数组。
   * 返回 { grossHours, leaveHours, hours }
   *   grossHours 出勤段原始时长；leaveHours 落在出勤段内的请假时长；hours 实际工时。
   */
  function effectiveHours(attRec, leaves) {
    if (!attRec || !attRec.clockIn) return { grossHours: 0, leaveHours: 0, hours: 0 };
    var start = new Date(attRec.clockIn);
    var endTs = attRec.clockOut || Date.now();
    var end = new Date(endTs);
    // 出勤段换算为「当日分钟」；跨日下班（如通宵）按当日 24:00 截断，避免越界
    var sMin = start.getHours() * 60 + start.getMinutes();
    var eMin = (end.toDateString() === start.toDateString())
      ? end.getHours() * 60 + end.getMinutes()
      : 1440;
    if (eMin < sMin) eMin = 1440;
    var gross = (endTs - attRec.clockIn) / 3600000;
    var overlapMin = 0;
    (leaves || []).forEach(function (lv) {
      // 批次 227 #3：noDeduct 类型（外出/出差）不扣减工作工时，交集里跳过
      if (isDeducting(lv.type) === false) return;
      var a = Math.max(sMin, lv.startMin);
      var b = Math.min(eMin, lv.endMin);
      if (b > a) overlapMin += (b - a);
    });
    var leaveH = overlapMin / 60;
    return {
      grossHours: gross,
      leaveHours: leaveH,
      hours: Math.max(0, gross - leaveH)
    };
  }

  return {
    DB_NAME: DB_NAME,
    STORE: STORE,
    TYPES: TYPES,
    typeLabel: typeLabel,
    colorOf: colorOf,
    isDeducting: isDeducting,
    colors: colors,
    hmToMin: hmToMin,
    minToHm: minToHm,
    fmtDuration: fmtDuration,
    getByDate: getByDate,
    getMonth: getMonth,
    getRange: getRange,
    save: save,
    remove: remove,
    totalMinutes: totalMinutes,
    effectiveHours: effectiveHours
  };
})();
