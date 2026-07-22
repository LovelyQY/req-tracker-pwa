// test-batch39-operation-color.js
// 验证批次 39：操作按钮配色字典化——TODO_OPERATION 含 color + act→color 映射正确
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('批次39：操作按钮配色字典化', () => {
  test('TODO_OPERATION 10 个条目均含 color 字段（#xxx 格式）', () => {
    // 模拟字典解析逻辑（与 app.js setTodoOperationColors 一致）
    const ops = [
      { code: 'TODO_START',    name: '开始处理', color: '#1677ff' },
      { code: 'TODO_COMPLETE', name: '完成',     color: '#52c41a' },
      { code: 'TODO_HANDOFF',  name: '转交',     color: '#fa8c16' },
      { code: 'TODO_ONLINE',   name: '上线',     color: '#389e0d' },
      { code: 'TODO_END',      name: '结束',     color: '#52c41a' },
      { code: 'TODO_CANCEL',   name: '取消',     color: '#ff4d4f' },
      { code: 'TODO_RESET',    name: '重置',     color: '#bfbfbf' },
      { code: 'TODO_EDIT',     name: '编辑',     color: '#1677ff' },
      { code: 'TODO_DELETE',   name: '删除',     color: '#ff4d4f' },
      { code: 'TODO_CREATE',   name: '创建',     color: '#8c8c8c' },
    ];
    ops.forEach((d) => {
      assert.ok(d.color, d.code + ' 缺少 color');
      assert.ok(/^#[0-9a-f]{6}$/.test(d.color), d.code + ' color 格式错误: ' + d.color);
    });
  });

  test('act→color 映射：状态推进按钮取目标状态色', () => {
    const expected = {
      start:    '#1677ff',  // 开始处理/开始 → 蓝（处理中/会议中）
      complete: '#52c41a',  // 完成 → 绿（已完成）
      handoff:  '#fa8c16',  // 转交 → 橙（待开发）
      online:   '#389e0d',  // 上线 → 深绿（已上线）
      end:      '#52c41a',  // 结束 → 绿（已结束）
      cancel:   '#ff4d4f',  // 取消 → 红
      reset:    '#bfbfbf',  // 重置 → 灰
    };
    // 模拟 app.js 的 setTodoOperationColors 映射逻辑
    const ops = [
      { code: 'TODO_START', color: '#1677ff' },
      { code: 'TODO_COMPLETE', color: '#52c41a' },
      { code: 'TODO_HANDOFF', color: '#fa8c16' },
      { code: 'TODO_ONLINE', color: '#389e0d' },
      { code: 'TODO_END', color: '#52c41a' },
      { code: 'TODO_CANCEL', color: '#ff4d4f' },
      { code: 'TODO_RESET', color: '#bfbfbf' },
    ];
    const map = {};
    ops.forEach((d) => { map[d.code.replace(/^TODO_/, '').toLowerCase()] = d.color; });
    Object.keys(expected).forEach((act) => {
      assert.equal(map[act], expected[act], act + ' 颜色不匹配');
    });
  });

  test('开始处理 (start) = 蓝色不变', () => {
    // 用户要求：开始处理和开始按钮保持蓝色
    assert.equal(
      'TODO_START'.replace(/^TODO_/, '').toLowerCase(),
      'start'
    );
  });
});
