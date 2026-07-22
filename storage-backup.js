// storage-backup.js —— 「存储与备份」独立页逻辑（自包含，不依赖 app.js 整页初始化）
//
// 该页从侧边栏「存储与备份」进入，承载原设置页的「数据备份」与「存储与数据」两张卡片。
// 为避免与首页 app.js 的整页 init 耦合（其 init 强依赖 index.html 的 DOM），
// 此处自包含地实现备份导出/导入与存储配额/持久化逻辑，复用同源 localStorage 与
// 同源 IndexedDB 图片/附件库（'req-tracker-pwa'），保证与首页读写同一份数据。

const STORE_KEY = 'req-tracker-v2-items';
const SETTINGS_KEY = 'req-tracker-v2-settings';

const DEFAULT_SETTINGS = {
  developers: [{ value: '开发A', enabled: true }, { value: '开发B', enabled: true }, { value: '开发C', enabled: true }],
  projects: [{ value: '默认项目', enabled: true }],
  groups: [{ value: '默认组', enabled: true, project: '默认项目' }]
};

// 深拷贝默认设置，避免与 DEFAULT_SETTINGS 共享引用
function cloneDefaultSettings() {
  const out = {};
  Object.keys(DEFAULT_SETTINGS).forEach((k) => {
    out[k] = DEFAULT_SETTINGS[k].map((x) => ({ value: x.value, enabled: x.enabled !== false, project: x.project || '' }));
  });
  return out;
}

// 兼容旧版「字符串数组」备份：统一转换为 { value, enabled, project } 对象数组
function migrateSettings(obj) {
  const out = { ...cloneDefaultSettings(), ...(obj || {}) };
  ['developers', 'projects', 'groups'].forEach((k) => {
    if (Array.isArray(out[k])) {
      out[k] = out[k].map((x) =>
        typeof x === 'string' ? { value: x, enabled: true, project: '' } : { value: x.value, enabled: x.enabled !== false, project: x.project || '' }
      );
    }
  });
  return out;
}

// 兼容迁移：旧数据用单值 dates.paused / dates.resumed，统一转为 pauseEvents 历史数组（按时间排序）
function normalizeItemDates(it) {
  if (!it || !it.dates) return it;
  const d = it.dates;
  if (!Array.isArray(d.pauseEvents)) {
    const ev = [];
    if (d.paused) ev.push({ type: 'pause', t: d.paused });
    if (d.resumed) ev.push({ type: 'resume', t: d.resumed });
    ev.sort((a, b) => a.t - b.t);
    d.pauseEvents = ev;
    delete d.paused;
    delete d.resumed;
  }
  return it;
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(normalizeItemDates) : [];
  } catch (e) {
    return [];
  }
}
function saveItems() {
  localStorage.setItem(STORE_KEY, JSON.stringify(items));
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? migrateSettings(JSON.parse(raw)) : cloneDefaultSettings();
    if (!s.selectedProject && s.projects.length) s.selectedProject = s.projects[0].value;
    return s;
  } catch (e) {
    return cloneDefaultSettings();
  }
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// 与首页共享同一份数据：每次进入页面重新读取，导入后写入以持久化
let items = loadItems();
let settings = loadSettings();

// ---------- 通用工具 ----------
function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const pad2 = (n) => String(n).padStart(2, '0');

function toast(msg, type, duration) {
  const t = document.getElementById('toast');
  if (!t) return;
  const msgEl = t.querySelector('.toast-msg');
  if (msgEl) msgEl.textContent = msg; else t.textContent = msg;
  t.classList.remove('toast--warn', 'toast--info', 'toast--success');
  if (type) t.classList.add('toast--' + type);
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), typeof duration === 'number' ? duration : 1800);
}

