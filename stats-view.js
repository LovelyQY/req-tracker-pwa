// stats-view.js — 考勤工时统计共享渲染模块（Batch 195）
// 从 app.js 的 1401-1627 行提取，供首页 #view-stats 容器和 report-stats.html 独立子页共用。
// 模块导出 window.RT_STATS_VIEW，调用方直接 RT_STATS_VIEW.renderInto(containerElement)。

(function () {
  'use strict';

  // ===== 工具函数（自包含，不依赖 app.js） =====
  function pad2(n) { return String(n).padStart(2, '0'); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function fmtClockTime(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // ===== 状态 =====
  var statsMode = 'day';                       // 'day' | 'week' | 'overall'
  var statsAnchor = null;                      // 锚点日期 YYYY-MM-DD（日/周模式）
  var statsMonth = null;                       // 综合模式的月份 { y, m }

  function statsEnsureAnchor() {
    if (!statsAnchor) statsAnchor = window.RT_ATTENDANCE ? RT_ATTENDANCE.todayStr() : RT_STATS.keyOf(new Date());
    if (!statsMonth) { var d = RT_STATS.parseKey(statsAnchor); statsMonth = { y: d.getFullYear(), m: d.getMonth() }; }
  }

  // ===== 日期区间 + 标题 =====
  function statsRange() {
    statsEnsureAnchor();
    if (statsMode === 'day') {
      var d = RT_STATS.parseKey(statsAnchor);
      var wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      return { from: statsAnchor, to: statsAnchor, title: (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + wk };
    }
    if (statsMode === 'week') {
      var r = RT_STATS.weekRange(statsAnchor);
      var a = RT_STATS.parseKey(r.from), b = RT_STATS.parseKey(r.to);
      return { from: r.from, to: r.to, title: (a.getMonth() + 1) + '/' + a.getDate() + ' – ' + (b.getMonth() + 1) + '/' + b.getDate() };
    }
    var mr = RT_STATS.monthRange(statsMonth.y, statsMonth.m);
    return { from: mr.from, to: mr.to, title: statsMonth.y + ' 年 ' + (statsMonth.m + 1) + ' 月' };
  }

  // ===== 导航 =====
  function statsShift(delta) {
    statsEnsureAnchor();
    if (statsMode === 'overall') {
      var m = statsMonth.m + delta, y = statsMonth.y;
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      statsMonth = { y: y, m: m };
    } else {
      var step = statsMode === 'week' ? 7 : 1;
      var d = RT_STATS.parseKey(statsAnchor);
      d.setDate(d.getDate() + delta * step);
      statsAnchor = RT_STATS.keyOf(d);
    }
    RT_STATS_VIEW.renderInto(document.getElementById('view-stats') || document.getElementById('report-stats-root'));
  }

  function statsSwitchMode(mode) {
    statsMode = mode;
    RT_STATS_VIEW.renderInto(document.getElementById('view-stats') || document.getElementById('report-stats-root'));
  }

  function statsGoToday() {
    statsAnchor = window.RT_ATTENDANCE ? RT_ATTENDANCE.todayStr() : RT_STATS.keyOf(new Date());
    var d = RT_STATS.parseKey(statsAnchor);
    statsMonth = { y: d.getFullYear(), m: d.getMonth() };
    RT_STATS_VIEW.renderInto(document.getElementById('view-stats') || document.getElementById('report-stats-root'));
  }

  // ===== 统计语义色（批次 209 / #16）：颜色从字典读取，改色只改字典 =====
  // 缺省回退值，保证字典未播种时仍有合理配色。
  var STATS_COLOR_FALLBACK = {
    ATTEND_NUM: '#1677ff',
    BAR_LATE: '#ff4d4f',
    BAR_NORMAL: '#1677ff',
    BAR_OVERTIME: '#389e0d',
    BAR_GRID: '#e5e7eb'
  };
  function loadStatsColors() {
    if (!window.RT_DICT || !RT_DICT.getDictByType || !RT_DICT.SEED_TYPE || !RT_DICT.SEED_TYPE.STATS_COLOR) {
      return Promise.resolve(STATS_COLOR_FALLBACK);
    }
    return RT_DICT.getDictByType(RT_DICT.SEED_TYPE.STATS_COLOR).then(function (list) {
      var map = {};
      (Array.isArray(list) ? list : []).forEach(function (r) { if (r && r.code && r.color) map[r.code] = r.color; });
      Object.keys(STATS_COLOR_FALLBACK).forEach(function (k) { if (!map[k]) map[k] = STATS_COLOR_FALLBACK[k]; });
      return map;
    }).catch(function () { return STATS_COLOR_FALLBACK; });
  }

  // ===== 渲染组件 =====
  // opts: { color?: 数字语义色(css), cls?: 附加 class }
  // 考勤类数字传 color（语义色，非黑）；业务动态数字不传（保持中性）。
  function stCard(num, label, opts) {
    opts = opts || {};
    var numStyle = opts.color ? ' style="color:' + opts.color + '"' : '';
    return '<div class="stat-card' + (opts.cls ? ' ' + opts.cls : '') + '">'
      + '<div class="stat-num"' + numStyle + '>' + num + '</div><div class="stat-label">' + label + '</div></div>';
  }

  // 卡片标题放卡片外（对齐 devices.html：set-group-title 在卡片外，set-group 为卡片本体）
  function stSec(title, inner) {
    return '<div class="st-sec">'
      + '<div class="set-group-title">' + title + '</div>'
      + '<div class="set-group">' + inner + '</div>'
      + '</div>';
  }

  // ===== 日统计 =====
  function stDayHtml(res, biz, rg, colors) {
    var d = res.days[0];
    if (!d) return '<div class="st-empty"><svg viewBox="0 0 24 24" fill="#34C759" fill-rule="evenodd" xmlns="http://www.w3.org/2000/svg"><path d="M5 9.2h3V19H5zM10.6 5h3v14h-3zm5.6 8H19v6h-2.8z"/></svg><div>无数据</div></div>';
    var S = RT_STATS, numC = colors.ATTEND_NUM;
    var clockLine = d.hasClock
      ? fmtClockTime(d.clockIn) + ' – ' + (d.clockOut ? fmtClockTime(d.clockOut) : '进行中')
      : (d.isRest ? '休息日' : '未打卡');

    var flags = [];
    if (d.isLate) flags.push('<span class="st-flag st-flag-bad">迟到 ' + S.fmtMin(d.lateMin) + '</span>');
    if (d.isEarly) flags.push('<span class="st-flag st-flag-bad">早退 ' + S.fmtMin(d.earlyMin) + '</span>');
    if (d.absent) flags.push('<span class="st-flag st-flag-bad">缺勤</span>');
    if (d.leaveCount) flags.push('<span class="st-flag st-flag-warn">请假 ' + S.fmtMin(d.leaveMin) + '</span>');
    if (!flags.length && d.hasClock) flags.push('<span class="st-flag st-flag-ok">全勤</span>');
    if (d.isRest) flags.push('<span class="st-flag">休息日</span>');

    var c = biz.perDay[d.date] || { task: 0, todo: 0, feedback: 0 };
    return stSec('考勤',
        '<div class="st-line">' + escapeHtml(clockLine) + '</div>'
        + '<div class="st-flags">' + flags.join('') + '</div>'
        + '<div class="st-grid">'
        + stCard(S.fmtHours(d.hours), '实际工时', { color: numC })
        + stCard(S.fmtHours(d.grossHours), '在岗时长', { color: numC })
        + stCard(S.fmtMin(d.leaveMin), '请假时长', { color: numC })
        + '</div>')
      + stSec('业务动态',
        '<div class="st-grid">'
        + stCard(c.task, '任务动态') + stCard(c.todo, '待办动态') + stCard(c.feedback, '反馈')
        + '</div>'
        + (biz.total ? '' : '<div class="st-empty-s">当日没有业务动态</div>'));
  }

  // ===== 周统计 =====
  // 柱状颜色（批次 209 / #16）：迟到早退红、正常系统色、加班深绿、休息用网格色，均从字典读。
  function weekBarColor(d, colors) {
    if (d.isRest) return colors.BAR_GRID;
    if (d.isLate || d.isEarly) return colors.BAR_LATE;
    if (d.isOvertime) return colors.BAR_OVERTIME;
    if (d.absent) return colors.BAR_LATE;
    return colors.BAR_NORMAL;
  }
  function stWeekHtml(res, biz, rg, colors) {
    var S = RT_STATS, s = res.summary;
    var max = Math.max.apply(null, res.days.map(function (x) { return x.hours; }).concat([1]));
    var WK = ['一', '二', '三', '四', '五', '六', '日'];
    var bars = res.days.map(function (d, i) {
      var h = max > 0 ? Math.round((d.hours / max) * 100) : 0;
      var fillCls = d.absent ? ' is-absent' : '';
      var fillColor = weekBarColor(d, colors);
      return '<div class="st-bar-col" title="' + d.date + ' ' + S.fmtHours(d.hours) + '">'
        + '<div class="st-bar-v">' + (d.hours ? S.fmtHours(d.hours) : '') + '</div>'
        + '<div class="st-bar-track" style="background:' + colors.BAR_GRID + '"><div class="st-bar-fill' + fillCls + '" style="height:' + h + '%;background:' + fillColor + '"></div></div>'
        + '<div class="st-bar-x">' + WK[i] + '</div></div>';
    }).join('');

    return stSec('工时分布', '<div class="st-bars">' + bars + '</div>')
      + stSec('考勤汇总',
        '<div class="st-grid">'
        + stCard(S.fmtHours(s.totalHours), '汇总工时', { color: colors.ATTEND_NUM })
        + stCard(S.fmtHours(s.avgHours), '日均工时', { color: colors.ATTEND_NUM })
        + stCard(s.attendDays + ' / ' + s.shouldDays, '出勤 / 应出勤', { color: colors.ATTEND_NUM })
        + stCard(s.absentDays, '缺勤天数', { color: colors.ATTEND_NUM })
        + '</div>'
        + '<div class="st-flags">'
        + '<span class="st-flag' + (s.lateDays ? ' st-flag-bad' : '') + '">迟到 ' + s.lateDays + ' 天</span>'
        + '<span class="st-flag' + (s.earlyDays ? ' st-flag-bad' : '') + '">早退 ' + s.earlyDays + ' 天</span>'
        + '<span class="st-flag' + (s.leaveDays ? ' st-flag-warn' : '') + '">请假 ' + s.leaveDays + ' 天 · ' + S.fmtMin(s.leaveMin) + '</span>'
        + '</div>')
      + stSec('业务动态',
        '<div class="st-grid">'
        + stCard(biz.task, '任务动态') + stCard(biz.todo, '待办动态') + stCard(biz.feedback, '反馈')
        + '</div>');
  }

  // ===== 综合统计 =====
  function stOverallHtml(res, biz, rg, colors) {
    var S = RT_STATS, s = res.summary, numC = colors.ATTEND_NUM;
    var STATUS_LABEL = { TODO: '待开发', SUBMITTED: '已提测', TESTING: '测试中', TESTED: '已测完', ONLINE: '已上线', PAUSED: '暂停中' };
    var STATUS_COLOR = { TODO: '#8c8c8c', SUBMITTED: '#faad14', TESTING: '#1890ff', TESTED: '#52c41a', ONLINE: '#722ed1', PAUSED: '#bfbfbf' };

    var keys = Object.keys(biz.statusDist);
    var distTotal = keys.reduce(function (n, k) { return n + biz.statusDist[k]; }, 0);
    var dist = '<div class="st-empty-s">本月没有任务动态</div>';
    if (distTotal) {
      var seg = keys.map(function (k) {
        var pct = (biz.statusDist[k] / distTotal) * 100;
        return '<div class="st-dist-seg" style="width:' + pct + '%;background:' + (STATUS_COLOR[k] || '#8c8c8c') + '"'
          + ' title="' + escapeHtml(STATUS_LABEL[k] || k) + ' ' + biz.statusDist[k] + '"></div>';
      }).join('');
      var lg = keys.map(function (k) {
        return '<span class="st-dist-lg"><i style="background:' + (STATUS_COLOR[k] || '#8c8c8c') + '"></i>'
          + escapeHtml(STATUS_LABEL[k] || k) + ' ' + biz.statusDist[k] + '</span>';
      }).join('');
      dist = '<div class="st-dist">' + seg + '</div><div class="st-dist-lgs">' + lg + '</div>';
    }

    var done = (biz.statusDist.TESTED || 0) + (biz.statusDist.ONLINE || 0);
    var doneRate = distTotal ? done / distTotal : 0;

    return stSec('工时与出勤',
        '<div class="st-grid">'
        + stCard(S.fmtHours(s.totalHours), '总工时', { color: numC })
        + stCard(S.fmtHours(s.avgHours), '平均日工时', { color: numC })
        + stCard(S.fmtRate(s.attendRate), '出勤率', { color: numC })
        + stCard(s.attendDays + ' / ' + s.shouldDays, '出勤 / 应出勤', { color: numC })
        + '</div>'
        + stRateBar('出勤率', s.attendRate))
      + stSec('异常与请假',
        '<div class="st-grid">'
        + stCard(s.lateDays, '迟到天数', { color: numC }) + stCard(s.earlyDays, '早退天数', { color: numC })
        + stCard(s.absentDays, '缺勤天数', { color: numC }) + stCard(S.fmtMin(s.leaveMin), '请假合计', { color: numC })
        + '</div>')
      + stSec('任务状态分布（' + (biz.taskUnique || 0) + ' 个任务）', dist + stRateBar('完成率', doneRate))
      + stSec('业务动态合计',
        '<div class="st-grid">'
        + stCard(biz.task, '任务动态') + stCard(biz.todo, '待办动态')
        + stCard(biz.feedback, '反馈') + stCard(biz.total, '合计')
        + '</div>');
  }

  function stRateBar(label, rate) {
    var pct = Math.round((rate || 0) * 100);
    return '<div class="st-rate">'
      + '<div class="st-rate-top"><span>' + escapeHtml(label) + '</span><span class="st-rate-n">' + pct + '%</span></div>'
      + '<div class="st-rate-track"><div class="st-rate-fill" style="width:' + pct + '%"></div></div>'
      + '</div>';
  }

  // ===== 独立 IDB 读反馈（不依赖 app.js 的 getAllFeedback） =====
  function getFeedback() {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open('req-tracker-feedback', 1);
        req.onsuccess = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('feedback')) { try { db.close(); } catch (_) {} resolve([]); return; }
          var tx = db.transaction('feedback', 'readonly');
          var store = tx.objectStore('feedback');
          var out = [];
          var cur = store.openCursor();
          cur.onsuccess = function (ev) {
            var c = ev.target.result;
            if (c) { out.push(c.value); c.continue(); }
            else { try { db.close(); } catch (_) {} resolve(out); }
          };
          cur.onerror = function () { try { db.close(); } catch (_) {} resolve(out); };
        };
        req.onerror = function () { resolve([]); };
      } catch (e) { resolve([]); }
    });
  }

  // ===== 主入口 =====
  async function renderInto(wrap) {
    if (!wrap) return;
    if (!window.RT_STATS) { wrap.innerHTML = '<div class="st-empty">统计模块未加载</div>'; return; }

    var rg = statsRange();
    var colors = await loadStatsColors();
    var modeBtn = function (k, label) {
      return '<button class="st-mode' + (statsMode === k ? ' is-on' : '') + '" onclick="statsSwitchMode(\'' + k + '\')">' + label + '</button>';
    };

    // ③ 导出 PDF 按钮移到「今天」左侧（原在页面顶部 toolbar，与标题栏重复且偏高）
    // 导出权限门控：无 RT_PERM 时回退显示（避免误隐藏）；有 RT_PERM 则按 export 权限显隐。
    var canExport = !window.RT_PERM || (RT_PERM.can && RT_PERM.can('page_report_stats', 'export'));
    var exportBtn = canExport
      ? '<button class="st-export" type="button" onclick="window.print()" aria-label="导出PDF">'
        + '<svg class="st-export-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/></svg>'
        + '<span>导出PDF</span></button>'
      : '';

    wrap.innerHTML = '<div class="st-head">'
      + '<span class="st-h-title">统计报表</span>'
      + exportBtn
      + '<button class="st-today" onclick="statsGoToday()">今天</button>'
      + '</div>'
      + '<div class="st-modes">' + modeBtn('day', '日统计') + modeBtn('week', '周统计') + modeBtn('overall', '综合统计') + '</div>'
      + '<div class="st-nav">'
      + '<button class="st-nav-btn" onclick="statsShift(-1)">‹</button>'
      + '<span class="st-nav-title">' + escapeHtml(rg.title) + '</span>'
      + '<button class="st-nav-btn" onclick="statsShift(1)">›</button>'
      + '</div>'
      + '<div id="stBody"><div class="st-empty">加载中…</div></div>';

    var body = document.getElementById('stBody');
    var res, biz;
    try {
      res = await RT_STATS.rangeStats(rg.from, rg.to);
    } catch (e) {
      body.innerHTML = '<div class="st-empty">统计数据加载失败</div>';
      return;
    }
    try {
      var todos = [], feedback = [], scope = null;
      try { todos = await RT_TODOS.getAllTodos(); } catch (e) {}
      try { feedback = await getFeedback(); } catch (e) {}
      try { scope = RT_DAYFACTS ? await RT_DAYFACTS.buildScope() : null; } catch (e) {}
      biz = RT_STATS.bizStats(rg.from, rg.to, {
        tasks: (typeof allTasks !== 'undefined' && Array.isArray(allTasks)) ? allTasks : [],
        todos: todos,
        feedback: feedback
      }, scope);
    } catch (e) { biz = { task: 0, todo: 0, feedback: 0, total: 0, perDay: {}, statusDist: {}, actDist: {} }; }

    if (statsMode === 'day') body.innerHTML = stDayHtml(res, biz, rg, colors);
    else if (statsMode === 'week') body.innerHTML = stWeekHtml(res, biz, rg, colors);
    else body.innerHTML = stOverallHtml(res, biz, rg, colors);
  }

  // ===== 返回逻辑 =====
  function onBack() {
    // 如果在 app 内（有 switchView），调用 switchView('home')
    if (typeof switchView === 'function') {
      switchView('home');
      return;
    }
    // 如果是独立子页，调用全局 goBack（auth.js 定义）
    if (typeof goBack === 'function') {
      goBack();
      return;
    }
    // 最终兜底
    window.history.back();
  }

  // ===== 导出 =====
  // 全局函数（供 inline onclick 直接调用）
  window.statsShift = statsShift;
  window.statsSwitchMode = statsSwitchMode;
  window.statsGoToday = statsGoToday;
  window.statsRange = statsRange;

  window.RT_STATS_VIEW = {
    renderInto: renderInto,
    onBack: onBack,
    // 状态（测试用）
    _state: {
      get statsMode() { return statsMode; },
      get statsAnchor() { return statsAnchor; },
      get statsMonth() { return statsMonth; }
    }
  };

})();
