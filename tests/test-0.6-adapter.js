// test-0.6-adapter.js —— 阶段 0.6 云适配层单测
// 验证：wrapWrite 包裹逻辑 / wireAll 集成 / 写操作后入同步队列
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

// Node 中 globalThis 即 root；数据模块 / 适配层均挂 globalThis
globalThis.RT_DB = require('../db.js');
globalThis.RT_CONFIG = require('../config.js');

// Mock RT_SYNC：enqueue 记录调用，不触发真实 flush
const syncCalls = [];
globalThis.RT_SYNC = {
  enqueue: function (storeGlobal, id, op) {
    syncCalls.push({ storeGlobal, id: String(id), op });
  },
  getQueueLength: function () { return 0; },
  isBusy: function () { return false; },
  onLine: function () { return true; },
};

// 加载被测模块（companies 真实模块 + adapter）
require('../companies.js');
const ADAPTER = require('../cloud-adapter.js');

describe('阶段 0.6 – wrapWrite（纯逻辑，无 DB）', () => {
  test('包裹 create：resolve 后调用 enqueue(storeGlobal, rec.id, put)', async () => {
    syncCalls.length = 0;
    const fake = {
      createFoo: function (data) {
        return Promise.resolve({ id: 'abc-123', name: data.name });
      }
    };
    ADAPTER.wrapWrite(fake, 'RT_FAKE', { create: ['createFoo'], delete: [] });
    await fake.createFoo({ name: 'test' });
    assert.equal(syncCalls.length, 1);
    assert.equal(syncCalls[0].storeGlobal, 'RT_FAKE');
    assert.equal(syncCalls[0].id, 'abc-123');
    assert.equal(syncCalls[0].op, 'put');
  });

  test('包裹 delete：resolve 后调用 enqueue(storeGlobal, args[0], delete)', async () => {
    syncCalls.length = 0;
    const fake = {
      deleteFoo: function (id) {
        return Promise.resolve(true);
      }
    };
    ADAPTER.wrapWrite(fake, 'RT_FAKE', { create: [], delete: ['deleteFoo'] });
    await fake.deleteFoo('del-456');
    assert.equal(syncCalls.length, 1);
    assert.equal(syncCalls[0].storeGlobal, 'RT_FAKE');
    assert.equal(syncCalls[0].id, 'del-456');
    assert.equal(syncCalls[0].op, 'delete');
  });

  test('包裹不碍原方法拒绝', async () => {
    syncCalls.length = 0;
    const fake = {
      broken: function () {
        return Promise.reject(new Error('fail'));
      }
    };
    ADAPTER.wrapWrite(fake, 'RT_FAKE', { create: ['broken'], delete: [] });
    await assert.rejects(() => fake.broken(), { message: 'fail' });
    assert.equal(syncCalls.length, 0); // 拒绝不入队
  });

  test('包裹非函数跳过，不抛错', () => {
    const fake = { notafunc: 42 };
    ADAPTER.wrapWrite(fake, 'RT_FAKE', { create: ['notafunc'], delete: [] });
    assert.equal(typeof fake.notafunc, 'number');
  });
});

describe('阶段 0.6 – wireAll 集成（真实 companies 模块 + fake-indexeddb）', () => {
  before(async () => {
    // 确保 companies store 已注册
    syncCalls.length = 0;
  });

  test('wireAll 包裹真实 RT_COMPANIES，创建后入队', async () => {
    syncCalls.length = 0;
    // wireAll 幂等 — 首次真包裹
    ADAPTER.wireAll();
    const rec = await globalThis.RT_COMPANIES.createCompany(
      { companyName: '测试0.6公司', companyType: '总公司', companyCode: 'T06' },
      'test'
    );
    assert.ok(rec && rec.id);
    assert.ok(syncCalls.length >= 1, '应至少有一次 enqueue（可能 crud-factory 也触发）');
    const last = syncCalls[syncCalls.length - 1];
    assert.equal(last.storeGlobal, 'RT_COMPANIES');
    assert.equal(last.id, rec.id);
    assert.equal(last.op, 'put');
  });

  test('wireAll 后删除也入队', async () => {
    // 先建再删
    syncCalls.length = 0;
    const rec = await globalThis.RT_COMPANIES.createCompany(
      { companyName: '测试0.6公司D', companyType: '总公司', companyCode: 'T6D' },
      'test'
    );
    syncCalls.length = 0; // 清掉创建入队
    await globalThis.RT_COMPANIES.deleteCompany(rec.id);
    assert.ok(syncCalls.length >= 1, '删除应入队');
    const del = syncCalls.find(c => c.op === 'delete');
    assert.ok(del);
    assert.equal(del.storeGlobal, 'RT_COMPANIES');
    assert.equal(del.id, rec.id);
  });

  test('isWired 返回 true 且二次 wireAll 不再重复包裹', () => {
    assert.equal(ADAPTER.isWired(), true);
    syncCalls.length = 0;
    ADAPTER.wireAll(); // 二次调用
    assert.equal(syncCalls.length, 0); // 不应再次包裹导致额外入队
  });

  test('WRITE_MAP 包含全部 8 个预期数据模块', () => {
    const expected = ['RT_USERS', 'RT_COMPANIES', 'RT_DEPTS', 'RT_POSITIONS',
      'RT_PROJECTS', 'RT_PROJECT_VERSIONS', 'RT_REQUIREMENT_TASKS', 'RT_TODOS'];
    expected.forEach(function (k) {
      assert.ok(ADAPTER.WRITE_MAP.hasOwnProperty(k), '缺少 ' + k);
    });
  });
});