// 自定义居中确认弹窗（白色卡片 + 抬头「提示」+ 一分为二的取消/确认），返回 Promise<boolean>
function customConfirm(message, opts) {
  opts = opts || {};
  const title = opts.title || '提示';
  const confirmText = opts.confirmText || '确认';
  const cancelText = opts.cancelText || '取消';
  const danger = opts.danger === true;
  return new Promise((resolve) => {
    const existing = document.getElementById('cd-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    overlay.id = 'cd-overlay';
    const safeMsg = escapeHtml(message).replace(/\n/g, '<br>');
    overlay.innerHTML =
      '<div class="cd-card" role="dialog" aria-modal="true">' +
        '<div class="cd-header">' + escapeHtml(title) + '</div>' +
        '<div class="cd-body">' + safeMsg + '</div>' +
        '<div class="cd-actions">' +
          '<button class="cd-btn cd-cancel" type="button">' + escapeHtml(cancelText) + '</button>' +
          '<button class="cd-btn cd-confirm' + (danger ? ' cd-danger' : '') + '" type="button">' + escapeHtml(confirmText) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    let done = false;
    const close = (res) => {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(res);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(true); }
    };
    document.addEventListener('keydown', onKey);
    overlay.querySelector('.cd-cancel').addEventListener('click', () => close(false));
    overlay.querySelector('.cd-confirm').addEventListener('click', () => close(true));
    overlay.querySelector('.cd-confirm').focus();
  });
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ---------- IndexedDB 图片 / 附件存储（与首页同源库，定义收口到 config.js）----------
const _mediaCfg = (window.RT_CONFIG && window.RT_CONFIG.database && window.RT_CONFIG.database('media')) || {};
const DB_NAME = _mediaCfg.name || 'req-tracker-pwa';
const DB_VERSION = _mediaCfg.version || 4;
const IMG_STORE = (_mediaCfg.stores && _mediaCfg.stores[0]) || 'images';
const ATT_STORE = (_mediaCfg.stores && _mediaCfg.stores[1]) || 'attachments';

let _dbPromise = null;
function openImageDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('当前环境不支持 IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IMG_STORE)) {
        db.createObjectStore(IMG_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ATT_STORE)) {
        db.createObjectStore(ATT_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function dbPutImage(img) {
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).put(img);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}
function dbGetImages(ids) {
  if (!ids || !ids.length) return Promise.resolve([]);
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(IMG_STORE, 'readonly');
    } catch (e) {
      console.warn('dbGetImages: store 不存在，返回空', e);
      return resolve([]);
    }
    const store = tx.objectStore(IMG_STORE);
    const out = [];
    let pending = ids.length;
    ids.forEach((id) => {
      const req = store.get(id);
      req.onsuccess = () => { if (req.result) out.push(req.result); if (--pending === 0) resolve(out); };
      req.onerror = () => { if (--pending === 0) resolve(out); };
    });
  }));
}
function dbPutAttachment(att) {
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(ATT_STORE, 'readwrite');
    tx.objectStore(ATT_STORE).put(att);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}
function dbGetAttachments(ids) {
  if (!ids || !ids.length) return Promise.resolve([]);
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(ATT_STORE, 'readonly');
    } catch (e) {
      console.warn('dbGetAttachments: store 不存在，返回空', e);
      return resolve([]);
    }
    const store = tx.objectStore(ATT_STORE);
    const out = [];
    let pending = ids.length;
    ids.forEach((id) => {
      const req = store.get(id);
      req.onsuccess = () => { if (req.result) out.push(req.result); if (--pending === 0) resolve(out); };
      req.onerror = () => { if (--pending === 0) resolve(out); };
    });
  }));
}

