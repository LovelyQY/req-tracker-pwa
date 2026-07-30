/* stats.js — 统计报表聚合层（批次 184）
 *
 * 职责：把「考勤 + 请假 + 节假日 + 任务/待办/反馈」四路事实，按日 / 周 / 综合三种粒度聚合。
 *
 * 严格复用已有单一真相源，不重复实现：
 *   - 工时口径  → RT_LEAVE.effectiveHours（批次 182 的交集扣减公式）
 *   - 应出勤判定 → RT_HOLIDAY.dayType（批次 181，含 override 优先级）
 *   - 业务计数  → RT_DAYFACTS.collect（批次 183 的多时间点命中 + 权限过滤）
 * 本文件只做「按区间循环 + 求和 + 比率」，任何口径变化都改上游，不会两处打架。
 *
 * 纯逻辑 + 无 DOM，可 node 直跑单测；渲染在 app.js。
 */
(function (root) {
  'use strict';

  // ---------- 作息基准（迟到/早退判定用）----------
  // 无企业级排班表，先用可配置的固定作息，存 localStorage，后续接 user_settings 漫游。
  var SCHED_KEY = 'rt_work_schedule';
  var DEFAULT_SCHED = { startMin: 9 * 60, endMin: 18 * 60, graceMin: 0 };

  function getSchedule() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(SCHED_KEY);
      if (!raw) return { startMin: DEFAULT_SCHED.startMin, endMin: DEFAULT_SCHED.endMin, graceMin: DEFAULT_SCHED.graceMin };
      var o = JSON.parse(raw);
      return {
        startMin: typeof o.startMin === 'number' ? o.startMin : DEFAULT_SCHED.startMin,
        endMin: typeof o.endMin === 'number' ? o.endMin : DEFAULT_SCHED.endMin,
        graceMin: typeof o.graceMin === 'number' ? o.graceMin : DEFAULT_SCHED.graceMin
      };
    } catch (e) { return { startMin: DEFAULT_SCHED.startMin, endMin: DEFAULT_SCHED.endMin, graceMin: DEFAULT_SCHED.graceMin }; }
  }
  function setSchedule(s) {
    try { root.localStorage.setItem(SCHED_KEY, JSON.stringify(s || {})); } catch (e) {}
  }

  // ---------- 日期工具 ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  // 区间内所有日期 key（含首尾）
  function eachDay(from, to) {
    var out = [], d = parseKey(from), end = parseKey(to);
    while (d <= end) { out.push(keyOf(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  // 某天所在周的周一 / 周日（ISO 周，周一为起点）
  function weekRange(dateKey) {
    var d = parseKey(dateKey);
    var dow = (d.getDay() + 6) % 7;
    var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
    var sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    return { from: keyOf(mon), to: keyOf(sun) };
  }
  function monthRange(year, month) {
    return { from: year + '-' + pad(month + 1) + '-01', to: year + '-' + pad(month + 1) + '-' + pad(new Date(year, month + 1, 0).getDate()) };
  }

  // 打卡时间戳 → 当天分钟数
  function tsToMin(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes();
  }

  // ---------- 单日聚合（核心原子）----------
  // att: 当天考勤记录|null；leaves: 当天请假数组；isRest: 当天是否休息日（已含 override）
  // 返回单日全部指标；weekStats / overallStats 均由它累加而来，保证口径一致。
  function dayStat(dateKey, att, leaves, isRest, sched) {
    sched = sched || getSchedule();
    leaves = leaves || [];
    var eff = (root.RT_LEAVE && root.RT_LEAVE.effectiveHours)
      ? root.RT_LEAVE.effectiveHours(att, leaves)
      : { grossHours: 0, leaveHours: 0, hours: 0 };

    var inMin = att ? tsToMin(att.clockIn) : null;
    var outMin = att ? tsToMin(att.clockOut) : null;
    var hasClock = !!(att && att.clockIn);

    // 迟到 / 早退：仅工作日判定；有请假覆盖到该时点则不算（请假不是迟到）
    var lateMin = 0, earlyMin = 0;
    function coveredBy(min) {
      for (var i = 0; i < leaves.length; i++) {
        if (min > leaves[i].startMin && min <= leaves[i].endMin) return true;
        if (min >= leaves[i].startMin && min < leaves[i].endMin) return true;
      }
      return false;
    }
    if (!isRest && hasClock) {
      var lateLine = sched.startMin + (sched.graceMin || 0);
      if (inMin !== null && inMin > lateLine && !coveredBy(sched.startMin)) lateMin = inMin - lateLine;
      if (outMin !== null && outMin < sched.endMin && !coveredBy(sched.endMin - 1)) earlyMin = sched.endMin - outMin;
    }

    var leaveMin = (root.RT_LEAVE && root.RT_LEAVE.totalMinutes)
      ? root.RT_LEAVE.totalMinutes(leaves)
      : leaves.reduce(function (s, l) { return s + (l.minutes || 0); }, 0);

    // 缺勤：应出勤（工作日）但既没打卡、也没请假
    var absent = (!isRest && !hasClock && !leaves.length);

    return {
      date: dateKey,
      isRest: isRest,
      hasClock: hasClock,
      clockIn: att ? att.clockIn : null,
      clockOut: att ? att.clockOut : null,
      grossHours: eff.grossHours,
      leaveHours: eff.leaveHours,
      hours: eff.hours,
      leaveMin: leaveMin,
      leaveCount: leaves.length,
      lateMin: lateMin,
      earlyMin: earlyMin,
      isLate: lateMin > 0,
      isEarly: earlyMin > 0,
      absent: absent
    };
  }

  // ---------- 区间聚合 ----------
  // days: dayStat 数组 → 汇总
  function summarize(days) {
    var s = {
      dayCount: days.length,
      shouldDays: 0,      // 应出勤天数（工作日）
      attendDays: 0,      // 实际出勤天数（有打卡）
      restDays: 0,
      absentDays: 0,
      lateDays: 0,
      earlyDays: 0,
      leaveDays: 0,       // 有请假记录的天数
      totalHours: 0,      // 实际工时合计（已扣请假）
      grossHours: 0,
      leaveHours: 0,
      leaveMin: 0,
      lateMin: 0,
      earlyMin: 0
    };
    days.forEach(function (d) {
      if (d.isRest) s.restDays++; else s.shouldDays++;
      if (d.hasClock) s.attendDays++;
      if (d.absent) s.absentDays++;
      if (d.isLate) s.lateDays++;
      if (d.isEarly) s.earlyDays++;
      if (d.leaveCount) s.leaveDays++;
      s.totalHours += d.hours;
      s.grossHours += d.grossHours;
      s.leaveHours += d.leaveHours;
      s.leaveMin += d.leaveMin;
      s.lateMin += d.lateMin;
      s.earlyMin += d.earlyMin;
    });
    // 日均按「实际出勤天数」而非自然天，否则周末会把均值拉塌
    s.avgHours = s.attendDays ? s.totalHours / s.attendDays : 0;
    // 出勤率 = 实际出勤 / 应出勤；应出勤为 0（整段都是假期）时记 100%，不显示 NaN
    s.attendRate = s.shouldDays ? Math.min(1, s.attendDays / s.shouldDays) : 1;
    return s;
  }

  // 拉取区间原始事实并逐日聚合。返回 { from, to, days:[dayStat], summary }
  // 依赖注入 ctx 便于测试：{ attMap, leaveMap, typeMap }，缺省则实时查库。
  function rangeStats(from, to, ctx) {
    ctx = ctx || {};
    var keys = eachDay(from, to);
    var sched = ctx.schedule || getSchedule();

    function loadAtt() {
      if (ctx.attMap) return Promise.resolve(ctx.attMap);
      if (!root.RT_ATTENDANCE || !root.RT_ATTENDANCE.getRange) return Promise.resolve({});
      return root.RT_ATTENDANCE.getRange(from, to).catch(function (e) {
        // 静默降级会让统计数字「看起来正常但其实是错的」，必须留痕便于排查
        if (root.console) root.console.warn('[RT_STATS] 考勤区间读取失败，按空数据统计：', e);
        return {};
      });
    }
    function loadLeave() {
      if (ctx.leaveMap) return Promise.resolve(ctx.leaveMap);
      if (!root.RT_LEAVE || !root.RT_LEAVE.getRange) return Promise.resolve({});
      return root.RT_LEAVE.getRange(from, to).catch(function (e) {
        if (root.console) root.console.warn('[RT_STATS] 请假区间读取失败，按空数据统计：', e);
        return {};
      });
    }
    // 休息日判定：按 RT_HOLIDAY.dayType 逐日推断（内部有年度数据缓存，不会重复网络请求）
    function loadTypes(attMap) {
      if (ctx.typeMap) return Promise.resolve(ctx.typeMap);
      if (!root.RT_HOLIDAY || !root.RT_HOLIDAY.dayType) {
        var fb = {};
        keys.forEach(function (k) {
          var ov = attMap[k] && attMap[k].override;
          var dow = parseKey(k).getDay();
          fb[k] = { isRest: ov === 'rest' ? true : (ov === 'work' ? false : (dow === 0 || dow === 6)) };
        });
        return Promise.resolve(fb);
      }
      return Promise.all(keys.map(function (k) {
        var ov = (attMap[k] && attMap[k].override) || null;
        return root.RT_HOLIDAY.dayType(k, ov).catch(function () { return { isRest: false }; });
      })).then(function (list) {
        var m = {};
        keys.forEach(function (k, i) { m[k] = list[i]; });
        return m;
      });
    }

    return loadAtt().then(function (attMap) {
      return Promise.all([loadLeave(), loadTypes(attMap)]).then(function (r) {
        var leaveMap = r[0], typeMap = r[1];
        var days = keys.map(function (k) {
          return dayStat(k, attMap[k] || null, leaveMap[k] || [], !!(typeMap[k] && typeMap[k].isRest), sched);
        });
        return { from: from, to: to, days: days, summary: summarize(days) };
      });
    });
  }

  // ---------- 业务计数（任务 / 待办 / 反馈）----------
  // 复用 RT_DAYFACTS.collect 逐日统计。
  // 注意两种口径的区别，别混用：
  //   task/todo/feedback → 「动态次数」，同一任务一天提测一天上线记 2 次（回答「做了多少事」）
  //   statusDist         → 「任务去重数」，同一任务无论命中几天只记 1 次（回答「盘子里有多少活」）
  // 状态分布若不去重，一条走完全流程的任务会把分布撑成 5 份，完成率也跟着失真。
  function bizStats(from, to, data, scope) {
    var keys = eachDay(from, to);
    var res = { task: 0, todo: 0, feedback: 0, perDay: {}, statusDist: {}, actDist: {}, taskUnique: 0 };
    if (!root.RT_DAYFACTS) return res;
    var seen = {};
    keys.forEach(function (k) {
      var c = root.RT_DAYFACTS.collect(k, data, scope);
      res.perDay[k] = c.counts;
      res.task += c.counts.task;
      res.todo += c.counts.todo;
      res.feedback += c.counts.feedback;
      c.tasks.forEach(function (x) {
        x.acts.forEach(function (a) { res.actDist[a.code] = (res.actDist[a.code] || 0) + 1; });
        var id = x.rec.id;
        if (id && seen[id]) return;              // 同一任务只计一次状态
        if (id) seen[id] = 1;
        var st = x.rec.statusCode || 'UNKNOWN';
        res.statusDist[st] = (res.statusDist[st] || 0) + 1;
      });
    });
    res.taskUnique = Object.keys(seen).length;
    res.total = res.task + res.todo + res.feedback;
    return res;
  }

  // ---------- 格式化 ----------
  function fmtHours(h) {
    if (!h) return '0';
    if (h < 1) return Math.round(h * 60) + ' 分';
    return (Math.round(h * 10) / 10).toString().replace(/\.0$/, '') + ' 时';
  }
  function fmtMin(m) {
    if (!m) return '0';
    if (m < 60) return m + ' 分';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + ' 时 ' + r + ' 分' : h + ' 时';
  }
  function fmtRate(r) { return Math.round((r || 0) * 100) + '%'; }

  root.RT_STATS = {
    DEFAULT_SCHED: DEFAULT_SCHED,
    getSchedule: getSchedule,
    setSchedule: setSchedule,
    keyOf: keyOf,
    parseKey: parseKey,
    eachDay: eachDay,
    weekRange: weekRange,
    monthRange: monthRange,
    tsToMin: tsToMin,
    dayStat: dayStat,
    summarize: summarize,
    rangeStats: rangeStats,
    bizStats: bizStats,
    fmtHours: fmtHours,
    fmtMin: fmtMin,
    fmtRate: fmtRate
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_STATS;
})(typeof window !== 'undefined' ? window : globalThis);
