// auth.js —— 单一共享会话 / 账号模块（v1）
// 所有页面通过 <script src="auth.js?v=X"></script> 引入，函数挂全局，供登录闸门、
// 侧边栏、个人信息、编辑表单等复用，彻底消除各页面重复的会话/账号逻辑。
//
// 会话 rt_session 存为 JSON：{ a: 账号, exp: 过期时间戳(ms) }
//   - 「记住登录」勾选 → 存 localStorage（关闭浏览器仍保留，直到 exp）
//   - 未勾选         → 存 sessionStorage（关闭标签页/浏览器即清除），仍受 exp 约束
// 旧格式（纯账号串）兼容返回，但新写入一律带 exp。
(function (root) {
  'use strict';

  var SESSION_KEY = 'rt_session';
  var ACCOUNTS_KEY = 'rt_accounts';

  function readSessionRaw() {
    try { return localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY); }
    catch (e) { return null; }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  // 当前登录账号字符串；过期/无效返回 null（并清除会话）
  function getSessionAccount() {
    try {
      var raw = readSessionRaw();
      if (!raw) return null;
      var s;
      try { s = JSON.parse(raw); } catch (e) { return raw; } // 兼容旧格式纯账号串，视为有效
      if (!s || !s.a) return null;
      if (s.exp && Date.now() > s.exp) { clearSession(); return null; }
      return s.a;
    } catch (e) { return null; }
  }

  // 写入会话：remember=true → localStorage，否则 sessionStorage
  // days 为免登时长（天），默认 1 天
  function setSession(account, remember, days) {
    days = (typeof days === 'number' && days > 0) ? days : 1;
    var exp = Date.now() + days * 24 * 60 * 60 * 1000;
    var payload = JSON.stringify({ a: account, exp: exp });
    try {
      if (remember) {
        localStorage.setItem(SESSION_KEY, payload);
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, payload);
        localStorage.removeItem(SESSION_KEY);
      }
    } catch (e) {}
    return payload;
  }

  // 仅更新会话中的账号标识（账号编辑场景），保持原存储位置（local/session）不变
  function updateSessionAccount(account) {
    try {
      var raw = readSessionRaw();
      if (!raw) return false;
      var s;
      try { s = JSON.parse(raw); } catch (e) { return false; }
      if (!s || !s.a) return false;
      s.a = account;
      var payload = JSON.stringify(s);
      // 当前在哪个存储就写回哪个，确保「记住登录」分流不被破坏
      try { if (localStorage.getItem(SESSION_KEY)) { localStorage.setItem(SESSION_KEY, payload); return true; } } catch (e) {}
      try { if (sessionStorage.getItem(SESSION_KEY)) { sessionStorage.setItem(SESSION_KEY, payload); return true; } } catch (e) {}
    } catch (e) {}
    return false;
  }

  // 退出登录：清除会话并跳转登录页
  function logout(redirect) {
    clearSession();
    location.replace(redirect || 'login/classic.html');
  }

  // 当前登录用户（账号 + 昵称）；过期返回 null
  function getCurrentUser() {
    try {
      var raw = readSessionRaw();
      if (!raw) return null;
      var s;
      try { s = JSON.parse(raw); } catch (e) { return null; } // 旧格式纯账号串无昵称，视为无效
      if (!s || !s.a) return null;
      if (s.exp && Date.now() > s.exp) { clearSession(); return null; }
      var account = s.a;
      var list = loadAccounts();
      var me = (Array.isArray(list) ? list : []).filter(function (a) { return a.account === account; })[0];
      return { account: account, nickname: (me && me.nickname) ? me.nickname : account };
    } catch (e) { return null; }
  }

  function loadAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveAccounts(list) {
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list || [])); } catch (e) {}
  }
  function getMyAccount() {
    var acc = getSessionAccount();
    if (!acc) return null;
    return loadAccounts().filter(function (a) { return a.account === acc; })[0] || null;
  }

  root.getSessionAccount = getSessionAccount;
  root.setSession = setSession;
  root.updateSessionAccount = updateSessionAccount;
  root.logout = logout;
  root.getCurrentUser = getCurrentUser;
  root.loadAccounts = loadAccounts;
  root.saveAccounts = saveAccounts;
  root.getMyAccount = getMyAccount;
  root.RT_AUTH = { SESSION_KEY: SESSION_KEY, ACCOUNTS_KEY: ACCOUNTS_KEY };

  // Node 仿真测试支持：导出供 require 使用
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getSessionAccount: getSessionAccount,
      setSession: setSession,
      updateSessionAccount: updateSessionAccount,
      logout: logout,
      getCurrentUser: getCurrentUser,
      loadAccounts: loadAccounts,
      saveAccounts: saveAccounts,
      getMyAccount: getMyAccount
    };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
