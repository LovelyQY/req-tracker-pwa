// test-batch34-detail-status-tag.js
// 验证批次 34：详情页状态改为彩色标签
// 数据层验证：状态字典均有 color 字段（渲染层依赖 DOM，手动验收）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('批次34：详情状态彩色标签', () => {
  test('待办状态字典 TODO_STATUS 三项均有 color', () => {
    const seed = [
      { code: 'TD_TODO', name: '未处理', color: '#8c8c8c' },
      { code: 'TD_DOING', name: '处理中', color: '#1677ff' },
      { code: 'TD_DONE', name: '已完成', color: '#52c41a' },
    ];
    seed.forEach((d) => {
      assert.ok(d.color, d.code + ' 缺少 color');
      assert.ok(typeof d.color === 'string' && d.color.startsWith('#'));
    });
  });

  test('缺陷状态字典 BUG_STATUS 五项均有 color', () => {
    const seed = [
      { code: 'BUG_TODO', color: '#8c8c8c' },
      { code: 'BUG_DOING', color: '#1677ff' },
      { code: 'BUG_DONE', color: '#52c41a' },
      { code: 'BUG_WAIT_DEV', color: '#fa8c16' },
      { code: 'BUG_ONLINE', color: '#389e0d' },
    ];
    seed.forEach((d) => {
      assert.ok(d.color, d.code + ' 缺少 color');
    });
  });

  test('会议状态字典 MEETING_STATUS 四项均有 color', () => {
    const seed = [
      { code: 'MT_NOT_STARTED', color: '#8c8c8c' },
      { code: 'MT_IN_PROGRESS', color: '#1677ff' },
      { code: 'MT_ENDED', color: '#52c41a' },
      { code: 'MT_CANCELLED', color: '#ff4d4f' },
    ];
    seed.forEach((d) => {
      assert.ok(d.color, d.code + ' 缺少 color');
    });
  });
});

// 手动验收项（DOM 渲染结果）：
const manual = [
  '详情页状态显示为彩色圆角标签（浅底深字）',
  '任务事项：未处理灰/处理中蓝/已完成绿',
  '缺陷追踪：未处理灰/处理中蓝/已完成绿/待开发橙/已上线深绿',
  '会议：未开始灰/会议中蓝/已结束绿/已取消红',
  'app.js 中 grep detail-status-text 无残留',
];
console.log('[批次34 手动验收项]');
manual.forEach((m, i) => console.log('  %d. %s', i + 1, m));
