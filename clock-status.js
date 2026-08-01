/*
 * clock-status.js —— 打卡状态（批次 211 / #20）
 *
 * 首页迷你日历与日历 TAB 共享的「打卡状态」唯一权威源：
 *   未打卡(NONE) / 已打卡(DONE) / 迟到(LATE) / 早退(EARLY) / 加班(OVERTIME) / 请假(LEAVE)
 *
 * 设计：
 *   - 迟到/早退/加班的判定复用 RT_STATS.dayStat（单一真相源，避免两处日历各算各的导致口径漂移）。
 *   - 展示色来自字典 CLOCK_STATUS（getDictByType），改色只需改字典/种子，两处日历实时生效；
 *     字典缺失时回退 DEFAULTS，保证离线/降级不崩。
 *   - 纯逻辑、无 DOM，可在 node 直跑单测（与 stats.js 同模式）。
 *   - 通过 window.RT_CLOCK_STATUS 暴露，app.js 在日历渲染时调用。
 */
(function (root) {
  'use strict';

  var STATUS = { NONE: 'NONE', DONE: 'DONE', LATE: 'LATE', EARLY: 'EARLY', OVERTIME: 'OVERTIME', LEAVE: 'LEAVE' };

  // 展示色兜底（与 dictionary.js CLOCK_STATUS 种子一致）；字典缺失时回退此值。
  // 配色口径：迟到/早退=红、已打卡=系统绿（同任务「已上线」）、加班=深绿、请假=灰、未打卡=中性灰。
  var DEFAULTS = {
    NONE:     { name: '未打卡', color: '#8c8c8c' },
    DONE:     { name: '已打卡', color: '#52c41a' },
    LATE:     { name: '迟到',   color: '#ff4d4f' },
    EARLY:    { name: '早退',   color: '#ff4d4f' },
    OVERTIME: { name: '加班',   color: '#389e0d' },
    LEAVE:    { name: '请假',   color: '#8c8c8c' }
  };

  /*
   * 计算某天的主打卡状态（单一状态，供日历状态点着色）。
   * dateKey: 'YYYY-MM-DD'；rec: attendance 记录|null；leaves: 当日请假数组；
   * isRest: 当天是否休息日（已含 override）；sched: 作息（缺省读 RT_STATS.getSchedule）。
   * 优先级：纯请假(无打卡) → 迟到 → 早退 → 加班 → 已打卡 → 请假(有打卡) → 未打卡。
   */
  function ofDay(dateKey, rec, leaves, isRest, sched) {
    leaves = leaves || [];
    var hasClock = !!(rec && rec.clockIn);
    // 纯请假日（无打卡）→ 请假
    if (leaves.length && !hasClock) return STATUS.LEAVE;
    if (root.RT_STATS && typeof root.RT_STATS.dayStat === 'function') {
      var ds = root.RT_STATS.dayStat(dateKey, rec || null, leaves, !!isRest, sched || null);
      if (ds.isLate) return STATUS.LATE;
      if (ds.isEarly) return STATUS.EARLY;
      if (ds.isOvertime) return STATUS.OVERTIME;
      if (ds.hasClock) return STATUS.DONE;
    } else if (hasClock) {
      return STATUS.DONE;
    }
    if (leaves.length) return STATUS.LEAVE;
    return STATUS.NONE;
  }

  // 读取字典 CLOCK_STATUS，返回 { code: {name, color} }（覆盖 DEFAULTS）。字典缺失/失败回退 DEFAULTS。
  function map() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = { name: DEFAULTS[k].name, color: DEFAULTS[k].color };
    });
    if (root.RT_DICT && typeof root.RT_DICT.getDictByType === 'function' &&
        root.RT_DICT.SEED_TYPE && root.RT_DICT.SEED_TYPE.CLOCK_STATUS) {
      try {
        return root.RT_DICT.getDictByType(root.RT_DICT.SEED_TYPE.CLOCK_STATUS).then(function (list) {
          (list || []).forEach(function (r) {
            if (r && r.code && DEFAULTS[r.code]) {
              out[r.code] = { name: r.name || DEFAULTS[r.code].name, color: r.color || DEFAULTS[r.code].color };
            }
          });
          return out;
        });
      } catch (e) { /* 字典读取失败，回退 DEFAULTS */ }
    }
    return Promise.resolve(out);
  }

  var api = { STATUS: STATUS, DEFAULTS: DEFAULTS, ofDay: ofDay, map: map };
  root.RT_CLOCK_STATUS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
