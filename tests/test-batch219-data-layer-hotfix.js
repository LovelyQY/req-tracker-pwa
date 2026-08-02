// test-batch219-data-layer-hotfix.js
// Batch 219（v1.4.24）数据层热修：
//  ① 权限页 IndexedDB 事务报错：updateMenu 在只读校验阶段跨越异步（checkMenuCodeUnique / queryByIndex /
//     getAllMenus）后，原 readwrite 事务已 auto-commit，再 put 抛「transaction has finished」。
//     修复方式：所有校验用只读事务 / 独立事务，校验完成后再开一个新的 readwrite 事务一次性写入。
//  ② 字典页不显示数据：dictionary.html 缺 i18n.js 致 t() 未定义、render() 崩溃 → 补 i18n.js 引用；
//     seedDict 增强错误上报与回退（数据层保证 seedDict 幂等、getAllDict 可读）。
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('fake-indexeddb/auto');

// ============ 权限 DAL 装配 ============
globalThis.RT_DB = require('../db.js');
globalThis.RT_DB.registerStore('users', {
  keyPath: 'id',
  indexes: [
    { name: 'account', path: 'account' },
    { name: 'departmentId', path: 'departmentId' }
  ]
});
globalThis.RT_USERS = {
  getAllUsers: async function () { return []; },
  getUser: async function () { return null; }
};
globalThis.getCurrentUserAccount = function () { return 'test-operator'; };
const RT_PERMISSIONS = require('../permissions.js');

// ============ 字典 DAL 装配 ============
const RT_DICT = require('../dictionary.js');

describe('批次219 ①：updateMenu 事务不再 auto-commit', () => {
  test('修改 parentCode（跨事务校验）后能成功写入并持久化', async () => {
    const modA = await RT_PERMISSIONS.createMenu({ menuCode: 'mod_219_a', menuName: '模块A', nodeType: 'module' }, 'system');
    const pageP = await RT_PERMISSIONS.createMenu({ menuCode: 'page_219_p', menuName: '页面P', nodeType: 'page', parentCode: 'mod_219_a' }, 'system');
    const pageQ = await RT_PERMISSIONS.createMenu({ menuCode: 'page_219_q', menuName: '页面Q', nodeType: 'page', parentCode: 'mod_219_a' }, 'system');
    const child = await RT_PERMISSIONS.createMenu({ menuCode: 'op_219_x', menuName: '操作X', nodeType: 'op', parentCode: 'page_219_p' }, 'system');

    // 关键：改 parentCode 会触发 queryByIndex + getAllMenus 跨事务异步校验，
    // 修复前原 readwrite 事务已提交，store.put 抛「transaction has finished」。
    const updated = await RT_PERMISSIONS.updateMenu(child.id, { parentCode: 'page_219_q' }, 'admin');
    assert.equal(updated.parentCode, 'page_219_q');
    assert.equal(updated.updatedBy, 'admin');

    const reread = await RT_PERMISSIONS.getMenu(child.id);
    assert.equal(reread.parentCode, 'page_219_q', '改父节点应已持久化');
  });

  test('修改 menuCode（唯一性校验）后能成功写入并持久化', async () => {
    const mod = await RT_PERMISSIONS.createMenu({ menuCode: 'mod_219_rename', menuName: '待改名', nodeType: 'module' }, 'system');
    const updated = await RT_PERMISSIONS.updateMenu(mod.id, { menuCode: 'mod_219_renamed' }, 'admin');
    assert.equal(updated.menuCode, 'mod_219_renamed');

    const byOld = await RT_PERMISSIONS.getMenuByCode('mod_219_rename');
    assert.equal(byOld, null, '旧 code 不应再存在');
    const byNew = await RT_PERMISSIONS.getMenuByCode('mod_219_renamed');
    assert.ok(byNew, '新 code 应可查到');
  });

  test('仅改 menuName / enabled 也能成功写入', async () => {
    const m = await RT_PERMISSIONS.createMenu({ menuCode: 'op_219_name', menuName: '旧名', nodeType: 'op' }, 'system');
    const updated = await RT_PERMISSIONS.updateMenu(m.id, { menuName: '新名', enabled: false }, 'admin');
    assert.equal(updated.menuName, '新名');
    assert.equal(updated.enabled, false);
    const reread = await RT_PERMISSIONS.getMenu(m.id);
    assert.equal(reread.menuName, '新名');
    assert.equal(reread.enabled, false);
  });

  test('改 menuCode 为已存在值仍报「菜单编号已存在」且不污染数据', async () => {
    await RT_PERMISSIONS.createMenu({ menuCode: 'mod_219_exist', menuName: '已存在', nodeType: 'page' }, 'system');
    const m = await RT_PERMISSIONS.createMenu({ menuCode: 'mod_219_other', menuName: '另一个', nodeType: 'page' }, 'system');
    await assert.rejects(
      () => RT_PERMISSIONS.updateMenu(m.id, { menuCode: 'mod_219_exist' }, 'admin'),
      /菜单编号已存在/
    );
    const stillOther = await RT_PERMISSIONS.getMenuByCode('mod_219_other');
    assert.ok(stillOther, '校验失败不应改动原记录');
  });
});

describe('批次219 ②：字典数据层（seedDict 幂等 + getAllDict 可读）', () => {
  test('seedDict 幂等播种，store 被填充且可查', async () => {
    const res1 = await RT_DICT.seedDict('system');
    assert.ok(res1.count > 0, '首次播种应写入系统枚举');
    const all = await RT_DICT.getAllDict();
    assert.ok(all.length > 0, 'getAllDict 应返回数据');
    assert.equal(all.length, res1.count, 'getAllDict 数量应与播种数量一致');
  });

  test('重复播种不翻倍（幂等）', async () => {
    const first = await RT_DICT.seedDict('system');
    const second = await RT_DICT.seedDict('system');
    assert.equal(second.count, first.count, '重复播种数量应不变');
    const all = await RT_DICT.getAllDict();
    assert.equal(all.length, first.count, 'store 内记录不应翻倍');
  });

  test('getDictByType 按类型过滤', async () => {
    await RT_DICT.seedDict('system');
    const statuses = await RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TASK_STATUS);
    assert.ok(statuses.length >= 5, '任务状态应有 5 条');
    statuses.forEach(function (r) { assert.equal(r.type, RT_DICT.SEED_TYPE.TASK_STATUS); });
  });

  test('dictionary.js 已注册 dict store（懒注册生效）', async () => {
    const db = await globalThis.RT_DB.openDB();
    assert.ok(db.objectStoreNames.contains('dict'), 'dict store 应已注册');
    db.close();
  });
});

describe('批次219 ②：dictionary.html 已引入 i18n.js（修复 t() 未定义）', () => {
  test('dictionary.html 包含 i18n.js 脚本引用', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'dictionary.html'), 'utf8');
    assert.ok(/i18n\.js(\?v=[0-9.]+)?/.test(html), 'dictionary.html 必须引入 i18n.js，否则 t() 未定义导致列表不渲染');
    assert.ok(/src="i18n\.js/.test(html), 'i18n.js 应以 script src 形式引入');
  });
});
