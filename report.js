// report.js —— 统计报表独立页逻辑
//
// 批次 10a（框架）：模块入口列表 + 同页内联视图切换（report.html 的 .report-section）。
// 批次 10b（任务统计）：把 index.html #view-report 的 renderReports / renderReportValueRow
//   逻辑迁移到本独立页，统计口径（时间维度、测试工时估算、已进入/未进入测试分布）与首页原报表逐行一致。
//   10c（缺陷追踪）、10d（任务事项 + 会议）将在后续子批次填充其余三个 .report-section。

(function (root) {
  'use strict';

  // ===================== 模块入口（框架，10a） =====================
  var MODULES = [
    { key: 'task',    name: '任务统计',     desc: '按时间维度汇总任务总量、测试工时与测试/上线进度', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>', batch: '10b（已完成）' },
    { key: 'todo',    name: '任务事项统计', desc: '统计任务事项的总量、未处理 / 处理中 / 已完成分布', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>', batch: '10d' },
    { key: 'bug',     name: '缺陷追踪统计', desc: '统计缺陷总量、未处理 / 处理中 / 已完成 / 待开发 / 已上线分布', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="12" rx="4"/><path d="M12 2v4M5 9l3 2M19 9l-3 2M4 16l4-1M20 16l-4-1"/></svg>', batch: '10c' },
    { key: 'meeting', name: '会议统计',     desc: '统计会议总量、未开始 / 已结束 / 已取消分布', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>', batch: '10d' }
  ];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ARROW_SVG = '<svg class="module-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

  function findRow(node) {
    while (node && node.nodeType === 1) {
      if (node.classList && node.classList.contains('module-row')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function renderModuleList() {
    var box = document.getElementById('moduleList');
    if (!box) return;
    box.innerHTML = MODULES.map(function (m) {
      return '<div class="module-row" data-key="' + m.key + '">' +
        '<div class="module-icon">' + m.icon + '</div>' +
        '<div class="module-main">' +
          '<div class="module-name">' + escapeHtml(m.name) + '</div>' +
          '<div class="module-desc">' + escapeHtml(m.desc) + '</div>' +
        '</div>' + ARROW_SVG +
      '</div>';
    }).join('');
    box.addEventListener('click', function (e) {
      var row = findRow(e.target);
      if (row) switchSection(row.getAttribute('data-key'));
    });
  }

  function switchSection(key) {
    var sections = document.querySelectorAll('#reportContent .report-section');
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      if (sec.getAttribute('data-key') === key) {
        sec.classList.add('active');
        if (!sec.getAttribute('data-rendered')) {
          if (key === 'task') { renderTaskReport(); }       // 10b 已实现的真实报表
          else if (key === 'bug') { renderBugReport(); }    // 10c 缺陷追踪报表
          else { renderPlaceholder(sec, key); }             // 10d 仍占位
          sec.setAttribute('data-rendered', '1');
        }
      } else {
        sec.classList.remove('active');
      }
    }
  }

  function renderPlaceholder(sec, key) {
    var mod = null;
    for (var i = 0; i < MODULES.length; i++) { if (MODULES[i].key === key) { mod = MODULES[i]; break; } }
    if (!mod) return;
    sec.innerHTML =
      '<div class="report-placeholder">' +
        '<div class="ph-title">' + escapeHtml(mod.name) + '</div>' +
        '<div class="ph-sub">本模块报表将在批次 ' + escapeHtml(mod.batch) +
        ' 实现（统计卡 + 模块分布 + 时间维度筛选 + 导出 PDF）。</div>' +
      '</div>';
  }

  // ===================== 任务统计报表（批次 10b） =====================
  // 状态 code → 中文（与 app.js statusName 一致；补充 PAUSED→暂停中 使「暂停中」状态可正确展示）
  var STATUS_NAME = { TODO: '待开发', SUBMITTED: '已提测', TESTING: '测试中', TESTED: '已测完', ONLINE: '已上线', PAUSED: '暂停中' };
  var reportFilter = { dim: 'year', year: 'all', quarter: 'all', month: 'all' };
  // 取消勾选则不统计的任务类型集合（默认普通BUG 不选中 = 不统计）
  var reportExcludeTypes = (typeof Set === 'function') ? new Set(['COMMON_BUG']) : { has: function () { return false; }, add: function () {}, delete: function () {} };

  var TASK_TYPE_LIST = [];          // [{code,name,color,...}] 来自字典 任务类型
  var TYPE_CODE_TO_NAME = {};
  var TYPE_CODE_TO_COLOR = {};      // 直接用字典色值（仓库未定义 --c-需求 等 CSS 变量）
  var priorityList = [], projectList = [], versionList = [], userList = [];
  var allTasks = [];                // 原始需求任务记录（来自 RT_REQUIREMENT_TASKS）
  var dataReady = false;

  // ---- 缺陷追踪（批次 10c）：数据源 = todos(typeCode=BUG) ----
  var BUG_STATUS_LIST = [];         // [{code,name,color,...}] 来自字典 缺陷追踪状态
  var BUG_STATUS_CODE_TO_NAME = {};
  var BUG_STATUS_CODE_TO_COLOR = {};
  var allTodos = [];                // 原始代办记录（来自 RT_TODOS.getAllTodos）
  var bugFilter = { dim: 'year', year: 'all', quarter: 'all', month: 'all' };

  function statusName(code) { return STATUS_NAME[code] || (code || ''); }
  function typeName(code) { return TYPE_CODE_TO_NAME[code] || (code || ''); }
  function typeColor(code) { return TYPE_CODE_TO_COLOR[code] || '#8c8c8c'; }
  function priorityName(code) { for (var i = 0; i < priorityList.length; i++) { if (priorityList[i] && priorityList[i].code === code) return priorityList[i].name; } return code || ''; }
  function projectNameById(id) { for (var i = 0; i < projectList.length; i++) { if (projectList[i] && projectList[i].id === id) return projectList[i].projectName; } return id || ''; }
  function versionNameById(id) { for (var i = 0; i < versionList.length; i++) { if (versionList[i] && versionList[i].id === id) return versionList[i].versionName; } return id || ''; }
  function userNicknamesByIds(ids) {
    if (!ids || !ids.length) return [];
    return ids.map(function (id) {
      for (var i = 0; i < userList.length; i++) { if (userList[i] && userList[i].id === id) return userList[i].nickname || userList[i].name || id; }
      return id;
    });
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function normalizeTask(t) {
    return {
      _source: 'idb',
      id: t.id,
      title: t.taskName,
      taskName: t.taskName,
      desc: t.taskDesc,
      typeCode: t.taskTypeCode,
      priorityText: priorityName(t.priorityCode),
      priorityCode: t.priorityCode,
      statusText: statusName(t.statusCode),
      statusCode: t.statusCode,
      projectName: projectNameById(t.projectId),
      versionName: versionNameById(t.projectVersionId),
      developerNames: userNicknamesByIds(t.developerIds),
      zentaoId: t.zentaoId,
      zentaoSubId: t.zentaoSubId,
      images: t.imageIds || [],
      attachments: t.attachmentIds || [],
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      dates: {
        submitted: t.devSubmitTime || null,
        started: t.testStartTime || null,
        completed: t.testEndTime || null,
        online: t.onlineTime || null
      },
      raw: t
    };
  }

  // ---- 时间筛选：以「测试开始 / 测试结束时间」为准，任一落在所选范围内即计入 ----
  function inPeriod(t, f) {
    if (!t) return false;
    var d = new Date(t);
    if (d.getFullYear() !== f.year) return false;
    if (f.dim === 'quarter') {
      if (f.quarter !== 'all' && Math.floor(d.getMonth() / 3) + 1 !== f.quarter) return false;
    } else if (f.dim === 'month') {
      if (f.month !== 'all' && d.getMonth() + 1 !== f.month) return false;
    }
    return true;
  }
  function periodMatch(it, f) {
    if (f.year === 'all') return true;
    var ds = it.dates || {};
    return inPeriod(ds.started, f) || inPeriod(ds.completed, f);
  }

  // 估算「只有开始时间、尚未结束」任务的测试工时（工作时段 08:00–17:30，整天 8H，周末不计）
  function estimateWorkHours(start, end) {
    var FULL_DAY = 8;
    var s = new Date(start), e = new Date(end);
    var firstOnly = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    var lastOnly = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    if (firstOnly.getTime() === lastOnly.getTime()) return Math.max(0, (e - s) / 3600000);
    var h = 0;
    var day = new Date(firstOnly);
    while (day.getTime() <= lastOnly.getTime()) {
      var dow = day.getDay();
      if (dow === 0 || dow === 6) { day.setDate(day.getDate() + 1); continue; }
      if (day.getTime() === firstOnly.getTime()) {
        var fe = new Date(s); fe.setHours(17, 30, 0, 0);
        h += Math.max(0, (fe - s) / 3600000);
      } else if (day.getTime() === lastOnly.getTime()) {
        var ls = new Date(e); ls.setHours(8, 0, 0, 0);
        h += Math.max(0, (e - ls) / 3600000);
      } else {
        h += FULL_DAY;
      }
      day.setDate(day.getDate() + 1);
    }
    return h;
  }
  // 单任务测试工时：结束基准 = 完成时间；未完成取当前时间
  function taskWorkHours(it) {
    var d = it.dates || {};
    if (!d.started) return 0;
    var endRaw = d.completed || Date.now();
    return Math.max(0, estimateWorkHours(d.started, endRaw));
  }

  // 收集可选年份：当前年 + 各任务录入/测试起止时间年份，降序
  function collectReportYears() {
    var set = {};
    set[new Date().getFullYear()] = 1;
    allTasks.forEach(function (t) {
      if (t.createdAt) set[new Date(t.createdAt).getFullYear()] = 1;
      if (t.testStartTime) set[new Date(t.testStartTime).getFullYear()] = 1;
      if (t.testEndTime) set[new Date(t.testEndTime).getFullYear()] = 1;
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }

  // 渲染维度下拉（年份始终存在，季度/月度按维度追加）
  function renderReportValueRow() {
    var box = document.getElementById('rf-value');
    if (!box) return;
    var years = collectReportYears();
    var html = '<select class="rf-select" id="rf-year" aria-label="年份"><option value="all">全部年份</option>';
    years.forEach(function (y) { html += '<option value="' + y + '">' + y + ' 年</option>'; });
    html += '</select>';
    if (reportFilter.dim === 'quarter') {
      html += '<select class="rf-select" id="rf-quarter" aria-label="季度"><option value="all">全部季度</option>';
      for (var q = 1; q <= 4; q++) html += '<option value="' + q + '">第 ' + q + ' 季度</option>';
      html += '</select>';
    } else if (reportFilter.dim === 'month') {
      html += '<select class="rf-select" id="rf-month" aria-label="月份"><option value="all">全部月份</option>';
      for (var m = 1; m <= 12; m++) html += '<option value="' + m + '">' + m + ' 月</option>';
      html += '</select>';
    }
    box.innerHTML = html;
    var yEl = document.getElementById('rf-year');
    if (yEl) {
      if (reportFilter.year !== 'all' && years.indexOf(reportFilter.year) === -1) reportFilter.year = 'all';
      yEl.value = String(reportFilter.year);
      yEl.addEventListener('change', function () { reportFilter.year = yEl.value === 'all' ? 'all' : Number(yEl.value); renderReports(); });
    }
    var qEl = document.getElementById('rf-quarter');
    if (qEl) {
      qEl.value = String(reportFilter.quarter);
      qEl.addEventListener('change', function () { reportFilter.quarter = qEl.value === 'all' ? 'all' : Number(qEl.value); renderReports(); });
    }
    var mEl = document.getElementById('rf-month');
    if (mEl) {
      mEl.value = String(reportFilter.month);
      mEl.addEventListener('change', function () { reportFilter.month = mEl.value === 'all' ? 'all' : Number(mEl.value); renderReports(); });
    }
  }

  // 统计范围文案（屏幕提示与 PDF 共用）
  function reportExcludeNames() {
    if (typeof reportExcludeTypes.has !== 'function') return '';
    var names = [];
    TASK_TYPE_LIST.forEach(function (t) { if (reportExcludeTypes.has(t.code)) names.push(t.name); });
    return names.join('、');
  }
  function reportCaptionText() {
    var base = '统计范围（测试时间）';
    var s;
    if (reportFilter.year === 'all') s = base + '：全部时间';
    else {
      s = base + '：' + reportFilter.year + ' 年';
      if (reportFilter.dim === 'quarter') s += reportFilter.quarter === 'all' ? ' · 全部季度' : ' · 第 ' + reportFilter.quarter + ' 季度';
      else if (reportFilter.dim === 'month') s += reportFilter.month === 'all' ? ' · 全部月份' : ' · ' + reportFilter.month + ' 月';
    }
    var ex = reportExcludeNames();
    if (ex) s += ' · 不含 ' + ex;
    return s;
  }
  function updateReportCaption() {
    var el = document.getElementById('rf-caption');
    if (el) el.textContent = reportCaptionText();
  }

  function sumHours(lst) {
    var s = 0;
    for (var i = 0; i < lst.length; i++) s += taskWorkHours(lst[i]);
    return s;
  }
  function round1(h) { return Math.round(h * 10) / 10; }

  // 渲染进度条：宽度按该小节约最大值成比例；已进入测试额外显示工时与占比
  function renderBars(elId, rows, colorMap, opts) {
    opts = opts || {};
    var showHours = !!opts.showHours;
    var totalH = opts.totalHours || 0;
    var box = document.getElementById(elId);
    if (!box) return;
    var max = 1;
    rows.forEach(function (r) { if (r.n > max) max = r.n; });
    box.innerHTML = rows.map(function (r) {
      var pct = r.n === 0 ? 0 : Math.max(6, Math.round((r.n / max) * 100));
      var color = colorMap[r.key] || 'var(--primary)';
      var tail = '<span class="bar-num">' + r.n + '</span>';
      if (showHours) {
        var rh = round1(r.h);
        var hDisp = r.n === 0 ? '0.0H' : (rh <= 0 ? '0.1H' : rh.toFixed(1) + 'H');
        var denom = (r.pctOf != null) ? r.pctOf : totalH;
        var pp = (denom > 0 && r.h > 0) ? Math.round((r.h / denom) * 100) : 0;
        tail += '<span class="bar-hours">' + hDisp + '</span><span class="bar-pct">' + pp + '%</span>';
      }
      return '<div class="bar-row">' +
        '<span class="bar-label">' + escapeHtml(r.label) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%;background:' + color + '"></span></span>' +
        tail +
      '</div>';
    }).join('');
  }

  function renderReports() {
    var list = allTasks.map(normalizeTask).filter(function (it) {
      return periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode);
    });
    var total = list.length;
    var testing = list.filter(function (i) { return i.statusText === '测试中' || i.statusText === '暂停中'; }).length;
    var tested = list.filter(function (i) { return i.statusText === '已测完'; }).length;
    var online = list.filter(function (i) { return i.statusText === '已上线'; }).length;
    var notStart = list.filter(function (i) { var d = i.dates || {}; return !d.started; }).length;

    var hours = 0;
    list.forEach(function (i) { hours += taskWorkHours(i); });
    var rounded = round1(hours);
    var hoursText = rounded <= 0 ? '0.1H' : rounded.toFixed(1) + 'H';

    setText('r-total', total);
    setText('r-hours', hoursText);
    setText('r-testing', testing);
    setText('r-tested', tested);
    setText('r-online', online);
    setText('r-notstart', notStart);

    // 两大模块：已进入测试 / 未进入测试
    var ENTERED = ['测试中', '已测完', '已上线', '暂停中'];
    var entered = list.filter(function (i) { return ENTERED.indexOf(i.statusText) !== -1; });
    var notEntered = list.filter(function (i) { return ENTERED.indexOf(i.statusText) === -1; });

    var enteredHours = sumHours(entered);
    var enteredHoursRounded = round1(enteredHours);
    var ehEl = document.getElementById('rm-entered-hours');
    if (ehEl) ehEl.textContent = '· 合计 ' + (enteredHoursRounded <= 0 ? '0.1H' : enteredHoursRounded.toFixed(1) + 'H');

    var TYPE_COLOR = {};
    TASK_TYPE_LIST.forEach(function (t) { if (t && t.code) TYPE_COLOR[t.code] = typeColor(t.code); });
    var ENTERED_COLOR = { '测试中': '#1677ff', '已测完': '#52c41a', '已上线': '#722ed1', '暂停中': '#8c8c8c' };
    var NOT_COLOR = { '已提测': '#faad14', '未开始': '#fa8c16' };

    function typeRows(lst) {
      return TASK_TYPE_LIST.filter(function (t) { return !reportExcludeTypes.has(t.code); }).map(function (t) {
        var sub = lst.filter(function (i) { return i.typeCode === t.code; });
        return { key: t.code, label: t.name, n: sub.length, h: sumHours(sub) };
      });
    }
    function enteredStatusRows(lst) {
      var testingSub = lst.filter(function (i) { return i.statusText === '测试中' || i.statusText === '暂停中'; });
      var testingH = sumHours(testingSub);
      var pausedSub = lst.filter(function (i) { return i.statusText === '暂停中'; });
      return [
        { key: '测试中', label: '测试中', n: testingSub.length, h: testingH },
        { key: '暂停中', label: '暂停中', n: pausedSub.length, h: sumHours(pausedSub), pctOf: testingH },
        { key: '已测完', label: '已测完', n: lst.filter(function (i) { return i.statusText === '已测完'; }).length, h: sumHours(lst.filter(function (i) { return i.statusText === '已测完'; })) },
        { key: '已上线', label: '已上线', n: lst.filter(function (i) { return i.statusText === '已上线'; }).length, h: sumHours(lst.filter(function (i) { return i.statusText === '已上线'; })) }
      ];
    }
    function notStatusRows(lst) {
      var ti = lst.filter(function (i) { return i.statusText === '已提测'; }).length;
      return [{ key: '已提测', label: '已提测', n: ti }, { key: '未开始', label: '未开始', n: lst.length - ti }];
    }

    renderBars('rm-type-entered', typeRows(entered), TYPE_COLOR, { showHours: true, totalHours: enteredHours });
    renderBars('rm-status-entered', enteredStatusRows(entered), ENTERED_COLOR, { showHours: true, totalHours: enteredHours });
    renderBars('rm-type-not', typeRows(notEntered), TYPE_COLOR);
    renderBars('rm-status-not', notStatusRows(notEntered), NOT_COLOR);

    updateReportCaption();
  }
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  // ---- 任务清单卡片（无操作按钮，沿用 buildTaskCardHtml 展示结构） ----
  function primaryTimeText(it) {
    var d = it.dates || {};
    var fallback = '录入时间 ' + fmtDate(it.createdAt);
    switch (it.statusText) {
      case '待开发': return fallback;
      case '已提测': return d.submitted ? '提测时间 ' + fmtDate(d.submitted) : fallback;
      case '测试中': return d.started ? '开始时间 ' + fmtDate(d.started) : fallback;
      case '暂停中': return d.started ? '开始时间 ' + fmtDate(d.started) : fallback;
      case '已测完': return d.completed ? '完成时间 ' + fmtDate(d.completed) : fallback;
      case '已上线': return d.online ? '上线时间 ' + fmtDate(d.online) : fallback;
      default: return fallback;
    }
  }
  function buildTaskCardHtml(it) {
    var devTags = (it.developerNames || []).map(function (d) {
      return '<span class="tag dev">' + escapeHtml(d) + '</span>';
    }).join('');
    var dateSpans = [primaryTimeText(it)];
    var imgCount = (it.images && it.images.length) ? it.images.length : 0;
    if (imgCount > 0) dateSpans.push('📷 ' + imgCount + ' 张图片');
    var attCount = (it.attachments && it.attachments.length) ? it.attachments.length : 0;
    if (attCount > 0) dateSpans.push('📎 ' + attCount + ' 个附件');
    var showTid = it.zentaoId || '';
    var showSid = it.zentaoSubId || '';
    var tc = typeColor(it.typeCode);
    return '<div class="task-card t-' + escapeHtml(it.typeCode || '') + '" data-id="' + escapeHtml(it.id) + '" style="--type-color:' + tc + '">' +
      '<div class="task-body">' +
        '<div class="task-header"><div class="task-title-row">' +
          '<span class="tag type-' + escapeHtml(it.typeCode || '') + '" style="background:' + tc + '1a;color:' + tc + '">' + escapeHtml(typeName(it.typeCode)) + '</span>' +
          '<h3 class="task-title">' + escapeHtml(it.title) + '</h3>' +
        '</div>' +
        '<span class="tag status-' + escapeHtml(it.statusText) + '">' + escapeHtml(it.statusText || '') + '</span>' +
        '</div>' +
        ((showTid || showSid) ? '<div class="task-idpills">' + (showTid ? '<span class="id-pill id-pill--task">' + escapeHtml(showTid) + '</span>' : '') + (showSid ? '<span class="id-pill id-pill--sub">' + escapeHtml(showSid) + '</span>' : '') + '</div>' : '') +
        (it.desc ? '<div class="task-desc">' + escapeHtml(it.desc) + '</div>' : '') +
        '<div class="task-meta">' +
          '<span class="tag pri-' + escapeHtml(it.priorityText || '中') + '">' + escapeHtml(it.priorityText || '中') + '</span>' +
          '<span class="tag proj">' + escapeHtml(it.projectName || '默认项目') + '</span>' +
          '<span class="tag grp">' + escapeHtml(it.versionName || '默认组') + '</span>' +
          devTags +
        '</div>' +
        '<div class="task-dates">' + dateSpans.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
      '</div>' +
    '</div>';
  }

  // 任务清单 overlay：列出「已进入 / 未进入测试」范围内的任务（沿用当前筛选口径）
  function openModuleTaskList(scope) {
    var isEntered = scope === 'entered';
    var list = allTasks.map(normalizeTask).filter(function (it) {
      return periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode);
    });
    var ENTERED = ['测试中', '已测完', '已上线', '暂停中'];
    var sub = isEntered
      ? list.filter(function (i) { return ENTERED.indexOf(i.statusText) !== -1; })
      : list.filter(function (i) { return ENTERED.indexOf(i.statusText) === -1; });
    sub.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    setText('tl-title', isEntered ? '已进入测试' : '未进入测试');
    var meta = '共 ' + sub.length + ' 项';
    var ex = reportExcludeNames();
    if (ex) meta += ' · 不含 ' + ex;
    setText('tl-meta', meta);
    var listEl = document.getElementById('tl-list');
    if (listEl) {
      listEl.innerHTML = sub.length
        ? sub.map(buildTaskCardHtml).join('')
        : '<div class="empty"><div class="empty-icon">📭</div>该范围暂无任务</div>';
    }
    var ov = document.getElementById('tl-overlay');
    if (ov) ov.hidden = false;
  }

  // 导出 PDF：调用系统打印（移动端可在打印对话框「另存为 PDF」）
  function exportReportPDF() {
    renderReportValueRow();
    updateReportCaption();
    setTimeout(function () { window.print(); }, 60);
  }

  // ---- 预取主数据（字典 + 实体表），供统计与任务卡片解析名称 ----
  function loadReportData() {
    if (dataReady) return Promise.resolve();
    var account = (typeof getSessionAccount === 'function') ? (getSessionAccount() || 'system') : 'system';
    var tasks = [];
    tasks.push(Promise.resolve()
      .then(function () { return (root.RT_DICT && RT_DICT.seedDict) ? RT_DICT.seedDict(account) : null; })
      .catch(function () { return null; }));
    if (root.RT_DICT && RT_DICT.getDictByType && RT_DICT.SEED_TYPE) {
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TASK_TYPE).then(function (list) {
        TASK_TYPE_LIST = Array.isArray(list) ? list : [];
        TASK_TYPE_LIST.forEach(function (t) { if (t && t.code) { TYPE_CODE_TO_NAME[t.code] = t.name; if (t.color) TYPE_CODE_TO_COLOR[t.code] = t.color; } });
      }).catch(function () { TASK_TYPE_LIST = []; }));
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.PRIORITY).then(function (list) { priorityList = Array.isArray(list) ? list : []; }).catch(function () { priorityList = []; }));
      // 缺陷/任务事项/会议 状态字典（10c / 10d 复用）
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.BUG_STATUS).then(function (list) {
        BUG_STATUS_LIST = Array.isArray(list) ? list : [];
        BUG_STATUS_LIST.forEach(function (t) { if (t && t.code) { BUG_STATUS_CODE_TO_NAME[t.code] = t.name; if (t.color) BUG_STATUS_CODE_TO_COLOR[t.code] = t.color; } });
      }).catch(function () { BUG_STATUS_LIST = []; }));
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TODO_STATUS).then(function (list) { /* 10d 预留 */ }).catch(function () {}));
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.MEETING_STATUS).then(function (list) { /* 10d 预留 */ }).catch(function () {}));
    }
    if (root.RT_PROJECTS && RT_PROJECTS.getAllProjects) tasks.push(RT_PROJECTS.getAllProjects().then(function (l) { projectList = Array.isArray(l) ? l : []; }).catch(function () { projectList = []; }));
    if (root.RT_PROJECT_VERSIONS && RT_PROJECT_VERSIONS.getAllProjectVersions) tasks.push(RT_PROJECT_VERSIONS.getAllProjectVersions().then(function (l) { versionList = Array.isArray(l) ? l : []; }).catch(function () { versionList = []; }));
    if (root.RT_USERS && RT_USERS.getAllUsers) tasks.push(RT_USERS.getAllUsers().then(function (l) { userList = Array.isArray(l) ? l : []; }).catch(function () { userList = []; }));
    if (root.RT_REQUIREMENT_TASKS && RT_REQUIREMENT_TASKS.getAllRequirementTasks) tasks.push(RT_REQUIREMENT_TASKS.getAllRequirementTasks().then(function (l) { allTasks = Array.isArray(l) ? l : []; }).catch(function () { allTasks = []; }));
    if (root.RT_TODOS && RT_TODOS.getAllTodos) tasks.push(RT_TODOS.getAllTodos().then(function (l) { allTodos = Array.isArray(l) ? l : []; }).catch(function () { allTodos = []; }));
    return Promise.all(tasks).then(function () { dataReady = true; });
  }

  function renderTaskReport() {
    return loadReportData().then(function () {
      renderReportValueRow();
      renderReports();
      updateReportCaption();
    }).catch(function () {
      renderReportValueRow();
      renderReports();
    });
  }

  // ---- 绑定任务报表交互（维度分段 / 普通BUG 勾选 / 导出 / 任务清单 / 返回） ----
  function wireTaskControls() {
    var seg = document.getElementById('rf-seg');
    if (seg) {
      seg.querySelectorAll('.rf-tab').forEach(function (el) {
        el.addEventListener('click', function () {
          seg.querySelectorAll('.rf-tab').forEach(function (t) { t.classList.toggle('is-active', t === el); });
          reportFilter.dim = el.dataset.dim;
          renderReportValueRow();
          renderReports();
        });
      });
    }
    var expBtn = document.getElementById('btn-export-pdf');
    if (expBtn) expBtn.addEventListener('click', exportReportPDF);

    var chks = document.querySelectorAll('.rf-type-chk');
    Array.prototype.forEach.call(chks, function (chk) {
      chk.checked = !reportExcludeTypes.has(chk.dataset.typeCode);
      chk.addEventListener('change', function () {
        var t = chk.dataset.typeCode;
        if (chk.checked) reportExcludeTypes.delete(t); else reportExcludeTypes.add(t);
        renderReports();
      });
    });

    document.querySelectorAll('.rm-list-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openModuleTaskList(btn.dataset.scope); });
    });
    var tlBack = document.getElementById('tl-back');
    if (tlBack) tlBack.addEventListener('click', function () { var ov = document.getElementById('tl-overlay'); if (ov) ov.hidden = true; });
  }

  // ===================== 缺陷追踪报表（批次 10c，数据源 todos typeCode=BUG） =====================
  function bugStatusColor(code) { return BUG_STATUS_CODE_TO_COLOR[code] || '#8c8c8c'; }

  // 缺陷候选时间（年份收集与区间匹配）：录入/反馈/开始/完成/上线
  function bugCandidateDates(t) {
    return [t.createdAt, t.feedbackTime, t.startTime, t.completeTime, t.onlineTime].filter(function (x) { return x; });
  }
  function collectBugYears() {
    var set = {};
    set[new Date().getFullYear()] = 1;
    allTodos.forEach(function (t) {
      if (t.typeCode !== 'BUG') return;
      bugCandidateDates(t).forEach(function (ts) { set[new Date(ts).getFullYear()] = 1; });
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }
  function periodMatchBug(t, f) {
    if (f.year === 'all') return true;
    var ds = bugCandidateDates(t);
    for (var i = 0; i < ds.length; i++) { if (inPeriod(ds[i], f)) return true; }
    return false;
  }
  function bugsInScope() {
    return allTodos.filter(function (t) { return t.typeCode === 'BUG' && periodMatchBug(t, bugFilter); });
  }

  function renderBugValueRow() {
    var box = document.getElementById('bf-value');
    if (!box) return;
    var years = collectBugYears();
    var html = '<select class="rf-select" id="bf-year" aria-label="年份"><option value="all">全部年份</option>';
    years.forEach(function (y) { html += '<option value="' + y + '">' + y + ' 年</option>'; });
    html += '</select>';
    if (bugFilter.dim === 'quarter') {
      html += '<select class="rf-select" id="bf-quarter" aria-label="季度"><option value="all">全部季度</option>';
      for (var q = 1; q <= 4; q++) html += '<option value="' + q + '">第 ' + q + ' 季度</option>';
      html += '</select>';
    } else if (bugFilter.dim === 'month') {
      html += '<select class="rf-select" id="bf-month" aria-label="月份"><option value="all">全部月份</option>';
      for (var m = 1; m <= 12; m++) html += '<option value="' + m + '">' + m + ' 月</option>';
      html += '</select>';
    }
    box.innerHTML = html;
    var yEl = document.getElementById('bf-year');
    if (yEl) {
      if (bugFilter.year !== 'all' && years.indexOf(bugFilter.year) === -1) bugFilter.year = 'all';
      yEl.value = String(bugFilter.year);
      yEl.addEventListener('change', function () { bugFilter.year = yEl.value === 'all' ? 'all' : Number(yEl.value); renderBugReports(); });
    }
    var qEl = document.getElementById('bf-quarter');
    if (qEl) { qEl.value = String(bugFilter.quarter); qEl.addEventListener('change', function () { bugFilter.quarter = qEl.value === 'all' ? 'all' : Number(qEl.value); renderBugReports(); }); }
    var mEl = document.getElementById('bf-month');
    if (mEl) { mEl.value = String(bugFilter.month); mEl.addEventListener('change', function () { bugFilter.month = mEl.value === 'all' ? 'all' : Number(mEl.value); renderBugReports(); }); }
  }

  function bugCaptionText() {
    var base = '统计范围（录入/反馈/处理/完成/上线时间）';
    var s;
    if (bugFilter.year === 'all') s = base + '：全部时间';
    else {
      s = base + '：' + bugFilter.year + ' 年';
      if (bugFilter.dim === 'quarter') s += bugFilter.quarter === 'all' ? ' · 全部季度' : ' · 第 ' + bugFilter.quarter + ' 季度';
      else if (bugFilter.dim === 'month') s += bugFilter.month === 'all' ? ' · 全部月份' : ' · ' + bugFilter.month + ' 月';
    }
    return s;
  }
  function updateBugCaption() { var el = document.getElementById('bf-caption'); if (el) el.textContent = bugCaptionText(); }
  function setBugText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  function renderBugReports() {
    var list = bugsInScope();
    var total = list.length;
    function cnt(code) { return list.filter(function (i) { return i.statusCode === code; }).length; }
    setBugText('b-total', total);
    setBugText('b-todo', cnt('BUG_TODO'));        // 未处理
    setBugText('b-doing', cnt('BUG_DOING'));      // 处理中
    setBugText('b-done', cnt('BUG_DONE'));        // 已完成
    setBugText('b-waitdev', cnt('BUG_WAIT_DEV')); // 待开发
    setBugText('b-online', cnt('BUG_ONLINE'));    // 已上线

    // 按 5 个状态分块（顺序取字典 BUG_STATUS）
    var rows = BUG_STATUS_LIST.map(function (st) {
      return { key: st.code, label: st.name, n: cnt(st.code), h: 0 };
    });
    var colorMap = {};
    BUG_STATUS_LIST.forEach(function (st) { if (st && st.code) colorMap[st.code] = bugStatusColor(st.code); });
    renderBars('b-status-bars', rows, colorMap);

    // 关联任务统计
    var linked = list.filter(function (i) { return i.relatedTaskId; }).length;
    var relEl = document.getElementById('b-related');
    if (relEl) relEl.textContent = '已关联需求任务 ' + linked + ' 条 · 未关联 ' + (total - linked) + ' 条';

    updateBugCaption();
  }

  function exportBugPDF() {
    renderBugValueRow();
    updateBugCaption();
    setTimeout(function () { window.print(); }, 60);
  }

  function renderBugReport() {
    return loadReportData().then(function () {
      renderBugValueRow();
      renderBugReports();
      updateBugCaption();
    }).catch(function () {
      renderBugValueRow();
      renderBugReports();
    });
  }

  function wireBugControls() {
    var seg = document.getElementById('bf-seg');
    if (seg) {
      seg.querySelectorAll('.rf-tab').forEach(function (el) {
        el.addEventListener('click', function () {
          seg.querySelectorAll('.rf-tab').forEach(function (t) { t.classList.toggle('is-active', t === el); });
          bugFilter.dim = el.dataset.dim;
          renderBugValueRow();
          renderBugReports();
        });
      });
    }
    var expBtn = document.getElementById('btn-export-bug-pdf');
    if (expBtn) expBtn.addEventListener('click', exportBugPDF);
  }

  // ===================== 初始化 =====================
  function init() {
    renderModuleList();
    wireTaskControls();
    wireBugControls();
    switchSection('task'); // 默认展示任务统计
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 挂全局，供 10c/10d 扩展：新增报表渲染函数后在此登记即可被切换逻辑调用
  root.RT_REPORT = {
    MODULES: MODULES,
    switchSection: switchSection,
    renderTaskReport: renderTaskReport,
    renderBugReport: renderBugReport   // 10c 缺陷追踪报表
  };
})(window);
