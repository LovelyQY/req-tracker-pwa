// test-batch87-permission.js
// Verify Batch 87: permission-management page logic (tree helpers + badge rendering).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

globalThis.RT_DB = require('../db.js');
globalThis.RT_DB.registerStore('users', {
  keyPath: 'id',
  indexes: [
    { name: 'account', path: 'account' },
    { name: 'departmentId', path: 'departmentId' }
  ]
});
require('../permissions-registry.js');
require('../permissions.js');
const API = globalThis.RT_PERMISSIONS;
const REG = globalThis.RT_PERM_REGISTRY_API;
require('../permission.js');
const PAGE = globalThis.RT_PERMISSION_PAGE;

function buildFlat() {
  return API.seedMenusFromRegistry('system').then(function () { return API.getAllMenus(); });
}
function containsCode(node, code) {
  if (node.menuCode === code) return true;
  return (node.children || []).some(function (c) { return containsCode(c, code); });
}

describe('Batch87: permission page pure helpers', () => {
  test('parentOptionsFor: module has no parent; page->module; op->page', async () => {
    var menus = await buildFlat();
    assert.deepEqual(PAGE.parentOptionsFor('module', menus), []);
    var pages = PAGE.parentOptionsFor('page', menus);
    assert.equal(pages.length, 5);
    assert.ok(pages.every(function (o) { return /mod_/.test(o.code); }));
    var ops = PAGE.parentOptionsFor('op', menus);
    assert.equal(ops.length, 21);
    assert.ok(ops.every(function (o) { return /page_/.test(o.code); }));
  });

  test('matchQuery: case-insensitive on name and code', () => {
    assert.ok(PAGE.matchQuery({ menuName: '公司', menuCode: 'page_company' }, '公司'));
    assert.ok(PAGE.matchQuery({ menuName: '公司', menuCode: 'page_company' }, 'COMPANY'));
    assert.ok(PAGE.matchQuery({ menuName: '导出', menuCode: 'op_x_export' }, 'export'));
    assert.ok(!PAGE.matchQuery({ menuName: '部门', menuCode: 'page_dept' }, '公司'));
  });

  test('filterTree: keeps matching nodes + ancestors, prunes unrelated, no mutation', async () => {
    var menus = await buildFlat();
    var tree = API.buildMenuTree(menus);
    var before = tree.length;
    var filtered = PAGE.filterTree(tree, 'op_company_view');
    assert.ok(filtered.length >= 1);
    var found = false;
    (function walk(ns) { ns.forEach(function (n) { if (n.menuCode === 'op_company_view') found = true; walk(n.children || []); }); })(filtered);
    assert.ok(found);
    var unrelated = filtered.filter(function (n) { return n.nodeType === 'module' && !containsCode(n, 'op_company_view'); });
    assert.equal(unrelated.length, 0, 'unrelated modules pruned');
    assert.equal(tree.length, before, 'original tree not mutated');
  });

  test('buildTreeHtml: module caret + op switch + edit/delete wiring', () => {
    var fake = [
      { id: 'm1', menuCode: 'mod_x', menuName: '模块X', nodeType: 'module', enabled: true, children: [
        { id: 'p1', menuCode: 'page_x', menuName: '页面X', nodeType: 'page', enabled: true, children: [
          { id: 'o1', menuCode: 'op_x_view', menuName: '查看', nodeType: 'op', enabled: false, children: [] }
        ] }
      ] }
    ];
    var html = PAGE.buildTreeHtml(fake);
    assert.ok(html.indexOf('data-type="module"') >= 0);
    assert.ok(html.indexOf('data-type="op"') >= 0);
    assert.ok(html.indexOf("toggleEnabled('o1'") >= 0);
    assert.ok(html.indexOf("openEdit('o1'") >= 0);
    assert.ok(html.indexOf("openConfirm('o1'") >= 0);
    assert.ok(html.indexOf('op_x_view') >= 0);
  });
});

describe('Batch87: badge rendering (configured vs unconfigured)', () => {
  test('registry op -> badge-cfg; custom op -> badge-uncfg', async () => {
    var menus = await buildFlat();
    var custom = await API.createMenu(
      { menuCode: 'op_company_custom87', menuName: '自定义导出', nodeType: 'op', parentCode: 'page_company', enabled: true },
      'tester'
    );
    var all = await API.getAllMenus();
    var tree = API.buildMenuTree(all);
    var html = PAGE.buildTreeHtml(tree);
    assert.ok(html.indexOf('badge-cfg') >= 0, 'registered nodes show badge-cfg');
    assert.ok(html.indexOf('badge-uncfg') >= 0, 'custom node shows badge-uncfg');
    assert.ok(html.indexOf('op_company_custom87') >= 0);
    assert.ok(REG.isCodeConfigured('op_company_view'));
    assert.ok(!REG.isCodeConfigured('op_company_custom87'));
    await API.deleteMenu(custom.id);
  });
});
