// report.js —— 统计报表独立页逻辑
//
// 批次 10a（本文件）：页面框架 + 模块入口 + 同页内联视图切换骨架。
//   - 渲染 4 个 .module-row（任务统计 / 任务事项统计 / 缺陷追踪统计 / 会议统计）
//   - 点击在 #reportContent 内联切换对应 .report-section（默认「任务统计」）
//   - 各报表区 10a 仅渲染占位骨架，真实统计卡 / 模块分布 / 时间筛选 / 导出 PDF
//     由 10b（任务统计）、10c（缺陷追踪统计）、10d（任务事项 + 会议统计）逐步填充。
//
// 数据层（config.js / db.js / ...）已由 report.html 在末尾按序加载，本文件可直接
// 使用 RT_DB / RT_DICT / RT_PROJECTS / RT_TODOS 等全局 API，无需自行注入 config.js。

(function (root) {
  'use strict';

  // 四类报表入口，data-key 与 report.html 中 .report-section 的 data-key 一一对应
  var MODULES = [
    {
      key: 'task',
      name: '任务统计',
      desc: '按时间维度汇总任务总量、测试工时与测试/上线进度',
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>',
      batch: '10b'
    },
    {
      key: 'todo',
      name: '任务事项统计',
      desc: '统计任务事项的总量、未处理 / 处理中 / 已完成分布',
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
      batch: '10d'
    },
    {
      key: 'bug',
      name: '缺陷追踪统计',
      desc: '统计缺陷总量、未处理 / 处理中 / 已完成 / 待开发 / 已上线分布',
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="12" rx="4"/><path d="M12 2v4M5 9l3 2M19 9l-3 2M4 16l4-1M20 16l-4-1"/></svg>',
      batch: '10c'
    },
    {
      key: 'meeting',
      name: '会议统计',
      desc: '统计会议总量、未开始 / 已结束 / 已取消分布',
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      batch: '10d'
    }
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
      if (!row) return;
      switchSection(row.getAttribute('data-key'));
    });
  }

  function switchSection(key) {
    var sections = document.querySelectorAll('#reportContent .report-section');
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      if (sec.getAttribute('data-key') === key) {
        sec.classList.add('active');
        if (!sec.getAttribute('data-rendered')) {
          renderPlaceholder(sec, key);
          sec.setAttribute('data-rendered', '1');
        }
      } else {
        sec.classList.remove('active');
      }
    }
  }

  function renderPlaceholder(sec, key) {
    var mod = null;
    for (var i = 0; i < MODULES.length; i++) {
      if (MODULES[i].key === key) { mod = MODULES[i]; break; }
    }
    if (!mod) return;
    sec.innerHTML =
      '<div class="report-placeholder">' +
        '<div class="ph-title">' + escapeHtml(mod.name) + '</div>' +
        '<div class="ph-sub">本模块报表将在批次 ' + escapeHtml(mod.batch) +
        ' 实现（统计卡 + 模块分布 + 时间维度筛选 + 导出 PDF）。</div>' +
      '</div>';
  }

  function init() {
    renderModuleList();
    switchSection('task'); // 默认展示首个模块占位
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 挂全局，供 10b-d 扩展：新增报表渲染函数后在此登记即可被切换逻辑调用
  root.RT_REPORT = {
    MODULES: MODULES,
    switchSection: switchSection
  };
})(window);
