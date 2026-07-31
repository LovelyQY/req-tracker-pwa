// Batch 198（#26 权限管理补全）：用户/角色/权限/图标四张系统管理页补齐操作按钮级
// data-perm 守卫并接入 applyGuard()，使 RBAC 在按钮级真正生效（v1.4.03）。
// 运行环境无 jsdom，沿用 191–197 的「源码结构 / 静态契约」断言风格。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const reg = require(path.join(ROOT, 'permissions-registry.js'));
const CODES = reg.flattenRegistryCodes();
const isCfg = (c) => reg.isCodeConfigured(c);

// ===== #26 注册表：目标操作码均已登记（无需改 registry，仅校验完整性）=====
test('Batch198 #26：注册表已含全部目标操作码', () => {
  [
    'page_user', 'op_user_create', 'op_user_edit', 'op_user_delete',
    'page_role', 'op_role_create', 'op_role_edit', 'op_role_delete',
    'page_perm', 'op_perm_create', 'op_perm_edit', 'op_perm_delete',
    'page_icon_manager', 'op_icon_manager_edit'
  ].forEach((c) => assert.ok(CODES.indexOf(c) >= 0, '注册表应登记：' + c));
});

// ===== #26 user.html：新增/编辑/删除按钮 + applyGuard =====
test('Batch198 #26：user.html 补齐操作权限守卫', () => {
  const html = read('user.html');
  assert.ok(html.indexOf('data-perm="op_user_create"') >= 0, '顶部+新增加 op_user_create');
  assert.ok(html.indexOf('data-perm="op_user_edit"') >= 0, '行内编辑加 op_user_edit');
  assert.ok(html.indexOf('data-perm="op_user_delete"') >= 0, '行内删除加 op_user_delete');
  assert.ok(html.indexOf('applyGuard()') >= 0, 'render() 后应调用 applyGuard()');
});

// ===== #26 role.html + role.js：新增/编辑/删除按钮 + applyGuard =====
test('Batch198 #26：role.html/role.js 补齐操作权限守卫', () => {
  const html = read('role.html');
  const js = read('role.js');
  assert.ok(html.indexOf('data-perm="op_role_create"') >= 0, '顶部+新增加 op_role_create');
  assert.ok(js.indexOf('data-perm="op_role_edit"') >= 0, '卡片编辑加 op_role_edit');
  assert.ok(js.indexOf('data-perm="op_role_delete"') >= 0, '卡片删除加 op_role_delete');
  assert.ok(js.indexOf('applyGuard()') >= 0, 'render() 后应调用 applyGuard()');
});

// ===== #26 permission.html + permission.js：新增/编辑/删除节点 + applyGuard =====
test('Batch198 #26：permission.html/permission.js 补齐操作权限守卫', () => {
  const html = read('permission.html');
  const js = read('permission.js');
  assert.ok(html.indexOf('data-perm="op_perm_create"') >= 0, '顶部+新增加 op_perm_create');
  assert.ok(html.indexOf('data-perm="op_perm_delete"') >= 0, '删除节点加 op_perm_delete');
  assert.ok(js.indexOf('data-perm="op_perm_edit"') >= 0, '节点编辑加 op_perm_edit');
  assert.ok(js.indexOf('data-perm="op_perm_create"') >= 0, '节点新增子项加 op_perm_create');
  assert.ok(js.indexOf('applyGuard()') >= 0, 'paint() 后应调用 applyGuard()');
});

// ===== #26 icon-manager.html：导出/导入/恢复默认/批量恢复 四个按钮 =====
test('Batch198 #26：icon-manager.html 四个维护按钮加 op_icon_manager_edit', () => {
  const html = read('icon-manager.html');
  const n = (html.match(/data-perm="op_icon_manager_edit"/g) || []).length;
  assert.strictEqual(n, 4, 'btnExport/btnImport/btnReset/btnResetAll 共 4 处应带 op_icon_manager_edit');
});

// ===== #26 自检（镜像 release.sh）：本批新增的所有 data-perm 必须命中注册表 =====
test('Batch198 #26：新增 data-perm 全部命中注册表（data-perm ⊆ 注册表）', () => {
  const files = ['user.html', 'role.html', 'role.js', 'permission.html', 'permission.js', 'icon-manager.html'];
  const re = /data-perm="([^"]+)"/g;
  const expect = [
    'op_user_create', 'op_user_edit', 'op_user_delete',
    'op_role_create', 'op_role_edit', 'op_role_delete',
    'op_perm_create', 'op_perm_delete', 'op_perm_edit',
    'op_icon_manager_edit'
  ];
  files.forEach((f) => {
    const html = read(f);
    let m;
    while ((m = re.exec(html)) !== null) {
      const code = m[1];
      assert.ok(isCfg(code), f + ' 的 data-perm "' + code + '" 必须在注册表中（否则 release.sh 自检会失败）');
    }
  });
  // 同时确认计划覆盖的全部目标码确实出现在源码中
  expect.forEach((c) => {
    const found = files.some((f) => read(f).indexOf('data-perm="' + c + '"') >= 0);
    assert.ok(found, '目标权限码应在源码中出现：' + c);
  });
});
