// auth.js —— 单一共享会话 / 账号模块（v2）
// 所有页面通过 <script src="auth.js?v=X"></script> 引入，函数挂全局，供登录闸门、
// 侧边栏、个人信息、编辑表单等复用，彻底消除各页面重复的会话/账号逻辑。
//
// v2 变更：移除 localStorage rt_accounts 账号库，统一从 IndexedDB users 表读取。
// 会话 rt_session 存为 JSON：{ a: 账号, exp: 过期时间戳(ms) }
//   - 「记住登录」勾选 → 存 localStorage（关闭浏览器仍保留，直到 exp）
//   - 未勾选         → 存 sessionStorage（关闭标签页/浏览器即清除），仍受 exp 约束
// 旧格式（纯账号串）兼容返回，但新写入一律带 exp。
(function (root) {
  'use strict';

  var SESSION_KEY = 'rt_session';

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

  // 从 IndexedDB users 表查找当前登录用户，返回 { account, nickname, ... }
  // 异步版本，用于需要完整用户信息的场景
  function getUserAsync() {
    var acc = getSessionAccount();
    if (!acc) return Promise.resolve(null);
    if (typeof root.RT_USERS !== 'undefined' && root.RT_USERS.getUserByAccount) {
      return root.RT_USERS.getUserByAccount(acc).then(function (rec) {
        if (!rec) return null;
        return {
          account: rec.account,
          nickname: rec.nickname || rec.account,
          phone: rec.phone || '',
          email: rec.email || '',
          tags: rec.tags || '',
          signature: rec.signature || '',
          avatar: rec.avatar || '',
          status: rec.status || 'none',
          id: rec.id
        };
      }).catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  // 当前登录用户（账号 + 昵称）；过期返回 null（同步版本，用于不需要完整信息的场景）
  function getCurrentUser() {
    try {
      var raw = readSessionRaw();
      if (!raw) return null;
      var s;
      try { s = JSON.parse(raw); } catch (e) { return null; }
      if (!s || !s.a) return null;
      if (s.exp && Date.now() > s.exp) { clearSession(); return null; }
      // 返回基本会话信息，具体昵称由调用方异步获取
      return { account: s.a, nickname: s.a };
    } catch (e) { return null; }
  }

  // 兼容旧 API：loadAccounts / saveAccounts 改为空操作（不再使用 localStorage rt_accounts）
  function loadAccounts() {
    // 返回空数组，兼容旧调用方（它们会在兜底逻辑中判断为空后跳过）
    return [];
  }
  function saveAccounts(list) {
    // 空操作：不再写入 localStorage rt_accounts
  }
  function getMyAccount() {
    // 改为同步返回基本会话信息
    return getCurrentUser();
  }

  root.getSessionAccount = getSessionAccount;
  root.setSession = setSession;
  root.updateSessionAccount = updateSessionAccount;
  root.logout = logout;
  root.getCurrentUser = getCurrentUser;
  root.loadAccounts = loadAccounts;
  root.saveAccounts = saveAccounts;
  root.getMyAccount = getMyAccount;
  root.getUserAsync = getUserAsync;
  root.RT_AUTH = { SESSION_KEY: SESSION_KEY, ACCOUNTS_KEY: 'rt_accounts' /* 保留键名兼容 */ };

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
      getMyAccount: getMyAccount,
      getUserAsync: getUserAsync
    };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
