// icon-manager.js -- 图标管理页逻辑（批次 148）
// 依赖：config.js / db.js / page-icons.js（RT_PAGE_ICONS）/ ui-utils.js（$）
// 职责：列表渲染、选中编辑、实时预览、保存（写 IDB）、恢复默认、导出全部 JSON。
(function () {
  'use strict';

  var selectedKey = null;

  // key → 中文标签映射（与 basic-data.html MODULES.name / 报表模块标题一致）
  // 批次191 #11：补齐所有注册表 key 的中文标签，避免图标管理列表显示英文 key
  var KEY_LABELS = {
    'company': '公司管理',
    'department': '部门管理',
    'position': '职位管理',
    'user': '人员管理',
    'project': '项目管理',
    'project-version': '项目版本管理',
    'role': '角色管理',
    'permission': '权限管理',
    'dictionary': '字典管理',
    'icon-manager': '图标管理',
    'backup': '数据备份',        // 批次155：存储与备份双入口
    'storage': '存储与数据',      // 批次155：存储与备份双入口
    'report-task': '任务报表',
    'report-todo': '待办报表',
    'report-bug': '缺陷报表',
    'report-meeting': '会议报表',
    // 批次163：补 3 个入口/品牌图标标签
    'index': '主页',
    'login': '登录页',
    'pwa': '桌面应用',
    // 批次174：设置中心 hub 图标标签（#11 补全）
    'settings': '设置',
    'account': '账号',
    'security': '账号安全',
    'device': '登录设备',
    'general': '通用',
    'notification': '通知',
    'theme': '界面与展示',
    'download': '下载地址',
    'cloud-sync': '云同步',
    'help': '帮助与反馈',
    // 批次191 #25：前赡功能图标标签（workflow/process/weather/ticket）
    'workflow': '工作流',
    'process': '流程',
    'weather': '天气',
    'ticket': '工单'
  };

  function labelForKey(key) { return KEY_LABELS[key] || key; }

  // 批次167：SVG 源码 XML 格式化（按标签边界换行 + 层级缩进），仅用于展示层，不改变存储内容
  function spaces(n) { return n > 0 ? new Array(n + 1).join(' ') : ''; }
  function formatSvg(src) {
    if (typeof src !== 'string') return '';
    var s = src.replace(/>\s+</g, '><').trim();
    var parts = s.split('>');
    var out = [], indent = 0;
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i].trim();
      if (!seg) continue;
      var full = seg + (i < parts.length - 1 ? '>' : '');
      if (seg.charAt(0) === '<' && seg.charAt(1) === '/') {           // 闭合标签：先退一层
        indent = Math.max(0, indent - 2);
        out.push(spaces(indent) + full);
      } else if (seg.charAt(0) === '<') {                            // 开始标签：本级输出后若非自闭合则进一层
        out.push(spaces(indent) + full);
        if (!/\/$/.test(seg)) indent += 2;
      } else {                                                       // 文本节点
        out.push(spaces(indent) + full);
      }
    }
    return out.join('\n');
  }

  function renderList() {
    if (typeof RT_PAGE_ICONS === 'undefined') { showErr('图标模块未加载'); return; }
    var items = RT_PAGE_ICONS.list();
    var box = $('list');
    if (!box) return;
    $('listCount').textContent = items.length + ' 项';
    if (!items.length) {
      box.innerHTML = '<div class="empty">暂无图标</div>';
      applyGuard();
      return;
    }
    box.innerHTML = items.map(function (it) {
      var badge = it.source === 'override'
        ? '<span class="badge override">已覆盖</span>'
        : '<span class="badge default">默认</span>';
      var resetBtn = it.source === 'override'
        ? '<button class="reset" data-key="' + escapeHtml(it.key) + '">恢复</button>'
        : '';
      return '<div class="icon-item' + (it.key === selectedKey ? ' active' : '') + '" data-key="' + escapeHtml(it.key) + '">'
        + '<div class="pv">' + it.svg + '</div>'
        + '<div class="ik">' + escapeHtml(labelForKey(it.key)) + '</div>'
        + badge
        + resetBtn
        + '</div>';
    }).join('');
    applyGuard();
  }

  function selectKey(key) {
    selectedKey = key;
    var it = findItem(key);
    var selEl = $('selKey');
    var codeEl = $('svgCodeText');
    var prev = $('preview');
    if (!it) {
      selEl.innerHTML = '未选择';
      if (codeEl) codeEl.textContent = '';
      prev.innerHTML = '';
      renderList();
      return;
    }
    selEl.innerHTML = escapeHtml(labelForKey(it.key))
      + '<span class="src ' + (it.source === 'override' ? 'badge override' : 'badge default') + '">'
      + (it.source === 'override' ? '已覆盖' : '默认') + '</span>';
    if (codeEl) codeEl.textContent = formatSvg(it.svg); // 批次164：只读展示 SVG 源码；批次167：格式化换行
    prev.innerHTML = it.svg; // 预览即所见
    renderList();
  }

  function findItem(key) {
    if (typeof RT_PAGE_ICONS === 'undefined') return null;
    var all = RT_PAGE_ICONS.list();
    for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
    return null;
  }

  function reset(key) {
    if (!key) { toast('请先选择一个图标再恢复默认', 'warn'); return; }
    customConfirm('确定将「' + labelForKey(key) + '」恢复为内置默认图标？', { title: '恢复默认', confirmText: '确定恢复', danger: true })
      .then(function (ok) {
        if (!ok) return;
        RT_PAGE_ICONS.reset(key).then(function () {
          toast('已恢复默认：' + labelForKey(key), 'success');
          if (selectedKey === key) selectKey(key); else renderList();
        });
      });
  }

  function exportAll() {
    if (typeof RT_PAGE_ICONS === 'undefined') { toast('图标模块未加载'); return; }
    var data = {
      updatedAt: new Date().toISOString(),
      icons: RT_PAGE_ICONS.list().map(function (it) {
        return { key: it.key, svg: it.svg, source: it.source };
      })
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'page-icons-' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click(); // 批次168：去掉导出 toast 提示
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 批次165：以 44×44 展示芯片为基准的尺寸合规判断
  // 默认图标 SVG intrinsic 为 22×22、居中置于 44×44 芯片内，属正常，不告警；
  // 仅当 viewBox 非 24×24（坐标系统异常）或 intrinsic 宽高明显过大/过小（>120 或 <8）才判为异常。
  function isIconSizeOk(svg) {
    var vb = (svg.match(/viewBox\s*=\s*"([^"]+)"/i) || [])[1];
    if (!vb) return false; // 无 viewBox 视为异常
    var p = vb.trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && (Math.round(p[2]) !== 24 || Math.round(p[3]) !== 24)) return false;
    var wm = svg.match(/width\s*=\s*"(\d+(?:\.\d+)?)"/i);
    var hm = svg.match(/height\s*=\s*"(\d+(?:\.\d+)?)"/i);
    var n = wm ? Number(wm[1]) : (hm ? Number(hm[1]) : 0);
    if (n && (n > 120 || n < 8)) return false;
    return true;
  }

  // 批次165：导入图标（复用 sanitize 做 XSS 防护 + 尺寸友好提示）
  function importAll() {
    var input = document.getElementById('import-icons-file');
    if (!input || typeof RT_PAGE_ICONS === 'undefined') return;
    input.onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || !Array.isArray(data.icons)) { toast('导入文件格式错误', 'error'); return; }
          var count = 0, warn = 0;
          data.icons.forEach(function (item) {
            if (!item || !item.key || !item.svg) { warn++; return; }
            var clean = RT_PAGE_ICONS.sanitize(item.svg);
            if (!clean || clean.indexOf('<svg') < 0) { warn++; return; }
            if (!isIconSizeOk(clean)) warn++;
            RT_PAGE_ICONS.set(item.key, clean); count++;
          });
          // 批次168：去掉导入成功 toast 提示；错误类 toast 保留
          renderList(); if (selectedKey) selectKey(selectedKey);
        } catch (err) { toast('导入失败：' + (err && err.message ? err.message : err), 'error'); }
      };
      reader.readAsText(f);
      e.target.value = '';
    };
    input.click();
  }

  // 批次165：批量重置（恢复全部为内置默认）
  function resetAll() {
    customConfirm('确定将所有自定义图标恢复为内置默认？此操作不可撤销。',
      { title: '批量恢复', confirmText: '全部恢复', danger: true })
      .then(function (ok) {
        if (!ok || typeof RT_PAGE_ICONS === 'undefined') return;
        RT_PAGE_ICONS.resetAll().then(function () {
          toast('已恢复所有图标为默认', 'success');
          selectKey(null);
        });
      });
  }

  function boot() {
    // 先加载覆盖层到内存，再渲染
    var initP = (typeof RT_PAGE_ICONS !== 'undefined' && RT_PAGE_ICONS.init)
      ? RT_PAGE_ICONS.init() : Promise.resolve();
    initP.then(function () {
      renderList();
    }).catch(function () {
      renderList();
    });

    // 列表点击：先处理「恢复」按钮（位于 .icon-item 内部），再处理选中（否则按钮点击会被 .icon-item 命中而只触发选中、reset 永不调用）
    $('list').addEventListener('click', function (e) {
      var rb = e.target.closest('.reset');
      if (rb && rb.getAttribute('data-key')) {
        reset(rb.getAttribute('data-key'));
        return;
      }
      var item = e.target.closest('.icon-item');
      if (item && item.getAttribute('data-key')) {
        selectKey(item.getAttribute('data-key'));
      }
    });

    $('btnReset').addEventListener('click', function () { reset(selectedKey); });
    $('btnExport').addEventListener('click', exportAll);
    $('btnImport').addEventListener('click', importAll);
    $('btnResetAll').addEventListener('click', resetAll);
  }

  // 进入页面（onPageShow / onVisible 重新同步覆盖层，便于从其它页改完回来）
  onPageShow(function () { if (typeof RT_PAGE_ICONS !== 'undefined') RT_PAGE_ICONS.init().then(renderList); else renderList(); });
  onVisible(function () { if (typeof RT_PAGE_ICONS !== 'undefined') RT_PAGE_ICONS.init().then(renderList); else renderList(); });

  // DOM 就绪后绑定并初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
