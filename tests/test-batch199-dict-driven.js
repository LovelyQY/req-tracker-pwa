// test-batch199-dict-driven.js
// 验证批次 199：字典驱动化改造（#28）
//   1) statusName 改为字典驱动（移除硬编码映射，见 dict-init.js）——结构性断言
//   2) app.js FALLBACK_* 收敛为 code-only 极简兜底 + 新增 ensureStatuses() ——结构性断言
//   3) 字典条目 disabled 字段：种子默认 false、消费侧 getDictByType 默认过滤、getAllDict 不过滤
//   4) SEED_TYPE_FUNCTIONAL 标记功能类/展示类分类，供「非功能子项新增即展现」语义显式化
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
require('fake-indexeddb/auto');

globalThis.RT_DB = require('../db.js');

// 加载真实 dictionary.js（会注册 store 并设置 globalThis.RT_DICT）
const RT_DICT = require('../dictionary.js');

// 直接写入一条 dict 记录（用于模拟「开发端禁用」条目）
function putRecord(rec) {
  return globalThis.RT_DB.openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction('dict', 'readwrite');
      const req = tx.objectStore('dict').put(rec);
      req.onsuccess = function () { db.close(); resolve(); };
      req.onerror = function () { db.close(); reject(req.error); };
    });
  });
}

describe('批次199：字典驱动化改造', () => {
  // ---------- 结构性断言（无需 DOM / IndexedDB）----------
  const dictInitSrc = require('fs').readFileSync(path.join(__dirname, '..', 'dict-init.js'), 'utf8');
  const appSrc = require('fs').readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  test('statusName 不再硬编码状态名映射（读 STATUS_CODE_TO_NAME）', () => {
    assert.ok(!/const s = \{\s*TODO:\s*['"]待开发/.test(dictInitSrc),
      'dict-init.js 的 statusName 不应再硬编码 const s 状态名映射');
    assert.ok(/STATUS_CODE_TO_NAME\[code\]\s*\|\|/.test(dictInitSrc),
      'dict-init.js 的 statusName 应改为读取 STATUS_CODE_TO_NAME 映射');
    assert.ok(/function setStatusNameMap/.test(dictInitSrc),
      'dict-init.js 应提供 setStatusNameMap 供 ensureStatuses 填充映射');
  });

  test('app.js FALLBACK_* 收敛为 code-only 极简兜底（不与字典重复维护中文名/色）', () => {
    assert.ok(!appSrc.includes("{ code: 'REQ', name:"),
      'FALLBACK_TASK_TYPES 不应再含中文名「需求」（已收敛为仅 code）');
    assert.ok(!appSrc.includes("{ code: 'TASK_ITEM', name:"),
      'FALLBACK_TODO_TYPES 不应再含中文名「任务事项」（已收敛为仅 code）');
    assert.ok(/async function ensureStatuses\(\)/.test(appSrc),
      'app.js 应新增 ensureStatuses() 从 TASK_STATUS 填充状态名映射');
    assert.ok(/setStatusNameMap\(list\)/.test(appSrc),
      'ensureStatuses 应调用 setStatusNameMap 写入内存映射');
  });

  // ---------- 运行时断言（IndexedDB + 真实种子）----------
  test('SEED_TYPE_FUNCTIONAL 标记功能类/展示类分类', () => {
    assert.ok(RT_DICT.SEED_TYPE_FUNCTIONAL, '应导出 SEED_TYPE_FUNCTIONAL');
    // 功能类（code 参与逻辑分支）
    ['TASK_TYPE', 'TASK_STATUS', 'TODO_TYPE', 'TODO_STATUS', 'BUG_STATUS', 'MEETING_STATUS', 'TODO_OPERATION', 'TASK_OPERATION']
      .forEach(function (k) {
        assert.equal(RT_DICT.SEED_TYPE_FUNCTIONAL[k], true, '功能类 ' + k + ' 应为 true');
      });
    // 展示类（纯展示，新增子项即展现）
    ['PRIORITY', 'PROJECT_STATUS', 'EMPLOYEE_STATUS', 'POSITION_LEVEL']
      .forEach(function (k) {
        assert.notEqual(RT_DICT.SEED_TYPE_FUNCTIONAL[k], true, '展示类 ' + k + ' 不应标记为功能类');
      });
  });

  test('种子默认 disabled=false；消费侧 getDictByType 默认过滤禁用项', async () => {
    await RT_DICT.seedDict('system');

    const statuses = await RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TASK_STATUS);
    assert.equal(statuses.length, 5, 'TASK_STATUS 应有 5 个种子（均未禁用）');
    statuses.forEach(function (s) {
      assert.notEqual(s.disabled, true, '种子不应为 disabled: ' + s.code);
    });

    // 注入一条被开发端禁用的 TASK_STATUS 子项
    await putRecord({
      id: 'test-disabled-status',
      code: 'PAUSED',
      type: RT_DICT.SEED_TYPE.TASK_STATUS,
      name: '暂停中',
      createdBy: 'system',
      createdAt: Date.now(),
      disabled: true
    });

    const filtered = await RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TASK_STATUS);
    assert.equal(filtered.length, 5, '默认 getDictByType 应过滤掉 disabled 的 PAUSED');
    assert.ok(!filtered.some(function (r) { return r.code === 'PAUSED'; }), 'PAUSED 不应出现在消费侧结果');

    const all = await RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TASK_STATUS, true);
    assert.equal(all.length, 6, 'includeDisabled=true 应包含被禁用的 PAUSED');

    const full = await RT_DICT.getAllDict();
    assert.ok(full.some(function (r) { return r.code === 'PAUSED' && r.disabled === true; }),
      'getAllDict 应保留禁用条目（字典管理页可查阅）');
  });

  test('消费侧下拉（getDictByType）默认不含禁用项；字典页（getAllDict）含全部', async () => {
    // 注入一条被禁用的 PROJECT_STATUS 子项
    await putRecord({
      id: 'test-disabled-project',
      code: 'FROZEN',
      type: RT_DICT.SEED_TYPE.PROJECT_STATUS,
      name: '已冻结',
      createdBy: 'system',
      createdAt: Date.now(),
      disabled: true
    });

    const projFiltered = await RT_DICT.getDictByType(RT_DICT.SEED_TYPE.PROJECT_STATUS);
    assert.ok(!projFiltered.some(function (r) { return r.code === 'FROZEN'; }),
      '项目状态下拉不应包含被禁用的 FROZEN');

    const projAll = await RT_DICT.getAllDict();
    assert.ok(projAll.some(function (r) { return r.code === 'FROZEN' && r.disabled === true; }),
      '字典管理页应能查阅被禁用的 FROZEN');
  });
});
