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
    // 云端同步：打开设置页即检测连接状态
    refreshCloudStatus();
  }

  // ===== 云端同步（阶段 0.4 数据播种）=====
  function cloudReady() {
    return (typeof RT_CLOUD !== 'undefined') && RT_CLOUD.envId() && (typeof RT_SEED !== 'undefined');
  }

  function refreshCloudStatus() {
    var el = $('cloudStatus');
    if (!el) return;
    if (!cloudReady()) { el.textContent = '未启用云端（缺 SDK 或环境 ID）'; return; }
    RT_CLOUD.init();
    RT_CLOUD.loginAnonymously().then(function (uid) {
      el.textContent = '已连接 · ' + String(uid).slice(0, 10) + '…';
      return RT_SEED.hasSeeded();
    }).then(function (seeded) {
      var sub = $('seedSub');
      if (sub) sub.textContent = seeded
        ? '已播种过，可重复点（仅覆盖本人数据）'
        : '把本地数据上传到云端（幂等，可重复点）';
    }).catch(function (e) {
      el.textContent = '连接失败：' + ((e && e.message) ? e.message : e);
    });
  }

  function showProgress(on) {
    var t = $('seedProgressTitle'), b = $('seedProgressBox');
    if (t) t.style.display = on ? '' : 'none';
    if (b) b.style.display = on ? '' : 'none';
  }

  function updateProgress(p) {
    var phaseEl = $('seedPhase'), detEl = $('seedDetail');
    if (!phaseEl || !detEl) return;
    if (p.phase === 'login') {
      phaseEl.textContent = '已匿名登录';
      detEl.textContent = 'uid: ' + String(p.uid || '').slice(0, 12) + '…';
      return;
    }
    if (p.coll) {
      phaseEl.textContent = '上传 ' + p.coll;
      var txt = p.done + '/' + p.total;
      if (p.ok || p.fail) txt += '（成功 ' + p.ok + (p.fail ? '，失败 ' + p.fail : '') + '）';
      detEl.textContent = txt;
    }
  }

  function startSeed() {
    if (!cloudReady()) { if (typeof toast === 'function') toast('云端未就绪', 'error'); return; }
    if (RT_SEED.isBusy()) { if (typeof toast === 'function') toast('播种进行中…', 'warn'); return; }
    showProgress(true);
    RT_SEED.seed({
      onProgress: function (p) { updateProgress(p); },
      onDone: function (results) {
        showProgress(false);
        var total = results.reduce(function (s, r) { return s + (r.total || 0); }, 0);
        var ok = results.reduce(function (s, r) { return s + (r.ok || 0); }, 0);
        if (typeof toast === 'function') toast('播种完成：' + ok + '/' + total + ' 条', 'success', 3500);
        refreshCloudStatus();
      },
      onError: function (e) {
        showProgress(false);
        if (typeof toast === 'function') toast('播种失败：' + ((e && e.message) ? e.message : e), 'error', 4500);
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  root.RT_SETTINGS_PAGE = {
    init: init, getLang: getLang, setSegActive: setSegActive,
    startSeed: startSeed, refreshCloudStatus: refreshCloudStatus
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