function genImageId() {
  return 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function genAttachId() {
  return 'att-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// 把任务.images 中的「dataUrl 字符串 / {id,dataUrl} 对象」统一落库为 IndexedDB 记录，返回纯 ID 数组
async function storeImagesForItem(it) {
  const raw = Array.isArray(it.images) ? it.images : [];
  const ids = [];
  for (const x of raw) {
    if (x && typeof x === 'object' && x.id) {
      await dbPutImage({ id: x.id, dataUrl: x.dataUrl, taskId: it.id });
      ids.push(x.id);
    } else if (typeof x === 'string' && x.startsWith('data:')) {
      const id = genImageId();
      await dbPutImage({ id, dataUrl: x, taskId: it.id });
      ids.push(id);
    } else if (typeof x === 'string') {
      ids.push(x);
    }
  }
  it.images = ids;
  return ids;
}
// 把任务.attachments 中的对象统一落库为 IndexedDB 记录，返回纯 ID 数组
async function storeAttachmentsForItem(it) {
  const raw = Array.isArray(it.attachments) ? it.attachments : [];
  const ids = [];
  for (const x of raw) {
    if (x && typeof x === 'object' && x.id) {
      await dbPutAttachment({ id: x.id, name: x.name, type: x.type, size: x.size, dataUrl: x.dataUrl, taskId: it.id });
      ids.push(x.id);
    } else if (typeof x === 'string' && x.startsWith('data:')) {
      const id = genAttachId();
      const comma = x.indexOf(',');
      const meta = comma > 0 ? x.slice(5, comma) : '';
      const name = (meta.split(';')[0] || 'attachment').split('/').pop() || 'attachment';
      await dbPutAttachment({ id, name, type: meta.split(';')[0] || '', size: Math.round((x.length - comma - 1) * 0.75), dataUrl: x, taskId: it.id });
      ids.push(id);
    } else if (typeof x === 'string') {
      ids.push(x);
    }
  }
  it.attachments = ids;
  return ids;
}

// ---------- 存储配额与持久化 ----------
// IndexedDB 与本机磁盘共享「源存储配额」，无单库硬上限；但接近上限时写入会失败，
// 且 best-effort 存储可能被浏览器在存储压力下整体驱逐（iOS 尤为明显）。
async function getStorageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch (e) {
    return null;
  }
}
async function isStoragePersistent() {
  if (!navigator.storage || !navigator.storage.persisted) return false;
  try { return await navigator.storage.persisted(); } catch (e) { return false; }
}
async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try { return await navigator.storage.persist(); } catch (e) { return false; }
}

// 刷新本页「存储与数据」卡片的展示
async function refreshStorageInfo() {
  const usageEl = document.getElementById('storage-usage');
  const quotaEl = document.getElementById('storage-quota');
  const persistEl = document.getElementById('storage-persist');
  const btn = document.getElementById('btn-persist');
  const tipEl = document.getElementById('storage-tip');
  if (!usageEl || !quotaEl) return;
  const est = await getStorageEstimate();
  if (est) {
    usageEl.textContent = formatFileSize(est.usage) || '0 B';
    quotaEl.textContent = est.quota ? formatFileSize(est.quota) : '未知';
  } else {
    usageEl.textContent = '浏览器不支持';
    quotaEl.textContent = '—';
  }
  const persistent = await isStoragePersistent();
  if (persistEl) persistEl.textContent = persistent ? '已开启（防误删）' : '未开启';
  if (btn) btn.style.display = persistent ? 'none' : '';
  if (tipEl) tipEl.textContent = persistent
    ? '已开启后，系统清理存储时本应用数据不会被自动删除。'
    : '开启后，系统清理存储时本应用数据不会被自动删除（iOS/存储空间紧张设备尤其建议开启）。';
}

