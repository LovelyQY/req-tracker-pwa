// Service Worker v5 —— 缓存优先 + 后台更新，离线可用
// 策略：
//   - 导航请求（HTML）：缓存优先，后台静默更新（批次 121-2：消除慢网白屏等待）
//   - 静态资源（css/js/图标）：stale-while-revalidate（先返回缓存，后台更新）
const CACHE = 'req-tracker-v1.3.56';
const APP_SHELL = [
  './',
  './index.html',
  './index-nosw.html',
  './profile.html',
  './profile-edit.html',
  './company.html',
  './position.html',
  './department.html',
  './project.html',
  './project-version.html',
  './dictionary.html',
  './about.html',
  './changelog.html',
  './basic-data.html',
  './storage-backup.html',
  './storage-backup.js',
  './status.html',
  './report.html',
  './report-common.js',
  './report-task.html',
  './report-task.js',
  './report-todo.html',
  './report-todo.js',
  './report-bug.html',
  './report-bug.js',
  './report-meeting.html',
  './report-meeting.js',
  './manifest.json',
  './CHANGELOG.md',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
// 注意：app.js / styles.css 不再预缓存，改由 fetch 事件按「版本化 URL」(app.js?v=1.0.x)
// 运行时缓存。每次发版 URL 变化即绕过旧缓存，彻底避免「刷新也还是旧版」的问题。

self.addEventListener('install', (event) => {
  // ★ 立即 skipWaiting：新版本 SW 安装后马上接管控制，
  //   避免旧 SW 长期占用页面变成「僵尸」导致无法更新（connection_reset -101）
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
});

// 保留消息接口（页面主动刷新时仍可用）
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只处理同源请求
  if (url.origin !== self.location.origin) return;

  // 导航请求：缓存优先 + 后台更新（批次 121-2）
  // 有缓存先出缓存（消除慢网白屏），同时后台拉取最新 HTML 更新缓存；
  // 无缓存则等网络。离线时回退到 index.html。
  // 版本一致性由 index.html/about.html 的 controllerchange 钩子 + version.json 比对兜底。
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req).then(function(cached) {
        // 后台更新：静默拉取最新版本并写入缓存
        const network = fetch(req, { cache: 'no-store' }).then(function(res) {
          caches.open(CACHE).then(function(c) { c.put(req, res.clone()); });
          return res;
        }).catch(function() {});
        // 有缓存立即返回，无缓存等网络
        return cached || network;
      })
    );
    return;
  }

  // CHANGELOG.md：network-first（发版后立即生效，不显示旧缓存内容）
  if (url.pathname.endsWith('CHANGELOG.md') || url.pathname.includes('CHANGELOG.md')) {
    // 用固定路径作为缓存 key（忽略前端附加的 ?_t= 时间戳），否则带 query 的请求
    // 永远匹配不到 install 时缓存的无 query './CHANGELOG.md'，离线时返回空响应。
    const cacheKey = new URL(req.url); cacheKey.search = '';
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(cacheKey, copy));
          return res;
        })
        .catch(() => caches.match(cacheKey).then((r) => r || caches.match('./CHANGELOG.md')))
    );
    return;
  }

  // 静态资源：stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
