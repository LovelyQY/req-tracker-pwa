// config.js —— 全局配置（单一事实来源 / Single Source of Truth）
//
// 用途：
//   1. 集中收口所有 IndexedDB「链接」（库名 / 版本 / store 列表），消除
//      db.js / imgstore.js / app.js / storage-backup.js 中重复硬编码的库名与版本号。
//   2. 预留 featureFlags / ui / sync / limits 等分组，后续其它配置信息直接往里加，
//      不破坏结构。
//
// 为什么是 JS 而非 JSON：
//   主库名/版本在 db.js、媒体库名/版本在 imgstore.js / app.js / storage-backup.js 中
//   于「模块加载时」同步读取（indexedDB.open 同步构造），JSON 的异步 fetch 赶不上。
//   本项目既有的 RT_DB / RT_IMGSTORE 等模块均为 IIFE + root.xxx 挂全局，本文件保持一致。
//   文件由 SW 随发版版本化缓存，离线可用。
//
// 接入方式（见 EXEC_PLAN_1-4.md 的 Batch 2/3/4）：
//   - 各 HTML 入口页在 db.js / imgstore.js 之前加入 <script src="config.js"></script>
//   - 各模块改为读取 RT_CONFIG.databases.<key>.name / .version，不再硬编码。
//
// 注意：修改本文件后随发版升级；新增/删除库或改版本号时，务必同步更新下方与对应模块。

