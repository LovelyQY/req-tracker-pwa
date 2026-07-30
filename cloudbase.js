// cloudbase.js —— CloudBase 连接与初始化（阶段 0 起点，仅负责「连上 + 登录」，不碰业务数据）
//
// ─── 链接三件事 ───────────────────────────────────────────────
// 1. 控制台开通 CloudBase 环境 → 复制「环境 ID」（形如 xxxx-envid）
// 2. 把环境 ID 填入 config.js 的 RT_CONFIG.sync.cloudbase.envId（见下）
// 3. 在 index.html 引入 SDK（v3 为 ESM，无 UMD 全量包；CDN 会自动挂载 window.cloudbase 全局）
//    + 本文件，二者都需在业务脚本之前加载：
//      <script type="module">
//        import * as CB from 'https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk@3.6.6/+esm';
//        window.cloudbase = CB.default || CB;
//      </script>
//      <script src="cloudbase.js" defer></script>
//    （旧版 tcb-js-sdk 全局名为 tcb，本文件兼容两者；v3 全局名为 cloudbase）
// ─────────────────────────────────────────────────────────────
// 数据同步（pull/push/冲突/软删）见计划中的 sync.js（RT_SYNC），本文件只提供底层 app / auth / uid。
(function (root) {
  'use strict';

  var RT_CLOUD = {
    _app: null,
    _auth: null,
    _uid: null,
    status: 'init',          // init | ready | login | error

    // 环境 ID：优先 window.TCB_ENV，其次 RT_CONFIG.sync.cloudbase.envId
    envId: function () {
      try {
        if (root.TCB_ENV) return String(root.TCB_ENV);
        var c = root.RT_CONFIG && root.RT_CONFIG.sync && root.RT_CONFIG.sync.cloudbase;
        if (c && c.envId) return String(c.envId);
      } catch (e) {}
      return '';
    },

    // 初始化 SDK，返回 app 实例（重复调用安全）
    init: function () {
      if (this._app) return this._app;
      var sdk = root.cloudbase || root.tcb;
      var env = this.envId();
      if (!sdk) {
        console.warn('[RT_CLOUD] 未检测到 CloudBase SDK，请在 index.html 引入 @cloudbase/js-sdk');
        this.status = 'error';
        return null;
      }
      if (!env) {
        console.warn('[RT_CLOUD] 未配置环境 ID：请在 RT_CONFIG.sync.cloudbase.envId 或 window.TCB_ENV 设置');
        this.status = 'error';
        return null;
      }
      try {
        this._app = sdk.init({ env: env });
        this._auth = this._app.auth();
        this.status = 'ready';
      } catch (e) {
        console.error('[RT_CLOUD] 初始化失败：', e);
        this.status = 'error';
      }
      return this._app;
    },

    // 匿名登录：最易跑通，无需账号即拿到 uid（适合先验证同步链路）
    loginAnonymously: function () {
      var self = this;
      return this._ensure().then(function (auth) {
        return auth.signInAnonymously();
      }).then(function (user) {
        self._uid = user && user.uid ? user.uid : (self._auth.currentUser && self._auth.currentUser.uid);
        self.status = 'login';
        return self._uid;
      });
    },

    // 自定义登录：对应方案 3.2，本地校验通过后用云函数签发的 ticket 换取云端身份
    signInWithTicket: function (ticket) {
      var self = this;
      return this._ensure().then(function (auth) {
        return auth.signInWithTicket(ticket);
      }).then(function (user) {
        self._uid = user && user.uid ? user.uid : (self._auth.currentUser && self._auth.currentUser.uid);
        self.status = 'login';
        return self._uid;
      });
    },

    uid: function () { return this._uid; },

    // 返回 CloudBase 数据库实例（需在 login 之后；供 RT_SYNC / RT_SEED 写入使用）
    database: function () {
      if (!this._app) this.init();
      if (!this._app) return null;
      return this._app.database();
    },

    // 健康检查：简单 .get() 验证连通（占位集合，避免误读业务数据）
    healthCheck: function () {
      var self = this;
      return this._ensure().then(function () {
        return self._app.database().collection('_rt_probe').limit(1).get();
      }).then(function () {
        return { ok: true, env: self.envId(), uid: self._uid };
      }).catch(function (e) {
        return { ok: false, error: (e && e.message) ? e.message : String(e) };
      });
    },

    _ensure: function () {
      if (!this._app) this.init();
      if (!this._app) return Promise.reject(new Error('CloudBase 未初始化（缺少 SDK 或环境 ID）'));
      if (!this._auth) this._auth = this._app.auth();
      return Promise.resolve(this._auth);
    }
  };

  root.RT_CLOUD = RT_CLOUD;

  // DOM 就绪后自动初始化（仅探测配置，不强制登录；首次真正登录由登录流程或 sync 引擎触发）
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      if (RT_CLOUD.envId()) RT_CLOUD.init();
    });
  }
})(typeof window !== 'undefined' ? window : this);
