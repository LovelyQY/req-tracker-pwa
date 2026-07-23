// report-task.js —— 任务统计报表（批次 40：从旧 report.js 迁来，独立页 report-task.html 使用）
// 数据/工具走 RT_REPORT_COMMON（report-common.js）。
(function (root) {
  'use strict';
  var C = root.RT_REPORT_COMMON;
  var escapeHtml = C.escapeHtml, fmtDate = C.fmtDate, normalizeTask = C.normalizeTask,
      inPeriod = C.inPeriod, periodMatch = C.periodMatch, estimateWorkHours = C.estimateWorkHours,
      taskWorkHours = C.taskWorkHours, renderBars = C.renderBars;

  var STATUS_NAME = { TODO: '待开发', SUBMITTED: '已提测', TESTING: '测试中', TESTED: '已测完', ONLINE: '已上线', PAUSED: '暂停中' };
  var reportFilter = { dim: 'year', year: 'all', quarter: 'all', month: 'all' };
  // 取消勾选则不统计的任务类型集合（默认普通 BUG 不选中 = 不统计）
  var reportExcludeTypes = (typeof Set === 'function') ? new Set(['COMMON_BUG']) : { has: function () { return false; }, add: function () {}, delete: function () {} };

  function statusName(code) { return STATUS_NAME[code] || (code || ''); }
  function typeName(code) { return C.typeName(code); }
  function typeColor(code) { return C.typeColor(code); }
  function priorityName(code) { return C.priorityName(code); }
  function projectNameById(id) { return C.projectNameById(id); }
  function versionNameById(id) { return C.versionNameById(id); }
  function userNicknamesByIds(ids) { return C.userNicknamesByIds(ids); }
  function setNumColor(id, c) { C.setNumColor(id, c); }

  function collectReportYears() {
    var set = {};
    set[new Date().getFullYear()] = 1;
    C.getData().allTasks.forEach(function (t) {
      if (t.createdAt) set[new Date(t.createdAt).getFullYear()] = 1;
      if (t.testStartTime) set[new Date(t.testStartTime).getFullYear()] = 1;
      if (t.testEndTime) set[new Date(t.testEndTime).getFullYear()] = 1;
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }

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

  function reportExcludeNames() {
    if (typeof reportExcludeTypes.has !== 'function') return '';
    var names = [];
    C.getData().TASK_TYPE_LIST.forEach(function (t) { if (reportExcludeTypes.has(t.code)) names.push(t.name); });
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
  function updateReportCaption() { var el = document.getElementById('rf-caption'); if (el) el.textContent = reportCaptionText(); }

  function sumHours(lst) { var s = 0; for (var i = 0; i < lst.length; i++) s += taskWorkHours(lst[i]); return s; }
  function round1(h) { return Math.round(h * 10) / 10; }

  function renderReports() {
    var list = C.getData().allTasks.map(normalizeTask).filter(function (it) {
      return periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode);
    });
    var total = list.length;
    var testing = list.filter(function (i) { return i.statusText === '测试中' || i.statusText === '暂停中'; }).length;
    var tested = list.filter(function (i) { return i.statusText === '已测完'; }).length;
    var online = list.filter(function (i) { return i.statusText === '已上线'; }).length;
    var notStart = list.filter(function (i) { var d = i.dates || {}; return !d.started; }).length;

    var hours = sumHours(list);
    var rounded = round1(hours);
    var hoursText = rounded <= 0 ? '0.1H' : rounded.toFixed(1) + 'H';

    setText('r-total', total);
    setText('r-hours', hoursText);
    setText('r-testing', testing);
    setText('r-tested', tested);
    setText('r-online', online);
    setText('r-notstart', notStart);

    var ENTERED = ['测试中', '已测完', '已上线', '暂停中'];
    var entered = list.filter(function (i) { return ENTERED.indexOf(i.statusText) !== -1; });
    var notEntered = list.filter(function (i) { return ENTERED.indexOf(i.statusText) === -1; });

    var enteredHours = sumHours(entered);
    var enteredHoursRounded = round1(enteredHours);
    var ehEl = document.getElementById('rm-entered-hours');
    if (ehEl) ehEl.textContent = '· 合计 ' + (enteredHoursRounded <= 0 ? '0.1H' : enteredHoursRounded.toFixed(1) + 'H');

    var TYPE_COLOR = {};
    C.getData().TASK_TYPE_LIST.forEach(function (t) { if (t && t.code) TYPE_COLOR[t.code] = typeColor(t.code); });
    var ENTERED_COLOR = { '测试中': '#1677ff', '已测完': '#52c41a', '已上线': '#722ed1', '暂停中': '#8c8c8c' };
    var NOT_COLOR = { '已提测': '#faad14', '未开始': '#fa8c16' };

    function typeRows(lst) {
      return C.getData().TASK_TYPE_LIST.filter(function (t) { return !reportExcludeTypes.has(t.code); }).map(function (t) {
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

  function openModuleTaskList(scope) {
    var isEntered = scope === 'entered';
    var list = C.getData().allTasks.map(normalizeTask).filter(function (it) {
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

  function exportReportPDF() {
    buildDetailTable();
    renderReportValueRow();
    updateReportCaption();
    setTimeout(function () { window.print(); }, 60);
  }

  // ============ 批次47：导出PDF表格（字段尽量全，不显示主ID）============
  function getFilteredTasks() {
    return C.getData().allTasks.map(normalizeTask).filter(function (it) {
      return periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode);
    });
  }
  function buildDetailTable() {
    var tbl = document.getElementById('rf-detail-table');
    if (!tbl) return;
    var list = getFilteredTasks();
    if (list.length === 0) { tbl.style.display = 'none'; return; }
    // 表头
    tbl.querySelector('thead tr').innerHTML =
      '<th>任务名称</th><th>类型</th><th>优先级</th><th>状态</th><th>项目</th><th>版本</th><th>测试开始</th><th>测试结束</th><th>工时</th><th>描述</th>';
    // 表体
    var rows = '';
    var typeName = C.typeName, statusName = C.statusName, pn = C.projectNameById, vn = C.versionNameById;
    list.forEach(function (it) {
      var d = it.dates || {};
      rows += '<tr>'
        + '<td>' + escapeHtml(it.name || '') + '</td>'
        + '<td>' + escapeHtml(typeName(it.typeCode) || '') + '</td>'
        + '<td>' + escapeHtml(it.priorityName || '') + '</td>'
        + '<td>' + escapeHtml(it.statusText || '') + '</td>'
        + '<td>' + escapeHtml(pn(it.projectId) || '') + '</td>'
        + '<td>' + escapeHtml(it.projectVersionId ? vn(it.projectVersionId) : '') + '</td>'
        + '<td>' + (d.started ? fmtDate(d.started) : '—') + '</td>'
        + '<td>' + (d.ended ? fmtDate(d.ended) : '—') + '</td>'
        + '<td>' + escapeHtml(it.hours || '') + '</td>'
        + '<td>' + escapeHtml(it.desc || '') + '</td>'
        + '</tr>';
    });
    tbl.querySelector('tbody').innerHTML = rows;
  }

  function renderTaskReport() {
    return C.loadReportData().then(function () {
      renderReportValueRow();
      renderReports();
      updateReportCaption();
    }).catch(function () {
      renderReportValueRow();
      renderReports();
    });
  }

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

  function init() {
    renderTaskReport().then(wireTaskControls).catch(function () { renderTaskReport(); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
