// permission.js —— 权限管理页（批次 87）
// 树形展示页面权限按钮（module/page/op 三级，buildMenuTree）；
// 新增 / 编辑 / 启停权限节点（createMenu / updateMenu，menuCode 唯一校验、防环）；
// 每节点「已配置 / 未配置」徽标（isCodeConfigured）；仅管理员可见（守卫批次 89 接线）。
(function (root) {
  'use strict';

  var API = root.RT_PERMISSIONS;
  var REG = root.RT_PERM_REGISTRY_API;

  // ---------------- 状态 ----------------
  var tree = [];            // buildMenuTree 后的根节点
  var flatMenus = [];       // 扁平菜单列表
  var menusById = {};       // id -> menu
  var editingId = null;
  var deletingId = null;
  var collapsedSet = new Set();
  var collapsedInit = false;
  var currentQuery = '';
  // 批次106：权限树局部语言覆盖。null = 跟随全局 RT_CONFIG.getLang()；'en' = 强制英文（查编码）
  var treeLang = null;

  // ---------------- 工具 ----------------
  function $(id) { return document.getElementById(id); }
  function nodeTypeOf(n) { return (n && (n.nodeType || n.type)) || ''; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function updateCounter(inputId, maxId, max) { var el = $(maxId); if (el) el.textContent = ($(inputId).value || '').length + '/' + max; }
  function setErr(field, msg) { var el = $('err-' + field); if (el) { el.textContent = msg || ''; el.classList.toggle('show', !!msg); } }
  function clearErr(field) { setErr(field, ''); }
  function getOperator() { return (typeof getSessionAccount === 'function' ? getSessionAccount() : '') || ''; }
  function openSheet() { $('sheetMask').classList.add('show'); $('sheet').classList.add('show'); }
  function closeSheet() { $('sheetMask').classList.remove('show'); $('sheet').classList.remove('show'); editingId = null; }

  // ---------------- 纯函数（单测用） ----------------
  // 父节点候选项：module 无父；page 父为 module；op 父为 page
  function parentOptionsFor(type, menus) {
    if (type === 'module') return [];
    var want = type === 'page' ? 'module' : 'page';
    return (menus || []).filter(function (m) { return m.nodeType === want; })
      .map(function (m) { return { code: m.menuCode, name: m.menuName }; });
  }
  function matchQuery(n, q) {
    if (!q) return true;
    q = String(q).toLowerCase();
    return (n.menuName || '').toLowerCase().indexOf(q) >= 0 || (n.menuCode || '').toLowerCase().indexOf(q) >= 0;
  }
  // 过滤树：保留匹配节点及其祖先（复制节点，避免改动原树）
  function filterTree(nodes, q) {
    var out = [];
    (nodes || []).forEach(function (n) {
      var kids = filterTree(n.children || [], q);
      if (matchQuery(n, q) || kids.length) {
        var copy = {}; var k;
        for (k in n) { if (Object.prototype.hasOwnProperty.call(n, k)) copy[k] = n[k]; }
        copy.children = kids;
        out.push(copy);
      }
    });
    return out;
  }

  // ---------------- 树渲染（批次106：中英双语 + 局部覆盖）----------------
  function currentGlobalLang() {
    return (typeof RT_CONFIG !== 'undefined' && RT_CONFIG.getLang) ? RT_CONFIG.getLang() : 'zh';
  }
  function treeLangResolved() {
    return treeLang || currentGlobalLang();
  }
  var TYPE_LABEL_ZH = { module: '模块', page: '页面', op: '操作' };
  function buildTreeHtml(nodes) {
    var lang = treeLangResolved();
    var en = lang === 'en';
    var html = '';
    (nodes || []).forEach(function (n) {
      var isLeaf = nodeTypeOf(n) === 'op';
      var cfg = REG && REG.isCodeConfigured ? REG.isCodeConfigured(n.menuCode) : true;
      // 类型标签：中文显示「模块/页面/操作」，英文显示原始 nodeType
      var typeLabel = en ? n.nodeType : (TYPE_LABEL_ZH[n.nodeType] || n.nodeType);
      var typeTag = '<span class="type-tag type-' + n.nodeType + '">' + typeLabel + '</span>';
      var caret = isLeaf ? '<span class="tcaret tcaret-empty"></span>'
        : '<span class="tcaret" data-code="' + n.menuCode + '">&#9654;</span>';
      var badge = cfg
        ? '<span class="badge badge-cfg">已配置</span>'
        : '<span class="badge badge-uncfg">未配置</span>';
      var enabled = n.enabled !== false;
      var sw = '<label class="tswitch"><input type="checkbox" ' + (enabled ? 'checked' : '') +
        ' onchange="toggleEnabled(\'' + n.id + '\',this.checked)"><span class="track"></span></label>';
      var editBtn = '<button class="icon-btn" aria-label="编辑" onclick="openEdit(\'' + n.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
      var delBtn = '<button class="icon-btn danger" aria-label="删除" onclick="openConfirm(\'' + n.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>';
      // displayName 优先 menuName，为空则回退到注册表中文名，兜底用 menuCode
      var regEntry = (REG && REG.getRegistryEntry) ? REG.getRegistryEntry(n.menuCode) : null;
      var displayName = n.menuName || (regEntry && regEntry.name) || n.menuCode;
      // 双语主副文本：
      //   中文 → 主显名称（含类型标签），隐藏编码
      //   英文 → 主显 menuCode（便于开发查编码），副标题显示名称
      var mainText, subText;
      if (en) {
        mainText = n.menuCode;
        subText = displayName !== n.menuCode ? displayName : '';
      } else {
        mainText = displayName;
        subText = '';
      }
      var labelHtml = '<span class="tlabel-wrap"><span class="tlabel" title="' + escapeHtml(mainText) + '">' + escapeHtml(mainText) + '</span>'
        + (subText ? '<span class="tsub">' + escapeHtml(subText) + '</span>' : '') + '</span>';
      var row = '<div class="trow">' + caret + typeTag + labelHtml
        + badge + sw + editBtn + delBtn + '</div>';
      if (isLeaf) {
        html += '<div class="tnode" data-id="' + n.id + '" data-code="' + n.menuCode + '" data-type="' + n.nodeType + '">' + row + '</div>';
      } else {
        html += '<div class="tnode" data-id="' + n.id + '" data-code="' + n.menuCode + '" data-type="' + n.nodeType + '">' + row
          + '<div class="tchildren">' + buildTreeHtml(n.children || []) + '</div></div>';
      }
    });
    return html;
  }

  function paint() {
    var box = $('permTree'); if (!box) return;
    var q = (currentQuery || '').trim().toLowerCase();
    var view = q ? filterTree(tree, q) : tree;
    if (!flatMenus.length) { box.innerHTML = ''; var e = $('treeEmpty'); if (e) e.style.display = 'block'; return; }
    var e2 = $('treeEmpty'); if (e2) e2.style.display = 'none';
    box.innerHTML = buildTreeHtml(view);
    if (!q) {
      collapsedSet.forEach(function (code) {
        var n = box.querySelector('.tnode[data-code="' + code + '"]');
        if (n) n.classList.add('collapsed');
      });
    }
  }

  function onCaretClick(e) {
    var caret = e.target.closest && e.target.closest('.tcaret');
    if (!caret || caret.classList.contains('tcaret-empty')) return;
    e.stopPropagation();
    var code = caret.getAttribute('data-code');
    var node = caret.closest('.tnode');
    if (!node) return;
    var collapsed = node.classList.toggle('collapsed');
    if (collapsed) collapsedSet.add(code); else collapsedSet.delete(code);
  }
  function onSearch() { currentQuery = $('search').value || ''; paint(); }

  // ---------------- 启停 ----------------
  function toggleEnabled(id, checked) {
    if (!id) return;
    API.updateMenu(id, { enabled: !!checked }, getOperator())
      .then(function () { toast(checked ? '已启用' : '已停用'); load(false); })
      .catch(function (err) { toast('操作失败：' + (err && err.message ? err.message : err)); load(false); });
  }

  // ---------------- 新增 / 编辑 ----------------
  function resetForm() {
    $('f-code').value = ''; $('f-code').disabled = false;
    $('f-name').value = ''; $('f-name').disabled = false;
    $('f-type').disabled = false;
    $('f-enabled').checked = true;
    updateCounter('f-code', 'maxCode', 64);
    updateCounter('f-name', 'maxName', 50);
    clearErr('code'); clearErr('name');
  }
  function populateParents(type, selectedCode) {
    var sel = $('f-parent');
    var opts = parentOptionsFor(type, flatMenus);
    // 表单跟随全局语言（非树局部覆盖）：英文 mode 编码在前
    var lang = currentGlobalLang();
    sel.innerHTML = '<option value="">（无父节点）</option>' + opts.map(function (o) {
      var label = lang === 'en' ? (o.code + ' · ' + o.name) : (o.name + ' · ' + o.code);
      return '<option value="' + escapeHtml(o.code) + '"' + (o.code === selectedCode ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
    }).join('');
  }
  // 树局部语言切换（跟随全局 / 强制英文查编码）
  function updateLangBtn() {
    var b = $('langToggle'); if (!b) return;
    var en = treeLang === 'en';
    b.textContent = en ? '🔤 中' : '🔤 EN';
    b.classList.toggle('active', en);
  }
  function toggleTreeLang() {
    treeLang = treeLang ? null : 'en';
    updateLangBtn();
    paint();
  }
  // 表单类型下拉同步双语标签（跟随全局语言）
  function applyTypeSelectLang(lang) {
    var sel = $('f-type'); if (!sel) return;
    var labels = lang === 'en'
      ? { module: 'module', page: 'page', op: 'op' }
      : { module: '模块', page: '页面', op: '操作' };
    var opts = sel.options;
    for (var i = 0; i < opts.length; i++) {
      if (labels[opts[i].value]) opts[i].textContent = labels[opts[i].value];
    }
  }
  function onTypeChange() {
    var t = $('f-type').value;
    var pf = $('parentField');
    if (t === 'module') { pf.style.display = 'none'; }
    else { pf.style.display = ''; populateParents(t, ''); }
  }
  function openAdd() {
    editingId = null;
    resetForm();
    $('sheetTitle').textContent = '新增权限节点';
    $('saveBtn').textContent = '创建';
    $('f-type').value = 'page';
    onTypeChange();
    openSheet();
  }
  function openEdit(id) {
    API.getMenu(id).then(function (m) {
      if (!m) { toast('节点不存在'); return; }
      editingId = id;
      resetForm();
      $('sheetTitle').textContent = '编辑权限节点';
      $('saveBtn').textContent = '保存';
      $('f-type').value = m.nodeType;
      $('f-type').disabled = true;           // 类型锁定，避免层级错乱
      var t = m.nodeType;
      if (t === 'module') { $('parentField').style.display = 'none'; }
      else { $('parentField').style.display = ''; populateParents(t, m.parentCode); }
      $('f-code').value = m.menuCode;
      $('f-code').disabled = true;           // menuCode 为关联键，编辑时锁定
      $('f-name').value = m.menuName;
      $('f-enabled').checked = m.enabled !== false;
      updateCounter('f-code', 'maxCode', 64);
      updateCounter('f-name', 'maxName', 50);
      openSheet();
    }).catch(function () { toast('读取失败'); });
  }
  function save() {
    var btn = $('saveBtn'); if (btn && btn.disabled) return;
    var type = $('f-type').value;
    var code = ($('f-code').value || '').trim();
    var name = ($('f-name').value || '').trim();
    var parentCode = type === 'module' ? '' : ($('f-parent').value || '');
    var enabled = $('f-enabled').checked;
    clearErr('code'); clearErr('name');
    var ok = true;
    if (!editingId) {
      if (!code) { setErr('code', '请输入菜单编号'); ok = false; }
      else if (code.length > 64) { setErr('code', '菜单编号最多 64 位'); ok = false; }
    }
    if (!name) { setErr('name', '请输入菜单名称'); ok = false; }
    else if (name.length > 50) { setErr('name', '菜单名称最多 50 位'); ok = false; }
    if (!ok) return;
    var op = getOperator();
    var payload = editingId
      ? { menuName: name, parentCode: parentCode, enabled: enabled }
      : { menuCode: code, menuName: name, nodeType: type, parentCode: parentCode, enabled: enabled };
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    var wasEdit = !!editingId;
    var p = editingId ? API.updateMenu(editingId, payload, op) : API.createMenu(payload, op);
    p.then(function () { closeSheet(); toast(wasEdit ? '已保存' : '已创建'); load(false); })
      .catch(function (err) { toast('操作失败：' + (err && err.message ? err.message : err)); })
      .then(function () { if (btn) { btn.disabled = false; btn.textContent = wasEdit ? '保存' : '创建'; } });
  }

  // ---------------- 删除 ----------------
  function openConfirm(id) {
    deletingId = id;
    var m = menusById[id];
    var hasChild = flatMenus.some(function (x) { return x.parentCode === (m && m.menuCode); });
    var txt = hasChild
      ? '该节点下还有子节点，请先删除其子节点后再删除。'
      : '确定删除权限节点「' + (m ? m.menuName : '') + '」吗？此操作不可撤销。';
    $('confirmText').textContent = txt;
    $('confirmBtn').style.display = hasChild ? 'none' : 'block';
    $('confirmMask').classList.add('show');
  }
  function closeConfirm() { $('confirmMask').classList.remove('show'); deletingId = null; }
  function doDelete() {
    if (!deletingId) return;
    var id = deletingId;
    API.deleteMenu(id)
      .then(function () { closeConfirm(); toast('已删除'); load(false); })
      .catch(function (err) { closeConfirm(); toast('删除失败：' + (err && err.message ? err.message : err)); });
  }

  // ---------------- 数据加载 ----------------
  function load(forceSeed) {
    var chain = (forceSeed === false) ? Promise.resolve() : API.seedMenusFromRegistry('system');
    chain.then(API.getAllMenus).then(function (menus) {
      flatMenus = menus || [];
      menusById = {};
      flatMenus.forEach(function (m) { menusById[m.id] = m; });
      tree = API.buildMenuTree(flatMenus);
      if (!collapsedInit) {
        flatMenus.forEach(function (m) { if (m.nodeType === 'page') collapsedSet.add(m.menuCode); });
        collapsedInit = true;
      }
      paint();
    }).catch(function (err) {
      var box = $('permTree');
      if (box) box.innerHTML = '<div class="empty">读取失败：' + escapeHtml(err && err.message ? err.message : err) + '</div>';
    });
  }

  function init() {
    // 批次101：入口幂等播种 — 确保系统管理员角色、admin绑定、菜单注册表
    if (typeof RT_USERS !== 'undefined' && RT_USERS.ensureDefaultAdminRole) {
      RT_USERS.ensureDefaultAdminRole({ account: 'admin', password: '123', nickname: '管理员', operator: 'system' })
        .then(function () {
          if (typeof RT_PERMISSIONS !== 'undefined' && RT_PERMISSIONS.seedMenusFromRegistry) {
            return RT_PERMISSIONS.seedMenusFromRegistry('system');
          }
        }).catch(function () {});
    }
    var tree = $('permTree');
    if (tree) tree.addEventListener('click', onCaretClick);
    // 批次106：语言按钮初态 + 表单类型标签 + 全局语言变更同步
    updateLangBtn();
    applyTypeSelectLang(currentGlobalLang());
    document.addEventListener('langchange', function () {
      applyTypeSelectLang(currentGlobalLang());   // 表单始终跟随全局
      if (treeLang === null) { updateLangBtn(); paint(); }  // 树仅在未局部覆盖时跟随全局
    });
    load(true);
    window.addEventListener('pageshow', function () { load(true); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(false); });
    if ('serviceWorker' in navigator) {
      fetch('version.json?_t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d && d.version) navigator.serviceWorker.register('sw.js?v=' + d.version); })
        .catch(function () {});
    }
  }

  // 暴露给 HTML onclick
  root.openAdd = openAdd;
  root.openEdit = openEdit;
  root.save = save;
  root.closeSheet = closeSheet;
  root.onTypeChange = onTypeChange;
  root.onSearch = onSearch;
  root.toggleEnabled = toggleEnabled;
  root.openConfirm = openConfirm;
  root.closeConfirm = closeConfirm;
  root.doDelete = doDelete;
  root.toggleTreeLang = toggleTreeLang;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  root.RT_PERMISSION_PAGE = {
    _init: init, load: load, paint: paint,
    buildTreeHtml: buildTreeHtml,
    parentOptionsFor: parentOptionsFor,
    matchQuery: matchQuery,
    filterTree: filterTree,
    nodeTypeOf: nodeTypeOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_PERMISSION_PAGE;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
