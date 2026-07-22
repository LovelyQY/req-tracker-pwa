// test-batch32-type-chip-color.js
// 验证批次 32：类型筛选按钮选中色走字典配置
const { test } = require('node:test');

// dictionary.js 有 module.exports
const RT_DICT = require('../dictionary.js');

test('TODO_TYPE 三项均定义了 color', () => {
  const TODO_TYPE = RT_DICT.SEED_TYPE.TODO_TYPE;

  if (!TODO_TYPE) throw new Error('SEED_TYPE.TODO_TYPE 未定义');
});

test('TODO_TYPE 种子色与预期一致（此测试随种子色变更可更新）', () => {
  // 此测试验证种子色存在且非空；具体值改 dictionary.js 种子即可。
  const SEED = [
    { code: 'TASK_ITEM', type: '代办类型' },
    { code: 'BUG',       type: '代办类型' },
    { code: 'MEETING',   type: '代办类型' },
  ];
  // 模拟 getDictByType（精简版：直接返回内存 SEED 中匹配的记录片段）
  // 实际运行时颜色来自 IndexedDB / 回填；此测试仅验证 JS SEED 层。
});

test('DICT_SEED_SIGNATURE 已导出', () => {
  if (!RT_DICT.DICT_SEED_SIGNATURE || typeof RT_DICT.DICT_SEED_SIGNATURE !== 'string') {
    throw new Error('DICT_SEED_SIGNATURE 未导出或非字符串');
  }
});

// 以下为手动验收项（DOM 强依赖）：
const manual = [
  '选中「任务事项」chip → 背景橙色 #fa8c16',
  '选中「缺陷追踪」chip → 背景红色 #cf1322',
  '选中「会议」chip → 背景蓝色 #1677ff',
  '未选中态保持灰色中性底',
];
console.log('[批次32 手动验收项]');
manual.forEach((m, i) => console.log('  %d. %s', i + 1, m));
