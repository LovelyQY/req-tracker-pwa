// settings.js —— 设置页（批次106）
// 首项设置：全局界面语言（中/EN）。写入 RT_CONFIG.setLang：
//   - 内存 RT_CONFIG.ui.lang 更新
//   - localStorage('rt_lang') 持久化
//   - document 派发 'langchange' 事件，供权限树等组件跨页同步
(function (root) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function getLang() {
    return (typeof RT_CONFIG !== 'undefined' && RT_CONFIG.getLang) ? RT_CONFIG.getLang() : 'zh';
  }
  function setSegActive(lang) {
    var seg = $('langSeg'); if (!seg) return;
    var btns = seg.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    }
  }
  function onSegClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('.seg-btn') : null;
    if (!btn) return;
    var lang = btn.getAttribute('data-lang');
    if (typeof RT_CONFIG !== 'undefined' && RT_CONFIG.setLang) RT_CONFIG.setLang(lang);
    setSegActive(lang);
  }

  function init() {
    setSegActive(getLang());
    var seg = $('langSeg');
    if (seg) seg.addEventListener('click', onSegClick);
    // 跨页/跨标签同步：其它页面改了语言，本页分段按钮同步高亮
    document.addEventListener('langchange', function (ev) {
      var lang = (ev && ev.detail && ev.detail.lang) || getLang();
      setSegActive(lang);
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  root.RT_SETTINGS_PAGE = { init: init, getLang: getLang, setSegActive: setSegActive };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
