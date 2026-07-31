// test-0.6-media.js —— 阶段 0.6 媒体云存储单测
// 验证：resolveAvatar 链（dataURL → 本地缓存 → 云存储 → 默认）
//       dbPutImage best-effort 镜像到云存储
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

globalThis.RT_DB = require('../db.js');
globalThis.RT_CONFIG = require('../config.js');
require('../imgstore.js');
const STORAGE = require('../cloud-storage.js');
const ADAPTER = require('../cloud-adapter.js');

// 伪造 RT_CLOUD_STORAGE，用于观测 uploadMedia / resolveAvatarUrl 被调用
let cloudUploads = [];
let cloudResolves = [];
let cloudResolveMap = {}; // id -> url（模拟云存储内容）
globalThis.RT_CLOUD_STORAGE = {
  DEFAULT_PREFIX: 'media/',
  enabled: function () { return true; },
  uploadMedia: function (dataUrl, kind, id) {
    cloudUploads.push({ dataUrl, kind, id });
    cloudResolveMap[id] = 'https://cloud.example.com/' + kind + '/' + id;
    return Promise.resolve('media/' + id);
  },
  resolveAvatarUrl: function (ref) {
    cloudResolves.push(ref);
    const url = cloudResolveMap[ref];
    return Promise.resolve(url || null);
  },
  resolveUrl: function () { return Promise.resolve(null); },
  uploadAvatar: function (dataUrl, id) { return this.uploadMedia(dataUrl, 'avatar', id); },
  dataUrlToBlob: STORAGE.dataUrlToBlob,
};

describe('阶段 0.6 – resolveAvatar 链', () => {
  before(() => {
    // 应用媒体云 patch（替换 resolveAvatar + 包裹 dbPutImage）
    ADAPTER.applyMediaCloud();
    cloudUploads.length = 0;
    cloudResolves.length = 0;
    cloudResolveMap = {};
  });

  test('dataURL 原样返回（不查 DB、不查云）', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const rv = await globalThis.RT_IMGSTORE.resolveAvatar(dataUrl);
    assert.equal(rv, dataUrl);
    assert.equal(cloudResolves.length, 0, 'dataURL 不应触发云查询');
  });

  test('null/undefined 返回 null', async () => {
    assert.equal(await globalThis.RT_IMGSTORE.resolveAvatar(null), null);
    assert.equal(await globalThis.RT_IMGSTORE.resolveAvatar(), null);
  });

  test('本地存在 → 返回本地 dataUrl（不查云）', async () => {
    cloudResolves.length = 0;
    await globalThis.RT_IMGSTORE.dbPutImage({ id: 'img-0.6-1', dataUrl: 'data:local1' });
    const rv = await globalThis.RT_IMGSTORE.resolveAvatar('img-0.6-1');
    assert.equal(rv, 'data:local1');
  });

  test('本地未命中 + 云有 URL → 返回云 URL', async () => {
    cloudResolveMap['img-0.6-cloud'] = 'https://cloud.x/img-0.6-cloud';
    const rv = await globalThis.RT_IMGSTORE.resolveAvatar('img-0.6-cloud');
    assert.equal(rv, 'https://cloud.x/img-0.6-cloud');
  });

  test('本地未命中 + 云也无 → 返回 null（默认头像由调用方处理）', async () => {
    const rv = await globalThis.RT_IMGSTORE.resolveAvatar('img-never-exists');
    assert.equal(rv, null);
  });
});

describe('阶段 0.6 – dbPutImage 自动镜像云存储', () => {
  before(() => {
    cloudUploads.length = 0;
    cloudResolveMap = {};
    // applyMediaCloud 已在上面执行过，dbPutImage 已被包裹
  });

  test('dbPutImage 触发 uploadMedia（best-effort）', async () => {
    cloudUploads.length = 0;
    await globalThis.RT_IMGSTORE.dbPutImage({ id: 'img-0.6-up', dataUrl: 'data:upload', taskId: 'avatar' });
    // uploadMedia 是异步 fire-and-forget，需短暂等待
    await new Promise(function (r) { setTimeout(r, 100); });
    assert.ok(cloudUploads.length >= 1, 'dbPutImage 应触发 uploadMedia');
    const last = cloudUploads[cloudUploads.length - 1];
    assert.equal(last.id, 'img-0.6-up');
    assert.equal(last.dataUrl, 'data:upload');
  });

  test('dbPutImage 无 dataUrl 时不触发上传', async () => {
    cloudUploads.length = 0;
    await globalThis.RT_IMGSTORE.dbPutImage({ id: 'img-no-url' });
    await new Promise(function (r) { setTimeout(r, 100); });
    assert.equal(cloudUploads.length, 0);
  });

  test('dbPutImage 无 RT_CLOUD_STORAGE 时不崩溃', async () => {
    const orig = globalThis.RT_CLOUD_STORAGE;
    globalThis.RT_CLOUD_STORAGE = undefined;
    await globalThis.RT_IMGSTORE.dbPutImage({ id: 'img-safe', dataUrl: 'data:safe' });
    globalThis.RT_CLOUD_STORAGE = orig;
    // 无异常即通过
    assert.ok(true);
  });
});

describe('阶段 0.6 – cloud-storage 纯函数', () => {
  test('dataUrlToBlob 有效 dataURL 返回 Blob', () => {
    const blob = STORAGE.dataUrlToBlob('data:text/plain;base64,SGVsbG8=');
    assert.ok(blob instanceof (typeof Blob !== 'undefined' ? Blob : Object));
  });

  test('dataUrlToBlob 非法输入返回 null', () => {
    assert.equal(STORAGE.dataUrlToBlob('not a data url'), null);
    assert.equal(STORAGE.dataUrlToBlob(''), null);
    assert.equal(STORAGE.dataUrlToBlob(null), null);
  });

  test('enabled 无 RT_CLOUD 时返回 false', () => {
    const orig = globalThis.RT_CLOUD;
    globalThis.RT_CLOUD = undefined;
    assert.equal(STORAGE.enabled(), false);
    globalThis.RT_CLOUD = orig;
  });

  test('resolveAvatarUrl(null) 返回 null', async () => {
    assert.equal(await STORAGE.resolveAvatarUrl(null), null);
    assert.equal(await STORAGE.resolveAvatarUrl(''), null);
  });
});
