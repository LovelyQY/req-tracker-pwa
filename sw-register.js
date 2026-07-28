/* sw-register.js — 通用 Service Worker 注册（批次129）
 * 读取同源 version.json 的 version 字段，注册带版本号的 sw.js，
 * 避免浏览器 24h 更新节流。被 14 个业务页面以一行 <script> 引入复用，
 * 各页面在其 DOMContentLoaded 回调中调用 registerAppSW()。
 *
 * 行为说明（零用户可见变更，仅更稳健）：
 *  - 统一为 register(...) 追加 .catch(function(){})，原 9 个页面为 fire-and-forget，
 *    现在可避免未处理的 Promise 拒绝（控制台报错），不改变正常注册流程。
 *  - 统一增加 'serviceWorker' in navigator 守卫，原 status.html 缺失该守卫，
 *    在不支持 SW 的环境下原代码会抛 TypeError，现已规避。
 */

function registerAppSW() {
  if (!('serviceWorker' in navigator)) return;
  fetch('version.json?_t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.version) {
        navigator.serviceWorker.register('sw.js?v=' + d.version).catch(function () {});
      }
    })
    .catch(function () {});
}
