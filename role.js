// role.js —— 角色管理页（批次 86）
// 列表 / 新增 / 编辑 / 启停 / 树形勾选分配权限（仅已配置节点可勾选）/
// 引用人员反查（D4 审计）/ 删除前「无人员引用」校验（系统管理员始终禁删）
(function (root) {
  'use strict';

  var API = root.RT_PERMISSIONS;
  var REG = root.RT_PERM_REGISTRY_API;

  // ---------------- 状态 ----------------
  var editingId = null;
  var deletingId = null;
  var currentRole = null;
  var permTree = [];
  var nodeLeaves = {};          // menuCode -> [后代 op code]
  var selected = new Set();      // 当前勾选的 op code 集合
  var collapsedSet = new Set();  // 折叠的节点 menuCode
  var usersByRole = {};          // roleId -> [user]

  // ---------------- 工具 ----------------
  function $(id) { return document.getElementById(id); }
  function nodeTypeOf(n) { return (n && (n.nodeType || n.type)) || ""; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function updateCounter(inputId, maxId, max) { $(maxId).textContent = ($(inputId).value || '').length + '/' + max; }
  function setErr(field, msg) {
    var el = $('err-' + field);
    if (el) { el.textContent = msg || ''; el.classList.toggle('show', !!msg); }
  }
  function clearErr(field) { setErr(field, ''); }
  function openSheet() { $('sheetMask').classList.add('show'); $('sheet').classList.add('show'); }
  function closeSheet() { $('sheetMask').classList.remove('show'); $('sheet').classList.remove('show'); editingId = null; }

  // ---------------- 人员反查（D4）----------------
  function loadUsers() {
    if (!root.RT_USERS || !root.RT_USERS.getAllUsers) return Promise.resolve([]);
    return root.RT_USERS.getAllUsers().then(function (list) {
      usersByRole = {};
      (list || []).forEach(function (u) {
        var rids = Array.isArray(u.roleIds) ? u.roleIds : [];
        rids.forEach(function (rid) { (usersByRole[rid] = usersByRole[rid] || []).push(u); });
      });
      return list;
    });
  }

  // ---------------- 列表 ----------------
  function render() {
    if (typeof API === 'undefined') { $('list').innerHTML = '<div class="empty">权限模块未加载</div>'; return; }
    var q = ($('search').value || '').trim().toLowerCase();
    Promise.all([API.getAllRoles(), loadUsers()]).then(function (res) {
      var roles = res[0] || [];
      if (q) roles = roles.filter(function (r) { return (r.roleName || '').toLowerCase().indexOf(q) >= 0; });
      var box = $('list');
      if (!roles.length) {
        box.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg><div>' + (q ? '没有匹配的角色' : '还没有角色，点击右上角「+ 新增」') + '</div></div>';
        return;
      }
      box.innerHTML = roles.map(cardHtml).join('');
    }).catch(function (err) {
      $('list').innerHTML = '<div class="empty">读取失败：' + escapeHtml(err && err.message ? err.message : err) + '</div>';
    });
  }

  function cardHtml(role) {
    var isSys = !!role.isSystemAdmin;
    var enabled = role.enabled !== false;
    var count = Array.isArray(role.menuCodes) ? role.menuCodes.length : 0;
    var refN = (usersByRole[role.id] || []).length;
    var statusTag = enabled ? '<span class="tag-on">启用</span>' : '<span class="tag-off">停用</span>';
    var delDisabled = isSys || refN > 0;
    var delTitle = isSys ? '系统管理员角色不可删除' : (refN > 0 ? '该角色仍有 ' + refN + ' 人引用，无法删除' : '删除');
    var editBtn = '<button class="icon-btn" aria-label="编辑" onclick="openEdit(\'' + role.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
    var delBtn = '<button class="icon-btn danger' + (delDisabled ? ' disabled' : '') + '" aria-label="删除" title="' + delTitle + '"'
      + (delDisabled ? '' : ' onclick="openConfirm(\'' + role.id + '\')"') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>';
    return '<div class="card">'
      + '<div class="card-row">'
      + '<div class="card-main">'
      + '<div class="card-name">' + escapeHtml(role.roleName || '未命名') + (isSys ? '<span class="badge-sys">系统管理员</span>' : '') + '</div>'
      + '<div class="card-meta">状态 ' + statusTag + ' · 权限 ' + count + ' 项'
      + ' · 引用 <span class="link-like" onclick="openPeopleById(\'' + role.id + '\')">' + refN + ' 人</span></div>'
      + '</div>'
      + '<div class="acts">' + editBtn + delBtn + '</div>'
      + '</div></div>';
  }

  // ---------------- 权限树 ----------------
  function buildPermTree() {
    return API.seedMenusFromRegistry('system').then(function () {
      return API.getAllMenus();
    }).then(function (menus) {
      permTree = API.buildMenuTree(menus || []);
      nodeLeaves = {};
      computeLeaves(permTree, nodeLeaves);
      return permTree;
    });
  }
  function computeLeaves(nodes, map) {
    var level = [];
    (nodes || []).forEach(function (n) {
      if (nodeTypeOf(n) === 'op') { map[n.menuCode] = [n.menuCode]; level.push(n.menuCode); }
      else {
        var childLeaves = computeLeaves(n.children || [], map);
        map[n.menuCode] = childLeaves;
        level = level.concat(childLeaves);
      }
    });
    return level;
  }
  function buildTreeHtml(nodes) {
    var html = '';
    (nodes || []).forEach(function (n) {
      var isLeaf = nodeTypeOf(n) === 'op';
      var cfg = REG && REG.isCodeConfigured ? REG.isCodeConfigured(n.menuCode) : true;
      var caret = isLeaf ? '<span class="tcaret tcaret-empty"></span>'
        : '<span class="tcaret" data-code="' + n.menuCode + '">▶</span>';
      var row = '<div class="trow">'
        + caret
        + '<label class="tlabel-wrap">'
        + '<input type="checkbox" class="tcb" data-code="' + n.menuCode + '" data-type="' + nodeTypeOf(n) + '">'
        + '<span class="tlabel">' + escapeHtml(n.menuName || (REG && REG.getRegistryEntry ? (REG.getRegistryEntry(n.menuCode) || {}).name : '') || n.menuCode) + '</span>'
        + '</label>'
        + (isLeaf && !cfg ? '<span class="perm-badge">未配置</span>' : '')
        + '</div>';
      if (isLeaf) {
        html += '<div class="tnode leaf" data-code="' + n.menuCode + '" data-type="op">' + row + '</div>';
      } else {
        html += '<div class="tnode" data-code="' + n.menuCode + '" data-type="' + nodeTypeOf(n) + '">' + row
          + '<div class="tchildren">' + buildTreeHtml(n.children || []) + '</div></div>';
      }
    });
    return html;
  }
  function renderPermTree() {
    var box = $('permTree'); if (!box) return;
    box.innerHTML = buildTreeHtml(permTree);
    applyTreeState();
  }
  function applyTreeState() {
    document.querySelectorAll('#permTree .tnode:not(.leaf)').forEach(function (node) {
      var code = node.getAttribute('data-code');
      var ops = nodeLeaves[code] || [];
      var cb = node.querySelector(':scope > .trow .tcb');
      if (!cb) return;
      var sel = ops.filter(function (c) { return selected.has(c); }).length;
      cb.checked = ops.length > 0 && sel === ops.length;
      cb.indeterminate = sel > 0 && sel < ops.length;
      var anyCfg = ops.some(function (c) { return REG.isCodeConfigured(c); });
      cb.disabled = !anyCfg;
    });
    document.querySelectorAll('#permTree .tnode.leaf .tcb').forEach(function (cb) {
      var code = cb.getAttribute('data-code');
      cb.checked = selected.has(code);
      cb.disabled = !(REG.isCodeConfigured(code));
    });
    collapsedSet.forEach(function (code) {
      var node = document.querySelector('#permTree .tnode[data-code="' + code + '"]');
      if (node) node.classList.add('collapsed');
    });
  }
  function toggleNode(code, type, checked, sel, leaves) {
    if (type === 'op') {
      if (checked) sel.add(code); else sel.delete(code);
    } else {
      (leaves[code] || []).forEach(function (c) { if (checked) sel.add(c); else sel.delete(c); });
    }
  }
  function onPermChange(e) {
    var cb = e.target.closest && e.target.closest('.tcb');
    if (!cb) return;
    toggleNode(cb.getAttribute('data-code'), cb.getAttribute('data-type'), cb.checked, selected, nodeLeaves);
    renderPermTree();
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
  function selectAllPerms(flag) {
    if (flag) {
      Object.keys(nodeLeaves).forEach(function (code) {
        (nodeLeaves[code] || []).forEach(function (op) { if (REG.isCodeConfigured(op)) selected.add(op); });
      });
    } else {
      selected.clear();
    }
    renderPermTree();
  }

  // ---------------- 表单：新增 / 编辑 ----------------
  function resetForm() {
    $('f-name').value = ''; $('f-name').disabled = false;
    $('f-enabled').checked = true; $('f-enabled').disabled = false;
    updateCounter('f-name', 'maxName', 30);
    clearErr('roleName');
    $('metaBox').style.display = 'none';
    $('refBox').style.display = 'none';
  }
  function openAdd() {
    editingId = null; currentRole = null;
    selected = new Set(); collapsedSet = new Set();
    resetForm();
    $('sheetTitle').textContent = '新增角色'; $('saveBtn').textContent = '创建';
    buildPermTree().then(function () { renderPermTree(); openSheet(); })
      .catch(function (err) { toast('加载权限树失败：' + (err && err.message ? err.message : err)); });
  }
  function openEdit(id) {
    API.getRole(id).then(function (role) {
      if (!role) { toast('角色不存在'); return; }
      editingId = id; currentRole = role;
      selected = new Set((role.menuCodes || []).filter(function (c) { return REG.isCodeConfigured(c); }));
      collapsedSet = new Set();
      $('f-name').value = role.roleName || '';
      $('f-name').disabled = !!role.isSystemAdmin;
      $('f-enabled').checked = role.enabled !== false;
      $('f-enabled').disabled = !!role.isSystemAdmin;   // 系统管理员不可停用
      updateCounter('f-name', 'maxName', 30);
      clearErr('roleName');
      var refN = (usersByRole[id] || []).length;
      $('refLabel').textContent = '引用人员 (' + refN + ')';
      $('refBox').style.display = 'block';
      $('metaBox').style.display = 'block';
      $('metaBox').innerHTML = '创建人：<b>' + escapeHtml(role.createdBy || '—') + '</b>　创建时间：<b>' + fmtTime(role.createdAt) + '</b>'
        + (role.isSystemAdmin ? '　<span class="badge-sys">系统管理员</span>' : '');
      $('sheetTitle').textContent = role.isSystemAdmin ? '系统管理员角色' : '编辑角色';
      $('saveBtn').textContent = '保存';
      buildPermTree().then(function () { renderPermTree(); openSheet(); })
        .catch(function (err) { toast('加载权限树失败：' + (err && err.message ? err.message : err)); });
    }).catch(function () { toast('读取失败'); });
  }
  function save() {
    var saveBtn = $('saveBtn'); if (saveBtn && saveBtn.disabled) return;
    var name = ($('f-name').value || '').trim();
    if (!name) { setErr('roleName', '请输入角色名称'); $('f-name').classList.add('invalid'); $('f-name').focus(); return; }
    if (name.length > 30) { setErr('roleName', '名称不超过 30 位'); $('f-name').focus(); return; }
    var operator = (typeof getSessionAccount === 'function' ? getSessionAccount() : '') || '';
    var codes = Array.from(selected);
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中\u2026'; }
    function done() { closeSheet(); toast(editingId ? '已保存' : '已创建'); render(); }
    function fail(err) { toast('操作失败：' + (err && err.message ? err.message : err)); }
    function reset() { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = editingId ? '保存' : '创建'; } }
    if (editingId) {
      API.updateRole(editingId, { roleName: name, enabled: $('f-enabled').checked }, operator)
        .then(function () { return API.saveRolePermissions(editingId, codes, operator); })
        .then(done).catch(fail).then(reset);
    } else {
      API.createRole({ roleName: name, enabled: $('f-enabled').checked, menuCodes: [] }, operator)
        .then(function (role) { return API.saveRolePermissions(role.id, codes, operator); })
        .then(done).catch(fail).then(reset);
    }
  }

  // ---------------- 引用人员抽屉 ----------------
  function openPeople() {
    if (!editingId) return;
    var users = usersByRole[editingId] || [];
    $('peopleTitle').textContent = '引用人员 (' + users.length + ')';
    var isSysAdminRole = !!(currentRole && currentRole.isSystemAdmin);
    var box = $('peopleList');
    if (!users.length) { box.innerHTML = '<div class="empty">暂无人员引用该角色</div>'; }
    else {
      box.innerHTML = users.map(function (u) {
        var nm = u.nickname || u.name || u.account || '未命名';
        var meta = [];
        if (u.employeeNo) meta.push('工号 ' + escapeHtml(u.employeeNo));
        if (u.account) meta.push('账号 ' + escapeHtml(u.account));
        // admin + 系统管理员 组合不可移除（其余人员可移除该角色）
        var protectedUser = u.account === 'admin' && isSysAdminRole;
        var delBtn = protectedUser ? ''
          : '<button class="pdel" type="button" aria-label="移除角色" title="移除该角色" onclick="removeUserRole(\'' + escapeHtml(u.id) + '\')">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
        return '<div class="person"><div class="avatar">' + escapeHtml((nm || '?').slice(0, 1)) + '</div>'
          + '<div class="pinfo"><div class="pname">' + escapeHtml(nm) + '</div>'
          + (meta.length ? '<div class="pmeta">' + meta.join(' · ') + '</div>' : '') + '</div>'
          + delBtn + '</div>';
      }).join('');
    }
    $('peopleMask').classList.add('show'); $('peopleSheet').classList.add('show');
  }
  // 从卡片「引用 N 人」进入：先取角色数据（含 isSystemAdmin），保证删除保护基于真实数据
  function openPeopleById(id) {
    if (!id) return;
    API.getRole(id).then(function (r) {
      currentRole = r || { id: id, isSystemAdmin: false };
      editingId = id;
      openPeople();
    }).catch(function () { editingId = id; openPeople(); });
  }
  // 移除某人员的当前角色关系
  function removeUserRole(userId) {
    if (!editingId || !userId) return;
    var users = usersByRole[editingId] || [];
    var user = null;
    for (var i = 0; i < users.length; i++) { if (users[i].id === userId) { user = users[i]; break; } }
    if (!user) { toast('未找到该人员'); return; }
    var isSysAdminRole = !!(currentRole && currentRole.isSystemAdmin);
    if (user.account === 'admin' && isSysAdminRole) { toast('系统管理员角色不可移除'); return; }
    var oldIds = Array.isArray(user.roleIds) ? user.roleIds : [];
    var newRoleIds = oldIds.filter(function (rid) { return rid !== editingId; });
    if (newRoleIds.length === oldIds.length) { toast('该人员未引用此角色'); return; }
    if (!root.RT_PERMISSIONS || !root.RT_PERMISSIONS.saveUserRoles) { toast('权限模块未加载'); return; }
    var name = user.nickname || user.name || user.account || '未命名';
    var operator = (typeof getSessionAccount === 'function' ? getSessionAccount() : '') || '';
    root.RT_PERMISSIONS.saveUserRoles(userId, newRoleIds, operator).then(function () {
      toast('已移除「' + name + '」的该角色');
      return loadUsers();   // 刷新 usersByRole（引用计数随之更新）
    }).then(function () {
      render();             // 刷新卡片引用计数
      openPeople();         // 刷新人员列表（移除该项）
    }).catch(function (err) {
      toast('移除失败：' + (err && err.message ? err.message : err));
    });
  }
  function closePeople() { $('peopleMask').classList.remove('show'); $('peopleSheet').classList.remove('show'); }

  // ---------------- 删除 ----------------
  function openConfirm(id) {
    deletingId = id;
    API.getRole(id).then(function (r) {
      var refN = (usersByRole[id] || []).length;
      var name = r ? r.roleName : '';
      var txt;
      if (r && r.isSystemAdmin) txt = '系统管理员角色不可删除。';
      else if (refN > 0) txt = '该角色仍有 ' + refN + ' 人引用，无法删除。';
      else txt = '确定删除「' + (name || '该角色') + '」吗？此操作不可撤销。';
      $('confirmText').textContent = txt;
      $('confirmBtn').style.display = (r && (r.isSystemAdmin || refN > 0)) ? 'none' : 'block';
      $('confirmMask').classList.add('show');
    }).catch(function () {
      $('confirmText').textContent = '确定删除该角色？此操作不可撤销。';
      $('confirmBtn').style.display = 'block';
      $('confirmMask').classList.add('show');
    });
  }
  function closeConfirm() { $('confirmMask').classList.remove('show'); deletingId = null; }
  function doDelete() {
    if (!deletingId) return;
    var id = deletingId;
    API.deleteRole(id).then(function () { closeConfirm(); toast('已删除'); render(); })
      .catch(function (err) { closeConfirm(); toast('删除失败：' + (err && err.message ? err.message : err)); });
  }

  // ---------------- 初始化 ----------------
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
    if (tree) {
      tree.addEventListener('change', onPermChange);
      tree.addEventListener('click', onCaretClick);
    }
    render();
    window.addEventListener('pageshow', render);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') render(); });
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
  root.openPeople = openPeople;
  root.openPeopleById = openPeopleById;
  root.removeUserRole = removeUserRole;
  root.closePeople = closePeople;
  root.selectAllPerms = selectAllPerms;
  root.openConfirm = openConfirm;
  root.closeConfirm = closeConfirm;
  root.doDelete = doDelete;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  root.RT_ROLE_PAGE = {
    _init: init, render: render,
    computeLeaves: computeLeaves, buildTreeHtml: buildTreeHtml, toggleNode: toggleNode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_ROLE_PAGE;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
