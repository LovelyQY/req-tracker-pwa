// cloud-storage.js —— 阶段 0.6：云存储适配层（RT_CLOUD_STORAGE）
//
// 职责（对齐 CloudBase 后端化方案 §3.3 cloud-storage.js / §5.3 媒体改造）：
//   · 媒体（头像 / 附件）二进制本体上传到云存储，返回可访问 URL；
//   · IndexedDB 仅保留 id 引用 + 元数据（如 users.avatar 字段存短 id），
//     离线时回退本地缓存，跨设备时回退云存储。
//   · 优雅降级：无 CloudBase 环境 / 未登录 / SDK 缺失时，所有方法安全 no-op 返回 null。
//
// 接入点（由 cloud-adapter.js 调用）：
//   · RT_IMGSTORE.resolveAvatar：本地缓存未命中后调用 resolveAvatarUrl(ref)。
//   · RT_IMGSTORE.dbPutImage：写入本地后 best-effort 调 uploadMedia 镜像到云。
//
// 云路径约定：media/<id>（头像 / 附件统一前缀，便于 resolveAvatarUrl 反查）。
//
// 说明：本文件纯函数、无 DOM 依赖，可在浏览器与 Node（单测）下直接 require。
(function (root) {
  'use strict';

  var DEFAULT_PREFIX = 'media/';

  // dataURL -> Blob（浏览器环境；Node 测试无 Blob 时降级返回 null）
  function dataUrlToBlob(dataUrl) {
    try {
      if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) return null;
      var sep = dataUrl.indexOf(',');
      if (sep < 0) return null;
      var meta = dataUrl.slice(5, sep);
      var isBase64 = meta.indexOf(';base64') !== -1;
      var mime = meta.split(';')[0] || 'application/octet-stream';
      var body = dataUrl.slice(sep + 1);
      var bin = isBase64 ? atob(body) : decodeURIComponent(body);
      var len = bin.length;
      var arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      if (typeof Blob === 'function') return new Blob([arr], { type: mime });
      return null;
    } catch (e) { return null; }
  }

  // 取得云存储实例（需 RT_CLOUD 已初始化且 SDK 支持 storage）；失败返回 null
  function storage() {
    try {
      var cb = root.RT_CLOUD;
      if (!cb || typeof cb.storage !== 'function') return null;
      var s = cb.storage();
      return s || null;
    } catch (e) { return null; }
  }

  // 云存储是否可用（有环境 ID + 能拿到 storage 实例）
  function enabled() {
    try {
      var cb = root.RT_CLOUD;
      if (!cb || !cb.envId || !cb.envId()) return false;
      return !!storage();
    } catch (e) { return false; }
  }

  // 上传二进制到云存储。
  //   dataUrl: 图片/附件 dataURL；kind: 逻辑类别（avatar/image/attachment 等）；id: 引用 id
  // 返回 Promise<cloudPath|null>：成功返回云路径，任何失败返回 null（调用方回退本地/默认）。
  function uploadMedia(dataUrl, kind, id) {
    return Promise.resolve().then(function () {
      if (typeof dataUrl !== 'string' || !id) return null;
      var st = storage();
      if (!st || typeof st.uploadFile !== 'function') return null;
      var cloudPath = DEFAULT_PREFIX + String(id);
      var blob = dataUrlToBlob(dataUrl);
      if (!blob) return null;
      return st.uploadFile({ cloudPath: cloudPath, filePath: blob })
        .then(function () { return cloudPath; })
        .catch(function () { return null; });
    });
  }

  // 由云路径换临时访问 URL
  function resolveUrl(cloudPath) {
    return Promise.resolve().then(function () {
      if (!cloudPath) return null;
      var st = storage();
      if (!st || typeof st.getTempFileURL !== 'function') return null;
      return st.getTempFileURL({ fileList: [cloudPath] }).then(function (res) {
        var list = (res && res.fileList) || [];
        for (var i = 0; i < list.length; i++) {
          var item = list[i] || {};
          if (item.fileID === cloudPath && item.tempFileURL) return item.tempFileURL;
          if ((item.download_url || item.url) && (!item.fileID || item.fileID === cloudPath))
            return item.download_url || item.url;
        }
        return null;
      }).catch(function () { return null; });
    });
  }

  // 由头像/媒体 id 反查云存储 URL（resolveAvatar 的云回退入口）
  function resolveAvatarUrl(ref) {
    if (!ref) return Promise.resolve(null);
    return resolveUrl(DEFAULT_PREFIX + String(ref));
  }

  function uploadAvatar(dataUrl, avatarId) {
    return uploadMedia(dataUrl, 'avatar', avatarId);
  }

  var api = {
    DEFAULT_PREFIX: DEFAULT_PREFIX,
    enabled: enabled,
    dataUrlToBlob: dataUrlToBlob,
    uploadMedia: uploadMedia,
    uploadAvatar: uploadAvatar,
    resolveUrl: resolveUrl,
    resolveAvatarUrl: resolveAvatarUrl
  };
  root.RT_CLOUD_STORAGE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
