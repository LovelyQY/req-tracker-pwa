// settings.js —— 设置中心 hub（批次 174：landing 分组 + hash 子视图 + 路由）
//
// 架构（参照 storage-backup 的 landing + hashchange 范式）：
//   - GROUPS 定义三大分组（账号 / 通用 / 帮助）与其子项；renderLanding 渲染 landing 列表。
//   - 子视图以 `<div id="${hash}View" hidden>` 承载；handleRoute() 按 location.hash 切换显隐并改标题。
//   - settingsPageBack()：子视图内清空 hash 回 landing；landing 内调用 goBack()（auth.js 提供）。
//   - 进入 #gen-sync 触发 refreshCloudStatus（匿名登录测连）；进入 #gen-ui 同步语言高亮。
//
// 已落地子视图（批次 174）：#gen-ui（6 语言骨架）、#gen-sync（阶段 0.4/0.5 播种 + 立即同步）。
// 其余子视图为占位空壳，由批次 175/176/177/178 填充。
(function (root) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function getLang() {
    return (typeof RT_CONFIG !== 'undefined' && RT_CONFIG.getLang) ? RT_CONFIG.getLang() : 'zh';
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ===== 设置中心 IA（批次 174）=====
  // real:true = 本批已落地内容；其余为占位空壳。
  var GROUPS = [
    { key: 'account', name: '账号', icon: 'account', sort: 10, items: [
      { key: 'account-profile', name: '个人资料', desc: '头像 / 部门 / 职位 / 工号', hash: 'account-profile', icon: 'account' },
      { key: 'account-security', name: '账号安全', desc: '密码 / 手机 / 邮箱', hash: 'account-security', icon: 'security' },
      { key: 'account-devices', name: '登录设备', desc: '历史设备 / 登出其他', hash: 'account-devices', icon: 'device' }
    ]},
    { key: 'general', name: '通用', icon: 'general', sort: 20, items: [
      { key: 'gen-notify', name: '通知', desc: '开关 / 声音 / 震动', hash: 'gen-notify', icon: 'notification' },
      { key: 'gen-ui', name: '界面与展示', desc: '深色 / 主题色 / 语言', hash: 'gen-ui', icon: 'theme', real: true },
      { key: 'gen-perm', name: '系统权限', desc: '相机 / 存储', hash: 'gen-perm', icon: 'permission' },
      { key: 'gen-download', name: '下载地址', desc: '默认位置 / 记住选择', hash: 'gen-download', icon: 'download' },
      { key: 'gen-sync', name: '云同步', desc: '同步时间 / 记录', hash: 'gen-sync', icon: 'cloud-sync', real: true }
    ]},
    { key: 'help', name: '帮助', icon: 'help', sort: 30, items: [
      { key: 'help', name: '帮助与反馈', desc: '使用说明 / 意见反馈', hash: 'help', icon: 'help' }
    ]}
  ];
  var HASH_MAP = {};
  GROUPS.forEach(function (g) { g.items.forEach(function (it) { HASH_MAP[it.hash] = it; }); });

  function iconSvg(key) {
    return (root.RT_PAGE_ICONS && root.RT_PAGE_ICONS.get) ? (root.RT_PAGE_ICONS.get(key) || '') : '';
  }

  // ===== landing 渲染 + hash 路由 =====
  function renderLanding() {
    var box = $('landingView');
    if (!box) return;
    var html = '';
    GROUPS.slice().sort(function (a, b) { return a.sort - b.sort; }).forEach(function (g) {
      html += '<div class="set-group-title">' + escapeHtml(g.name) + '</div>';
      html += '<div class="set-group">';
      g.items.forEach(function (it) {
        html += '<div class="hub-row" onclick="location.hash=\'#' + it.hash + '\'">'
          + '<div class="hub-ic">' + iconSvg(it.icon) + '</div>'
          + '<div class="hub-main"><div class="hub-name">' + escapeHtml(it.name) + '</div>'
          + '<div class="hub-desc">' + escapeHtml(it.desc) + '</div></div>'
          + '<svg class="hub-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'
          + '</div>';
      });
      html += '</div>';
    });
    box.innerHTML = html;
  }

  function handleRoute() {
    var h = (location.hash || '').replace(/^#/, '');
    var landing = $('landingView');
    if (landing) landing.hidden = !!h;
    // 切换所有子视图显隐
    Object.keys(HASH_MAP).forEach(function (hash) {
      var v = document.getElementById(hash + 'View');
      if (v) v.hidden = (h !== hash);
    });
    // 标题随路由切换
    var titleEl = $('hubTitle');
    if (titleEl) {
      var it = HASH_MAP[h];
      titleEl.textContent = it ? it.name : '设置';
    }
    // 进入对应子视图时触发懒加载
    if (h === 'gen-sync') refreshCloudStatus();
    else if (h === 'gen-ui') syncLangUI();
  }

  function settingsPageBack() {
    if (location.hash && location.hash !== '#') { location.hash = ''; handleRoute(); }
    else if (typeof goBack === 'function') goBack();
  }

  function bootRouting() {
    var p = (root.RT_PAGE_ICONS && root.RT_PAGE_ICONS.init) ? root.RT_PAGE_ICONS.init() : Promise.resolve();
    p.then(renderLanding).catch(renderLanding);
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
  }

  // ===== 语言（#gen-ui，批次 174 六语言骨架）=====
  // RT_CONFIG.setLang 仅支持 zh / en（config.js 强制回退）；其余 4 语言为骨架：
  // 落本地偏好 + 提示"筹备中"，不破坏现有 i18n 机制（全站翻译见独立批次 185）。
  function prefLang() {
    try { return localStorage.getItem('rt_lang_pref') || getLang(); } catch (e) { return getLang(); }
  }
  function setLangPref(code) {
    if (code === 'zh-CN' || code === 'en') {
      var map = { 'zh-CN': 'zh', 'en': 'en' };
      if (typeof RT_CONFIG !== 'undefined' && RT_CONFIG.setLang) RT_CONFIG.setLang(map[code]);
    } else if (typeof toast === 'function') {
      toast('该语言翻译筹备中，将随全站多语言批次上线', 'info', 2600);
    }
    try { localStorage.setItem('rt_lang_pref', code); } catch (e) {}
    syncLangUI();
  }
  function syncLangUI() {
    var grid = $('langGrid');
    if (!grid) return;
    var cur = prefLang();
    var btns = grid.querySelectorAll('.lang-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-lang') === cur);
    }
  }
  function onLangClick(e) {
    var b = (e.target && e.target.closest) ? e.target.closest('.lang-btn') : null;
    if (b) setLangPref(b.getAttribute('data-lang'));
  }

  // ===== 云端同步（#gen-sync，阶段 0.4 数据播种 / 0.5 立即同步）=====
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
  function fmtAgo(ts) {
    if (!ts) return '从未';
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + ' 秒前';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }
  function syncSubText() {
    var q = (typeof RT_SYNC !== 'undefined' && RT_SYNC.getQueueLength) ? RT_SYNC.getQueueLength() : 0;
    var last = (typeof RT_SYNC !== 'undefined' && RT_SYNC.getLastSync) ? RT_SYNC.getLastSync() : 0;
    return '队列 ' + q + ' 条 · 上次同步 ' + fmtAgo(last);
  }
  function syncNow() {
    if (typeof RT_SYNC === 'undefined') {
      if (typeof toast === 'function') toast('同步引擎未加载', 'error');
      return;
    }
    if (RT_SYNC.isBusy()) { if (typeof toast === 'function') toast('同步进行中…', 'warn'); return; }
    var cloudOk = (typeof RT_CLOUD !== 'undefined') && !!RT_CLOUD.envId();
    if (!cloudOk) { if (typeof toast === 'function') toast('云端未启用', 'error'); return; }

    var titleEl = $('seedProgressTitle');
    if (titleEl) titleEl.textContent = '同步进度';
    showProgress(true);
    if (typeof toast === 'function') toast('开始同步…', 'info', 1500);
    RT_SYNC.syncNow({
      onProgress: function (p) {
        if (!p || !p.phase) return;
        var phaseEl = $('seedPhase'), detEl = $('seedDetail');
        if (!phaseEl || !detEl) return;
        if (p.phase === 'pull') { phaseEl.textContent = '拉取云端变更'; detEl.textContent = '下载最新数据到本地…'; }
        else if (p.phase === 'push') { phaseEl.textContent = '推送本地改动'; detEl.textContent = '上传本地新增 / 修改…'; }
      },
      onDone: function (s) {
        showProgress(false);
        if (titleEl) titleEl.textContent = '播种进度';
        var pushed = (s.pushed || 0) + (s.deleted || 0);
        var msg = '同步完成：拉取 ' + (s.pulled || 0) + ' · 推送 ' + pushed + ' · 剩余队列 ' + (s.remaining || 0);
        if (typeof toast === 'function') toast(msg, 'success', 3500);
        var sub = $('syncSub'); if (sub) sub.textContent = syncSubText();
        refreshCloudStatus();
      },
      onError: function (e) {
        showProgress(false);
        if (titleEl) titleEl.textContent = '播种进度';
        if (typeof toast === 'function') toast('同步失败：' + ((e && e.message) ? e.message : e), 'error', 4500);
        var sub = $('syncSub'); if (sub) sub.textContent = syncSubText();
      }
    });
  }

  // ===== init =====
  function init() {
    bootRouting();
    var grid = $('langGrid');
    if (grid) { syncLangUI(); grid.addEventListener('click', onLangClick); }
    // 跨页/跨标签语言同步
    document.addEventListener('langchange', function () { syncLangUI(); });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  root.RT_SETTINGS_PAGE = {
    init: init, syncNow: syncNow, startSeed: startSeed, refreshCloudStatus: refreshCloudStatus
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
