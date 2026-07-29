// icon-manager.js -- 图标管理页逻辑（批次 148）
// 依赖：config.js / db.js / page-icons.js（RT_PAGE_ICONS）/ ui-utils.js（$）
// 职责：列表渲染、选中编辑、实时预览、保存（写 IDB）、恢复默认、导出全部 JSON。
(function () {
  'use strict';

  var selectedKey = null;

  // key → 中文标签映射（与 basic-data.html MODULES.name / 报表模块标题一致）
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
    'pwa': 'PWA桌面'
  };

  function labelForKey(key) { return KEY_LABELS[key] || key; }

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
    var ta = $('svgInput');
    var prev = $('preview');
    if (!it) {
      selEl.innerHTML = '未选择';
      ta.value = '';
      prev.innerHTML = '';
      renderList();
      return;
    }
    selEl.innerHTML = escapeHtml(labelForKey(it.key))
      + '<span class="src ' + (it.source === 'override' ? 'badge override' : 'badge default') + '">'
      + (it.source === 'override' ? '已覆盖' : '默认') + '</span>';
    ta.value = it.svg;
    prev.innerHTML = it.svg; // 预览即所见（保存时会净化）
    renderList();
  }

  function findItem(key) {
    if (typeof RT_PAGE_ICONS === 'undefined') return null;
    var all = RT_PAGE_ICONS.list();
    for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
    return null;
  }

  function onInput() {
    var prev = $('preview');
    if (prev) prev.innerHTML = $('svgInput').value || '';
  }

  function save() {
    if (!selectedKey) { toast('请先选择一个图标'); return; }
    if (typeof RT_PAGE_ICONS === 'undefined') { toast('图标模块未加载'); return; }
    var raw = $('svgInput').value;
    var clean = RT_PAGE_ICONS.sanitize(raw);
    if (!clean || clean.indexOf('<svg') < 0) { toast('SVG 内容无效', 'error'); return; }
    RT_PAGE_ICONS.set(selectedKey, clean).then(function () {
      toast('已保存：' + labelForKey(selectedKey), 'success');
      selectKey(selectedKey); // 重新渲染列表 + 预览
    }).catch(function () { toast('保存失败', 'error'); });
  }

  function reset(key) {
    if (!key) return;
    customConfirm('确定将「' + labelForKey(key) + '」恢复为内置默认图标？', { title: '恢复默认', confirmText: '恢复', danger: true })
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
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('已导出 ' + data.icons.length + ' 个图标', 'success');
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

    // 列表点击：选中
    $('list').addEventListener('click', function (e) {
      var item = e.target.closest('.icon-item');
      if (item && item.getAttribute('data-key')) {
        selectKey(item.getAttribute('data-key'));
        return;
      }
      var rb = e.target.closest('.reset');
      if (rb && rb.getAttribute('data-key')) {
        reset(rb.getAttribute('data-key'));
      }
    });

    $('svgInput').addEventListener('input', onInput);
    $('btnSave').addEventListener('click', save);
    $('btnReset').addEventListener('click', function () { reset(selectedKey); });
    $('btnExport').addEventListener('click', exportAll);
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
