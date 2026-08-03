// time-source.js —— 打卡时间源抽象（批次 227 #5）
//
// 为什么需要它：客户端时钟可能被用户改错（时区/手动拨动），导致考勤统计失真。
// 因此「打卡权威时间」应优先取服务端时间，取不到再回退本地 Date.now()。
//
// 设计：
//   - getServerTime() 异步返回毫秒时间戳。
//   - 未配置 CloudBase（localStorage / 离线 / 沙箱）时立即回退 Date.now()，零等待。
//   - 已配置但云函数「未部署 / 超时 / 报错」时，2 秒内回退 Date.now()，绝不阻塞打卡。
//   - 云函数部署说明见 functions/getServerTime/index.js（沙箱无法代部署，由用户自行部署）。
//
// 纯逻辑、无 DOM，可 node 直跑单测（mock globalThis.RT_CLOUD 即可）。
(function (root) {
  'use strict';

  var FALLBACK_MS = 2000; // 云函数最长等待，超时即回退本地时间

  // 取服务端时间：优先自有云函数 getServerTime，取不到则回退 Date.now()
  function getServerTime() {
    var RT_CLOUD = root.RT_CLOUD;
    // 未初始化（无 SDK / 无 envId / 本地模式）→ 直接本地时间，避免 2s 空等
    if (!RT_CLOUD || !RT_CLOUD._app || typeof RT_CLOUD.callFunction !== 'function') {
      return Promise.resolve(Date.now());
    }
    var fallback = new Promise(function (resolve) {
      setTimeout(function () { resolve(Date.now()); }, FALLBACK_MS);
    });
    var remote = Promise.resolve(RT_CLOUD.callFunction('getServerTime', {})).then(function (r) {
      // 云函数约定返回 { time: <ms> }；容错：也可能直接返回 time
      var t = r && r.result ? (r.result.time != null ? r.result.time : r.result) : null;
      return (typeof t === 'number' && t > 0) ? t : Date.now();
    }).catch(function () { return Date.now(); });
    return Promise.race([remote, fallback]);
  }

  root.RT_TIME_SOURCE = { getServerTime: getServerTime, FALLBACK_MS: FALLBACK_MS };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_TIME_SOURCE;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