(function (root) {
  'use strict';

  var RT_CONFIG = {
    // ===================== IndexedDB 链接（库 = 链接）=====================
    databases: {
      // 主业务库：人员 / 部门 / 职位 / 公司 / 项目 / 版本 / 字典 /
      //            需求任务 / 任务生命周期 / 更新日志
      // 由 db.js (RT_DB) 统一拥有与升级；store 由各数据模块 registerStore 注册。
      main: {
        key: 'main',
        name: 'req-tracker',
        version: 4, // 基础版本；db.js 运行时按已存在版本自动抬升，不在此锁死；v4 新增 page_icons（图标管理覆盖层）
        owner: 'db.js (RT_DB.openDB)',
        stores: [
          'users', 'companies', 'departments', 'positions',
          'projects', 'projectVersions', 'dict',
          'requirementTasks', 'taskLifecycles', 'changelog'
        ],
        description: '主数据库，由 db.js 统一拥有与升级'
      },

      // 媒体库：图片 / 附件（Base64 字节，避免撑大 localStorage 配额）
      // 被 imgstore.js / app.js / storage-backup.js 三处共用，曾各自硬编码一份。
      media: {
        key: 'media',
        name: 'req-tracker-pwa',
        version: 4,
        owner: 'imgstore.js / app.js / storage-backup.js',
        stores: ['images', 'attachments'],
        description: '图片与附件二进制存储'
      }
      // 后续若新增 IndexedDB 库，在此追加一项即可（key 自定义，name/version/stores 必填）。
    },

    // ===================== 预留：后续其它配置分组 =====================
    // 你后续要放的「其他配置信息」按主题归入以下分组，新增分组也欢迎，勿删已用 key。
    featureFlags: { dataPermission: true }, // 功能开关（如 { newReport: true }；批次92数据权限默认开）
    ui: { lang: 'zh' }, // 界面语言：'zh' 中文（默认） / 'en' 英文（批次106起，为全站 i18n 预留）
    sync: {
      cloudbase: {
        envId: 'pwa-20260724-d2g883p981e75c948', // ★ CloudBase 环境 ID（控制台「环境设置 → 环境 ID」复制粘贴于此即启用云端能力）
        region: 'ap-shanghai'  // 环境所在地域，按需调整
      }
    },         // 同步 / 远程接口配置
    limits: {},       // 长度 / 配额上限（未来从各模块 LIMITS 收敛到此）

    // ===================== 首页「今日短语」默认池（单一事实来源）=====================
    // 纯文本、积极、贴合工作场景。设置页「界面与展示 → 首页今日短语」可增删改并持久化到
    // localStorage 'rt_ui_prefs.homePhrases'；用户未自定义时回退此内置池。
    homePhrasesDefault: [
      '今天也要元气满满', '把最重要的事先做完', '小步快跑，持续交付',
      '计划赶不上变化，先动起来', '专注当下，拒绝内耗', '会议少一点，效率高一点的',
      '文档写清楚，沟通省一半', '进度看得见，心里才踏实', '今日事今日毕',
      '把需求拆小，风险也变小', '喝口水，起来走走', '完成比完美更重要'
    ],

    // ===================== 元信息 =====================
    _meta: {
      configVersion: 1,
      note: '本文件为单一事实来源：IndexedDB 库名/版本勿在其它文件硬编码；改后随发版升级。'
    }
  };

  // ===================== 界面语言（批次106：为全站 i18n 预留）=====================
  // 双层架构：
  //   内存单一事实来源  → RT_CONFIG.ui.lang（默认 'zh'）
  //   持久层            → localStorage('rt_lang')（刷新 / SW 更新后恢复；未来可迁 IndexedDB 做跨设备同步）
  //   广播              → document 上派发 'langchange' 事件（detail.lang），供跨页/跨组件同步
  // 当前仅「权限树」作为首个双语消费者；其它页面后续逐步接入 getLang()。
  // 批次185：全站多语言支持 6 种语言（旧 'zh'/'en' 兼容映射）
  var RT_LANGS = ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'];
  (function initLang() {
    try {
      var saved = localStorage.getItem('rt_lang');
      if (saved === 'zh') saved = 'zh-CN';                 // 旧值兼容
      if (RT_LANGS.indexOf(saved) >= 0) RT_CONFIG.ui.lang = saved;
    } catch (e) { /* localStorage 不可用时忽略，回退默认 'zh-CN' */ }
  })();
  RT_CONFIG.LANGS = RT_LANGS;
  RT_CONFIG.getLang = function () {
    return (RT_LANGS.indexOf(RT_CONFIG.ui.lang) >= 0) ? RT_CONFIG.ui.lang : 'zh-CN';
  };
  RT_CONFIG.setLang = function (lang) {
    if (RT_LANGS.indexOf(lang) < 0) lang = 'zh-CN';
    RT_CONFIG.ui.lang = lang;
    try { localStorage.setItem('rt_lang', lang); } catch (e) { /* 忽略存储失败 */ }
    try {
      if (typeof document !== 'undefined' && document.dispatchEvent) {
        var ev = (typeof CustomEvent !== 'undefined')
          ? new CustomEvent('langchange', { detail: { lang: lang } })
          : { type: 'langchange', detail: { lang: lang } };
        document.dispatchEvent(ev);
      }
    } catch (e) { /* 忽略派发失败 */ }
    return lang;
  };

  // 便捷读取：RT_CONFIG.database('media').name
  RT_CONFIG.database = function (key) { return RT_CONFIG.databases[key] || null; };

  root.RT_CONFIG = RT_CONFIG;
  if (typeof module !== 'undefined' && module.exports) module.exports = RT_CONFIG;

  // ===================== 全局公共工具函数（避免各文件重复定义） =====================
  // escapeHtml: 防止 XSS，转义 HTML 特殊字符
  root.escapeHtml = function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  };

  // toast: 轻量级消息提示（批次 120 统一收口，各文件不再重复定义）
  root.toast = function toast(msg, type, duration) {
    var el = document.getElementById('toast');
    if (!el) return;
    var icon = el.querySelector('.toast-icon');
    var msgEl = el.querySelector('.toast-msg');
    if (icon) icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : '!';
    if (msgEl) msgEl.textContent = msg || '';
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, duration || 2500);
  };

  // formatFileSize: 格式化文件大小（批次 120 统一收口）
  root.formatFileSize = function formatFileSize(bytes) {
    if (bytes == null || isNaN(bytes)) return '0 B';
    var n = Number(bytes);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // customConfirm: 自定义居中确认弹窗，替代原生 confirm()（批次 120 统一收口）
  root.customConfirm = function customConfirm(message, opts) {
    opts = opts || {};
    var title = opts.title || '提示';
    var confirmText = opts.confirmText || '确认';
    var cancelText = opts.cancelText || '取消';
    var danger = opts.danger === true;
    return new Promise(function(resolve) {
      var existing = document.getElementById('cd-overlay');
      if (existing) existing.remove();
      var overlay = document.createElement('div');
      overlay.className = 'cd-overlay';
      overlay.id = 'cd-overlay';
      var safeMsg = escapeHtml(message).replace(/\n/g, '<br>');
      overlay.innerHTML =
        '<div class="cd-card" role="dialog" aria-modal="true">' +
          '<div class="cd-header">' + escapeHtml(title) + '</div>' +
          '<div class="cd-body">' + safeMsg + '</div>' +
          '<div class="cd-actions">' +
            '<button class="cd-btn cd-cancel" type="button">' + escapeHtml(cancelText) + '</button>' +
            '<button class="cd-btn cd-confirm' + (danger ? ' cd-danger' : '') + '" type="button">' + escapeHtml(confirmText) + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      var done = false;
      var close = function(res) {
        if (done) return;
        done = true;
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(res);
      };
      var onKey = function(e) {
        if (e.key === 'Escape') close(false);
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(true); }
      };
      document.addEventListener('keydown', onKey);
      overlay.querySelector('.cd-cancel').addEventListener('click', function() { close(false); });
      overlay.querySelector('.cd-confirm').addEventListener('click', function() { close(true); });
      overlay.querySelector('.cd-confirm').focus();
    });
  };

  // ===================== 全局空状态图标（批次225：统一回退为邮箱 emoji 📭，可经图标管理配置）=====================
  // 背景：批次224 曾用「彩色填充 SVG」按 variant 区分场景（box/task/bug/... 各色），
  // 现按需求回退为单个 emoji 📭，并注册为 page-icons 的 'empty' 默认 key，使其可在
  // 「图标管理」页显示 / 编辑 / 覆盖。渲染统一走 getEmptyIconHtml()，忽略 variant，保证「全局一致」。
  // 行为：优先返回 RT_PAGE_ICONS.get('empty')（含图标管理覆盖层）；RT_PAGE_ICONS 未加载时回退默认 emoji。
  var RT_EMPTY_ICON_DEFAULT = '<svg viewBox="0 0 24 24" width="22" height="22"><text x="12" y="17" font-size="18" text-anchor="middle">📭</text></svg>';
  root.RT_EMPTY_ICON_DEFAULT = RT_EMPTY_ICON_DEFAULT;
  root.getEmptyIconHtml = function getEmptyIconHtml() {
    if (root.RT_PAGE_ICONS && typeof root.RT_PAGE_ICONS.get === 'function') {
      var v = root.RT_PAGE_ICONS.get('empty');
      if (v) return v;
    }
    return RT_EMPTY_ICON_DEFAULT;
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
