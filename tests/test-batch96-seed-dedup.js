// test-batch96-seed-dedup.js
// 批次96+97回归：seedMenusFromRegistry 单例门控 + buildMenuTree 去重
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

globalThis.RT_DB = require('../db.js');
require('../permissions-registry.js');
const RT = require('../permissions.js');
const REG = globalThis.RT_PERM_REGISTRY_API;

globalThis.getCurrentUserAccount = function () { return 'test'; };

describe('批次96：seedMenusFromRegistry 单例门控', () => {
  before(async function () {
    await RT.seedMenusFromRegistry('system');
  });

  test('首次播种 menus 数为注册表全量', async () => {
    const menus = await RT.getAllMenus();
    const allCodes = REG.flattenRegistryCodes();
    // 每个 code 对应一条菜单记录
    assert.ok(menus.length >= allCodes.length,
      `menus(${menus.length}) 不应少于注册表(${allCodes.length})`);
  });

  test('并发调用不产生重复 — 两次并行 seed 结果 menuCode 唯一', async () => {
    // 两个并行的 seed 调用（数据已由 before 播好，此处仅验证幂等）
    const [r1, r2] = await Promise.all([
      RT.seedMenusFromRegistry('system'),
      RT.seedMenusFromRegistry('system')
    ]);
    // 幂等：两次都跳过（srs已存在）
    assert.ok(r1.created === 0, '第一次并发调用不应再创建');
    assert.ok(r2.created === 0, '第二次并发调用不应再创建');
    // 最终 menus 数不变
    const menus = await RT.getAllMenus();
    const uniqCodes = new Set(menus.map(m => m.menuCode));
    assert.equal(uniqCodes.size, menus.length, '所有 menuCode 应唯一');
  });

  test('命中时 upsert 补齐 menuName', async () => {
    const menus = await RT.getAllMenus();
    // 所有已配置的节点都应有 menuName
    for (const m of menus) {
      if (REG.isCodeConfigured(m.menuCode)) {
        const entry = REG.getRegistryEntry(m.menuCode);
        assert.ok(m.menuName, `menuCode ${m.menuCode} 的 menuName 不应为空`);
        if (entry && entry.name) {
          assert.equal(m.menuName, entry.name,
            `${m.menuCode} menuName 应等于注册表 name`);
        }
      }
    }
  });
});

describe('批次97：buildMenuTree 去重', () => {
  test('树中每个 menuCode 只出现一次', async () => {
    const menus = await RT.getAllMenus();
    const tree = RT.buildMenuTree(menus);

    function collectCodes(nodes, codes) {
      (nodes || []).forEach(n => {
        if (codes.has(n.menuCode)) throw new Error('重复 menuCode: ' + n.menuCode);
        codes.add(n.menuCode);
        if (n.children) collectCodes(n.children, codes);
      });
      return codes;
    }

    const codes = collectCodes(tree, new Set());
    assert.ok(codes.size > 0, '树应包含节点');
  });

  test('树根节点仅 module 类型', async () => {
    const menus = await RT.getAllMenus();
    const tree = RT.buildMenuTree(menus);
    for (const root of tree) {
      assert.equal(root.nodeType, 'module', `根节点 ${root.menuCode} 应为 module`);
    }
  });
});
