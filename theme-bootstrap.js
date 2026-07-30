// theme-bootstrap.js —— 主题/深色模式「早加载」引导脚本（无依赖、可离线）
//
// 作用（在 <head> 同步执行，body 绘制前完成，避免深色模式/主题色首屏闪烁）：
//   1. 读取 localStorage('rt_ui_prefs')：{ dark: bool, theme: '#1677ff', notify: {...} }
//   2. 应用 html.dark 类（深色模式开关）
//   3. 应用主题色到全站 CSS 变量：--primary / --primary-light / --primary-dark /
//      --primary-hover / --primary-ghost / --link，以及图标 chip 渐变
//      --icon-primary / --icon-primary-light / --icon-bg / --icon-shadow
//   4. 同步更新 <meta name="theme-color">（状态栏/地址栏配色）
//   5. 跨标签页同步：localStorage('storage' 事件) + 本页 settings.js 派发的
//      'rt-ui-prefs-change' 事件
//
// 设计要点：
//   - 不依赖任何其它模块（RT_CONFIG 等），纯原生，确保 earliest paint 前可用。
//   - 通过 documentElement.style 设置内联变量（优先级高于 :root 样式表），
//     因此 theme-bootstrap 设置的主题色会「覆盖」base.css / settings.html 内联 :root。
//   - 深色模式的具体「表面/文字/边框」颜色由各页面的 CSS 在 `html.dark { … }` 中定义
//     （base.css 覆盖加载它的页面；settings.html 自带覆盖块）。
//   - 真实「账号漫游」待阶段 0.6 CloudBase user_settings 就绪；此脚本仅消费本地偏好。
(function () {
  'use strict';

  var KEY = 'rt_ui_prefs';
  var DEFAULT_THEME = '#1677ff';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function hexToRgb(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    if (isNaN(n)) return { r: 22, g: 119, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function clamp(x) { return Math.max(0, Math.min(255, x)); }
  function toHex(r, g, b) {
    return '#' + [r, g, b].map(function (x) {
      var h = clamp(Math.round(x)).toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join('');
  }
  // pct: -100..100，正数变亮、负数变暗
  function shade(hex, pct) {
    var c = hexToRgb(hex);
    var t = pct < 0 ? 0 : 255;
    var p = Math.abs(pct) / 100;
    return toHex(c.r + (t - c.r) * p, c.g + (t - c.g) * p, c.b + (t - c.b) * p);
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  function apply(prefs) {
    prefs = prefs || {};
    var root = document.documentElement;
    if (!root) return;
    // 1) 深色模式
    if (prefs.dark) root.classList.add('dark');
    else root.classList.remove('dark');
    // 2) 主题色（缺省回退默认蓝）
    var base = prefs.theme || DEFAULT_THEME;
    var light = shade(base, 18);
    var dark = shade(base, -16);
    root.style.setProperty('--primary', base);
    root.style.setProperty('--primary-light', light);
    root.style.setProperty('--primary-dark', dark);
    root.style.setProperty('--primary-hover', shade(base, -10));
    root.style.setProperty('--primary-ghost', rgba(base, 0.1));
    root.style.setProperty('--link', base);
    // 图标 chip 视觉（覆盖 theme.css 默认蓝渐变）
    root.style.setProperty('--icon-primary', base);
    root.style.setProperty('--icon-primary-light', light);
    root.style.setProperty('--icon-bg', 'linear-gradient(135deg, ' + base + ', ' + light + ')');
    root.style.setProperty('--icon-shadow', '0 4px 12px ' + rgba(base, 0.25));
    // 3) 状态栏/地址栏配色
    try {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', base);
    } catch (e) {}
  }

  function init() {
    try {
      apply(read());
      // 跨标签页：其它标签改了偏好 → 本标签同步
      window.addEventListener('storage', function (e) {
        if (e && e.key === KEY) { try { apply(JSON.parse(e.newValue || '{}')); } catch (_) {} }
      });
      // 同页 settings.js 实时改偏好后主动通知（无需等 storage 事件）
      window.addEventListener('rt-ui-prefs-change', function () { try { apply(read()); } catch (_) {} });
    } catch (e) { /* 静默失败，回退默认浅色 */ }
  }

  // 暴露给 settings.js 直接调用（实时应用）
  window.applyRtUiPrefs = function (prefs) { apply(prefs || read()); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
