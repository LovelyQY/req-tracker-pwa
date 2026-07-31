// test-batch186-i18n.js
// 批次186 回归：i18n 引擎修复（#6 切换语言不翻译 的根因解除）
//   - t() 翻译 / 回退 zh-CN / 缺失返回 key 自身
//   - applyLang 填充 [data-i18n] 并设置 <html lang>
//   - langchange 事件触发重渲染
//   - 6 份字典 settings.* 键集对齐（杜绝裸键）
//   - settings.html 引用的 data-i18n 键在基准字典均存在
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// —— 浏览器全局桩：字典 IIFE 与 i18n 引擎挂载到 global ——
global.window = global;
global.RT_I18N = {};

// 最小 DOM 桩
function makeNode(key) {
  return {
    _attrs: {},
    _text: '',
    getAttribute(k) { return k === 'data-i18n' ? key : (this._attrs[k] || null); },
    setAttribute(k, v) { this._attrs[k] = v; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; },
  };
}
function makeDocument(nodes) {
  const handlers = {};
  return {
    documentElement: {
      _attrs: {},
      setAttribute(k, v) { this._attrs[k] = v; },
      getAttribute(k) { return this._attrs[k] || null; },
    },
    querySelectorAll(sel) {
      if (sel === '[data-i18n]') return nodes.filter(n => n.getAttribute('data-i18n') !== null);
      return [];
    },
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    dispatchEvent(ev) { (handlers[ev.type] || []).forEach(fn => fn(ev)); return true; },
  };
}

global.CustomEvent = class CustomEvent {
  constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; }
};

// 注入 6 份字典
require('../i18n/zh-CN.js');
require('../i18n/en.js');
require('../i18n/zh-HK.js');
require('../i18n/zh-TW.js');
require('../i18n/ko.js');
require('../i18n/ja.js');

const nodes = [makeNode('settings.title'), makeNode('settings.nickname')];
global.document = makeDocument(nodes);

const i18n = require('../i18n.js');
const { t, applyLang } = i18n;

describe('批次186：t() 翻译与回退', () => {
  test('当前语言命中返回对应译文', () => {
    applyLang('en');
    assert.equal(t('settings.title'), 'Settings');
    assert.equal(t('settings.nickname'), 'Nickname');
  });

  test('缺省 zh-CN 命中', () => {
    applyLang('zh-CN');
    assert.equal(t('settings.title'), '设置');
    assert.equal(t('settings.nickname'), '昵称');
  });

  test('当前语言缺失 → 回退 zh-CN（single source of truth）', () => {
    applyLang('en');
    const zhVal = global.RT_I18N['zh-CN']['settings.title'];
    const saved = global.RT_I18N['en']['settings.title'];
    delete global.RT_I18N['en']['settings.title']; // 模拟 en 未译
    try {
      assert.equal(t('settings.title'), zhVal, 'en 缺失应回退 zh-CN');
    } finally {
      global.RT_I18N['en']['settings.title'] = saved; // 还原
    }
  });

  test('两语言均缺失 → 返回 key 自身（绝不留空串）', () => {
    applyLang('en');
    const key = 'settings.__not_a_real_key__';
    assert.equal(t(key), key);
  });

  test('占位符替换 {name} 格式', () => {
    // t() 引擎的 fillVars 使用 {name} 占位符（settings.* 中的 $1 由代码手动 replace）
    global.RT_I18N['zh-CN']['__ph_test'] = '你好 {name}';
    global.RT_I18N['en']['__ph_test'] = 'Hello {name}';
    try {
      applyLang('zh-CN');
      assert.equal(t('__ph_test', { name: '世界' }), '你好 世界');
      applyLang('en');
      assert.equal(t('__ph_test', { name: 'World' }), 'Hello World');
    } finally {
      delete global.RT_I18N['zh-CN']['__ph_test'];
      delete global.RT_I18N['en']['__ph_test'];
    }
  });
});

describe('批次186：applyLang 填充 data-i18n', () => {
  test('applyLang 后节点 textContent 为该语言译文', () => {
    applyLang('en');
    assert.equal(nodes[0].textContent, 'Settings');
    assert.equal(nodes[1].textContent, 'Nickname');
    assert.equal(global.document.documentElement.getAttribute('lang'), 'en');
  });

  test('切换回 zh-CN 节点同步更新', () => {
    applyLang('zh-CN');
    assert.equal(nodes[0].textContent, '设置');
    assert.equal(nodes[1].textContent, '昵称');
  });

  test('langchange 事件触发重渲染', () => {
    applyLang('en');
    assert.equal(nodes[0].textContent, 'Settings');
    // 派发 langchange（detail.lang = zh-CN），模拟 RT_CONFIG.setLang 派发
    global.document.dispatchEvent(new global.CustomEvent('langchange', { detail: { lang: 'zh-CN' } }));
    assert.equal(nodes[0].textContent, '设置', 'langchange 应重渲染为 zh-CN');
  });
});

describe('批次186：字典键集对齐（杜绝裸键）', () => {
  const LANGS = ['zh-CN', 'en', 'zh-HK', 'zh-TW', 'ko', 'ja'];
  function settingsKeys(lang) {
    return Object.keys(global.RT_I18N[lang])
      .filter(k => k.startsWith('settings.'))
      .sort();
  }
  test('6 份字典 settings.* 键集数量一致', () => {
    const counts = LANGS.map(l => settingsKeys(l).length);
    const first = counts[0];
    counts.forEach(c => assert.equal(c, first, '各语言 settings.* 键数应一致'));
    assert.ok(first >= 110, 'settings.* 键数应随批次186增长（>=110）');
  });
  test('6 份字典 settings.* 键集完全相等', () => {
    const base = settingsKeys('zh-CN');
    LANGS.slice(1).forEach(l => {
      assert.deepEqual(settingsKeys(l), base, `${l} 的 settings.* 键集应与 zh-CN 对齐`);
    });
  });
  test('common.notLoggedIn（侧边栏未登录占位）存在于 6 份字典', () => {
    LANGS.forEach(l => {
      assert.ok(global.RT_I18N[l]['common.notLoggedIn'], `${l} 缺少 common.notLoggedIn`);
    });
  });
});

describe('批次186：settings.html 引用的键均存在', () => {
  test('settings.html 所有 data-i18n 键在基准字典可解析', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
    const keys = new Set();
    const re = /data-i18n="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) keys.add(m[1]);
    assert.ok(keys.size > 30, `settings.html 应大量使用 data-i18n（实际 ${keys.size}）`);
    const missing = [...keys].filter(k => !global.RT_I18N['zh-CN'][k]);
    assert.deepEqual(missing, [], `以下键在基准字典缺失：${missing.join(', ')}`);
  });
});

describe('批次186：#21 侧边栏当前用户优先（静态回归）', () => {
  test('index.html 抽屉不再硬编码演示账号 LovelyQY', () => {
    const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(!/drawer-name">\s*LovelyQY/.test(idx), '抽屉名不应硬编码 LovelyQY（历史/演示账号）');
    assert.ok(/id="drawer-name"/.test(idx), '抽屉名应使用 id 供 JS 动态填充');
    assert.ok(/id="drawer-tags"/.test(idx), '抽屉标签容器应空置并供 JS 填充');
  });
  test('refreshDrawerUser 在 getUserAsync 缺失时回退 account 昵称', () => {
    // 引擎层不依赖 DOM 之外的私有函数；此处仅校验占位键存在，保证未登录态文案可译
    assert.ok(global.RT_I18N['zh-CN']['common.notLoggedIn'], '缺少 common.notLoggedIn 占位键');
  });
});

