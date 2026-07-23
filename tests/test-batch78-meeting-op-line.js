// test-batch78-meeting-op-line.js
// 验证批次 78：移除 getStatusOpLine 中「会议特判」，会议随正常流程逻辑返回
// 正确的 { time, opCode }（创建/开始/结束/取消），不再硬编码 meetingTime + TODO_START。
// getStatusOpLine 为纯函数，不依赖 IndexedDB，模块加载处 RT_DB 调用已做空值守卫，故无需 fake-indexeddb。
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const RT_TODO_LIFECYCLES = require('../todo-lifecycles.js');
const getStatusOpLine = RT_TODO_LIFECYCLES.getStatusOpLine;

// 构造一条流转记录
function lc(todoId, statusCode, operationCode, operateTime) {
  return { id: todoId + '-' + operationCode, todoId: todoId, statusCode: statusCode, operationCode: operationCode, operator: 'u1', operateTime: operateTime };
}

describe('批次78：会议随流程逻辑返回正确 opCode', () => {
  test('会议「未开始」(MT_NOT_STARTED)：返回创建时间 / TODO_CREATE（非硬编码会议开始时间）', () => {
    const todo = { id: 'm1', typeCode: 'MEETING', statusCode: 'MT_NOT_STARTED', createdAt: 1000, meetingTime: 9999 };
    const list = [lc('m1', 'MT_NOT_STARTED', 'TODO_CREATE', 1000)];
    const line = getStatusOpLine(todo, list);
    assert.ok(line, '应返回单行');
    assert.equal(line.opCode, 'TODO_CREATE', '初始态应为创建');
    assert.equal(line.time, 1000, '时间应取创建时间，而非 meetingTime');
  });

  test('会议「会议中」(MT_IN_PROGRESS)：返回会议开始时间 / TODO_START', () => {
    const todo = { id: 'm2', typeCode: 'MEETING', statusCode: 'MT_IN_PROGRESS', createdAt: 1000, meetingTime: 9999 };
    const list = [
      lc('m2', 'MT_NOT_STARTED', 'TODO_CREATE', 1000),
      lc('m2', 'MT_IN_PROGRESS', 'TODO_START', 2000),
    ];
    const line = getStatusOpLine(todo, list);
    assert.ok(line, '应返回单行');
    assert.equal(line.opCode, 'TODO_START', '应为开始处理');
    assert.equal(line.time, 2000, '时间应取开始处理操作的 operateTime');
  });

  test('会议「已结束」(MT_ENDED)：返回会议结束时间 / TODO_END', () => {
    const todo = { id: 'm3', typeCode: 'MEETING', statusCode: 'MT_ENDED', createdAt: 1000, meetingTime: 9999 };
    const list = [
      lc('m3', 'MT_NOT_STARTED', 'TODO_CREATE', 1000),
      lc('m3', 'MT_IN_PROGRESS', 'TODO_START', 2000),
      lc('m3', 'MT_ENDED', 'TODO_END', 3000),
    ];
    const line = getStatusOpLine(todo, list);
    assert.ok(line, '应返回单行');
    assert.equal(line.opCode, 'TODO_END', '应为结束');
    assert.equal(line.time, 3000, '时间应取结束操作的 operateTime');
  });

  test('会议「已取消」(MT_CANCELLED)：返回会议取消时间 / TODO_CANCEL', () => {
    const todo = { id: 'm4', typeCode: 'MEETING', statusCode: 'MT_CANCELLED', createdAt: 1000, meetingTime: 9999 };
    const list = [
      lc('m4', 'MT_NOT_STARTED', 'TODO_CREATE', 1000),
      lc('m4', 'MT_IN_PROGRESS', 'TODO_START', 2000),
      lc('m4', 'MT_CANCELLED', 'TODO_CANCEL', 4000),
    ];
    const line = getStatusOpLine(todo, list);
    assert.ok(line, '应返回单行');
    assert.equal(line.opCode, 'TODO_CANCEL', '应为取消');
    assert.equal(line.time, 4000, '时间应取取消操作的 operateTime');
  });

  test('会议无任何流水：兜底返回创建时间 / TODO_CREATE', () => {
    const todo = { id: 'm5', typeCode: 'MEETING', statusCode: 'MT_NOT_STARTED', createdAt: 5000, meetingTime: 9999 };
    const line = getStatusOpLine(todo, []);
    assert.ok(line, '应返回单行');
    assert.equal(line.opCode, 'TODO_CREATE', '兜底应为创建');
    assert.equal(line.time, 5000, '兜底时间应取 createdAt');
  });

  test('回归：普通待办「处理中」(TD_DOING)：返回开始处理时间 / TODO_START', () => {
    const todo = { id: 't1', typeCode: 'TODO', statusCode: 'TD_DOING', createdAt: 1000 };
    const list = [
      lc('t1', 'TD_TODO', 'TODO_CREATE', 1000),
      lc('t1', 'TD_DOING', 'TODO_START', 2000),
    ];
    const line = getStatusOpLine(todo, list);
    assert.ok(line);
    assert.equal(line.opCode, 'TODO_START');
    assert.equal(line.time, 2000);
  });

  test('回归：会议不再输出硬编码的 meetingTime 作为时间值', () => {
    const todo = { id: 'm6', typeCode: 'MEETING', statusCode: 'MT_IN_PROGRESS', createdAt: 1000, meetingTime: 9999 };
    const list = [
      lc('m6', 'MT_NOT_STARTED', 'TODO_CREATE', 1000),
      lc('m6', 'MT_IN_PROGRESS', 'TODO_START', 2000),
    ];
    const line = getStatusOpLine(todo, list);
    assert.notEqual(line.time, 9999, '绝不应使用 meetingTime 作为灰时间值');
  });
});
