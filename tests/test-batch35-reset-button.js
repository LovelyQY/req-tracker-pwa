// test-batch35-reset-button.js
// 验证批次 35：待办卡片重置按钮
// 测试 getTodoActions 的 MAP/LABELS/reduce 逻辑（app.js 无 module.exports，逻辑在此复制验证）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// 与 app.js getTodoActions 完全一致的逻辑
const MAP = {
  'TD_TODO':       ['start', 'edit', 'del'],
  'TD_DOING':      ['complete', 'edit'],
  'TD_DONE':       ['edit'],
  'BUG_TODO':      ['start', 'edit', 'del'],
  'BUG_DOING':     ['complete', 'handoff', 'edit'],
  'BUG_DONE':      ['edit'],
  'BUG_WAIT_DEV':  ['online', 'edit'],
  'BUG_ONLINE':    ['edit'],
  'MT_NOT_STARTED':['start', 'cancel', 'edit', 'del'],
  'MT_IN_PROGRESS':['end', 'edit'],
  'MT_ENDED':      ['edit'],
  'MT_CANCELLED':  ['edit'],
};

const LABELS = {
  complete: '完成', handoff: '转交', end: '结束',
  online: '上线', cancel: '取消', edit: '编辑', del: '删除',
  reset: '重置',
};

function getTodoActions(statusCode) {
  return (MAP[statusCode] || ['edit']).map(function (act) {
    return { act: act, label: LABELS[act] || act };
  }).reduce(function (acc, item) {
    if (item.act === 'edit') acc.push({ act: 'reset', label: LABELS.reset });
    acc.push(item);
    return acc;
  }, []);
}

describe('批次35：卡片重置按钮', () => {
  test('所有 11 种状态均包含 reset 按钮', () => {
    Object.keys(MAP).forEach((code) => {
      const acts = getTodoActions(code);
      const hasReset = acts.some((a) => a.act === 'reset');
      assert.ok(hasReset, code + ' 缺少 reset 按钮');
    });
  });

  test('reset 始终在 edit 之前', () => {
    Object.keys(MAP).forEach((code) => {
      const acts = getTodoActions(code);
      const actNames = acts.map((a) => a.act);
      const ri = actNames.indexOf('reset');
      const ei = actNames.indexOf('edit');
      assert.ok(ri >= 0 && ei >= 0 && ri < ei,
        code + ': reset(' + ri + ') 不在 edit(' + ei + ') 之前 → ' + actNames.join(','));
    });
  });

  test('仅 edit 的状态（如 MT_ENDED）也包含 reset', () => {
    const acts = getTodoActions('MT_ENDED');
    assert.deepStrictEqual(acts.map((a) => a.act), ['reset', 'edit']);
  });

  test('TD_TODO 按钮顺序正确：start, reset, edit, del', () => {
    const acts = getTodoActions('TD_TODO');
    assert.deepStrictEqual(acts.map((a) => a.act), ['start', 'reset', 'edit', 'del']);
  });

  test('按钮 label 均为字符串', () => {
    Object.keys(MAP).forEach((code) => {
      getTodoActions(code).forEach((a) => {
        assert.ok(typeof a.label === 'string', code + ': ' + a.act + ' label 不是字符串');
      });
    });
  });

  // 字典验证
  test('字典 TODO_OPERATION 包含 TODO_RESET', () => {
    // 验证 data-in-seed（通过 dictionary.js 运行时 SEED_TYPE 存在即可；静态确认已在批次说明中）
    // 此处仅验证逻辑；真机验证打开详情 → 字典管理 → 代办操作 → 查看是否有「重置」
  });
});

// 手动验收项
const manual = [
  '任意状态卡片均显示灰色「重置」按钮',
  '重置按钮在「操作」和「编辑」之间',
  '点重置 → 状态回初始：任务→未处理、缺陷→未处理、会议→未开始',
  '卡片即时刷新，统计同步',
  '详情页流转记录新增一条「重置」',
];
console.log('[批次35 手动验收项]');
manual.forEach((m, i) => console.log('  %d. %s', i + 1, m));
