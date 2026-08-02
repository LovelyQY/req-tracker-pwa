// test-batch86-role.js
// Verify Batch 86: role-management page logic (permission tree helpers).
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
require('../role.js');
const PAGE = globalThis.RT_ROLE_PAGE;

// 浏览器环境 escapeHtml 由 config.js 挂全局；测试缺它导致 buildTreeHtml 报 escapeHtml is not defined。
// 复刻 config.js (批次120) 实现，保证与线上一致。
globalThis.escapeHtml = function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
};

function buildTree() {
  return API.seedMenusFromRegistry('system').then(function () { return API.getAllMenus(); })
    .then(function (menus) { return API.buildMenuTree(menus || []); });
}

function leafTotal(map) {
  var all = {};
  Object.keys(map).forEach(function (k) { map[k].forEach(function (c) { all[c] = 1; }); });
  return Object.keys(all).length;
}

describe('Batch86: role management page logic', () => {
  describe('computeLeaves: node -> descendant op codes', () => {
    test('module node contains all descendant ops', async () => {
      var tree = await buildTree();
      var map = {};
      PAGE.computeLeaves(tree, map);
      // 基础数据现为「设置」下的分组页（page_basic_data），其下含公司/部门等全部 op
      assert.ok(map['page_basic_data'].indexOf('op_company_view') >= 0);
      assert.ok(map['page_basic_data'].indexOf('op_company_delete') >= 0);
      assert.ok(map['page_basic_data'].indexOf('op_dept_view') >= 0);
    });
    test('page node contains only its own ops (no cross-page leak)', async () => {
      var tree = await buildTree();
      var map = {};
      PAGE.computeLeaves(tree, map);
      assert.ok(map['page_company'].indexOf('op_company_view') >= 0);
      assert.ok(map['page_company'].indexOf('op_dept_view') < 0);
      assert.deepEqual(map['op_company_view'], ['op_company_view']);
    });
    test('distinct op leaves total = 107 (registry op count, 批次 207 #14 + 批次214 新增流程审批 3 操作 + 批次216 新增通知 1 操作)', async () => {
      var tree = await buildTree();
      var map = {};
      PAGE.computeLeaves(tree, map);
      assert.equal(leafTotal(map), 107);
    });
  });

  describe('buildTreeHtml: tree rendering', () => {
    test('renders module caret + op leaf data-type + known op code', async () => {
      var tree = await buildTree();
      var html = PAGE.buildTreeHtml(tree);
      assert.ok(html.indexOf('data-type="module"') >= 0);
      assert.ok(html.indexOf('data-type="op"') >= 0);
      assert.ok(html.indexOf('tcaret" data-code="mod_settings"') >= 0);
      assert.ok(html.indexOf('op_company_view') >= 0);
    });
    test('unconfigured op node gets the disabled badge', async () => {
      var fakeTree = [{ menuCode: 'op_zzz_unknown', name: 'Unknown', type: 'op', children: [] }];
      var html = PAGE.buildTreeHtml(fakeTree);
      assert.ok(html.indexOf('perm-badge') >= 0);
    });
  });

  describe('toggleNode: checkbox aggregation', () => {
    test('toggle module on -> all descendant ops selected; off -> cleared', async () => {
      var tree = await buildTree();
      var map = {};
      PAGE.computeLeaves(tree, map);
      var sel = new Set();
      PAGE.toggleNode('page_basic_data', 'page', true, sel, map);
      assert.ok(sel.size > 0);
      assert.ok(sel.has('op_company_view'));
      assert.ok(sel.has('op_dept_view'));
      PAGE.toggleNode('page_basic_data', 'page', false, sel, map);
      assert.equal(sel.size, 0);
    });
    test('toggle single op -> only that leaf', async () => {
      var tree = await buildTree();
      var map = {};
      PAGE.computeLeaves(tree, map);
      var sel = new Set();
      PAGE.toggleNode('op_company_view', 'op', true, sel, map);
      assert.deepEqual(Array.from(sel), ['op_company_view']);
    });
  });
});
