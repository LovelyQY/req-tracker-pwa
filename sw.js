// Service Worker v4 —— HTML 网络优先，离线可用
// 策略：
//   - 导航请求（HTML）：network-first，失败回退到缓存的 index.html
//   - 静态资源（css/js/图标）：stale-while-revalidate（先返回缓存，后台更新）
const CACHE = 'req-tracker-v1.1.6';
const APP_SHELL = [
  './',
  './index.html',
  './index-nosw.html',
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

  // 导航请求：网络优先
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // CHANGELOG.md：network-first（发版后立即生效，不显示旧缓存内容）
  if (url.pathname.endsWith('CHANGELOG.md') || url.pathname.includes('CHANGELOG.md')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
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
