// wh.js —— 微枢 / 多 PWA 共享 CloudBase 环境「头部」配置（单一事实来源 / Single Source of Truth）
//
// 背景：
//   6 个月免费版 CloudBase 仅 1 个环境，但需要把「多个 PWA」都放进同一个环境。
//   本文件即「共享头部」：把所有页面散落的 CloudBase 环境连接配置，以及
//   「本 PWA 标识 / 云端集合命名空间」集中到这一处，避免 envId 在 config.js /
//   deploy-cloudbase.sh / init-db.py / collections.schema.json / 各 HTML 重复硬编码。
//
// 用法（每个 HTML <head>，必须置于 CloudBase SDK <script type="module"> 与 cloudbase.js 之前）：
//   <script src="wh.js?v=1.4.37"></script>
//
// 多 PWA 复用：把本文件复制到另一个 PWA 工程，仅改 pwaKey / collPrefix（必要时 envId
// 保持同一环境），即可让多个 PWA 共用同一 CloudBase 环境而数据互不干扰。
//
// 读取方：cloudbase.js（envId / collPrefix）、init-db.py（envId / collPrefix，正则解析）、
//         deploy-cloudbase.sh（envId，grep 解析）、RT_SYNC.js（collPrefix 加集合前缀）。
(function (root) {
  'use strict';

  root.RT_CLOUD_ENV = {
    // ★ CloudBase 环境 ID（控制台「环境设置 → 环境 ID」复制粘贴于此即启用云端能力；
    //   改环境 / 换号只改这一处，全站与后端脚本自动跟随）。
    envId: 'pwa-20260724-d2g883p981e75c948',

    // 环境所在地域（informational；@cloudbase/js-sdk 的 init 只需 env，地域由环境本身决定）
    region: 'ap-shanghai',

    // Web SDK 版本（须与 index.html 等页面 <script type="module"> 引入的
    // @cloudbase/js-sdk@x.y.z 版本保持一致；升级 SDK 时改两处：本字段 + 各 HTML 的 import URL）。
    sdkVersion: '3.6.6',

    // 本 PWA 标识（微枢 = ws）。用于在「同一 CloudBase 环境 + 多个 PWA」场景下区分归属。
    pwaKey: 'ws',

    // 云端集合（数据表）命名空间前缀：本 PWA 的所有云端集合统一加此前缀，
    // 与同环境其它 PWA 的集合物理隔离（如 ws_users / ws_requirements / ws_projects …）。
    // 本地 IndexedDB 不受影响（各 PWA 本就是独立应用、各自独立库）。
    // 加第二个 PWA 时：复制本文件、改 pwaKey='xy' 与 collPrefix='xy_' 即可，无需动业务代码。
    collPrefix: 'ws_'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_CLOUD_ENV;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
