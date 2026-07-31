// settings.js —— 设置中心 hub（批次 174：landing 分组 + hash 子视图 + 路由；批次 188 #2：账号类改跳独立子页）
//
// 架构（参照 storage-backup 的 landing + hashchange 范式）：
//   - GROUPS 定义三大分组（账号 / 通用 / 帮助）与其子项；renderLanding 渲染 landing 列表。
//   - 子项两类：① hash 子视图（如 #gen-ui / #gen-sync），点击 location.hash 切换；
//     ② nav 独立子页（如 个人资料→profile.html / 账号安全→security.html / 登录设备→devices.html），点击 navTo() 整页跳转。
//   - handleRoute() 按 location.hash 切换显隐并改标题；settingsPageBack()：子视图内清空 hash 回 landing，landing 内调用 goBack()。
//   - 进入 #gen-sync 触发 refreshCloudStatus（匿名登录测连）；进入 #gen-ui 同步语言高亮。
//
// 已落地子视图（批次 174）：#gen-ui（6 语言骨架）、#gen-sync（阶段 0.4/0.5 播种 + 立即同步）。
// 账号类（个人资料 / 账号安全 / 登录设备）已由 Batch 188（#2）+ Batch 189（#5）改为跳转独立子页
// profile.html / security.html / devices.html，settings hub 仅做分组入口，不再内嵌任何账号子视图。
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
    { key: 'settings.account', name: '账号', icon: 'account', sort: 10, items: [
      { key: 'settings.profile', name: '个人资料', descKey: 'settings.profileDesc', nav: 'profile.html', icon: 'account' },
      { key: 'settings.accountSecurity', name: '账号安全', descKey: 'settings.securityDesc', nav: 'security.html', icon: 'security' },
      { key: 'settings.devices', name: '登录设备', descKey: 'settings.devicesDesc', nav: 'devices.html', icon: 'device' }
    ]},
    { key: 'settings.general', name: '通用', icon: 'general', sort: 20, items: [
      { key: 'settings.notification', name: '通知', descKey: 'settings.notificationDesc', hash: 'gen-notify', icon: 'notification', real: true },
      { key: 'settings.ui', name: '界面与展示', descKey: 'settings.uiDesc', hash: 'gen-ui', icon: 'theme', real: true },
      { key: 'settings.permissions', name: '系统权限', descKey: 'settings.permissionsDesc', hash: 'gen-perm', icon: 'permission', real: true },
      { key: 'settings.download', name: '下载地址', descKey: 'settings.downloadDesc', hash: 'gen-download', icon: 'download', real: true },
      { key: 'settings.cloudSync', name: '云同步', descKey: 'settings.cloudSyncDesc', hash: 'gen-sync', icon: 'cloud-sync', real: true }
    ]},
    { key: 'settings.help', name: '帮助', icon: 'help', sort: 30, items: [
      { key: 'settings.help', name: '帮助与反馈', descKey: 'settings.helpDesc', hash: 'help', icon: 'help', real: true }
    ]}
  ];
  var HASH_MAP = {};
  GROUPS.forEach(function (g) { g.items.forEach(function (it) { if (it.hash) HASH_MAP[it.hash] = it; }); });

  function iconSvg(key) {
    return (root.RT_PAGE_ICONS && root.RT_PAGE_ICONS.get) ? (root.RT_PAGE_ICONS.get(key) || '') : '';
  }

  // ===== landing 渲染 + hash 路由 =====
  function renderLanding() {
    var box = $('landingView');
    if (!box) return;
    var html = '';
    GROUPS.slice().sort(function (a, b) { return a.sort - b.sort; }).forEach(function (g) {
      html += '<div class="set-group-title">' + escapeHtml(t(g.key)) + '</div>';
      html += '<div class="set-group">';
      g.items.forEach(function (it) {
        var go = it.nav ? ('navTo(\'' + it.nav + '\')') : ('location.hash=\'#' + it.hash + '\'');
        html += '<div class="hub-row" onclick="' + go + '">'
          + '<div class="hub-ic">' + iconSvg(it.icon) + '</div>'
          + '<div class="hub-main"><div class="hub-name">' + escapeHtml(t(it.key)) + '</div>'
          + '<div class="hub-desc">' + escapeHtml(t(it.descKey)) + '</div></div>'
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
      titleEl.textContent = it ? t(it.key) : t('settings.title');
    }
    // 进入对应子视图时触发懒加载
    if (h === 'gen-sync') refreshCloudStatus();
    else if (h === 'gen-ui') { syncLangUI(); renderUI(); }
    else if (h === 'gen-notify') renderNotify();
    else if (h === 'gen-perm') renderPerms();
    else if (h === 'gen-download') renderDownload();
    else if (h === 'help') renderHelp();
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

  // ===== 语言（#gen-ui，批次 174 骨架；批次185 全站翻译接入）=====
  // 直接调用 RT_CONFIG.setLang(code) 应用语言（派发 langchange → i18n 引擎重渲染）；
  // 字典未就绪的语言落到 zh-CN 兜底，并提示"筹备中"（全量翻译见 185-B/C/D）。
  function prefLang() {
    try { return localStorage.getItem('rt_lang_pref') || getLang(); } catch (e) { return getLang(); }
  }
  function setLangPref(code) {
    if (typeof RT_CONFIG !== 'undefined' && RT_CONFIG.setLang) RT_CONFIG.setLang(code);
    try { localStorage.setItem('rt_lang_pref', code); } catch (e) {}
    syncLangUI();
    // 字典尚未就绪的语言：已落到 zh-CN 兜底，给出"筹备中"提示
    if (typeof RT_I18N === 'undefined' || !RT_I18N[code]) {
      if (typeof toast === 'function') toast(t('settings.langUnavailable'),'info',2600);
    }
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
    if (!cloudReady()) { if (typeof toast === 'function') toast(t('settings.cloudNotReady'), 'error'); return; }
    if (RT_SEED.isBusy()) { if (typeof toast === 'function') toast(t('settings.seedInProgress'), 'warn'); return; }
    showProgress(true);
    RT_SEED.seed({
      onProgress: function (p) { updateProgress(p); },
      onDone: function (results) {
        showProgress(false);
        var total = results.reduce(function (s, r) { return s + (r.total || 0); }, 0);
        var ok = results.reduce(function (s, r) { return s + (r.ok || 0); }, 0);
        if (typeof toast === 'function') toast(t('settings.seedDone').replace('$1', ok + '/' + total),'success',3500);
        refreshCloudStatus();
      },
      onError: function (e) {
        showProgress(false);
        if (typeof toast === 'function') toast(t('settings.seedFailed') + ((e && e.message) ? e.message : e), 'error', 4500);
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
    if (RT_SYNC.isBusy()) { if (typeof toast === 'function') toast(t('settings.syncInProgress'), 'warn'); return; }
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
        if (typeof toast === 'function') toast(t('settings.syncDone').replace('$1',(s.pulled||0)).replace('$2',pushed).replace('$3',(s.remaining||0)),'success',3500);
        var sub = $('syncSub'); if (sub) sub.textContent = syncSubText();
        refreshCloudStatus();
      },
      onError: function (e) {
        showProgress(false);
        if (titleEl) titleEl.textContent = '播种进度';
        if (typeof toast === 'function') toast(t('settings.syncFailed') + ((e && e.message) ? e.message : e), 'error', 4500);
        var sub = $('syncSub'); if (sub) sub.textContent = syncSubText();
      }
    });
  }

  // ===== 界面与展示 + 通知（批次 176）=====
  // 偏好本地持久化（localStorage 'rt_ui_prefs'）：{ dark, theme, notify:{master,sound,vibrate,ringtone} }
  // 真实「账号漫游」待阶段 0.6 CloudBase user_settings 就绪（见 roamPref 钩子）。
  var PREFS_KEY = 'rt_ui_prefs';
  var DEFAULT_THEME = '#1677ff';
  var THEME_PRESETS = ['#1677ff', '#fa541c', '#52c41a', '#722ed1', '#eb2f96', '#13c2c2', '#faad14', '#1f2937'];

  function prefsGet() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function prefsSet(patch) {
    var p = prefsGet();
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) p[k] = patch[k]; }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
    // 实时应用到本页（theme-bootstrap.js 提供）+ 通知其它标签页
    if (typeof window !== 'undefined') {
      if (window.applyRtUiPrefs) window.applyRtUiPrefs(p);
      try { window.dispatchEvent(new CustomEvent('rt-ui-prefs-change')); } catch (_) {}
    }
    roamPref(patch);
  }
  // 云端漫游钩子：阶段 0.6 就绪后写入 user_settings 集合；当前仅本地，静默不抛错。
  function roamPref(patch) {
    try { if (typeof RT_SYNC !== 'undefined' && RT_SYNC.setUserPref) RT_SYNC.setUserPref(patch); } catch (_) {}
  }

  // ---- 深色模式 / 主题色 ----
  // 解析深色态：显式偏好优先；未设置时跟随系统 prefers-color-scheme（#7）
  function resolveDark(prefs) {
    if (prefs && typeof prefs.dark === 'boolean') return prefs.dark;
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) { return false; }
  }
  function renderUI() {
    var p = prefsGet();
    var dt = $('uiDarkToggle'); if (dt) dt.checked = resolveDark(p);
    var sw = $('themeSwatches');
    if (sw) {
      var cur = (p.theme || DEFAULT_THEME).toLowerCase();
      sw.innerHTML = THEME_PRESETS.map(function (c) {
        var active = (c.toLowerCase() === cur) ? ' active' : '';
        return '<button type="button" class="swatch' + active + '" data-color="' + c + '" style="background:' + c + '" aria-label="主题色 ' + c + '"></button>';
      }).join('');
    }
    var ci = $('themeCustom'); if (ci) ci.value = p.theme || DEFAULT_THEME;
  }
  function toggleDark() {
    var dt = $('uiDarkToggle'); if (!dt) return;
    prefsSet({ dark: dt.checked });
    if (typeof toast === 'function') toast(dt.checked ? t('settings.darkModeOn') : t('settings.darkModeOff'), 'success', 1500);
  }
  function onSwatchClick(e) {
    var b = (e.target && e.target.closest) ? e.target.closest('.swatch') : null;
    if (!b) return;
    pickTheme(b.getAttribute('data-color'));
  }
  function pickTheme(c) {
    prefsSet({ theme: c });
    renderUI();
  }
  function onThemeCustom(e) {
    var v = e && e.target ? e.target.value : null;
    if (!v) return;
    prefsSet({ theme: v });
    var sw = $('themeSwatches');
    if (sw) {
      var b = sw.querySelectorAll('.swatch'); var cur = v.toLowerCase();
      for (var i = 0; i < b.length; i++) b[i].classList.toggle('active', b[i].getAttribute('data-color').toLowerCase() === cur);
    }
  }
  function resetTheme() {
    prefsSet({ theme: DEFAULT_THEME });
    renderUI();
    // #8：恢复默认后按需露出自定义颜色输入，便于用户再次自定义
    var row = $('themeCustomRow');
    if (row) row.style.display = 'flex';
    if (typeof toast === 'function') toast(t('settings.themeReset'), 'success', 1500);
  }
  // #8：默认隐藏自定义颜色输入，点击「自定义颜色」才按需出现
  function toggleCustomColor() {
    var row = $('themeCustomRow');
    if (!row) return;
    var show = (row.style.display === 'none');
    row.style.display = show ? 'flex' : 'none';
  }

  // ---- 通知 ----
  function setChecked(id, on) { var el = $(id); if (el) el.checked = !!on; }
  function renderNotify() {
    var p = prefsGet();
    var n = p.notify || {};
    setChecked('ntMaster', n.master !== false);
    setChecked('ntSound', n.sound !== false);
    setChecked('ntVibrate', n.vibrate !== false);
    var sel = $('ntRingtone'); if (sel) sel.value = n.ringtone || 'default';
    updateNotifyDeps();
  }
  function onNotifyChange(key) {
    var p = prefsGet(); var n = p.notify || {};
    if (key === 'master') n.master = !!$('ntMaster').checked;
    else if (key === 'sound') n.sound = !!$('ntSound').checked;
    else if (key === 'vibrate') n.vibrate = !!$('ntVibrate').checked;
    else if (key === 'ringtone') n.ringtone = $('ntRingtone').value;
    prefsSet({ notify: n });
    updateNotifyDeps();
  }
  function updateNotifyDeps() {
    var p = prefsGet(); var n = p.notify || {};
    var master = n.master !== false;
    ['ntSound', 'ntVibrate', 'ntRingtone'].forEach(function (id) { var el = $(id); if (el) el.disabled = !master; });
    var wrap = $('ntDeps'); if (wrap) wrap.style.opacity = master ? '1' : '0.5';
  }
  function previewRingtone() {
    var p = prefsGet(); var n = p.notify || {};
    if (n.master === false || n.sound === false) {
      if (typeof toast === 'function') toast(t('settings.notifyEnableFirst'), 'info', 1800);
      return;
    }
    playTone(n.ringtone || 'default');
  }
  function playTone(kind) {
    try {
      if (kind === 'none') return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { if (typeof toast === 'function') toast('当前环境不支持音频试听', 'info', 1800); return; }
      var ctx = new AC();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      var freq = 880, type = 'sine', dur = 0.28;
      if (kind === 'chime') { type = 'triangle'; freq = 1046; }
      else if (kind === 'bell') { type = 'square'; freq = 660; }
      else if (kind === 'soft') { type = 'sine'; freq = 523; }
      o.type = type; o.frequency.value = freq;
      g.gain.value = 0.05;
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.stop(ctx.currentTime + dur);
      o.onended = function () { try { ctx.close(); } catch (_) {} };
    } catch (_) {}
  }
  function testVibrate() {
    if (navigator.vibrate) {
      navigator.vibrate(120);
      if (typeof toast === 'function') toast(t('settings.vibrateTriggered'), 'success', 1200);
    } else if (typeof toast === 'function') {
      toast('当前设备 / 浏览器不支持震动', 'info', 1800);
    }
  }

  // ===== 系统权限 + 下载地址（批次 177）=====
  // 权限由浏览器 Permissions API 统一管理；本页查询状态并引导授权，已授权状态缓存到
  // rt_ui_prefs.permStatus（漫游钩子 roamPref，待阶段 0.6 CloudBase user_settings 就绪）。
  var PERM_DEFS = [
    { key: 'camera', name: '相机', desc: '用于拍照上传头像 / 附件', type: 'media', constraint: { video: true }, pname: 'camera' },
    { key: 'microphone', name: '麦克风', desc: '用于语音备注（规划中）', type: 'media', constraint: { audio: true }, pname: 'microphone' },
    { key: 'storage', name: '存储空间', desc: 'persistent-storage 持久化存储，降低被清理风险', type: 'storage', pname: 'persistent-storage' }
  ];
  function permDef(key) { for (var i = 0; i < PERM_DEFS.length; i++) if (PERM_DEFS[i].key === key) return PERM_DEFS[i]; return null; }
  function permBadge(st) {
    return st === 'granted' ? '已授权' : st === 'denied' ? '已拒绝' : st === 'prompt' ? '未决定' : st === 'loading' ? '查询中' : '未知';
  }
  function permRowHtml(d, st) {
    var cls = (st === 'loading' || !st) ? 'unknown' : st;
    return '<div class="set-row" data-permrow="' + d.key + '">' +
      '<div class="set-row-main"><div class="set-row-title">' + escapeHtml(d.name) + '</div>' +
      '<div class="set-row-sub">' + escapeHtml(d.desc) + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span class="perm-badge ' + cls + '">' + permBadge(st) + '</span>' +
        '<button type="button" class="btn-link" onclick="RT_SETTINGS_PAGE.requestPerm(\'' + d.key + '\')">去授权</button>' +
      '</div></div>';
  }
  function renderPerms() {
    var box = $('permList'); if (!box) return;
    box.innerHTML = PERM_DEFS.map(function (d) { return permRowHtml(d, 'loading'); }).join('');
    PERM_DEFS.forEach(function (d) { queryPerm(d.key); });
  }
  function queryPerm(key) {
    var d = permDef(key); if (!d) return;
    var el = document.querySelector('[data-permrow="' + key + '"] .perm-badge');
    if (!navigator.permissions || !navigator.permissions.query) {
      if (el) { el.className = 'perm-badge unknown'; el.textContent = '未知'; }
      cachePerm(key, 'unknown');
      return;
    }
    navigator.permissions.query({ name: d.pname }).then(function (res) {
      if (el) { el.className = 'perm-badge ' + res.state; el.textContent = permBadge(res.state); }
      cachePerm(key, res.state);
    }).catch(function () {
      if (el) { el.className = 'perm-badge unknown'; el.textContent = '未知'; }
      cachePerm(key, 'unknown');
    });
  }
  function cachePerm(key, st) {
    var p = prefsGet(); p.permStatus = p.permStatus || {};
    if (p.permStatus[key] === st) return; // 仅在变化时写，避免每次渲染都落盘
    p.permStatus[key] = st;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
    roamPref({ permStatus: p.permStatus });
  }
  function requestPerm(key) {
    var d = permDef(key); if (!d) return;
    if (d.type === 'media') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof toast === 'function') toast('当前环境不支持媒体授权', 'error'); return;
      }
      navigator.mediaDevices.getUserMedia(d.constraint).then(function (stream) {
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
        afterPerm(key, 'granted');
      }).catch(function () { afterPerm(key, 'denied'); });
    } else if (d.type === 'storage') {
      if (!navigator.storage || !navigator.storage.persist) {
        if (typeof toast === 'function') toast('当前浏览器不支持持久化存储申请', 'info'); return;
      }
      navigator.storage.persist().then(function (ok) { afterPerm('storage', ok ? 'granted' : 'prompt'); })
        .catch(function () { afterPerm('storage', 'unknown'); });
    }
  }
  function afterPerm(key, st) {
    cachePerm(key, st);
    if (typeof toast === 'function') {
      toast(st === 'granted' ? ('已授权 ' + (permDef(key) ? permDef(key).name : '')) : ('授权状态：' + permBadge(st)),
        st === 'granted' ? 'success' : 'info', 1800);
    }
    queryPerm(key); // 校准到浏览器真实状态
    renderPerms();
  }

  // 下载偏好（半真：浏览器无法指定 OS 下载目录，仅保存命名 / 格式偏好供导出页读取）
  function renderDownload() {
    var p = prefsGet(); var d = p.download || {};
    var pre = $('dlPrefix'); if (pre) pre.value = d.prefix || '';
    var fmt = $('dlFormat'); if (fmt) fmt.value = d.format || 'csv';
    setChecked('dlRemember', d.remember !== false);
  }
  function onDownloadChange(key, val) {
    var p = prefsGet(); var d = p.download || {};
    if (key === 'remember') d.remember = !!val;
    else d[key] = val;
    prefsSet({ download: d });
  }

  // ===== 帮助与反馈（批次 178）=====
  // 帮助：本地文档集 + 分类标签 + 搜索；反馈：表单 → 本地 IDB /feedback store + roam 钩子（阶段 0.6 后走 CloudBase feedback 集合）。
  var HELP_DOCS = [
    { id: 'quickstart', tag: '入门', title: '快速开始', body: '<p>欢迎使用需求任务追踪 PWA！首次使用请按以下步骤操作：</p><ul><li>在<strong>首页</strong>查看你的任务与待办列表；</li><li>在<strong>基础数据</strong>（公司/部门/职位）建立组织架构；</li><li>在<strong>项目与版本</strong>中创建项目，再添加需求任务；</li><li>完成后可在<strong>统计报表</strong>查看进度概览。</li></ul><p>所有数据默认保存在本机 IndexedDB 中，离线可用。</p>' },
    { id: 'sync', tag: '同步', title: '云端同步说明', body: '<p>本应用支持将数据同步到 CloudBase 云端：</p><ul><li>在<strong>设置 → 云同步</strong>中点击「首次数据播种」将本机数据上传至云端；</li><li>播种为幂等操作（本人数据仅覆盖本人），可重复点击；</li><li>「立即同步」可拉取云端变更并推送本地改动。</li></ul><p>同步引擎与播种功能已就绪（阶段 0.4/0.5），完整跨设备一致性待阶段 0.6 后端适配层上线。</p>' },
    { id: 'theme', tag: '界面', title: '深色模式与主题色', body: '<p>在<strong>设置 → 界面与展示</strong>中可调整：</p><ul><li><strong>深色模式</strong>：开启后全站表面色/文字/边框自动适配暗色，减少视觉疲劳；</li><li><strong>统一主题色</strong>：点击色板或使用自定义取色器，全站主色、图标与状态栏即时同步；</li><li>偏好保存到本机，可在「恢复默认」一键回退。</li></ul>' },
    { id: 'notify', tag: '通知', title: '消息通知设置', body: '<p>在<strong>设置 → 通知</strong>中可配置：</p><ul><li><strong>总开关</strong>：关闭后所有通知不触发；</li><li><strong>声音 / 震动 / 提示音</strong>：可分别开关并试听/测试效果；</li><li>通知偏好保存在本机，后续将随账号漫游（云端就绪后）。</li><li>真实推送（Web Push）需服务端支持，将在后续版本上线。</li></ul>' },
    { id: 'perm', tag: '权限', title: '系统权限说明', body: '<p>在<strong>设置 → 系统权限</strong>中可查询并引导授权：</p><ul><li><strong>相机</strong>：用于拍照上传头像与附件，点击「去授权」调起浏览器授权弹窗；</li><li><strong>麦克风</strong>：用于语音备注（规划中）；</li><li><strong>存储空间</strong>：申请持久化存储，降低数据被浏览器自动清理的风险。</li></ul><p>权限授予由浏览器控制，本页仅查询与引导。</p>' },
    { id: 'security', tag: '账号', title: '账号与安全', body: '<p>在<strong>设置 → 个人资料</strong>中可查看与编辑：</p><ul><li><strong>昵称 / 密码 / 手机 / 邮箱</strong>：点击对应行进入编辑浮层，保存后即时生效；</li><li><strong>密码</strong>须 8-20 位且同时包含大写英文、小写英文、数字、符号（@ . _ #）；</li><li><strong>手机</strong>为 11 位中国大陆手机号（选填），邮箱为必填；</li><li>修改账号会同步更新登录标识，请牢记新账号。</li></ul>' },
    { id: 'offline', tag: '入门', title: '离线与安装', body: '<p>本应用为 PWA（渐进式 Web 应用），支持：</p><ul><li><strong>离线使用</strong>：首次加载后，所有页面、脚本与更新日志自动缓存，无网络也可操作；</li><li><strong>安装到主屏</strong>：在 Chrome/Safari 浏览器菜单中点击「添加到主屏幕」，获得接近原生 App 的体验；</li><li><strong>Service Worker</strong>：自动缓存资源并后台静默更新，确保离线始终可用最新版本。</li></ul>' }
  ];
  var HELP_TAGS = ['全部', '入门', '同步', '界面', '通知', '权限', '账号'];
  var _helpFilter = '全部';

  function renderHelp() {
    renderHelpTags();
    renderHelpList();
    $('helpSearch').value = '';
    $('helpDetail').hidden = true;
    $('fbErr').style.display = 'none';
    $('fbThanks').style.display = 'none';
    $('fbContent').value = '';
    $('fbContact').value = '';
    // 反馈类型默认选中第一个
    var btns = document.querySelectorAll('#fbTypeRow .lang-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', i === 0);
    _helpFilter = '全部';
  }
  function renderHelpTags() {
    var box = $('helpTags'); if (!box) return;
    box.innerHTML = HELP_TAGS.map(function (t) {
      return '<span class="help-tag' + (t === _helpFilter ? ' active' : '') + '" onclick="RT_SETTINGS_PAGE.filterHelp(\'' + t + '\')">' + t + '</span>';
    }).join('');
  }
  function renderHelpList() {
    var box = $('helpList'); if (!box) return;
    var kw = ($('helpSearch').value || '').toLowerCase();
    var docs = HELP_DOCS.slice();
    if (_helpFilter !== '全部') docs = docs.filter(function (d) { return d.tag === _helpFilter; });
    if (kw) {
      docs = docs.filter(function (d) { return d.title.toLowerCase().indexOf(kw) !== -1 || d.body.toLowerCase().indexOf(kw) !== -1; });
    }
    if (!docs.length) { box.innerHTML = '<div class="no-results">未找到匹配的帮助文档</div>'; return; }
    box.innerHTML = docs.map(function (d) {
      return '<div class="help-item" onclick="RT_SETTINGS_PAGE.showHelpDoc(\'' + d.id + '\')">'
        + '<div class="help-item-title">' + escapeHtml(d.title) + '</div>'
        + '<span class="help-item-tag">' + escapeHtml(d.tag) + '</span></div>';
    }).join('');
  }
  function showHelpDoc(id) {
    var d = null;
    for (var i = 0; i < HELP_DOCS.length; i++) if (HELP_DOCS[i].id === id) { d = HELP_DOCS[i]; break; }
    if (!d) return;
    var el = $('helpDetail');
    if (!el) return;
    el.innerHTML = '<div class="help-back" onclick="RT_SETTINGS_PAGE.closeHelpDoc()">← 返回列表</div>'
      + '<div class="help-detail-title">' + escapeHtml(d.title) + '</div>'
      + '<div class="help-detail-body">' + d.body + '</div>';
    el.hidden = false;
  }
  function closeHelpDoc() { var el = $('helpDetail'); if (el) { el.hidden = true; el.innerHTML = ''; } }
  function filterHelp(tag) { _helpFilter = tag; renderHelpTags(); renderHelpList(); closeHelpDoc(); }
  function searchHelp() { closeHelpDoc(); renderHelpList(); }

  // 反馈表单 → IDB /feedback store（无阶段 0.6 时本地存储；roam 钩子待后端就绪）
  var _feedbackDbReady = false;
  function ensureFeedbackStore() {
    if (_feedbackDbReady) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open('req-tracker-feedback', 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('feedback')) db.createObjectStore('feedback', { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = function (e) { _feedbackDbReady = true; resolve(e.target.result); };
        req.onerror = function (e) { reject(e.target.error); };
      } catch (e) { reject(e); }
    });
  }
  function submitFeedback() {
    var content = $('fbContent').value.trim();
    if (!content) { showFbErr(t('settings.feedbackRequired')); return; }
    if (content.length < 4) { showFbErr(t('settings.feedbackMinLength')); return; }
    var btns = document.querySelectorAll('#fbTypeRow .lang-btn.active');
    var type = btns.length ? (btns[0].getAttribute('data-fbtype') || 'other') : 'other';
    var contact = $('fbContact').value.trim();
    var rec = { type: type, content: content, contact: contact, status: 'pending', createdAt: Date.now(), _owner: getSessionAccount() || 'local' };
    ensureFeedbackStore().then(function (db) {
      var tx = db.transaction('feedback', 'readwrite');
      tx.objectStore('feedback').add(rec);
      tx.oncomplete = function () {
        $('fbContent').value = ''; $('fbContact').value = ''; $('fbErr').style.display = 'none'; $('fbThanks').style.display = 'block';
        try { db.close(); } catch (_) {}
        if (typeof toast === 'function') toast(t('settings.feedbackSubmitted'), 'success', 2500);
        // roam 钩子：阶段 0.6 后自动推送到 CloudBase feedback 集合
        try { if (typeof RT_SYNC !== 'undefined' && RT_SYNC.pushFeedback) RT_SYNC.pushFeedback(rec); } catch (_) {}
      };
      tx.onerror = function () { showFbErr(t('settings.feedbackFailed')); };
    }).catch(function () { showFbErr(t('settings.feedbackFailed')); });
  }
  function showFbErr(msg) { var el = $('fbErr'); if (el) { el.textContent = msg; el.style.display = 'block'; } $('fbThanks').style.display = 'none'; }

  // ===== init =====
  function init() {
    bootRouting();
    var grid = $('langGrid');
    if (grid) { syncLangUI(); grid.addEventListener('click', onLangClick); }
    var sw = $('themeSwatches');
    if (sw) sw.addEventListener('click', onSwatchClick);
    // 跨页/跨标签语言同步
    document.addEventListener('langchange', function () {
      syncLangUI();
      renderLanding();   // 重渲染设置 hub（分组/子项名称与描述）
      handleRoute();     // 重渲染当前子视图 + 标题，使切换语言即时生效
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  root.RT_SETTINGS_PAGE = {
    init: init, syncNow: syncNow, startSeed: startSeed, refreshCloudStatus: refreshCloudStatus,
    renderUI: renderUI, renderNotify: renderNotify, toggleDark: toggleDark, pickTheme: pickTheme,
    onThemeCustom: onThemeCustom, resetTheme: resetTheme, toggleCustomColor: toggleCustomColor, onNotifyChange: onNotifyChange,
    previewRingtone: previewRingtone, testVibrate: testVibrate,
    renderPerms: renderPerms, requestPerm: requestPerm, renderDownload: renderDownload, onDownloadChange: onDownloadChange,
    renderHelp: renderHelp, searchHelp: searchHelp, filterHelp: filterHelp, showHelpDoc: showHelpDoc, closeHelpDoc: closeHelpDoc,
    submitFeedback: submitFeedback
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