// ---------- 基础数据表（req-tracker 库）备份/还原 ----------
// req-tracker 库由 db.js 统一管理，存放人员/部门/职位/公司/项目/项目版本/字典/更新日志。
// 此处自包含地读写该库，不依赖 db.js 与各数据模块（避免引入完整 RT_DB 注册流程）。
// 基础库名收口到 config.js（RT_CONFIG.databases.main.name）；store 列表为备份所需的子集
// （已含 requirementTasks / taskLifecycles / todos / todoLifecycles，覆盖代办模块新增实体）
const BASE_DB_NAME = (window.RT_CONFIG && window.RT_CONFIG.database && window.RT_CONFIG.database('main') && window.RT_CONFIG.database('main').name) || 'req-tracker';
// 与 db.js 中各模块 registerStore 的 store 名一致（备份所需子集，共 12 个 store）
const BASE_STORES = ['users', 'departments', 'positions', 'companies', 'projects', 'projectVersions', 'dict', 'changelog', 'requirementTasks', 'taskLifecycles', 'todos', 'todoLifecycles'];
const ACCOUNTS_LS_KEY = 'rt_accounts';  // 保留键名兼容旧数据迁移（users.js migrateAccounts）

// 打开基础数据库（只读探测已有版本，避免触发 upgrade）
function openBaseDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('当前环境不支持 IndexedDB')); return; }
    const req = indexedDB.open(BASE_DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 读取基础库所有 store 的全部记录，返回 { users: [...], departments: [...], ... }
async function exportBaseData() {
  let db;
  try {
    db = await openBaseDB();
  } catch (e) {
    console.warn('[备份] 无法打开基础数据库 req-tracker，跳过基础数据:', e);
    return {};
  }
  const out = {};
  // 只读取已存在的 store（避免在旧设备上 store 未建出时抛错）
  const existing = BASE_STORES.filter((n) => db.objectStoreNames.contains(n));
  await Promise.all(existing.map((name) => {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(name, 'readonly');
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => { out[name] = Array.isArray(req.result) ? req.result : []; resolve(); };
        req.onerror = () => { out[name] = []; resolve(); };
      } catch (e) {
        out[name] = [];
        resolve();
      }
    });
  }));
  db.close();
  return out;
}

// 将备份中的基础数据写回 req-tracker 库（覆盖式：先 clear 再 put）
async function importBaseData(baseData) {
  if (!baseData || typeof baseData !== 'object') return;
  let db;
  try {
    db = await openBaseDB();
  } catch (e) {
    console.warn('[备份] 无法打开基础数据库写入，跳过:', e);
    return;
  }
  const existing = BASE_STORES.filter((n) => db.objectStoreNames.contains(n));
  // 单事务覆盖所有存在的 store，保证原子性
  await new Promise((resolve) => {
    const tx = db.transaction(existing, 'readwrite');
    let pending = existing.length;
    if (pending === 0) { db.close(); resolve(); return; }
    existing.forEach((name) => {
      const store = tx.objectStore(name);
      const records = Array.isArray(baseData[name]) ? baseData[name] : [];
      store.clear();
      records.forEach((rec) => { try { store.put(rec); } catch (_) {} });
    });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { try { db.close(); } catch (_) {} resolve(); };
    tx.onabort = () => { try { db.close(); } catch (_) {} resolve(); };
  });
}

// ---------- 数据备份（导出 / 导入 JSON） ----------
const BACKUP_MAGIC = 'req-tracker-pwa';

