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
      renderProjectBars = C.renderProjectBars, buildTodoCardHtml = C.buildTodoCardHtml;

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

    // 按状态分模块：3 个状态，各按项目分布
    var notstartItems = list.filter(function (t) { return t.statusCode === 'MT_NOT_STARTED'; });
    var endedItems = list.filter(function (t) { return t.statusCode === 'MT_ENDED'; });
    var cancelledItems = list.filter(function (t) { return t.statusCode === 'MT_CANCELLED'; });

    var projLabel = function (pid) { return C.projectNameById(pid); };
    var donePred = function () { return false; };

    function renderMtBars(elId, items) {
      renderProjectBars(elId, items, donePred, projLabel);
    }

    renderMtBars('mt-bars-notstart', notstartItems);
    renderMtBars('mt-bars-ended', endedItems);
    renderMtBars('mt-bars-cancelled', cancelledItems);

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
  function openList(scope) {
    var list = C.getData().allTodos.filter(inScope);
    var codeMap = { notstart: 'MT_NOT_STARTED', ended: 'MT_ENDED', cancelled: 'MT_CANCELLED' };
    var code = codeMap[scope];
    var sub = code ? list.filter(function (t) { return t.statusCode === code; }) : list;
    sub.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    var labelMap = { notstart: '未开始', ended: '已结束', cancelled: '已取消' };
    setText('tl-title', labelMap[scope] || scope);
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
      '<th>名称</th><th>类型</th><th>状态</th><th>项目</th><th>版本</th><th>会议时间</th><th>地点</th><th>开始</th><th>结束</th><th>取消原因</th>';
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
        + '<td>' + (t.startTime ? fd(t.startTime) : '—') + '</td>'
        + '<td>' + (t.completeTime ? fd(t.completeTime) : '—') + '</td>'
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

    document.querySelectorAll('.rm-list-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openList(btn.dataset.scope); });
    });
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
