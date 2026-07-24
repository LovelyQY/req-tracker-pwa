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
    ui: {},           // UI 相关（主题、每页条数等）
    sync: {},         // 同步 / 远程接口配置
    limits: {},       // 长度 / 配额上限（未来从各模块 LIMITS 收敛到此）

    // ===================== 元信息 =====================
    _meta: {
      configVersion: 1,
      note: '本文件为单一事实来源：IndexedDB 库名/版本勿在其它文件硬编码；改后随发版升级。'
    }
  };

  // 便捷读取：RT_CONFIG.database('media').name
  RT_CONFIG.database = function (key) { return RT_CONFIG.databases[key] || null; };

  root.RT_CONFIG = RT_CONFIG;
  if (typeof module !== 'undefined' && module.exports) module.exports = RT_CONFIG;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
