// test-batch187-theme.js
// 批次187 回归：深色模式 & 主题色重构（#7 / #8）
//   #7：深色模式使用「低饱和深色系」主题色（亮蓝→#1e5bb3），与浅色亮蓝解耦；
//       未显式设置深色时跟随系统 prefers-color-scheme。
//   #8 的 DOM 行为（自定义颜色输入默认隐藏、点「自定义颜色/恢复默认」才出现）属浏览器交互，
//       此处仅校验主题引擎层；交互层由 settings.js 的 toggleCustomColor/resetTheme 负责。
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

function makeEl() {
  const cls = new Set();
  const props = {};
  return {
    classList: {
      add(c) { cls.add(c); },
      remove(c) { cls.delete(c); },
      contains(c) { return cls.has(c); },
    },
    style: {
      setProperty(k, v) { props[k] = v; },
      getPropertyValue(k) { return props[k] || ''; },
    },
    setAttribute() {},
    getAttribute() { return null; },
  };
}

const docEl = makeEl();
global.window = global;
let store = {};
global.localStorage = {
  getItem(k) { return k in store ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; },
};
global.addEventListener = function () {};
global.matchMedia = function () { return { matches: false, media: '', addEventListener() {}, removeEventListener() {} }; };
global.document = {
  documentElement: docEl,
  querySelector() { return null; },
  addEventListener() {},
  readyState: 'complete',
};

require('../theme-bootstrap.js');

describe('批次187 #7：深色模式主题色（低饱和深色系）', () => {
  test('深色模式：主色走低饱和深色系（亮蓝 #1677ff → #1e5bb3）', () => {
    global.applyRtUiPrefs({ dark: true, theme: '#1677ff' });
    assert.ok(docEl.classList.contains('dark'), '应加 html.dark 类');
    assert.equal(docEl.style.getPropertyValue('--primary'), '#1e5bb3', '主色应为深色系');
  });

  test('深色模式：橙色主题同样被拉向低饱和深色系', () => {
    global.applyRtUiPrefs({ dark: true, theme: '#fa541c' });
    assert.equal(docEl.style.getPropertyValue('--primary'), '#a7462b');
  });

  test('浅色模式：主色保持所选亮色（不被压暗）', () => {
    global.applyRtUiPrefs({ dark: false, theme: '#1677ff' });
    assert.ok(!docEl.classList.contains('dark'), '不应加 dark 类');
    assert.equal(docEl.style.getPropertyValue('--primary'), '#1677ff', '浅色应保留原主题色');
  });

  test('未显式设置 dark 且系统偏好深色 → 跟随系统（深色系）', () => {
    global.matchMedia = function () { return { matches: true, media: '', addEventListener() {}, removeEventListener() {} }; };
    global.applyRtUiPrefs({ theme: '#1677ff' }); // 无 dark 键
    assert.ok(docEl.classList.contains('dark'), '应跟随系统深色');
    assert.equal(docEl.style.getPropertyValue('--primary'), '#1e5bb3');
  });

  test('未显式设置 dark 且系统偏好浅色 → 浅色', () => {
    global.matchMedia = function () { return { matches: false, media: '', addEventListener() {}, removeEventListener() {} }; };
    global.applyRtUiPrefs({ theme: '#1677ff' });
    assert.ok(!docEl.classList.contains('dark'));
    assert.equal(docEl.style.getPropertyValue('--primary'), '#1677ff');
  });

  test('显式 dark:false 优先于系统深色偏好', () => {
    global.matchMedia = function () { return { matches: true, media: '', addEventListener() {}, removeEventListener() {} }; };
    global.applyRtUiPrefs({ dark: false, theme: '#1677ff' });
    assert.ok(!docEl.classList.contains('dark'), '显式关闭应覆盖系统偏好');
  });
});

describe('批次187：主题色变量派生一致', () => {
  test('深色模式下 --primary-light/-dark/--link 均由深色系主色派生', () => {
    global.applyRtUiPrefs({ dark: true, theme: '#1677ff' });
    const p = docEl.style.getPropertyValue('--primary');
    const pl = docEl.style.getPropertyValue('--primary-light');
    const pd = docEl.style.getPropertyValue('--primary-dark');
    assert.equal(p, '#1e5bb3');
    assert.ok(pl && pl !== p, '--primary-light 应 distinct 于主色');
    assert.ok(pd && pd !== p, '--primary-dark 应 distinct 于主色');
    // 状态栏配色同步为主色
    assert.equal(docEl.style.getPropertyValue('--icon-primary'), '#1e5bb3');
  });
});