async function downloadBackup() {
  // 展开图片数据：从 IndexedDB 取出 dataUrl 写入备份，避免导出后图片丢失
  const itemsWithImages = await Promise.all(items.map(async (it) => {
    const imgs = await dbGetImages(it.images || []);
    const atts = await dbGetAttachments(it.attachments || []);
    return { ...it, images: imgs.map((i) => ({ id: i.id, dataUrl: i.dataUrl })), attachments: atts.map((a) => ({ id: a.id, name: a.name, type: a.type, size: a.size, dataUrl: a.dataUrl })) };
  }));
  // ★ 读取全部基础数据表（人员/部门/职位/公司/项目/项目版本/字典/更新日志）—— 账号信息已在 users 表中
  const baseData = await exportBaseData();
  const backup = {
    app: BACKUP_MAGIC,
    schema: 4,  // v4: 移除 accounts 字段（已合并到 baseData.users）
    exportedAt: Date.now(),
    data: { items: itemsWithImages, settings },
    baseData
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  a.href = url;
  a.download = `req-tracker-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  // 统计导出规模
  const baseCount = Object.keys(baseData).reduce((s, k) => s + (Array.isArray(baseData[k]) ? baseData[k].length : 0), 0);
  toast(`已导出：${itemsWithImages.length} 条任务 + ${baseCount} 条基础数据`, 'success', 2800);
}

async function applyBackup(parsed) {
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || !Array.isArray(data.items) || typeof data.settings !== 'object' || data.settings === null) {
    throw new Error('不是有效的备份文件');
  }
  const baseData = parsed && parsed.baseData ? parsed.baseData : null;
  const taskCount = items.length;
  const baseCount = baseData ? Object.keys(baseData).reduce((s, k) => s + (Array.isArray(baseData[k]) ? baseData[k].length : 0), 0) : 0;
  const ok = await customConfirm(
    `导入会用备份覆盖当前 ${taskCount} 条任务与全部设置${baseCount ? `、${baseCount} 条基础数据（人员/部门/职位/公司/项目等）` : ''}。\n确定继续？（建议先导出当前备份）`
  );
  if (!ok) return false;
  items = data.items;
  settings = migrateSettings(data.settings);
  if (!settings.selectedProject && settings.projects.length) settings.selectedProject = settings.projects[0].value;
  // 导入时把图片数据写回 IndexedDB，并把 tasks.images 转回纯 ID 引用
  for (const it of items) {
    if (Array.isArray(it.images) && it.images.length) await storeImagesForItem(it);
    if (Array.isArray(it.attachments) && it.attachments.length) await storeAttachmentsForItem(it);
  }
  saveItems();
  saveSettings();
  // ★ 还原基础数据表（账号信息已在 users 表中）
  if (baseData) {
    try { await importBaseData(baseData); }
    catch (e) { console.warn('[备份] 基础数据还原失败:', e); toast('基础数据还原失败：' + (e && e.message ? e.message : e), 'warn', 3000); }
  }
  // 本页不渲染首页列表，仅刷新存储卡片并提示；返回首页后首页会重新读取最新数据
  refreshStorageInfo();
  toast(`已导入 ${items.length} 条任务${baseCount ? ` + ${baseCount} 条基础数据` : ''}`, 'success', 2800);
  return true;
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      applyBackup(parsed);
    } catch (e) {
      toast('导入失败：' + (e && e.message ? e.message : '文件解析错误'));
    }
  };
  reader.onerror = () => toast('读取文件失败');
  reader.readAsText(file);
}

// ---------- Service Worker 注册（与主应用一致，保证离线可用）----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  fetch('version.json?_t=' + Date.now(), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const v = d && d.version ? d.version : '1.2.56';
      return navigator.serviceWorker.register('sw.js?v=' + v);
    })
    .catch(() => {});
}

// ---------- 初始化：绑定按钮、刷新存储卡片 ----------
function initStorageBackup() {
  const exportBtn = document.getElementById('btn-export');
  const importBtn = document.getElementById('btn-import');
  const importFile = document.getElementById('import-file');
  if (exportBtn) exportBtn.addEventListener('click', downloadBackup);
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importBackupFile(f);
      e.target.value = '';
    });
  }

  const persistBtn = document.getElementById('btn-persist');
  if (persistBtn) {
    persistBtn.addEventListener('click', async () => {
      const ok = await requestPersistentStorage();
      toast(ok ? '已开启持久化存储，数据将更不容易被清理' : '浏览器未授权持久化，数据仍可能被清理', ok ? 'success' : 'warn', 3200);
      refreshStorageInfo();
    });
  }

  refreshStorageInfo();
  registerSW();
}

document.addEventListener('DOMContentLoaded', initStorageBackup);
