// report-todo.js —— 任务事项统计报表（批次 41，独立页 report-todo.html 使用）
// 数据/工具走 RT_REPORT_COMMON（report-common.js）。
// 补充 A：每模块含「任务清单」按钮（todos 卡片，无操作按钮）
// 补充 B：时间口径按 createdAt（录入/创建时间）
(function (root) {
  'use strict';
  var C = root.RT_REPORT_COMMON;
  var escapeHtml = C.escapeHtml, fmtDate = C.fmtDate,
      inPeriod = C.inPeriod, renderBars = C.renderBars,
      buildTimeValueRow = C.buildTimeValueRow, wireTimeSeg = C.wireTimeSeg,
      renderProjectBars = C.renderProjectBars, buildTodoCardHtml = C.buildTodoCardHtml;

  // ============ 模块级状态 ============
  var filter = { dim: 'year', year: 'all', quarter: 'all', month: 'all' };
  var TYPE_CODE = 'TASK_ITEM';

  // ============ 年份收集（补充 B：仅 createdAt） ============
  function collectYears() {
    var set = {};
    set[new Date().getFullYear()] = 1;
    C.getData().allTodos.forEach(function (t) {
      if (t.typeCode !== TYPE_CODE) return;
      if (t.createdAt) set[new Date(t.createdAt).getFullYear()] = 1;
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }

  // ============ 范围过滤（补充 B：仅 createdAt） ============
  function inScope(t) {
    if (t.typeCode !== TYPE_CODE) return false;
    if (filter.year === 'all') return true;
    return t.createdAt ? inPeriod(t.createdAt, filter) : false;
  }

  // ============ 报表渲染 ============
  function renderReport() {
    var list = C.getData().allTodos.filter(inScope);
    var total = list.length;
    var cntTodo = list.filter(function (t) { return t.statusCode === 'TD_TODO'; }).length;
    var cntDoing = list.filter(function (t) { return t.statusCode === 'TD_DOING'; }).length;
    var cntDone = list.filter(function (t) { return t.statusCode === 'TD_DONE'; }).length;

    setText('tdo-total', total);
    setText('tdo-todo', cntTodo);
    setText('tdo-doing', cntDoing);
    setText('tdo-done', cntDone);

    // 统计卡数字着色（取自字典 color）
    var STATUS_COLOR = {};
    C.getData().TODO_STATUS_LIST.forEach(function (d) { if (d && d.code) STATUS_COLOR[d.code] = d.color || '#8c8c8c'; });
    C.setNumColor('tdo-todo', STATUS_COLOR['TD_TODO'] || '#8c8c8c');
    C.setNumColor('tdo-doing', STATUS_COLOR['TD_DOING'] || '#1677ff');
    C.setNumColor('tdo-done', STATUS_COLOR['TD_DONE'] || '#52c41a');

    // 按状态分模块：未处理 / 处理中 / 已完成，各按项目分布
    var todoItems = list.filter(function (t) { return t.statusCode === 'TD_TODO'; });
    var doingItems = list.filter(function (t) { return t.statusCode === 'TD_DOING'; });
    var doneItems = list.filter(function (t) { return t.statusCode === 'TD_DONE'; });

    var projLabel = function (pid) { return C.projectNameById(pid); };
    var donePred = function (t) { return t.statusCode === 'TD_DONE'; };

    renderProjectBars('tdo-bars-todo', todoItems, donePred, projLabel);
    renderProjectBars('tdo-bars-doing', doingItems, donePred, projLabel);
    renderProjectBars('tdo-bars-done', doneItems, donePred, projLabel);

    updateCaption();
  }

  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  // ============ 说明文案 ============
  function captionText() {
    var base = '统计范围（录入/创建时间）';
    if (filter.year === 'all') return base + '：全部时间';
    var s = base + '：' + filter.year + ' 年';
    if (filter.dim === 'quarter') s += filter.quarter === 'all' ? ' · 全部季度' : ' · 第 ' + filter.quarter + ' 季度';
    else if (filter.dim === 'month') s += filter.month === 'all' ? ' · 全部月份' : ' · ' + filter.month + ' 月';
    return s;
  }
  function updateCaption() { var el = document.getElementById('rf-caption'); if (el) el.textContent = captionText(); }

  // ============ 时间维度控件 ============
  function renderTimeControls() {
    var box = document.getElementById('rf-value');
    if (!box) return;
    buildTimeValueRow(box, filter, collectYears(), function () { renderReport(); });
    // 同步选中值
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
    var sub;
    if (scope === 'todo') sub = list.filter(function (t) { return t.statusCode === 'TD_TODO'; });
    else if (scope === 'doing') sub = list.filter(function (t) { return t.statusCode === 'TD_DOING'; });
    else sub = list.filter(function (t) { return t.statusCode === 'TD_DONE'; });
    sub.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    var labelMap = { todo: '未处理', doing: '处理中', done: '已完成' };
    setText('tl-title', labelMap[scope] || scope);
    setText('tl-meta', '共 ' + sub.length + ' 项');
    var listEl = document.getElementById('tl-list');
    if (listEl) {
      listEl.innerHTML = sub.length
        ? sub.map(buildTodoCardHtml).join('')
        : '<div class="empty"><div class="empty-icon">📭</div>该范围暂无任务事项</div>';
    }
    var ov = document.getElementById('tl-overlay');
    if (ov) ov.hidden = false;
  }

  // ============ 导出 PDF ============
  function exportPDF() {
    renderTimeControls();
    updateCaption();
    setTimeout(function () { window.print(); }, 60);
  }

  // ============ 控件绑定 ============
  function wireControls() {
    wireTimeSeg('rf-seg', filter, function () {
      filter.dim = this;
      renderTimeControls();
      renderReport();
    });
    // wireTimeSeg 使用的是事件委托，需要手动绑定
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

  // ============ 初始化 ============
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
