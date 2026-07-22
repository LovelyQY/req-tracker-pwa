// test-batch33-lifecycle-write.js
// 验证批次 33：流转记录写入——字典校验降级非阻塞，核心 CRUD 正常
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

// 先设置全局依赖，再 require 被测模块
globalThis.RT_DB = require('../db.js');

// 注入 SEED_TYPE（供 todo-lifecycles.js 内部的 assertDictCode 使用）
globalThis.RT_DICT = {
  SEED_TYPE: {
    TODO_OPERATION: '代办操作',
    TODO_STATUS: '代办事项状态',
    BUG_STATUS: '缺陷追踪状态',
    MEETING_STATUS: '会议状态',
  },
  // 模拟 getDictByType：返回包含测试所需 code 的字典列表
  getDictByType: async function (type) {
    const all = {
      '代办操作': [
        { code: 'TODO_CREATE', name: '创建' },
        { code: 'TODO_START', name: '开始处理' },
        { code: 'TODO_COMPLETE', name: '完成' },
        { code: 'TODO_END', name: '结束' },
        { code: 'TODO_CANCEL', name: '取消' },
        { code: 'TODO_RESET', name: '重置' },
      ],
      '代办事项状态': [
        { code: 'TD_TODO', name: '未处理', color: '#8c8c8c' },
        { code: 'TD_DOING', name: '处理中', color: '#1677ff' },
        { code: 'TD_DONE', name: '已完成', color: '#52c41a' },
      ],
      '缺陷追踪状态': [
        { code: 'BUG_TODO', name: '未处理' },
        { code: 'BUG_DOING', name: '处理中' },
      ],
      '会议状态': [
        { code: 'MT_NOT_STARTED', name: '未开始' },
        { code: 'MT_ENDED', name: '已结束' },
        { code: 'MT_CANCELLED', name: '已取消' },
      ],
    };
    return (all[type] || []);
  },
};

globalThis.RT_TODOS = {
  getTodo: async function (id) {
    return { id: id, typeCode: 'BUG', statusCode: 'BUG_TODO' };
  },
};

const RT_TODO_LIFECYCLES = require('../todo-lifecycles.js');

describe('批次33：流转记录写入', () => {
  test('createTodoLifecycle 正常写入（非阻塞——字典校验失败不抛错）', async () => {
    // 使用不存在的 operationCode 来触发字典校验降级
    const rec = await RT_TODO_LIFECYCLES.createTodoLifecycle({
      todoId: 'test-33-1',
      statusCode: 'TD_DOING',
      operationCode: 'UNKNOWN_OPERATION_CODE',  // 字典里没有，应降级不抛错
      operator: 'u1',
      operateTime: Date.now(),
    });
    assert.ok(rec && rec.id, '即使 op code 不在字典，也应成功写入');
  });

  test('createTodoLifecycle 正常写入（正确参数）', async () => {
    const rec = await RT_TODO_LIFECYCLES.createTodoLifecycle({
      todoId: 'test-33-2',
      statusCode: 'BUG_DOING',
      operationCode: 'TODO_COMPLETE',
      operator: 'u1',
      operateTime: Date.now(),
    });
    assert.ok(rec && rec.id);
    assert.equal(rec.todoId, 'test-33-2');
    assert.equal(rec.statusCode, 'BUG_DOING');
    assert.equal(rec.operationCode, 'TODO_COMPLETE');
  });

  test('getByTodoId 可读取已写入的记录', async () => {
    const list = await RT_TODO_LIFECYCLES.getByTodoId('test-33-2');
    assert.ok(list.length >= 1, '至少有一笔记录');
    assert.equal(list[0].todoId, 'test-33-2');
  });

  test('operator 为空时校验拒绝（字段级校验仍生效）', () => {
    return RT_TODO_LIFECYCLES.createTodoLifecycle({
      todoId: 'x', statusCode: 'TD_DOING', operationCode: 'TODO_START', operator: '',
    }).then(
      () => { throw new Error('应被拒绝但未抛错'); },
      (e) => { assert.ok(e.message.includes('操作人') || e.message.includes('operator'), '应提示操作人缺失'); },
    );
  });
});
