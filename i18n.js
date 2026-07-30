/*
 * i18n 全站多语言引擎（批次185-A）
 * -------------------------------------------------------------
 * 设计要点：
 *   1. 字典为「静态打包资源」，随发版走（不走云端）。各语言文件形如：
 *        window.RT_I18N['zh-CN'] = { 'app.title': '需求任务追踪', ... }
 *      由 i18n/<lang>.js 在 <head> 中以 defer 注入（保证 init() 调用前已就绪）。
 *   2. t(key, vars?) 为全局翻译函数：
 *        - 优先取当前语言字典；
 *        - key 缺失 → 回退 zh-CN（single source of truth，保证不白屏）；
 *        - 仍缺失 → 返回 key 本身（开发者可见，绝不留空串）。
 *   3. applyLang(lang) 设置当前语言 + 填充 [data-i18n] / [data-i18n-ph] / [data-i18n-aria]。
 *   4. 监听 RT_CONFIG.setLang 派发的 'langchange' 事件，自动重渲染当前页文案。
 *
 * 接入方式（两种并用）：
 *   - 静态文案：HTML 元素加 data-i18n="key"，applyLang 时批量填充 textContent（或 data-i18n-attr 指定属性）。
 *   - 动态/JS 文案：调用处改用 t('key')（含 toast(t('...'))、确认框、状态名等）。
 */
(function (root) {
  'use strict';

  // 字典容器（各语言文件注入到此对象）
  var RT_I18N = root.RT_I18N || (root.RT_I18N = {});

  var SUPPORTED = ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'];
  var FALLBACK = 'zh-CN';
  var curLang = FALLBACK;

  function isSupported(lang) { return SUPPORTED.indexOf(lang) >= 0; }
  function getDict(lang) { return RT_I18N[lang] || null; }

  function lookup(lang, key) {
    var d = getDict(lang);
    if (!d) return null;
    var v = d[key];
    return (v === undefined || v === null) ? null : v;
  }

  // 占位符替换：{name} → vars.name
  function fillVars(str, vars) {
    if (!vars) return String(str);
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return (vars[k] !== undefined && vars[k] !== null) ? String(vars[k]) : m;
    });
  }

  // 全局翻译函数
  function t(key, vars) {
    if (key === undefined || key === null) return '';
    var val = lookup(curLang, key);
    if (val === null) val = lookup(FALLBACK, key);
    if (val === null) return String(key);
    return fillVars(val, vars);
  }

  // 设置当前语言并刷新页面文案（用于启动 / 语言切换）
  function applyLang(lang) {
    if (!isSupported(lang)) lang = FALLBACK;
    curLang = lang;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('lang', lang);
    }
    renderI18n();
    return lang;
  }

  // 填充所有 data-i18n / data-i18n-ph / data-i18n-aria 元素
  function renderI18n(scope) {
    var root_ = scope || (typeof document !== 'undefined' ? document : null);
    if (!root_ || !root_.querySelectorAll) return;

    var nodes = root_.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-i18n');
      var attr = el.getAttribute('data-i18n-attr');
      if (attr) el.setAttribute(attr, t(key));
      else el.textContent = t(key);
    }
    nodes = root_.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < nodes.length; j++) {
      nodes[j].setAttribute('placeholder', t(nodes[j].getAttribute('data-i18n-ph')));
    }
    nodes = root_.querySelectorAll('[data-i18n-aria]');
    for (var k = 0; k < nodes.length; k++) {
      nodes[k].setAttribute('aria-label', t(nodes[k].getAttribute('data-i18n-aria')));
    }
  }

  // 监听语言切换（来自 RT_CONFIG.setLang 派发的 langchange）
  function bindLangChange() {
    if (typeof document === 'undefined') return;
    document.addEventListener('langchange', function (e) {
      var lang = (e && e.detail && e.detail.lang) ? e.detail.lang
        : (typeof RT_CONFIG !== 'undefined' && RT_CONFIG.getLang ? RT_CONFIG.getLang() : FALLBACK);
      applyLang(lang);
      // 通知宿主应用重渲染动态内容（任务列表 / 待办 / 统计等）
      if (typeof RT_APP !== 'undefined' && RT_APP.onLangChange) {
        try { RT_APP.onLangChange(); } catch (err) { /* 忽略重渲染错误 */ }
      }
    });
  }

  var api = {
    SUPPORTED: SUPPORTED,
    FALLBACK: FALLBACK,
    t: t,
    applyLang: applyLang,
    renderI18n: renderI18n,
    getDict: getDict,
    isSupported: isSupported,
    get currentLang() { return curLang; },
    _setCurrentForTest: function (l) { curLang = l; }  // 仅供单测
  };

  root.RT_I18N = RT_I18N;       // 字典容器（语言文件注入）
  root.RT_I18N_API = api;       // 引擎 API
  root.t = t;                   // 全局便捷函数

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // 浏览器环境：自动绑定 langchange
  if (typeof document !== 'undefined') bindLangChange();

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
