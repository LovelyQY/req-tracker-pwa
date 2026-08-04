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

  // 状态优先级（高→低），用于「代表状态」与排序（批次 226 #1）。
  // 请假 = 外出 = 出差 > 迟到 > 未打卡 > 加班 > 已打卡。
  // 注：外出/出差/调休属事件态，由 RT_LEAVE 色渲染；其优先级等同请假（见 statusRank 事件层）。
  var STATUS_ORDER = {
    LEAVE: 100, OUTING: 95, TRAVEL: 95, ADJUST: 95,
    LATE: 80, EARLY: 80,
    NONE: 60,
    OVERTIME: 40,
    DONE: 20
  };
  // 状态等级数值：已知时钟状态直接取；请假/事件子类（RT_LEAVE 类型 key）按 STATUS_ORDER 映射。
  // STATUS_ORDER 为显示顺序唯一权威源：请假(LEAVE)=100 > 外出/出差/调休(95) > 迟到/早退(80) > 未打卡(60) > 加班(40) > 已打卡(20)。
  function statusRank(code) {
    if (!code) return 0;
    if (STATUS_ORDER[code] != null) return STATUS_ORDER[code];      // 大小写精确命中（如 'OUTING'）
    var c = String(code).toUpperCase();
    if (c.indexOf('OUTING') === 0) return STATUS_ORDER.OUTING;       // 外出事件
    if (c.indexOf('TRAVEL') === 0) return STATUS_ORDER.TRAVEL;       // 出差事件
    if (c.indexOf('ADJUST') === 0) return STATUS_ORDER.ADJUST;       // 调休事件
    if (c.indexOf('LEAVE') === 0 || c.indexOf('PERSONAL') === 0 || c.indexOf('SICK') === 0 ||
        c.indexOf('ANNUAL') === 0 || c.indexOf('OTHER') === 0) return STATUS_ORDER.LEAVE; // 请假子类
    return 0;
  }

  // 展示色兜底（与 dictionary.js CLOCK_STATUS 种子一致）；字典缺失时回退此值。
  // 两层色板（批次 226 设计修订）：正常上班=系统蓝、请假=青、迟到/早退=红、加班=深绿、未打卡=灰。
  var DEFAULTS = {
    NONE:     { name: '未打卡', color: '#8c8c8c' },                 // 灰（无数据/未打卡）
    DONE:     { name: '已打卡', color: '#1677ff' },                 // 系统蓝（正常上班常态蓝点）
    LATE:     { name: '迟到',   color: '#f5222d' },                 // 红
    EARLY:    { name: '早退',   color: '#f5222d' },                 // 红
    OVERTIME: { name: '加班',   color: '#389e0d' },                 // 深绿
    LEAVE:    { name: '请假',   color: '#13c2c2' }                  // 青（请假 4 子类合并色）
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

  /*
   * 批次 226 #4：分上下午打卡状态，返回 { am, pm } 状态码（NONE/DONE/LATE/EARLY/OVERTIME）。
   * 用于日历「双点并排」展示：左=上午(上班)、右=下午(下班)，一眼看出上午/下午是否正常。
   *   am（上午/上班）：无打卡 → NONE；迟到 → LATE；否则 → DONE
   *   pm（下午/下班）：无打卡 → NONE；早退 → EARLY；加班 → OVERTIME；否则 → DONE
   * 纯请假（无打卡）am/pm 均为 NONE，由调用方单独渲染请假点（cal-dot-leave），保持口径统一。
   * 优先级：纯请假(无打卡) → 迟到 → 早退 → 加班 → 已打卡 → 请假(有打卡) → 未打卡。
   */
  function ofDaySplit(dateKey, rec, leaves, isRest, sched) {
    leaves = leaves || [];
    var hasClock = !!(rec && rec.clockIn);
    var am = STATUS.NONE, pm = STATUS.NONE;
    if (root.RT_STATS && typeof root.RT_STATS.dayStat === 'function') {
      var ds = root.RT_STATS.dayStat(dateKey, rec || null, leaves, !!isRest, sched || null);
      if (ds.hasClock) {
        am = ds.isLate ? STATUS.LATE : STATUS.DONE;
        if (ds.clockOut) {
          if (ds.isEarly) pm = STATUS.EARLY;
          else if (ds.isOvertime) pm = STATUS.OVERTIME;
          else pm = STATUS.DONE;
        }
      }
    } else if (hasClock) {
      am = STATUS.DONE;
      if (rec && rec.clockOut) pm = STATUS.DONE;
    }
    return { am: am, pm: pm };
  }

  /*
   * 批次 226 #4（修订）：上下午色点「合并 / 展开」规则（纯逻辑，可在 node 直测）。
   *   - 上午下午颜色相同（如 迟到+早退 同为红、正常双绿）→ 只渲染 1 个点；
   *   - 颜色不同（如 上午迟到红 / 下午正常绿）→ 渲染 2 个点（左上午·右下午）；
   *   - 任一侧为 NONE（未打卡）→ 只渲染另一侧；两侧皆 NONE → 0 个点。
   * 颜色相同与否以 DEFAULTS 颜色判定（与字典 CLOCK_STATUS 种子口径一致：迟到/早退同为红、已打卡绿、加班深绿），
   * 仅决定「几点」，实际渲染色由调用方按字典 colorOf 取，保证与全局一致。
   * 返回需渲染的状态码数组：[code] / [am, pm] / []。
   */
  function dotCodes(am, pm) {
    var hasA = !!(am && am !== 'NONE' && DEFAULTS[am]);
    var hasP = !!(pm && pm !== 'NONE' && DEFAULTS[pm]);
    if (hasA && hasP) {
      return (DEFAULTS[am].color === DEFAULTS[pm].color) ? [am] : [am, pm];
    }
    if (hasA) return [am];
    if (hasP) return [pm];
    return [];
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

  /*
   * 批次 226 #3 + 设计修订：某日最终应渲染的色点状态码数组（纯逻辑，node 可测）。
   * dateKey: 'YYYY-MM-DD'；rec/leaves/isRest 同 ofDay；opts: { todayKey }。
   * 规则：
   *   1) 未来日期屏蔽：dateKey > todayKey 且 leaves 为空 → 返回 []（无点）；
   *      若 leaves 命中（请假/外出/出差/调休）→ 仍显示事件点。
   *   2) 正常上班（DONE）蓝点常驻为基线；
   *   3) 加班覆盖：codes 含 OVERTIME → 移除 DONE（蓝被深绿覆盖，加班日仅 1 深绿点）；
   *   4) 其余异常态（迟到/早退/请假/外出/出差/调休）在蓝点之外按 dotCodes 同色合并/异色展开。
   * 返回状态码数组（供渲染按 DEFAULTS/字典取色）。
   */
  function dayDots(dateKey, rec, leaves, isRest, opts) {
    opts = opts || {};
    leaves = leaves || [];
    // 1) 未来日期屏蔽（除非有事件/请假命中）
    if (opts.todayKey && dateKey > opts.todayKey && leaves.length === 0) return [];
    var split = ofDaySplit(dateKey, rec || null, leaves, !!isRest);
    var codes = dotCodes(split.am, split.pm);
    // 3) 加班覆盖正常蓝点：加班日仅显深绿点，蓝点被覆盖
    if (codes.indexOf(STATUS.OVERTIME) >= 0) {
      var i = codes.indexOf(STATUS.DONE);
      if (i >= 0) codes.splice(i, 1);
    }
    return codes;
  }

  var api = { STATUS: STATUS, DEFAULTS: DEFAULTS, STATUS_ORDER: STATUS_ORDER, statusRank: statusRank, ofDay: ofDay, ofDaySplit: ofDaySplit, dotCodes: dotCodes, dayDots: dayDots, map: map };
  root.RT_CLOCK_STATUS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
