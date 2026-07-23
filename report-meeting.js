// report-meeting.js —— 会议统计报表（批次 43，独立页 report-meeting.html 使用）
// 数据/工具走 RT_REPORT_COMMON（report-common.js）。
// 补充 A：每模块含「任务清单」按钮（todos 卡片，无操作按钮）
// 补充 B：时间口径按 meetingTime（会议时间）
(function (root) {
  'use strict';
  var C = root.RT_REPORT_COMMON;
  var escapeHtml = C.escapeHtml, fmtDate = C.fmtDate,
      inPeriod = C.inPeriod, renderBars = C.renderBars,
      buildTimeValueRow = C.buildTimeValueRow, wireTimeSeg = C.wireTimeSeg,
      buildTodoCardHtml = C.buildTodoCardHtml;

  var filter = { dim: 'year', year: 'all', quarter: 'all', month: 'all' };
  var TYPE_CODE = 'MEETING';

  function meetingStatusName(code) {
    var d = C.getData();
    return (d.MEETING_STATUS_CODE_TO_NAME && d.MEETING_STATUS_CODE_TO_NAME[code]) || code || '';
  }
  function meetingStatusColor(code) {
    var d = C.getData();
    return (d.MEETING_STATUS_CODE_TO_COLOR && d.MEETING_STATUS_CODE_TO_COLOR[code]) || '#8c8c8c';
  }

  // ============ 年份收集（补充 B：仅 meetingTime） ============
  function collectYears() {
    var set = {};
    set[new Date().getFullYear()] = 1;
    C.getData().allTodos.forEach(function (t) {
      if (t.typeCode !== TYPE_CODE) return;
      if (t.meetingTime) set[new Date(t.meetingTime).getFullYear()] = 1;
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }

  // ============ 范围过滤（补充 B：仅 meetingTime） ============
  function inScope(t) {
    if (t.typeCode !== TYPE_CODE) return false;
    if (filter.year === 'all') return true;
    return t.meetingTime ? inPeriod(t.meetingTime, filter) : false;
  }

  // ============ 报表渲染 ============
  function renderReport() {
    var list = C.getData().allTodos.filter(inScope);
    var total = list.length;

    function cnt(code) { return list.filter(function (t) { return t.statusCode === code; }).length; }
    var nNotstart = cnt('MT_NOT_STARTED'), nEnded = cnt('MT_ENDED'), nCancelled = cnt('MT_CANCELLED');

    setText('m-total', total);
    setText('m-notstart', nNotstart);
    setText('m-ended', nEnded);
    setText('m-cancelled', nCancelled);

    // 统计卡数字着色
    C.setNumColor('m-notstart', meetingStatusColor('MT_NOT_STARTED'));
    C.setNumColor('m-ended', meetingStatusColor('MT_ENDED'));
    C.setNumColor('m-cancelled', meetingStatusColor('MT_CANCELLED'));

    // 批次48：按项目分组，每个项目一张卡片，卡片内展示状态分布
    var byProject = {};
    list.forEach(function (t) {
      var pid = t.projectId || '__noproj__';
      (byProject[pid] = byProject[pid] || []).push(t);
    });
    var projIds = Object.keys(byProject).sort(function (a, b) {
      return (byProject[b] && byProject[b].length || 0) - (byProject[a] && byProject[a].length || 0);
    });
    var pnFn = C.projectNameById;
    var STATUSES = [
      { code: 'MT_NOT_STARTED', name: '未开始', key: 'MT_NOT_STARTED' },
      { code: 'MT_ENDED', name: '已结束', key: 'MT_ENDED' },
      { code: 'MT_CANCELLED', name: '已取消', key: 'MT_CANCELLED' }
    ];
    var html = '';
    projIds.forEach(function (pid) {
      var items = byProject[pid];
      var pTotal = items.length;
      var pName = pid === '__noproj__' ? '(未指定项目)' : escapeHtml(pnFn(pid) || pid);
      var cells = '';
      STATUSES.forEach(function (s) {
        var cnt = items.filter(function (t) { return t.statusCode === s.code; }).length;
        var pct = pTotal > 0 ? Math.round(cnt / pTotal * 100) : 0;
        var c = meetingStatusColor(s.key);
        cells += '<div class="rm-status-cell">'
          + '<div class="rm-status-num" style="color:' + c + '">' + cnt + '</div>'
          + '<div class="rm-status-label">' + s.name + '</div>'
          + '<div class="rm-status-bar"><div class="rm-status-bar-inner" style="width:' + pct + '%;background:' + c + '"></div><span class="rm-status-pct">' + pct + '%</span></div>'
          + '</div>';
      });
      html += '<div class="report-module rm-project-card">'
        + '<div class="rm-project-header">'
        + '<div class="rm-project-name">' + pName + '</div>'
        + '</div>'
        + '<div class="rm-status-row">' + cells + '</div>'
      + '<div class="rm-status-note">进度条百分比 = 该状态数量 ÷ 本项目内条目总数</div>'
        + '<button class="rm-list-btn" data-project="' + escapeHtml(pid) + '" type="button">'
        + '<span>会议清单 (' + pTotal + ')</span>'
        + '<svg class="rm-list-arrow" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>'
        + '</button>'
        + '</div>';
    });
    var container = document.getElementById('rm-project-modules');
    if (container) container.innerHTML = html || '<div class="empty" style="padding:24px"><div class="empty-icon">📭</div>该范围暂无数据</div>';

    updateCaption();
  }

  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  function captionText() {
    var base = '统计范围（会议时间）';
    if (filter.year === 'all') return base + '：全部时间';
    var s = base + '：' + filter.year + ' 年';
    if (filter.dim === 'quarter') s += filter.quarter === 'all' ? ' · 全部季度' : ' · 第 ' + filter.quarter + ' 季度';
    else if (filter.dim === 'month') s += filter.month === 'all' ? ' · 全部月份' : ' · ' + filter.month + ' 月';
    return s;
  }
  function updateCaption() { var el = document.getElementById('rf-caption'); if (el) el.textContent = captionText(); }

  function renderTimeControls() {
    var box = document.getElementById('rf-value');
    if (!box) return;
    buildTimeValueRow(box, filter, collectYears(), function () { renderReport(); });
    var yEl = document.getElementById(box.id + '-year');
    if (yEl) { yEl.value = String(filter.year); }
    var qEl = document.getElementById(box.id + '-quarter');
    if (qEl) { qEl.value = String(filter.quarter); }
    var mEl = document.getElementById(box.id + '-month');
    if (mEl) { mEl.value = String(filter.month); }
  }

  // ============ 任务清单 overlay（补充 A） ============
  function openList(projectId) {
    var list = C.getData().allTodos.filter(inScope);
    var sub = list.filter(function (t) { return (t.projectId || '__noproj__') === projectId; });
    sub.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    var pName = projectId === '__noproj__' ? '(未指定项目)' : (C.projectNameById(projectId) || projectId);
    setText('tl-title', pName);
    setText('tl-meta', '共 ' + sub.length + ' 项');
    var listEl = document.getElementById('tl-list');
    if (listEl) {
      listEl.innerHTML = sub.length
        ? sub.map(buildTodoCardHtml).join('')
        : '<div class="empty"><div class="empty-icon">📭</div>该范围暂无会议</div>';
    }
    var ov = document.getElementById('tl-overlay');
    if (ov) ov.hidden = false;
  }

  function exportPDF() {
    buildDetailTable();
    renderTimeControls();
    updateCaption();
    setTimeout(function () { window.print(); }, 60);
  }

  // ============ 批次47：导出PDF表格（字段尽量全，不显示主ID）============
  function buildDetailTable() {
    var tbl = document.getElementById('rf-detail-table');
    if (!tbl) return;
    var list = C.getData().allTodos.filter(inScope);
    if (list.length === 0) { tbl.style.display = 'none'; return; }
    var sn = C.statusName, tn = C.typeName, pn = C.projectNameById, vn = C.versionNameById;
    var fd = C.fmtDateTime;
    tbl.querySelector('thead tr').innerHTML =
      '<th>名称</th><th>类型</th><th>状态</th><th>项目</th><th>版本</th><th>会议时间</th><th>会议地点</th><th>会议纪要</th><th>备注</th><th>开始时间</th><th>结束时间</th><th>取消时间</th><th>取消原因</th>';
    var rows = '';
    list.sort(function (a, b) { return (b.meetingTime || b.createdAt || 0) - (a.meetingTime || a.createdAt || 0); });
    list.forEach(function (t) {
      rows += '<tr>'
        + '<td>' + escapeHtml(t.name || t.desc || '') + '</td>'
        + '<td>' + escapeHtml(tn(t.typeCode)) + '</td>'
        + '<td>' + escapeHtml(sn(t.statusCode)) + '</td>'
        + '<td>' + escapeHtml(pn(t.projectId) || '') + '</td>'
        + '<td>' + escapeHtml(t.projectVersionId ? vn(t.projectVersionId) : '') + '</td>'
        + '<td>' + (t.meetingTime ? fd(t.meetingTime) : '—') + '</td>'
        + '<td>' + escapeHtml(t.location || '') + '</td>'
        + '<td>' + escapeHtml(t.minutes || '') + '</td>'
        + '<td>' + escapeHtml(t.remark || '') + '</td>'
        + '<td>' + (t.startTime ? fd(t.startTime) : '—') + '</td>'
        + '<td>' + (t.completeTime ? fd(t.completeTime) : '—') + '</td>'
        + '<td>' + (t.cancelTime ? fd(t.cancelTime) : '—') + '</td>'
        + '<td>' + escapeHtml(t.cancelReason || '') + '</td>'
        + '</tr>';
    });
    tbl.querySelector('tbody').innerHTML = rows;
  }

  function wireControls() {
    var seg = document.getElementById('rf-seg');
    if (seg) {
      seg.querySelectorAll('.rf-tab').forEach(function (el) {
        el.addEventListener('click', function () {
          seg.querySelectorAll('.rf-tab').forEach(function (t) { t.classList.toggle('is-active', t === el); });
          filter.dim = el.dataset.dim;
          renderTimeControls();
          renderReport();
        });
      });
    }
    var expBtn = document.getElementById('btn-export-pdf');
    if (expBtn) expBtn.addEventListener('click', exportPDF);

    // 批次48：事件委托（按钮由 JS 动态生成）
    var mods = document.getElementById('rm-project-modules');
    if (mods) {
      mods.addEventListener('click', function (e) {
        var btn = e.target.closest('.rm-list-btn');
        if (btn && btn.dataset.project) { openList(btn.dataset.project); }
      });
    }
    var tlBack = document.getElementById('tl-back');
    if (tlBack) tlBack.addEventListener('click', function () { var ov = document.getElementById('tl-overlay'); if (ov) ov.hidden = true; });
  }

  function render() {
    return C.loadReportData().then(function () {
      renderTimeControls();
      renderReport();
      updateCaption();
    }).catch(function () {
      renderTimeControls();
      renderReport();
    });
  }

  function init() {
    render().then(wireControls).catch(function () { render(); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
