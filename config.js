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
// 接入方式（见 CONFIG_PLAN.md 的 Batch 2/3/4）：
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
        version: 3, // 基础版本；db.js 运行时按已存在版本自动抬升，不在此锁死
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
    sync: {},         // 同步 / 远程接口配置
    limits: {},       // 长度 / 配额上限（未来从各模块 LIMITS 收敛到此）

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
  (function initLang() {
    try {
      var saved = localStorage.getItem('rt_lang');
      if (saved === 'zh' || saved === 'en') RT_CONFIG.ui.lang = saved;
    } catch (e) { /* localStorage 不可用时忽略，回退默认 'zh' */ }
  })();
  RT_CONFIG.getLang = function () {
    return RT_CONFIG.ui.lang === 'en' ? 'en' : 'zh';
  };
  RT_CONFIG.setLang = function (lang) {
    if (lang !== 'zh' && lang !== 'en') lang = 'zh';
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
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
