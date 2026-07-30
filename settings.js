// settings.js —— 设置中心 hub（批次 174：landing 分组 + hash 子视图 + 路由）
//
// 架构（参照 storage-backup 的 landing + hashchange 范式）：
//   - GROUPS 定义三大分组（账号 / 通用 / 帮助）与其子项；renderLanding 渲染 landing 列表。
//   - 子视图以 `<div id="${hash}View" hidden>` 承载；handleRoute() 按 location.hash 切换显隐并改标题。
//   - settingsPageBack()：子视图内清空 hash 回 landing；landing 内调用 goBack()（auth.js 提供）。
//   - 进入 #gen-sync 触发 refreshCloudStatus（匿名登录测连）；进入 #gen-ui 同步语言高亮。
//
// 已落地子视图（批次 174）：#gen-ui（6 语言骨架）、#gen-sync（阶段 0.4/0.5 播种 + 立即同步）。
// 已落地子视图（批次 175）：#account-profile（资料）、#account-security（密码/手机/邮箱）、#account-devices（本机会话占位）。
// 其余子视图为占位空壳，由批次 176/177/178 填充。
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
      { key: 'gen-notify', name: '通知', desc: '开关 / 声音 / 震动', hash: 'gen-notify', icon: 'notification', real: true },
      { key: 'gen-ui', name: '界面与展示', desc: '深色 / 主题色 / 语言', hash: 'gen-ui', icon: 'theme', real: true },
      { key: 'gen-perm', name: '系统权限', desc: '相机 / 存储', hash: 'gen-perm', icon: 'permission', real: true },
      { key: 'gen-download', name: '下载地址', desc: '默认位置 / 记住选择', hash: 'gen-download', icon: 'download', real: true },
      { key: 'gen-sync', name: '云同步', desc: '同步时间 / 记录', hash: 'gen-sync', icon: 'cloud-sync', real: true }
    ]},
    { key: 'help', name: '帮助', icon: 'help', sort: 30, items: [
      { key: 'help', name: '帮助与反馈', desc: '使用说明 / 意见反馈', hash: 'help', icon: 'help', real: true }
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
    else if (h === 'gen-ui') { syncLangUI(); renderUI(); }
    else if (h === 'gen-notify') renderNotify();
    else if (h === 'gen-perm') renderPerms();
    else if (h === 'gen-download') renderDownload();
    else if (h === 'help') renderHelp();
    else if (h === 'account-profile') renderProfile();
    else if (h === 'account-security') renderSecurity();
    else if (h === 'account-devices') renderDevices();
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
      if (typeof toast === 'function') toast('该语言翻译筹备中，将随全站多语言批次上线', 'info', 2600);
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

  // ===== 账号分组（批次 175）：个人资料 / 账号安全 / 登录设备 =====
  // 内嵌 hash 子视图，复用 RT_USERS / RT_IMGSTORE / RT_DEPTS / RT_POSITIONS / RT_COMPANIES；
  // 后端（阶段 0.6 cloud 适配层）就绪后，资料 / 安全读写将自动走 CloudBase users 集合。
  var RE_ACCOUNT    = /^[A-Za-z0-9._@-]{4,20}$/;
  var RE_PW_CHARSET = /^[A-Za-z0-9@._#]{8,20}$/;
  var RE_PW_UPPER   = /[A-Z]/, RE_PW_LOWER = /[a-z]/, RE_PW_DIG = /[0-9]/, RE_PW_SYM = /[@._#]/;
  var accountRec = null; // 当前用户记录缓存

  // 可编辑字段定义（昵称属资料 op_profile_edit；其余属安全 op_security_edit）
  var AC_FIELDS = {
    nickname: { label: '昵称', placeholder: '最多 10 位', max: 10, perm: 'op_profile_edit', hint: '',
      validate: function (v) { if (v && v.length > 10) return '昵称最多 10 位'; return ''; } },
    account: { label: '账号', placeholder: '4-20 位，仅含英文、数字、. _ - @', max: 20, perm: 'op_security_edit',
      hint: '账号修改后会同步更新登录标识，请牢记新账号',
      validate: function (v) { if (!v) return '请输入账号'; if (!RE_ACCOUNT.test(v)) return '账号须 4-20 位，仅含英文、数字、. _ - @'; return ''; } },
    password: { label: '密码', type: 'password', placeholder: '新密码（8-20 位，含大小写/数字/符号）', max: 20, perm: 'op_security_edit',
      hint: '8-20 位，须同时包含：大写英文 + 小写英文 + 数字 + 符号（@ . _ #）',
      validate: function (v) {
        if (!v) return '请输入新密码';
        if (v.length < 8 || v.length > 20) return '密码长度须 8-20 位';
        if (!RE_PW_CHARSET.test(v)) return '密码仅含英文(大小写)、数字、@ . _ #';
        var miss = [];
        if (!RE_PW_UPPER.test(v)) miss.push('大写英文');
        if (!RE_PW_LOWER.test(v)) miss.push('小写英文');
        if (!RE_PW_DIG.test(v)) miss.push('数字');
        if (!RE_PW_SYM.test(v)) miss.push('符号(@._#)');
        if (miss.length) return '密码须同时包含：' + miss.join('、');
        return '';
      } },
    phone: { label: '手机', placeholder: '11 位手机号', max: 20, perm: 'op_security_edit', hint: '中国大陆手机号，选填',
      validate: function (v) { if (v && !/^1[3-9]\d{9}$/.test(v)) return '手机号格式不正确（11 位，1 开头）'; return ''; } },
    email: { label: '邮箱', placeholder: 'name@example.com', max: 60, perm: 'op_security_edit', hint: '邮箱为必填项',
      validate: function (v) { if (!v) return '请输入邮箱'; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return '邮箱格式不正确'; return ''; } }
  };

  function setText(id, val) {
    var el = $(id);
    if (el) el.textContent = (val == null || val === '') ? '—' : String(val);
  }

  async function loadAccountRec() {
    var acc = getSessionAccount();
    if (!acc) return null;
    if (typeof RT_USERS !== 'undefined' && RT_USERS.ensurePerson) { try { await RT_USERS.ensurePerson(acc); } catch (e) {} }
    var rec = (typeof RT_USERS !== 'undefined') ? await RT_USERS.getUserByAccount(acc) : null;
    if (!rec) {
      var m = (typeof getMyAccount === 'function') ? getMyAccount() : null;
      rec = m ? { account: m.account, phone: m.phone || '', email: m.email || '' } : null;
    }
    return rec;
  }

  async function renderProfile() {
    var rec = await loadAccountRec();
    if (!rec) return;
    accountRec = rec;
    setText('ac-name', rec.name || rec.nickname || rec.account);
    setText('ac-acc', '@' + (rec.account || '—'));
    setText('ac-nick', rec.nickname);
    setText('ac-realname', rec.name);
    setText('ac-emp', rec.employeeNo);
    setText('ac-account', rec.account);
    // 头像（dataURL 或 images 表引用）
    var av = $('acAvatar');
    if (av) {
      av.innerHTML = '';
      var seed = (rec.name || rec.nickname || rec.account || '?').slice(0, 1);
      if (rec.avatar && typeof RT_IMGSTORE !== 'undefined' && RT_IMGSTORE.resolveAvatar) {
        try {
          var url = await RT_IMGSTORE.resolveAvatar(rec.avatar);
          if (url) { var im = document.createElement('img'); im.src = url; im.alt = ''; av.appendChild(im); }
          else av.textContent = seed;
        } catch (e) { av.textContent = seed; }
      } else {
        av.textContent = seed;
      }
    }
    // 公司 / 部门 / 职位（外键解析只读）
    try {
      if (typeof RT_DEPTS !== 'undefined') {
        var d = rec.departmentId ? await RT_DEPTS.getDept(rec.departmentId) : null;
        setText('ac-dept', d ? d.deptName : '');
        if (d && d.companyId && typeof RT_COMPANIES !== 'undefined') {
          var c = await RT_COMPANIES.getCompany(d.companyId);
          setText('ac-company', c ? c.companyName : '');
        }
      }
      if (typeof RT_POSITIONS !== 'undefined') {
        var p = rec.positionId ? await RT_POSITIONS.getPosition(rec.positionId) : null;
        setText('ac-pos', p ? p.positionName : '');
      }
    } catch (e) {}
    guardPerm();
  }

  async function renderSecurity() {
    var rec = await loadAccountRec();
    if (!rec) return;
    accountRec = rec;
    setText('sec-account', rec.account);
    setText('sec-phone', rec.phone);
    setText('sec-email', rec.email);
    guardPerm();
  }

  async function renderDevices() {
    setText('dv-acc', getSessionAccount() || '—');
    setText('dv-ua', prettyUA(navigator.userAgent || ''));
    guardPerm();
  }

  function prettyUA(ua) {
    ua = ua || '';
    var os = '未知系统', br = '未知浏览器';
    if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';
    if (/Edg\//i.test(ua)) br = 'Edge';
    else if (/HuaweiBrowser|Huawei/i.test(ua)) br = '华为浏览器';
    else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) br = 'Chrome';
    else if (/Firefox\//i.test(ua)) br = 'Firefox';
    else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) br = 'Safari';
    return br + ' · ' + os;
  }

  function guardPerm() {
    if (typeof RT_PERM !== 'undefined' && RT_PERM.guard) { try { RT_PERM.guard(document); } catch (e) {} }
  }

  // 共享编辑浮层（昵称 / 账号 / 密码 / 手机 / 邮箱）
  var acEditMode = null;
  function openAcEdit(mode) {
    if (!accountRec) return;
    var def = AC_FIELDS[mode];
    if (!def) return;
    acEditMode = mode;
    var in1 = $('acF-input1'), in2 = $('acF-input2');
    $('acSheetTitle').textContent = '编辑' + def.label;
    $('acF-label').textContent = def.label;
    if (def.type === 'password') {
      in1.type = 'password'; in1.placeholder = def.placeholder; in1.value = ''; in1.maxLength = def.max;
      $('acF-confirm-group').style.display = 'block';
      in2.type = 'password'; in2.placeholder = '再次输入新密码'; in2.value = ''; in2.maxLength = def.max;
    } else {
      in1.type = 'text'; in1.placeholder = def.placeholder; in1.maxLength = def.max;
      in1.value = (mode === 'nickname') ? (accountRec.nickname || '')
        : (mode === 'account' ? accountRec.account
          : mode === 'phone' ? (accountRec.phone || '') : (accountRec.email || ''));
      $('acF-confirm-group').style.display = 'none';
    }
    if (def.hint) { $('acF-hint').textContent = def.hint; $('acF-hint').style.display = 'block'; }
    else { $('acF-hint').style.display = 'none'; }
    var saveBtn = $('acF-save');
    if (saveBtn) saveBtn.setAttribute('data-perm', def.perm || 'op_profile_edit');
    clearAcErr();
    $('acSheetMask').classList.add('show'); $('acSheet').classList.add('show');
    try { in1.focus(); } catch (e) {}
  }
  function clearAcErr() {
    var el = $('acF-err'); if (el) { el.textContent = ''; el.style.display = 'none'; }
    $('acF-input1').classList.remove('invalid'); $('acF-input2').classList.remove('invalid');
  }
  function showAcErr(msg) {
    var el = $('acF-err'); if (el) { el.textContent = msg; el.style.display = 'block'; }
    $('acF-input1').classList.add('invalid');
  }
  function closeAcSheet() {
    $('acSheetMask').classList.remove('show'); $('acSheet').classList.remove('show');
  }
  function saveAcField() {
    var mode = acEditMode;
    if (!mode || !accountRec || !accountRec.id) return;
    var def = AC_FIELDS[mode];
    var v1 = $('acF-input1').value;
    if (def.type === 'password') {
      var v2 = $('acF-input2').value;
      if (!v1) { showAcErr('请输入新密码'); return; }
      if (v1 !== v2) { showAcErr('两次输入的密码不一致'); return; }
    }
    var msg = def.validate(v1);
    if (msg) { showAcErr(msg); return; }
    var patch = {};
    patch[mode] = v1;
    var operator = getSessionAccount() || '';
    if (typeof RT_USERS !== 'undefined' && RT_USERS.updateProfile) {
      RT_USERS.updateProfile(accountRec.id, patch, operator)
        .then(function () {
          closeAcSheet();
          if (typeof toast === 'function') toast('已保存', 'success');
          renderProfile(); renderSecurity();
        })
        .catch(function (err) { showAcErr('保存失败：' + ((err && err.message) ? err.message : err)); });
    } else {
      showAcErr('保存失败：未加载用户模块');
    }
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
  function renderUI() {
    var p = prefsGet();
    var dt = $('uiDarkToggle'); if (dt) dt.checked = !!p.dark;
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
    if (typeof toast === 'function') toast(dt.checked ? '已开启深色模式' : '已关闭深色模式', 'success', 1500);
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
    if (typeof toast === 'function') toast('已恢复默认主题色', 'success', 1500);
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
      if (typeof toast === 'function') toast('请先开启「消息通知」与「声音」', 'info', 1800);
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
      if (typeof toast === 'function') toast('已触发震动', 'success', 1200);
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
    if (!content) { showFbErr('请输入反馈内容'); return; }
    if (content.length < 4) { showFbErr('反馈内容至少 4 个字'); return; }
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
        if (typeof toast === 'function') toast('反馈已提交，感谢你的意见！', 'success', 2500);
        // roam 钩子：阶段 0.6 后自动推送到 CloudBase feedback 集合
        try { if (typeof RT_SYNC !== 'undefined' && RT_SYNC.pushFeedback) RT_SYNC.pushFeedback(rec); } catch (_) {}
      };
      tx.onerror = function () { showFbErr('提交失败，请重试'); };
    }).catch(function () { showFbErr('提交失败（本地数据库不可用）'); });
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
    document.addEventListener('langchange', function () { syncLangUI(); });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  root.RT_SETTINGS_PAGE = {
    init: init, syncNow: syncNow, startSeed: startSeed, refreshCloudStatus: refreshCloudStatus,
    renderProfile: renderProfile, renderSecurity: renderSecurity, renderDevices: renderDevices,
    openAcEdit: openAcEdit, saveAcField: saveAcField, clearAcErr: clearAcErr, closeAcSheet: closeAcSheet,
    renderUI: renderUI, renderNotify: renderNotify, toggleDark: toggleDark, pickTheme: pickTheme,
    onThemeCustom: onThemeCustom, resetTheme: resetTheme, onNotifyChange: onNotifyChange,
    previewRingtone: previewRingtone, testVibrate: testVibrate,
    renderPerms: renderPerms, requestPerm: requestPerm, renderDownload: renderDownload, onDownloadChange: onDownloadChange,
    renderHelp: renderHelp, searchHelp: searchHelp, filterHelp: filterHelp, showHelpDoc: showHelpDoc, closeHelpDoc: closeHelpDoc,
    submitFeedback: submitFeedback
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
