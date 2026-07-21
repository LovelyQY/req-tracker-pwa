// 需求任务追踪 —— 微信小程序风格 PWA 逻辑
// 数据持久化在 localStorage，离线可用

const STORE_KEY = 'req-tracker-v2-items';
const SETTINGS_KEY = 'req-tracker-v2-settings';
const UI_STATE_KEY = 'req-tracker-v2-ui';
// 任务类型改为字典驱动（单一来源）：TASK_TYPE_LIST 在 init() 预取后填充（元素 {code,name,order,color}）。
// 全站 chips/筛选/图表/报表均读取它，改 dictionary.js 种子即全站生效，无需改业务代码。
// FALLBACK_TASK_TYPES 为字典加载失败时的兜底，保证 UI 不崩。
const FALLBACK_TASK_TYPES = [
  { code: 'REQ', name: '需求', order: 1, color: '#096dd9' },
  { code: 'ONLINE_BUG', name: '线上BUG', order: 2, color: '#cf1322' },
  { code: 'COMMON_BUG', name: '普通BUG', order: 3, color: '#ff7a00' }
];
let TASK_TYPE_LIST = [];
let TYPE_CODE_TO_NAME = {};
let TYPE_NAME_TO_CODE = {};
let TYPE_CODE_TO_COLOR = {};
function setTaskTypeList(list) {
  TASK_TYPE_LIST = Array.isArray(list) ? list.slice() : [];
  TYPE_CODE_TO_NAME = {};
  TYPE_NAME_TO_CODE = {};
  TYPE_CODE_TO_COLOR = {};
  TASK_TYPE_LIST.forEach(function (t) {
    if (!t || !t.code) return;
    TYPE_CODE_TO_NAME[t.code] = t.name;
    TYPE_NAME_TO_CODE[t.name] = t.code;
    if (t.color) TYPE_CODE_TO_COLOR[t.code] = t.color;
  });
}
// 由任务记录的 typeCode 解析展示名；找不到时回退记录自身的中文 type（兼容迁移前数据）
function resolveTypeName(code, fallbackType) {
  if (code && TYPE_CODE_TO_NAME[code]) return TYPE_CODE_TO_NAME[code];
  return fallbackType || code || '';
}
// 由 typeCode 解析展示色；缺省中性灰
function resolveTypeColor(code) {
  return (code && TYPE_CODE_TO_COLOR[code]) || '#8c8c8c';
}
// 启动预取：确保字典已播种并取出任务类型列表；异常则走兜底
async function ensureTaskTypes() {
  try {
    if (typeof RT_DICT !== 'undefined' && RT_DICT.seedDict) {
      await RT_DICT.seedDict((typeof getSessionAccount === 'function' ? getSessionAccount() : 'system') || 'system');
    }
    if (typeof RT_DICT !== 'undefined' && RT_DICT.getDictByType && RT_DICT.SEED_TYPE) {
      const list = await RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TASK_TYPE);
      if (list && list.length) { setTaskTypeList(list); return; }
    }
  } catch (e) { /* 字典异常则走兜底 */ }
  setTaskTypeList(FALLBACK_TASK_TYPES);
}

// ===== 字典预取（仿 ensureTaskTypes / setTaskTypeList 模式）=====
async function ensurePriorities() {
  try {
    if (typeof RT_DICT !== 'undefined' && RT_DICT.seedDict) {
      await RT_DICT.seedDict((typeof getSessionAccount === 'function' ? getSessionAccount() : 'system') || 'system');
    }
    if (typeof RT_DICT !== 'undefined' && RT_DICT.getDictByType && RT_DICT.SEED_TYPE) {
      const list = await RT_DICT.getDictByType(RT_DICT.SEED_TYPE.PRIORITY);
      if (list && list.length) { setPriorityList(list); return; }
    }
  } catch (e) { /* 字典异常则走兜底 */ }
  // fallback
  setPriorityList([
    { code: 'HIGH', name: '高', order: 1 },
    { code: 'MEDIUM', name: '中', order: 2 },
    { code: 'LOW', name: '低', order: 3 }
  ]);
}
function setPriorityList(list) {
  priorityList = Array.isArray(list) ? list.slice() : [];
}

async function ensureProjects() {
  try {
    if (typeof RT_PROJECTS !== 'undefined' && RT_PROJECTS.getAllProjects) {
      setProjectList(await RT_PROJECTS.getAllProjects()); return;
    }
  } catch (e) { /* 异常则走兜底 */ }
  setProjectList([]);
}
function setProjectList(list) { projectList = Array.isArray(list) ? list : []; }

async function ensureProjectVersions() {
  try {
    if (typeof RT_PROJECT_VERSIONS !== 'undefined' && RT_PROJECT_VERSIONS.getAllProjectVersions) {
      setVersionList(await RT_PROJECT_VERSIONS.getAllProjectVersions()); return;
    }
  } catch (e) { /* 异常则走兜底 */ }
  setVersionList([]);
}
function setVersionList(list) { versionList = Array.isArray(list) ? list : []; }

async function ensureDevelopers() {
  try {
    if (typeof RT_USERS !== 'undefined' && RT_USERS.getAllUsers) {
      setUserList(await RT_USERS.getAllUsers()); return;
    }
  } catch (e) { /* 异常则走兜底 */ }
  setUserList([]);
}
function setUserList(list) { userList = Array.isArray(list) ? list : []; }

// ===== 展示映射（code→中文名 / id→名称）=====
function priorityName(code) {
  const p = priorityList.find(function (x) { return x && x.code === code; });
  return p ? p.name : (code || '');
}
function statusName(code) {
  // 复用已有 TYPE_CODE_TO_NAME 模式，或直接查字典
  if (!code) return '';
  const s = { TODO: '待开发', SUBMITTED: '已提测', TESTING: '测试中', TESTED: '已测完', ONLINE: '已上线' };
  return s[code] || code;
}
function projectNameById(id) {
  const p = projectList.find(function (x) { return x && x.id === id; });
  return p ? p.projectName : (id || '');
}
function versionNameById(id) {
  const v = versionList.find(function (x) { return x && x.id === id; });
  return v ? v.versionName : (id || '');
}
function userNicknamesByIds(ids) {
  if (!ids || !ids.length) return [];
  return ids.map(function (id) {
    const u = userList.find(function (x) { return x && x.id === id; });
    return u ? (u.nickname || u.name || id) : id;
  });
}
function versionsByProject(projectId) {
  if (!projectId) return versionList;
  return versionList.filter(function (v) { return v && v.projectId === projectId; });
}

// ===== 旧数据兼容映射 =====
const LEGACY_STATUS_MAP = { '待开发': 'TODO', '已提测': 'SUBMITTED', '测试中': 'TESTING', '已测完': 'TESTED', '已上线': 'ONLINE' };
const LEGACY_PRIORITY_MAP = { '高': 'HIGH', '中': 'MEDIUM', '低': 'LOW' };
function legacyStatusToCode(s) { return LEGACY_STATUS_MAP[s] || 'TODO'; }
function legacyPriorityToCode(s) { return LEGACY_PRIORITY_MAP[s] || 'MEDIUM'; }

// ===== 新旧数据归一化 =====
// 将新旧数据统一映射到展示模型，使 renderCard / renderDetail 无需感知数据来源
function normalizeTask(t) {
  if (t._source === 'idb') {
    return {
      _source: 'idb',
      id: t.id,
      title: t.taskName,
      taskName: t.taskName,
      desc: t.taskDesc,
      typeCode: t.taskTypeCode,
      priorityText: priorityName(t.priorityCode),
      priorityCode: t.priorityCode,
      statusText: statusName(t.statusCode),
      statusCode: t.statusCode,
      projectName: projectNameById(t.projectId),
      versionName: versionNameById(t.projectVersionId),
      developerNames: userNicknamesByIds(t.developerIds),
      zentaoId: t.zentaoId,
      zentaoSubId: t.zentaoSubId,
      images: t.imageIds || [],
      attachments: t.attachmentIds || [],
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      raw: t  // 保留原始引用供详情/编辑用
    };
  }
  // legacy: 保持原样，补上统一字段名供渲染使用
  return Object.assign({}, t, {
    _source: 'legacy',
    title: t.title,
    desc: t.desc,
    priorityText: t.priority,                    // 旧数据本身就是中文
    priorityCode: legacyPriorityToCode(t.priority),
    statusText: t.status,
    statusCode: legacyStatusToCode(t.status),
    projectName: t.project,                       // 旧数据就是项目名字符串
    versionName: t.group,                         // 旧数据就是组名字符串
    developerNames: t.developers || [],            // 旧数据就是姓名数组
    images: t.images || [],
    attachments: t.attachments || [],
    raw: t
  });
}

// 旧数据迁移：将 localStorage legacy items 批量迁移到 requirementTasks 表（骨架，本期不调用）
// 调用时机：页面初始化时 `refreshTaskList()` 检测到新表为空且 localStorage 有旧数据时提示用户执行
// 本期不启用：新表数据结构尚未稳定，迁移失败不静默吞错；待后续迭代启用
function migrateLegacyItems() {
  // TODO: 遍历 items → normalizeTask → 去重后逐条 createRequirementTask → 成功后从 localStorage 删除 → 重新 refreshTaskList
  return Promise.resolve();
}

// 旧数据迁移：任务记录仅含中文 type 时，按 name→code 补齐 typeCode（幂等，不改原有 type）
function migrateItemTypeCodes() {
  if (!Array.isArray(items)) return;
  let changed = false;
  items.forEach(function (it) {
    if (it && !it.typeCode && it.type && TYPE_NAME_TO_CODE[it.type]) {
      it.typeCode = TYPE_NAME_TO_CODE[it.type];
      changed = true;
    }
  });
  if (changed) saveItems();
}
const STATUSES = ['待开发', '已提测', '测试中', '已测完', '已上线'];
const STAT_STATS = ['已提测', '测试中', '已测完', '已上线'];

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

const DEFAULT_UI_STATE = { showStats: true, showFilters: true };

let items = loadItems();
let settings = loadSettings();
let uiState = loadUIState();
let editingId = null;
let editingSetting = null;
let filter = { typeCode: [], status: [], q: '', project: '', group: [], priority: [], paused: '' };
let currentView = 'task';
let formTypeCode = 'REQ';
let formPriorityCode = 'MEDIUM';
let formDeveloperIds = [];  // 替换原来的 formDevs（姓名数组）
let formImages = [];   // 当前表单中的图片（{id, dataUrl} 对象，dataUrl 仅内存态，数据存 IndexedDB）
let formAttachments = []; // 当前表单中的附件（{id, name, type, dataUrl} 对象，dataUrl 仅内存态，数据存 IndexedDB）

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

function loadUIState() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    return raw ? { ...DEFAULT_UI_STATE, ...JSON.parse(raw) } : { ...DEFAULT_UI_STATE };
  } catch (e) {
    return { ...DEFAULT_UI_STATE };
  }
}
function saveUIState() {
  localStorage.setItem(UI_STATE_KEY, JSON.stringify(uiState));
}

// 生成唯一 ID（rt_ 前缀避免与其它 localStorage 数据冲突）
function uid() {
  return 'rt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 当前登录用户（账号 + 昵称）：由 auth.js 统一提供 getCurrentUser()
// （含过期校验，与首页登录闸门一致；首页有登录闸门，进入 app 时 rt_session 必然存在或已清退）

// 操作人展示文案：昵称(账号)；无昵称时仅显示账号；账号缺失时显示「—」
function formatOperator(u) {
  if (!u || !u.account) return '—';
  const acct = escapeHtml(u.account);
  const nick = (u.nickname && u.nickname !== u.account) ? escapeHtml(u.nickname) : '';
  return nick ? (nick + '(' + acct + ')') : acct;
}

// 记录一条操作步骤（动作 + 操作人 + 时间），用于详情页「任务生命周期」时间线
// 与 updatedBy（最终更新人）并存：updatedBy 只保留最后一次，ops 保留完整逐步轨迹
// statusOverride 用于动作结果态与当前 it.status 不一致的情况（如「删除」实际为已删除态）
function recordOp(it, action, by, statusOverride) {
  it.ops = it.ops || [];
  it.ops.push({
    action: action,
    status: (statusOverride !== undefined) ? statusOverride : (it.status || null),
    by: by || getCurrentUser(),
    at: Date.now()
  });
}

// 由一条操作记录推导其节点状态（用于时间线圆点/标签取真实颜色）
// 新记录直接读取 o.status；历史旧记录按动作名回退推导
function statusForOp(o) {
  if (o.status) return o.status;
  const m = {
    '创建': '待开发', '编辑': null, '删除': '删除', '重置': '待开发',
    '暂停': '暂停中', '恢复': '测试中', '开发提交': '已提测',
    '测试开始': '测试中', '测试完成': '已测完', '上线': '已上线', '推进': null
  };
  return (o.action && m[o.action] !== undefined) ? m[o.action] : null;
}

// 节点颜色：取实际状态对应的主题色变量；无状态动作（如编辑）用中性灰
function lifeColor(status) {
  if (!status) return '#94a3b8';
  return `var(--c-${status})`;
}

function toast(msg, type, duration) {
  const t = document.getElementById('toast');
  const msgEl = t.querySelector('.toast-msg');
  if (msgEl) msgEl.textContent = msg; else t.textContent = msg;
  // 类型样式：warn / info / success（对应 styles.css 中的 .toast--*）
  t.classList.remove('toast--warn', 'toast--info', 'toast--success');
  if (type) t.classList.add('toast--' + type);
  t.classList.add('show');
  clearTimeout(toast._t);
  // 第 3 个参数为可选停留时长（毫秒），默认 1800
  toast._t = setTimeout(() => t.classList.remove('show'), typeof duration === 'number' ? duration : 1800);
}

// 自定义居中确认弹窗（方案 E 风格：白色卡片 + 抬头「提示」+ 一分为二的取消/确认）
// 返回 Promise<boolean>，替代原生 confirm()（避免英文域名提示 & 方形高亮）
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
    // 不响应遮罩点击关闭，避免误触导致误删/误覆盖
    overlay.querySelector('.cd-confirm').focus();
  });
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 两位补零，日期/时间格式化共用（fmtDate / tsToLocalInput）
const pad2 = (n) => String(n).padStart(2, '0');

// ---------- 图片处理 ----------
// Canvas 压缩：最大宽度 800px，JPEG quality 0.7
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 800;
        let w = img.width, h = img.height;
        if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

// 读取任意文件为 dataURL（不压缩）
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

// 将 dataURL 同步转换为 Blob（必须在用户手势同步上下文中调用，避免弹窗拦截）
function dataUrlToBlob(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('不是有效的 dataURL');
  const parts = dataUrl.split(',');
  if (parts.length !== 2) throw new Error('dataURL 格式错误');
  const header = parts[0];
  const encoded = parts[1];
  const mimeMatch = header.match(/:(.*?);/);
  const isBase64 = header.includes(';base64');
  const mimeType = (mimeMatch && mimeMatch[1]) || 'application/octet-stream';
  let bytes;
  if (isBase64) {
    const byteString = atob(encoded);
    bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  } else {
    bytes = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
  }
  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

// 判断是否为移动端环境（移动端用新窗口更可靠；桌面/桌面PWA 用页面内模态框）
function isMobileEnv() {
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) return true;
  // 触屏且窄屏（手机/小平板）视为移动端
  if (('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.innerWidth < 820) return true;
  return false;
}

// 用 Blob URL 在新标签页打开（仅移动端主路径 / 桌面端兜底）
function openAttachmentNewTab(att) {
  const { blob } = dataUrlToBlob(att.dataUrl);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) window.location.href = url;
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 30000);
}

// 原生 <a download> 下载：真实浏览器中最可靠，带进度、保存到「下载」文件夹
function nativeDownload(att) {
  try {
    const { blob } = dataUrlToBlob(att.dataUrl);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.name || 'attachment';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 60000);
    return true;
  } catch (e) {
    console.error('原生下载失败:', e);
    return false;
  }
}

// 判断是否在 PWA standalone（独立窗口）模式——该模式下浏览器禁止任何形式的下载
function isStandalone() {
  return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

// 统一附件下载入口：按环境选择最可靠方式，并始终先给出可见反馈（杜绝「点击无反应」的错觉）。
async function handleAttachmentDownload(att) {
  if (!att || !att.dataUrl) { toast('附件数据不可用，请刷新后重试', 'warn'); return; }
  // 立即反馈：让用户确认点击已生效（即使浏览器随后静默拦截下载）
  toast('正在准备下载：' + (att.name || '附件'), 'info', 1800);
  // 移动端：系统分享文件最可靠（直接存到本机，Android Chrome 支持）
  if (isMobileEnv()) {
    try {
      const { blob } = dataUrlToBlob(att.dataUrl);
      const file = new File([blob], att.name || 'attachment', { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: att.name || '附件' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // 用户主动取消分享
      console.warn('navigator.share(files) 失败:', e);
    }
    // 移动端兜底：新窗口（真实浏览器上下文下载）
    openAttachmentNewTab(att);
    return;
  }
  // 桌面端
  // PWA 独立窗口（standalone）：该上下文里 File System Access API 不稳定——
  // 可能直接抛 SecurityError，也可能挂起永不返回（promise 既不 resolve 也不 reject），
  // 原生 <a download> 又常被静默拦截。最稳妥、必然可见且可用的方案是引导用户在
  // 真实浏览器中打开链接下载（?dl= 触发自动下载）。故 standalone 下直接走引导框，
  // 完全不依赖会“挂死”的 showSaveFilePicker，彻底避免“点了毫无反应、也没弹框”。
  if (isStandalone()) {
    const url = location.origin + location.pathname + '?dl=' + encodeURIComponent(att.id);
    showExternalDownloadDialog(url);
    return;
  }
  // 真实浏览器（非 standalone）：优先「另存为」对话框，必定产生实际文件、用户明确保存位置
  if (window.showSaveFilePicker) {
    try {
      const { blob, mimeType } = dataUrlToBlob(att.dataUrl);
      const ext = (att.name || '').includes('.') ? '.' + (att.name.split('.').pop()) : '';
      const accept = mimeType ? { [mimeType]: ext ? [ext] : [] } : { 'application/octet-stream': [] };
      const handle = await window.showSaveFilePicker({
        suggestedName: att.name || 'attachment',
        types: [{ description: att.name || '附件', accept }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      toast('已保存：' + (att.name || 'attachment'), 'success', 3000);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // 用户主动取消保存
      console.warn('showSaveFilePicker 失败，回退原生下载:', e);
    }
  }
  // 兜底：真实浏览器原生 <a download>
  nativeDownload(att);
}

// 外部下载引导模态框
function showExternalDownloadDialog(url) {
  const overlay = document.getElementById('ext-download-overlay');
  const urlInput = document.getElementById('ext-download-url');
  const openLink = document.getElementById('ext-download-open');
  const copyBtn = document.getElementById('ext-download-copy');
  const closeBtn = document.getElementById('ext-download-close');
  if (!overlay || !urlInput || !openLink) {
    // 极端兜底：复制链接并提示
    try { navigator.clipboard.writeText(url); } catch (e) {}
    toast('下载链接已复制，请在浏览器中打开本应用以下载', 'info');
    return;
  }
  urlInput.value = url;
  openLink.href = url;
  overlay.hidden = false;
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';

  const close = () => {
    overlay.classList.remove('show');
    overlay.hidden = true;
    document.body.style.overflow = '';
  };
  // 点击「在浏览器中打开」会新开标签页（target=_blank），但当前页的引导框必须关闭，
  // 否则全屏遮罩会一直盖住界面、拦截所有点击（表现为“任务卡点不开”）。
  if (openLink) openLink.onclick = close;
  copyBtn.onclick = () => {
    const clearSel = () => {
      if (window.getSelection) window.getSelection().removeAllRanges();
      try { urlInput.blur(); } catch (e) {}
    };
    const fallback = () => { urlInput.select(); try { document.execCommand('copy'); } catch (e) {} clearSel(); toast('链接已复制，请在浏览器粘贴打开', 'info'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          () => { clearSel(); toast('链接已复制，请在浏览器粘贴打开', 'info'); },
          () => fallback()
        );
      } else {
        fallback();
      }
    } catch (e) {
      fallback();
    }
  };
  closeBtn.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

// 浏览器打开 ?dl=附件ID 时，自动触发下载（此时处于浏览器上下文，下载可靠）
function checkAutoDownloadFromUrl() {
  let dlId = null;
  try {
    const params = new URLSearchParams(location.search);
    dlId = params.get('dl');
  } catch (e) {}
  if (!dlId) return;
  // 清理地址栏参数，避免刷新重复触发
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  // 等待 IndexedDB 与页面就绪
  setTimeout(async () => {
    // 版本校验：浏览器可能缓存了旧版 index.html（如 1.1.16），其下载逻辑较早释放 Blob 会导致大文件失败。
    // 若与 version.json 不一致，先刷新加载最新逻辑再下载。
    try {
      const res = await fetch('version.json?v=' + Date.now());
      const v = await res.json();
      if (v && v.version && v.version !== APP_VERSION) {
        toast('正在更新到 v' + v.version + ' 以下载…', 'info');
        setTimeout(() => location.reload(), 1000);
        return;
      }
    } catch (e) { /* 校验失败不阻塞下载 */ }
    try {
      const atts = await dbGetAttachments([dlId]);
      if (!atts.length) { toast('附件不存在或已删除', 'warn'); return; }
      const att = atts[0];
      if (!att.dataUrl) { toast('附件数据不可用', 'warn'); return; }
      // PWA 独立窗口中 <a download> 被浏览器禁止，改为弹引导框让用户去真实浏览器下载
      if (isStandalone()) {
        showExternalDownloadDialog(location.origin + location.pathname + '?dl=' + encodeURIComponent(dlId));
        toast('当前为 PWA 独立窗口，无法在本窗口下载，请在浏览器中打开下方链接', 'info', 4000);
        return;
      }
      // 普通浏览器：原生下载（带进度、存「下载」文件夹）
      nativeDownload(att);
      // 浏览器出于安全限制无法读取完整保存路径，仅提示文件名与默认下载文件夹
      const fname = att.name || 'attachment';
      toast('已开始下载：' + fname + '（保存到浏览器「下载」文件夹，可按 Ctrl+J / Cmd+Shift+J 查看）', 'info', 4500);
    } catch (e) {
      console.error('自动下载失败:', e);
      toast('自动下载失败，请返回应用重新下载', 'warn');
    }
  }, 800);
}

// 预览附件：
//  - 图片 → 模态框放大
//  - 移动端 → 新标签页（避免 iframe PDF 黑屏）
//  - 桌面/桌面PWA → 页面内 iframe 模态框（PDF 由 Chrome 原生 viewer 渲染，不会黑屏）
function previewAttachment(att) {
  if (!att.dataUrl) { toast('附件数据不可用，请刷新后重试', 'warn'); return; }
  const type = (att.type || '').toLowerCase();
  const lowerName = (att.name || '').toLowerCase();
  // 图片：模态框放大
  if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|svg|webp|bmp)$/.test(lowerName)) {
    try { openImageViewer(att.dataUrl); } catch (e) { openAttachmentNewTab(att); }
    return;
  }
  // 移动端：新标签页由浏览器原生处理（PDF/HTML/Excel 等）
  if (isMobileEnv()) {
    try { openAttachmentNewTab(att); } catch (e) { toast('预览失败，请尝试「下载」按钮', 'warn'); }
    return;
  }
  // 桌面/桌面PWA：iframe 模态框预览
  const overlay = document.getElementById('pdf-viewer-overlay');
  const iframe = document.getElementById('pdf-viewer-iframe');
  if (!overlay || !iframe) { openAttachmentNewTab(att); return; }
  try {
    const { blob } = dataUrlToBlob(att.dataUrl);
    const blobUrl = URL.createObjectURL(blob);
    iframe.src = blobUrl;
    overlay.hidden = false;
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  } catch (e) {
    console.error('预览失败:', e);
    toast('预览失败，请尝试「下载」按钮', 'warn');
  }
}

function closePdfViewer() {
  const overlay = document.getElementById('pdf-viewer-overlay');
  const iframe = document.getElementById('pdf-viewer-iframe');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.hidden = true;
  document.body.style.overflow = '';
  if (iframe) {
    // 释放 Blob URL 避免内存泄漏
    const src = iframe.src;
    iframe.src = '';
    if (src && src.startsWith('blob:')) {
      URL.revokeObjectURL(src);
    }
  }
}

// ---------- IndexedDB 图片存储 ----------
// 图片（Base64 dataURL）存入 IndexedDB，避免占用 localStorage ~5MB 配额
const DB_NAME = 'req-tracker-pwa';
const DB_VERSION = 4;
const IMG_STORE = 'images';
const ATT_STORE = 'attachments';

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

function dbGetImage(id) {
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
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

function dbDeleteImage(id) {
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function dbDeleteImages(ids) {
  if (!ids || !ids.length) return Promise.resolve();
  return Promise.all(ids.map((id) => dbDeleteImage(id).catch(() => {})));
}

function genImageId() {
  return 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ---------- IndexedDB 附件存储 ----------
function genAttachId() {
  return 'att-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
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
      // 极端情况：store 不存在（旧库未升级），视为无附件，避免抛出未处理的拒绝
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

function dbDeleteAttachment(id) {
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(ATT_STORE, 'readwrite');
    tx.objectStore(ATT_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function dbDeleteAttachments(ids) {
  if (!ids || !ids.length) return Promise.resolve();
  return Promise.all(ids.map((id) => dbDeleteAttachment(id).catch(() => {})));
}

// ---------- 存储配额与持久化 ----------
// IndexedDB 与本机磁盘共享「源存储配额」，无单库硬上限；但接近上限时写入会失败，
// 且 best-effort 存储可能被浏览器在存储压力下整体驱逐（iOS 尤为明显）。
// 这里统一做：配额预估、持久化申请、超限拦截、高占用预警。
const QUOTA_WARN_RATIO = 0.8;    // 用量超 80% 提醒清理
const QUOTA_BLOCK_RATIO = 0.97;  // 用量超 97% 直接拦截保存（留出余量，避免写入中途失败）

// 读取存储配额估算（usage/quota，单位字节）；环境不支持时返回 null
async function getStorageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch (e) {
    return null;
  }
}

// 是否已开启持久化存储（开启后浏览器不会自动驱逐，除非用户手动清除）
async function isStoragePersistent() {
  if (!navigator.storage || !navigator.storage.persisted) return false;
  try { return await navigator.storage.persisted(); } catch (e) { return false; }
}

// 申请持久化存储（须在用户手势中调用，如点击按钮）
async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try { return await navigator.storage.persist(); } catch (e) { return false; }
}

// 估算一组 dataUrl 落库后的近似字节数（Base64 膨胀，公式与迁移逻辑一致）
function estimateDataUrlsBytes(dataUrls) {
  let total = 0;
  for (const d of dataUrls) {
    if (typeof d !== 'string') continue;
    const comma = d.indexOf(',');
    total += Math.round((d.length - (comma > 0 ? comma + 1 : 0)) * 0.75);
  }
  return total;
}

// 保存前配额校验：若本次新增会让用量越过硬上限，拦截并提示（返回 false 表示中止保存）
async function checkQuotaBeforeSave(addedDataUrls) {
  const est = await getStorageEstimate();
  if (!est || !est.quota) return true; // 无法估算，放行
  const added = estimateDataUrlsBytes(addedDataUrls);
  if (est.usage + added > est.quota * QUOTA_BLOCK_RATIO) {
    toast('存储空间不足，无法保存图片/附件，请先在「设置 → 存储与数据」清理旧数据', 'warn', 3400);
    return false;
  }
  return true;
}

// 保存后 / 切到设置页时：用量偏高则提醒用户清理（不拦截）
async function warnIfQuotaHigh() {
  const est = await getStorageEstimate();
  if (!est || !est.quota) return;
  const ratio = est.usage / est.quota;
  if (ratio >= QUOTA_WARN_RATIO) {
    toast(`存储空间已用约 ${Math.round(ratio * 100)}%，建议清理旧图片/附件`, 'warn', 3200);
  }
}

// 刷新设置页「存储与数据」卡片的展示
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


// 把任务.images 中的「dataUrl 字符串 / {id,dataUrl} 对象」统一落库为 IndexedDB 记录，
// 返回纯 ID 数组（写回任务对象）。已是 ID 引用的原样保留。
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
      // 兼容极老版本：附件直接以 dataUrl 字符串形式内联存储
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

// 旧版数据迁移：localStorage 中若存的是 dataUrl 字符串数组，落库到 IndexedDB 并替换为 ID
async function migrateImagesToDB() {
  let changed = false;
  for (const it of items) {
    const raw = Array.isArray(it.images) ? it.images : [];
    if (raw.some((x) => typeof x === 'string' && x.startsWith('data:'))) {
      await storeImagesForItem(it);
      changed = true;
    }
  }
  if (changed) saveItems();
}

// 旧版数据迁移：localStorage 中若附件仍是内联对象（含 id/name/type/size/dataUrl）或 dataUrl 字符串，
// 落库到 IndexedDB 并替换为 ID 引用（确保老数据在升级后仍能看到/下载）
async function migrateAttachmentsToDB() {
  let changed = false;
  for (const it of items) {
    const raw = Array.isArray(it.attachments) ? it.attachments : [];
    if (raw.some((x) => (x && typeof x === 'object' && x.dataUrl) || (typeof x === 'string' && x.startsWith('data:')))) {
      await storeAttachmentsForItem(it);
      changed = true;
    }
  }
  if (changed) saveItems();
}

// 渲染表单中的图片缩略图（上传区）
function renderFormImageThumbs() {
  const container = document.getElementById('image-thumbs');
  const addBtn = document.getElementById('image-add-btn');
  if (!container) return;
  if (formImages.length === 0) {
    container.innerHTML = '';
    if (addBtn) addBtn.style.display = '';
    return;
  }
  container.innerHTML = formImages.map((img, idx) => `
    <div class="image-thumb">
      ${img.dataUrl ? `<img src="${img.dataUrl}" alt="图片 ${idx + 1}" />` : `<div class="image-thumb-loading"></div>`}
      <button class="image-thumb-remove" data-img-idx="${idx}" type="button" aria-label="删除图片">✕</button>
    </div>
  `).join('');
  if (addBtn) addBtn.style.display = formImages.length >= 5 ? 'none' : '';
}

// 渲染表单中的附件列表
function renderFormAttachments() {
  const container = document.getElementById('attachment-list');
  const addBtn = document.getElementById('attachment-add-btn');
  if (!container) return;
  container.innerHTML = formAttachments.map((att, idx) => `
    <div class="attachment-item">
      <div class="attachment-info">
        <span class="attachment-icon">${getFileIcon(att.name)}</span>
        <span class="attachment-name" title="${escapeHtml(att.name)}">${escapeHtml(truncateFileName(att.name, 20))}</span>
        <span class="attachment-size">${formatFileSize(att.size || 0)}</span>
      </div>
      <button class="attachment-remove" data-att-idx="${idx}" type="button" aria-label="删除附件">✕</button>
    </div>
  `).join('');
  if (addBtn) addBtn.style.display = formAttachments.length >= 3 ? 'none' : '';
}

// 当前详情页的附件数据缓存
let _detailAttData = null;
let _detailBlobUrls = [];   // 详情页「下载」链接的 Blob URL，关闭/重渲染时回收

// 回收详情页下载链接产生的 Blob URL（避免内存泄漏与悬空地址）
function revokeDetailBlobUrls() {
  _detailBlobUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} });
  _detailBlobUrls = [];
}

// 渲染任务详情中的附件列表
async function renderDetailAttachments(ids) {
  const section = document.getElementById('task-detail-attachments-section');
  const container = document.getElementById('task-detail-attachments');
  if (!section || !container) return;
  // 回收上次渲染产生的 Blob URL（详情页每次重渲染都会重新生成）
  revokeDetailBlobUrls();
  if (!ids || ids.length === 0) {
    section.hidden = true;
    _detailAttData = null;
    return;
  }
  section.hidden = false;
  container.innerHTML = '<div class="image-thumb-loading" style="height:40px"></div>';
  const atts = await dbGetAttachments(ids);
  if (atts.length === 0) {
    section.hidden = true;
    _detailAttData = null;
    return;
  }
  _detailAttData = atts;
  container.innerHTML = atts.map((att, idx) => {
    // 非 standalone：渲染真实 <a download href=blob> 作为兜底；
    // standalone（PWA 独立窗口禁下载）：点击由事件委托拦截并走 handleAttachmentDownload() 兜底。
    let dlHref = '#';
    try {
      const { blob } = dataUrlToBlob(att.dataUrl);
      dlHref = URL.createObjectURL(blob);
      _detailBlobUrls.push(dlHref);
    } catch (e) { dlHref = '#'; }
    const dlName = escapeHtml(att.name || 'attachment');
    return `
      <div class="detail-attachment-item">
        <div class="detail-attachment-info">
          <span class="attachment-icon">${getFileIcon(att.name)}</span>
          <span class="detail-attachment-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
          <span class="attachment-size">${formatFileSize(att.size || 0)}</span>
        </div>
        <div class="detail-attachment-actions">
          <a class="btn sm ghost attachment-download-link" href="${dlHref}" download="${dlName}" data-att-idx="${idx}" rel="noopener">下载</a>
          <button class="btn sm ghost attachment-preview" data-att-idx="${idx}" type="button">预览</button>
        </div>
      </div>
    `;
  }).join('');
}

function getFileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📽️', pptx: '📽️', txt: '📃', zip: '📦', rar: '📦',
    '7z': '📦', gz: '📦', jpg: '🖼️', jpeg: '🖼️', png: '🖼️',
    gif: '🖼️', svg: '🖼️', webp: '🖼️', mp4: '🎬', avi: '🎬',
    mp3: '🎵', wav: '🎵', json: '📋', xml: '📋', html: '🌐',
    css: '🎨', js: '⚡', ts: '⚡', py: '🐍', java: '☕'
  };
  return icons[ext] || '📎';
}

function truncateFileName(name, max) {
  if (!name || name.length <= max) return name;
  const ext = name.lastIndexOf('.');
  if (ext === -1) return name.slice(0, max - 1) + '…';
  const base = name.slice(0, ext);
  const suffix = name.slice(ext);
  const limit = Math.max(3, max - suffix.length - 1);
  return base.slice(0, limit) + '…' + suffix;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// 渲染任务详情中的图片缩略图（ids 为 IndexedDB 图片 ID 数组，异步加载）
async function renderDetailImages(ids) {
  const section = document.getElementById('task-detail-images-section');
  const container = document.getElementById('task-detail-images');
  if (!section || !container) return;
  if (!ids || ids.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  container.innerHTML = '<div class="image-thumb-loading"></div>';
  const imgs = await dbGetImages(ids);
  container.innerHTML = imgs.map((img, idx) => `
    <div class="detail-image-thumb" data-img-idx="${idx}">
      <img src="${img.dataUrl}" alt="图片 ${idx + 1}" />
    </div>
  `).join('');
}

// 打开图片放大查看
function openImageViewer(dataUrl) {
  const overlay = document.getElementById('image-viewer-overlay');
  const img = document.getElementById('image-viewer-img');
  if (!overlay || !img) return;
  img.src = dataUrl;
  overlay.hidden = false;
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeImageViewer() {
  const overlay = document.getElementById('image-viewer-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.hidden = true;
  document.body.style.overflow = '';
}

// ---------- Tabs ----------
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + view));
  const fab = document.getElementById('fab');
  if (fab) fab.style.display = view === 'task' ? 'flex' : 'none';
  if (view === 'report') { renderReportValueRow(); renderReports(); }
  if (view === 'settings') { renderSettings(); refreshStorageInfo(); }
  if (view === 'task') populateFilterSelects();
  else {
    // 离开设置页时清空各列表搜索词与输入框，并重置状态筛选，避免回来时列表仍被过滤
    listSearch.dev = listSearch.project = listSearch.group = '';
    ['dev', 'project', 'group'].forEach((k) => { const i = document.getElementById(k + '-search'); if (i) i.value = ''; });
    listStatus.dev = listStatus.project = listStatus.group = '全部';
    document.querySelectorAll('.status-filter .seg').forEach((s) => s.classList.toggle('is-active', s.dataset.val === '全部'));
  }
}

// ---------- Modal ----------
function openModal(titleText) {
  document.getElementById('modal-title').textContent = titleText;
  renderFormOptions();
  document.getElementById('modal-overlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  document.body.style.overflow = '';
  editingId = null;
  document.getElementById('task-form').reset();
  formTypeCode = 'REQ';
  formPriorityCode = 'MEDIUM';
  formDeveloperIds = [];
  formImages = [];
  formAttachments = [];
  renderFormTypeChips();
  renderFormPriorityChips();
  renderFormDevChips();
  renderFormImageThumbs();
  renderFormAttachments();
}

// ---------- 任务详情 ----------
function openTaskDetail(id) {
  // 5.11: 从双源 allTasks 查找 + normalizeTask 归一化后展示
  const raw = allTasks.find((i) => i && i.id === id);
  if (!raw) return;
  const it = normalizeTask(raw);

  // 标题栏固定为「任务详情」；任务名称单独成行（居中）显示在标题栏下方
  const nameEl = document.getElementById('task-detail-name');
  if (nameEl) nameEl.textContent = it.title || '未命名任务';

  const isNewModel = it._source === 'idb';
  // idb 任务的归档状态暂不接入 settings（统一视为未归档）
  const projArchived = isNewModel ? false : !(settings.projects || []).some((p) => p.value === it.projectName && p.enabled !== false);
  const grpArchived = isNewModel ? false : !(settings.groups || []).some((g) => g.value === it.versionName && g.enabled !== false);
  const devTags = (it.developerNames || []).map((d) => {
    const off = isNewModel ? false : !(settings.developers || []).some((x) => x.value === d && x.enabled !== false);
    return `<span class="tag dev${off ? ' off' : ''}">${escapeHtml(d)}</span>`;
  }).join('');
  // 主标签行：任务类型 / 优先级 / 状态 / 开发人员（依次、居中）
  const mainTags = [
    `<span class="tag type-${it.typeCode || ''}" style="background:${resolveTypeColor(it.typeCode)}1a;color:${resolveTypeColor(it.typeCode)}">${escapeHtml(resolveTypeName(it.typeCode, it.type))}</span>`,
    `<span class="tag pri-${it.priorityText || '中'}">${escapeHtml(it.priorityText || '中')}</span>`,
    `<span class="tag status-${it.statusText}">${escapeHtml(it.statusText || '')}</span>`,
    devTags
  ].join('');
  // 次标签行：所属项目 / 需求组（居中）
  const metaTags = [
    `<span class="tag proj${projArchived ? ' arch' : ''}">${escapeHtml(it.projectName || '默认项目')}</span>`,
    `<span class="tag grp${grpArchived ? ' arch' : ''}">${escapeHtml(it.versionName || '默认组')}</span>`
  ].join('');
  const mainEl = document.getElementById('task-detail-tags-main');
  if (mainEl) mainEl.innerHTML = mainTags;
  const metaEl = document.getElementById('task-detail-tags-meta');
  if (metaEl) metaEl.innerHTML = metaTags;

  // 任务ID / 子ID：显示在描述上方；两者皆空时隐藏整行（兼容旧数据）
  const dTid = it.zentaoId || it.taskId || '';
  const dSid = it.zentaoSubId || it.subId || '';
  const idRow = document.getElementById('task-detail-idrow');
  if (dTid || dSid) {
    idRow.hidden = false;
    document.getElementById('task-detail-taskid').textContent = dTid || '—';
    document.getElementById('task-detail-subid').textContent = dSid || '—';
  } else {
    idRow.hidden = true;
  }

  // 描述：用 textContent + CSS white-space:pre-wrap 保留换行
  document.getElementById('task-detail-desc').textContent = it.desc || '';

  // 图片
  renderDetailImages(it.images || []);

  // 附件
  renderDetailAttachments(it.attachments || []);

  // 任务生命周期：竖版时间线，每个步骤单独记录节点状态/操作人（动作 + 账号(昵称) + 时间），最新在前
  // 圆点颜色取该节点实际状态色；编辑等无状态变更动作用中性灰 + 「编辑」标签
  const opsHtml = (it.ops && it.ops.length)
    ? '<div class="lc-timeline">' + it.ops.slice().reverse().map((o) => {
        const status = statusForOp(o);
        const color = lifeColor(status);
        const who = formatOperator(o.by);
        const when = o.at ? fmtDate(o.at) : '';
        const action = escapeHtml(o.action || '操作');
        const badge = status
          ? `<span class="lc-badge" style="background:var(--c-${status}-bg);color:${color}">${escapeHtml(status)}</span>`
          : `<span class="lc-badge" style="background:#94a3b81f;color:#64748b">编辑</span>`;
        return `<div class="lc-item" style="--c:${color}">
          <span class="lc-dot"></span>
          <div class="lc-body">
            <div class="lc-head"><span class="lc-action">${action}</span>${badge}</div>
            <div class="lc-meta">操作人 <span class="op">${who}</span> · ${escapeHtml(when)}</div>
          </div>
        </div>`;
      }).join('') + '</div>'
    : '<div class="task-detail-empty">暂无生命周期记录</div>';
  document.getElementById('task-detail-ops').innerHTML = opsHtml;

  const ov = document.getElementById('task-detail-overlay');
  ov.hidden = false;
  ov.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeTaskDetail() {
  const ov = document.getElementById('task-detail-overlay');
  ov.classList.remove('show');
  ov.hidden = true;
  document.body.style.overflow = '';
  revokeDetailBlobUrls();
}

// 新增/编辑任务表单：选项统一从 IndexedDB 预取（RT_PROJECTS / RT_PROJECT_VERSIONS / RT_USERS）
async function renderFormOptions() {
  await Promise.all([ensureProjects(), ensureProjectVersions(), ensureDevelopers()]);

  // 项目 select（#f-project）: option value = 项目 ID
  const projSel = document.getElementById('f-project');
  const curProj = projSel.value;  // 保留当前选中
  projSel.innerHTML = '<option value="">请选择项目</option>' +
    projectList.filter(function (p) { return p; }).map(function (p) {
      return '<option value="' + p.id + '">' + escapeHtml(p.projectName) + '</option>';
    }).join('');
  if (curProj && projectList.some(function (p) { return p && p.id === curProj; })) projSel.value = curProj;

  // 需求组→项目版本 select（#f-group）: option value = 版本 ID，按所选项目级联
  await refreshFormGroupSelect(projSel.value);

  // 开发人员 chips（#form-dev-chips）: data-user-id = 用户 ID
  renderFormDevChips();

  // 优先级 chips 已独立为 renderFormPriorityChips()
  renderFormPriorityChips();

  // 图片/附件保持不变
  renderFormImageThumbs();
  renderFormAttachments();
}

// 新增/编辑任务表单：需求组下拉改为按所选项目级联的项目版本（从 versionList 取，option value = 版本 ID）
async function refreshFormGroupSelect(projectId) {
  const groupSel = document.getElementById('f-group');
  if (!groupSel) return;
  const curGroup = groupSel.value;   // 保留当前选中

  const vers = versionsByProject(projectId);
  groupSel.innerHTML = '<option value="">请选择需求组</option>' +
    vers.map(function (v) { return '<option value="' + v.id + '">' + escapeHtml(v.versionName) + '</option>'; }).join('');

  if (curGroup && vers.some(function (v) { return v && v.id === curGroup; })) groupSel.value = curGroup;
}

function renderFormTypeChips() {
  const wrap = document.getElementById('form-type-chips');
  if (!wrap) return;
  wrap.innerHTML = TASK_TYPE_LIST.map((t) =>
    `<button class="chip ${formTypeCode === t.code ? 'active' : ''}" data-type-code="${t.code}" type="button" style="--chip-color:${t.color}">${escapeHtml(t.name)}</button>`
  ).join('');
}

// 筛选栏任务类型 chips：字典驱动（"全部类型"哨兵 data-type-code="全部" + 各类型），init 预取后渲染
function renderTypeFilterChips() {
  const wrap = document.getElementById('type-chips');
  if (!wrap) return;
  let html = '<button class="chip ' + (filter.typeCode.length === 0 ? 'active' : '') + '" data-type-code="全部" type="button">全部类型</button>';
  TASK_TYPE_LIST.forEach(function (t) {
    const active = filter.typeCode.includes(t.code) ? 'active' : '';
    html += '<button class="chip ' + active + '" data-type-code="' + t.code + '" type="button" style="--chip-color:' + t.color + '">' + escapeHtml(t.name) + '</button>';
  });
  wrap.innerHTML = html;
}

// 模块级缓存变量（避免重复查 IndexedDB）
let priorityList = [];       // {code:'HIGH', name:'高', order:1}, ... from 字典 PRIORITY
let projectList = [];        // from RT_PROJECTS.getAllProjects()
let versionList = [];        // from RT_PROJECT_VERSIONS.getAllProjectVersions()
let userList = [];           // from RT_USERS.getAllUsers()

function renderFormPriorityChips() {
  const wrap = document.getElementById('form-priority-chips');
  if (!wrap) return;
  wrap.innerHTML = (priorityList.length ? priorityList : [
    { code: 'HIGH', name: '高' }, { code: 'MEDIUM', name: '中' }, { code: 'LOW', name: '低' }
  ]).map(function (p) {
    const active = formPriorityCode === p.code ? ' active' : '';
    return '<button class="chip' + active + '" data-priority-code="' + p.code + '" type="button">' + escapeHtml(p.name) + '</button>';
  }).join('');
}

function renderFormDevChips() {
  var wrap = document.getElementById('form-dev-chips');
  if (!wrap) return;
  if (!userList.length) {
    wrap.innerHTML = '<span style="font-size:12px;color:var(--muted)">请先在基础数据中添加人员</span>';
    return;
  }
  wrap.innerHTML = userList.map(function (u) {
    if (!u || !u.id) return '';
    var on = formDeveloperIds.includes(u.id) ? ' active' : '';
    return '<button class="chip' + on + '" data-user-id="' + u.id + '" type="button">' + escapeHtml(u.nickname || u.name || u.id) + '</button>';
  }).join('');
}

// 时间戳 <-> datetime-local 输入框互转（按浏览器本地时区）
function tsToLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function localInputToTs(str) {
  if (!str) return null;
  const t = new Date(str).getTime();
  return isNaN(t) ? null : t;
}

function getFormData() {
  return {
    taskName:       document.getElementById('f-title').value.trim(),
    taskDesc:       document.getElementById('f-desc').value.trim(),
    taskTypeCode:   formTypeCode,                       // 不变，已走字典 code
    priorityCode:   formPriorityCode,                   // HIGH/MEDIUM/LOW（替代中文 priority）
    statusCode:     'TODO',                             // 新增固定待开发
    projectId:      document.getElementById('f-project').value || '',     // value 即 ID
    projectVersionId: document.getElementById('f-group').value || '',     // 替代姓名[]
    developerIds:   [...formDeveloperIds],              // 用户 ID[]（替代姓名[]）
    zentaoId:       document.getElementById('f-taskid').value.trim(),
    zentaoSubId:    document.getElementById('f-subid').value.trim(),
    imageIds:       formImages.map(function (i) { return i.id; }),
    attachmentIds:  formAttachments.map(function (a) { return a.id; }),
    // createdBy/createdAt/updatedAt/updatedBy/... 由 createRequirementTask(data, op) 自动填充
    // devSubmitTime/testStartTime/... 创建时均为 null（默认值）
  };
}

// 从编辑表单收集暂停/恢复历史（按 .pe-pair 组顺序还原为事件，组内 pause 在前）
function collectPauseEvents() {
  const box = document.getElementById('form-pause-events');
  if (!box) return [];
  const ev = [];
  box.querySelectorAll('.pe-pair').forEach((pair) => {
    pair.querySelectorAll('.pe-input').forEach((input) => {
      const row = input.closest('.pe-row');
      const type = row && row.dataset.peType;
      if (type !== 'pause' && type !== 'resume') return;
      const t = localInputToTs(input.value);
      if (t == null) return; // 时间被清空视为不保留该记录
      ev.push({ type, t });
    });
  });
  return ev;
}

async function setFormData(item) {
  var norm = normalizeTask(item);  // 5.12: 统一字段

  document.getElementById('f-title').value = norm.title;
  document.getElementById('f-desc').value = norm.desc || '';
  document.getElementById('f-taskid').value = norm.zentaoId || '';
  document.getElementById('f-subid').value = norm.zentaoSubId || '';

  // 项目/版本：根据 _source 分别处理
  if (item._source === 'idb') {
    // 新数据：value = ID
    await renderFormOptions();  // 确保下拉已填充
    document.getElementById('f-project').value = item.projectId || '';
    await refreshFormGroupSelect(item.projectId);
    document.getElementById('f-group').value = item.projectVersionId || '';
    // 开发者
    formDeveloperIds = item.developerIds ? [...item.developerIds] : [];
    // 优先级
    formPriorityCode = item.priorityCode || 'MEDIUM';
  } else {
    // 旧数据：回退到 settings（保持原有逻辑不变）
    // 编辑时任务所属项目/组可能已归档（不在启用下拉里），须手动补入对应 option，
    // 否则下方 set value 会因无法匹配而回退到第一个启用项，保存时静默篡改归属（数据损坏）。
    const projectSel = document.getElementById('f-project');
    if (item.project && !settings.projects.some((p) => p.value === item.project && p.enabled !== false)) {
      const opt = document.createElement('option');
      opt.value = item.project; opt.textContent = item.project;
      projectSel.appendChild(opt);
    }
    projectSel.value = item.project;
    refreshFormGroupSelect(item.project);
    const groupSel = document.getElementById('f-group');
    if (item.group && !settings.groups.some((g) => g.value === item.group && g.enabled !== false && g.project === item.project)) {
      const opt = document.createElement('option');
      opt.value = item.group; opt.textContent = item.group;
      groupSel.appendChild(opt);
    }
    groupSel.value = item.group;
    // 兜底：legacy 用原字段
    formDeveloperIds = [...(item.developers || [])];
    formPriorityCode = norm.priorityCode || 'MEDIUM';
  }
  // 类型不变（已字典化）
  formTypeCode = item.typeCode || 'REQ';

  // 时间字段...
  const d = item.dates || {};
  document.getElementById('f-created').value = tsToLocalInput(item.createdAt);
  document.getElementById('f-submitted').value = tsToLocalInput(d.submitted);
  document.getElementById('f-started').value = tsToLocalInput(d.started);
  document.getElementById('f-completed').value = tsToLocalInput(d.completed);
  document.getElementById('f-online').value = tsToLocalInput(d.online);
  // 暂停/恢复历史：编辑且有记录时显示并可修改；新增不显示。暂停+恢复为一组，删除整组。
  const peGroup = document.getElementById('form-pause-events-group');
  const peBox = document.getElementById('form-pause-events');
  const pe = (item.dates && item.dates.pauseEvents) || [];
  if (pe.length) {
    // 将 pause/resume 按顺序配对：每个 pause 与紧随其后的 resume 一组（落单的单独成组）
    const pairs = [];
    let cur = null;
    pe.forEach((e) => {
      if (e.type === 'pause') { cur = [e]; pairs.push(cur); }
      else if (cur) { cur.push(e); cur = null; }
      else pairs.push([e]);
    });
    peBox.innerHTML = pairs.map((pair) => {
      const rows = pair.map((e) => `
        <div class="pe-row" data-pe-type="${escapeHtml(e.type)}">
          <span class="pe-type">${e.type === 'pause' ? '暂停' : '恢复'}</span>
          <input type="datetime-local" class="pe-input" value="${tsToLocalInput(e.t)}" />
        </div>`).join('');
      return `<div class="pe-pair">${rows}<button type="button" class="del pe-pair-del" aria-label="删除该组暂停/恢复记录"><span class="del-circle"></span></button></div>`;
    }).join('');
    peGroup.hidden = false;
  } else {
    peBox.innerHTML = '';
    peGroup.hidden = true;
  }
  formTypeCode = item.typeCode || 'REQ';
  // 编辑时先同步从 IndexedDB 加载图片和附件数据，再渲染（避免保存时 dataUrl 丢失）
  // 按来源分流字段名：idb 用 imageIds/attachmentIds，legacy 用 images/attachments
  const imgIds = (item._source === 'idb' ? item.imageIds : item.images) || [];
  const attIds = (item._source === 'idb' ? item.attachmentIds : item.attachments) || [];
  const [imgs, atts] = await Promise.all([
    imgIds.length ? dbGetImages(imgIds) : Promise.resolve([]),
    attIds.length ? dbGetAttachments(attIds) : Promise.resolve([])
  ]);
  // 图片：按原始顺序匹配，缺失的跳过
  const imgMap = {};
  imgs.forEach((i) => { imgMap[i.id] = i.dataUrl; });
  formImages = imgIds
    .map((id) => ({ id, dataUrl: imgMap[id] || null }))
    .filter((f) => f.dataUrl !== null);
  // 附件：按原始顺序匹配，缺失的跳过（避免空数据导致保存异常）
  // 注意：必须保留 id 字段，否则 getFormData/onSubmit 会生成 undefined key
  const attMap = {};
  atts.forEach((a) => { attMap[a.id] = { id: a.id, name: a.name, type: a.type, size: a.size, dataUrl: a.dataUrl }; });
  formAttachments = attIds
    .map((id) => attMap[id] || null)
    .filter((f) => f !== null);
  renderFormTypeChips();
  renderFormPriorityChips();
  renderFormDevChips();
  renderFormImageThumbs();
  renderFormAttachments();
}

// ---------- Task list ----------
function nextStatus(status) {
  const idx = STATUSES.indexOf(status);
  return idx >= 0 && idx < STATUSES.length - 1 ? STATUSES[idx + 1] : null;
}

function actionLabel(status) {
  const map = {
    '待开发': '开发提交',
    '已提测': '测试开始',
    '测试中': '测试完成',
    '已测完': '上线'
  };
  return map[status] || '';
}

// 格式化任务各阶段时间戳为可读日期数组
function formatTaskDates(dates) {
  if (!dates) return [];
  const out = [];
  const stages = [
    { key: 'submitted', label: '提测' },
    { key: 'started',   label: '起测' },
    { key: 'completed', label: '测完' },
    { key: 'online',    label: '上线' }
  ];
  for (const s of stages) {
    if (dates[s.key]) out.push(`${s.label} ${fmtDate(dates[s.key])}`);
  }
  return out;
}

// 任务卡片仅显示一条时间：随当前状态展示所处阶段的时间（四个字文案）
function primaryTimeText(it) {
  const d = it.dates || {};
  const fallback = '录入时间 ' + fmtDate(it.createdAt);
  switch (it.statusText) {
    case '待开发': return fallback;
    case '已提测': return d.submitted ? '提测时间 ' + fmtDate(d.submitted) : fallback;
    case '测试中': return d.started ? '开始时间 ' + fmtDate(d.started) : fallback;
    case '暂停中': return d.started ? '开始时间 ' + fmtDate(d.started) : fallback;
    case '已测完': return d.completed ? '完成时间 ' + fmtDate(d.completed) : fallback;
    case '已上线': return d.online ? '上线时间 ' + fmtDate(d.online) : fallback;
    default: return fallback;
  }
}

var allTasks = [];   // 统一单数据源（替代 items 用于渲染）

// 双源刷新：旧(localStorage) + 新(IndexedDB) 合并
async function refreshTaskList() {
  // 旧数据源（向后兼容）
  var legacy = loadItems().map(function (t) { return Object.assign({}, t, { _source: 'legacy' }); });
  // 新数据源
  var fresh = [];
  try {
    fresh = await RT_REQUIREMENT_TASKS.getAllRequirementTasks();
    fresh = (fresh || []).map(function (t) { return Object.assign({}, t, { _source: 'idb' }); });
  } catch (e) { /* 新表异常时仅显示旧数据 */ }

  allTasks = [...fresh, ...legacy];    // 新数据在前
  renderTaskList();                    // 复用原有渲染入口（用 allTasks 替代 items）
}

function renderTaskList() {
  const list = document.getElementById('task-list');
  // 5.11: 统一通过 normalizeTask 归一化后再筛选/渲染
  const normalized = allTasks.map(normalizeTask);
  const filtered = normalized.filter((n) => {
    if (filter.typeCode.length && !filter.typeCode.includes(n.typeCode)) return false;
    // 筛选项「测试中」合并计入「暂停中」（暂停中视为测试中的一个子状态）
    if (filter.status.length) {
      const eff = n.statusText === '暂停中' ? '测试中' : n.statusText;
      if (!filter.status.includes(eff)) return false;
    }
    if (filter.priority.length && !filter.priority.includes(n.priorityText)) return false;
    if (filter.paused && n.statusText !== '暂停中') return false;   // 仅看已暂停
    if (filter.project && n.projectName !== filter.project) return false;
    if (filter.group.length && !filter.group.includes(n.versionName)) return false;
    const tid = n.zentaoId || n.taskId || '';
    const sid = n.zentaoSubId || n.subId || '';
    if (filter.q && !(`${n.title} ${n.desc} ${tid} ${sid}`.toLowerCase().includes(filter.q.toLowerCase()))) return false;
    return true;
  }).sort((a, b) => b.createdAt - a.createdAt);
  renderStats(filtered);

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>暂无任务，点击右下角 + 添加一条</div>';
    return;
  }

  list.innerHTML = filtered.map((n) => buildTaskCardHtml(n, true)).join('');
}

// 任务卡片 HTML：首页列表与报表「任务清单」新页面共用。
// withActions=true 时含操作按钮（首页）；新页面传 false 仅作只读清单。
function buildTaskCardHtml(it, withActions) {
  const advance = actionLabel(it.statusText);
  const isNewModel = it._source === 'idb';
  // 项目/需求组/开发人员的启用状态：idb 任务的归档状态暂不接入 settings（统一视为未归档）
  const projArchived = isNewModel ? false : !(settings.projects || []).some((p) => p.value === it.projectName && p.enabled !== false);
  const grpArchived = isNewModel ? false : !(settings.groups || []).some((g) => g.value === it.versionName && g.enabled !== false);
  const devTags = (it.developerNames || []).map((d) => {
    const off = isNewModel ? false : !(settings.developers || []).some((x) => x.value === d && x.enabled !== false);
    return `<span class="tag dev${off ? ' off' : ''}">${escapeHtml(d)}</span>`;
  }).join('');
  const dateSpans = [primaryTimeText(it)];
  const imgCount = (it.images && it.images.length) ? it.images.length : 0;
  if (imgCount > 0) dateSpans.push(`📷 ${imgCount} 张图片`);
  const attCount = (it.attachments && it.attachments.length) ? it.attachments.length : 0;
  if (attCount > 0) dateSpans.push(`📎 ${attCount} 个附件`);

  // 任务 ID/子 ID 兼容：idb 走 zentaoId/zentaoSubId，legacy 保留原 taskId/subId
  const showTid = it.zentaoId || it.taskId || '';
  const showSid = it.zentaoSubId || it.subId || '';

  return `
    <div class="task-card t-${it.typeCode || ''}" data-id="${it.id}" style="--type-color:${resolveTypeColor(it.typeCode)}">
      <div class="task-body">
        <div class="task-header">
          <div class="task-title-row">
            <span class="tag type-${it.typeCode || ''}" style="background:${resolveTypeColor(it.typeCode)}1a;color:${resolveTypeColor(it.typeCode)}">${escapeHtml(resolveTypeName(it.typeCode, it.type))}</span>
            <h3 class="task-title">${escapeHtml(it.title)}</h3>
          </div>
          <span class="tag status-${it.statusText}">${escapeHtml(it.statusText || '')}</span>
        </div>
        ${(showTid || showSid) ? `
        <div class="task-idpills">
          ${showTid ? `<span class="id-pill id-pill--task">${escapeHtml(showTid)}</span>` : ''}
          ${showSid ? `<span class="id-pill id-pill--sub">${escapeHtml(showSid)}</span>` : ''}
        </div>` : ''}
        ${it.desc ? `<div class="task-desc">${escapeHtml(it.desc)}</div>` : ''}
        <div class="task-meta">
          <span class="tag pri-${it.priorityText || '中'}">${escapeHtml(it.priorityText || '中')}</span>
          <span class="tag proj${projArchived ? ' arch' : ''}">${escapeHtml(it.projectName || '默认项目')}</span>
          <span class="tag grp${grpArchived ? ' arch' : ''}">${escapeHtml(it.versionName || '默认组')}</span>
          ${devTags}
        </div>
        <div class="task-dates">${dateSpans.map((d) => `<span>${d}</span>`).join('')}</div>
        ${withActions ? `<div class="task-actions">
          ${advance ? `<button class="btn action-${advance}" data-act="advance" data-id="${it.id}">${advance}</button>` : ''}
          ${it.statusText === '测试中' ? `<button class="btn action-暂停" data-act="pause" data-id="${it.id}">暂停</button>` : ''}
          ${it.statusText === '暂停中' ? `<button class="btn action-暂停恢复" data-act="resume" data-id="${it.id}">暂停恢复</button>` : ''}
          <button class="btn action-重置" data-act="reset" data-id="${it.id}">重置</button>
          <button class="btn action-编辑" data-act="edit" data-id="${it.id}">编辑</button>
          ${it.statusText === '待开发' ? `<button class="btn action-删除" data-act="del" data-id="${it.id}">删除</button>` : ''}
        </div>` : ''}
      </div>
    </div>
  `;
}

// ---------- Reports ----------
// 报表时间筛选状态：维度 dim(year/quarter/month)，year/quarter/month 取值或 'all'
let reportFilter = { dim: 'year', year: 'all', quarter: 'all', month: 'all' };
// 报表中「取消勾选则不统计」的任务类型集合（默认普通BUG不选中=不统计）
let reportExcludeTypes = new Set(['COMMON_BUG']);

// 报表时间筛选：以「测试开始时间 / 测试结束时间」为准，任一落在所选范围内即计入
function inPeriod(t, f) {
  if (!t) return false;
  const d = new Date(t);
  if (d.getFullYear() !== f.year) return false;
  if (f.dim === 'quarter') {
    if (f.quarter !== 'all' && Math.floor(d.getMonth() / 3) + 1 !== f.quarter) return false;
  } else if (f.dim === 'month') {
    if (f.month !== 'all' && d.getMonth() + 1 !== f.month) return false;
  }
  return true;
}
function periodMatch(it, f) {
  if (f.year === 'all') return true; // 全部年份：等同显示全部（含未开始任务）
  const ds = it.dates || {};
  // 测试开始时间 或 测试结束时间 任一在范围内即统计
  return inPeriod(ds.started, f) || inPeriod(ds.completed, f);
}

// 收集可选年份：录入时间与测试起止时间都纳入，含当前年份，降序
function collectReportYears() {
  const set = new Set();
  set.add(new Date().getFullYear());
  items.forEach((it) => {
    if (it.createdAt) set.add(new Date(it.createdAt).getFullYear());
    const d = it.dates || {};
    if (d.started) set.add(new Date(d.started).getFullYear());
    if (d.completed) set.add(new Date(d.completed).getFullYear());
  });
  return Array.from(set).sort((a, b) => b - a);
}

// 渲染维度对应的下拉选择区（年份始终存在，季度/月度按维度追加）
function renderReportValueRow() {
  const box = document.getElementById('rf-value');
  if (!box) return;
  const years = collectReportYears();
  let html = '<select class="rf-select" id="rf-year" aria-label="年份"><option value="all">全部年份</option>';
  years.forEach((y) => { html += `<option value="${y}">${y} 年</option>`; });
  html += '</select>';
  if (reportFilter.dim === 'quarter') {
    html += '<select class="rf-select" id="rf-quarter" aria-label="季度"><option value="all">全部季度</option>';
    for (let q = 1; q <= 4; q++) html += `<option value="${q}">第 ${q} 季度</option>`;
    html += '</select>';
  } else if (reportFilter.dim === 'month') {
    html += '<select class="rf-select" id="rf-month" aria-label="月份"><option value="all">全部月份</option>';
    for (let m = 1; m <= 12; m++) html += `<option value="${m}">${m} 月</option>`;
    html += '</select>';
  }
  box.innerHTML = html;
  const yEl = document.getElementById('rf-year');
  if (yEl) {
    if (reportFilter.year !== 'all' && !years.includes(reportFilter.year)) reportFilter.year = 'all';
    yEl.value = String(reportFilter.year);
    yEl.addEventListener('change', () => { reportFilter.year = yEl.value === 'all' ? 'all' : Number(yEl.value); renderReports(); });
  }
  const qEl = document.getElementById('rf-quarter');
  if (qEl) {
    qEl.value = String(reportFilter.quarter);
    qEl.addEventListener('change', () => { reportFilter.quarter = qEl.value === 'all' ? 'all' : Number(qEl.value); renderReports(); });
  }
  const mEl = document.getElementById('rf-month');
  if (mEl) {
    mEl.value = String(reportFilter.month);
    mEl.addEventListener('change', () => { reportFilter.month = mEl.value === 'all' ? 'all' : Number(mEl.value); renderReports(); });
  }
}

// 统计范围文字（屏幕提示与 PDF 共用）；筛选以测试起止时间为准
function reportCaptionText() {
  const base = '统计范围（测试时间）';
  let s;
  if (reportFilter.year === 'all') s = base + '：全部时间';
  else {
    s = base + '：' + reportFilter.year + ' 年';
    if (reportFilter.dim === 'quarter') {
      s += reportFilter.quarter === 'all' ? ' · 全部季度' : ' · 第 ' + reportFilter.quarter + ' 季度';
    } else if (reportFilter.dim === 'month') {
      s += reportFilter.month === 'all' ? ' · 全部月份' : ' · ' + reportFilter.month + ' 月';
    }
  }
  // 取消勾选的类型不计入统计，文案同步提示（PDF 中可见）
  if (reportExcludeTypes.size) {
    const names = Array.from(reportExcludeTypes).map((c) => resolveTypeName(c)).join('、');
    s += ' · 不含 ' + names;
  }
  return s;
}
function updateReportCaption() {
  const el = document.getElementById('rf-caption');
  if (el) el.textContent = reportCaptionText();
}

// 导出 PDF：调用系统打印（移动端浏览器可在打印对话框中「另存为 PDF」）
function exportReportPDF() {
  if (currentView !== 'report') switchView('report');
  renderReportValueRow();
  updateReportCaption();
  setTimeout(() => { window.print(); }, 60);
}

// 报表模块「任务清单」：跳转新页面，列出该模块（已进入/未进入测试）的任务。
// 沿用当前报表筛选（时间区间 + 类型勾选排除），与报表统计口径一致。
function openModuleTaskList(scope) {
  const ENTERED = ['测试中', '已测完', '已上线', '暂停中'];
  const isEntered = scope === 'entered';
  const base = items.filter((it) => periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode));
  const sub = isEntered
    ? base.filter((i) => ENTERED.includes(i.status))
    : base.filter((i) => !ENTERED.includes(i.status));
  const titleEl = document.getElementById('tl-title');
  const metaEl = document.getElementById('tl-meta');
  const listEl = document.getElementById('tl-list');
  if (titleEl) titleEl.textContent = isEntered ? '已进入测试' : '未进入测试';
  let meta = '共 ' + sub.length + ' 项';
  if (reportExcludeTypes.size) {
    const names = Array.from(reportExcludeTypes).map((c) => resolveTypeName(c)).join('、');
    meta += ' · 不含 ' + names;
  }
  if (metaEl) metaEl.textContent = meta;
  if (listEl) {
    listEl.innerHTML = sub.length
      ? sub.sort((a, b) => b.createdAt - a.createdAt).map((it) => buildTaskCardHtml(normalizeTask(it), false)).join('')
      : '<div class="empty"><div class="empty-icon">📭</div>该范围暂无任务</div>';
  }
  switchView('tasklist');
}

// 估算「只有开始时间、尚未结束」任务的测试工时。
// 规则（按工作时段 08:00–17:30，整天 8H，周末不计）：
//  - 当天：当前时间 − 开始时间
//  - 跨天：首日 (17:30 − 开始) + 末日 (当前时间 − 8:00)
//  - 跨完整天：中间每个工作日 8H
//  - 跨周末：周六、周日（含首尾部分日）时长扣减为 0
function estimateWorkHours(start, end) {
  const FULL_DAY = 8;
  const s = new Date(start), e = new Date(end);
  const firstOnly = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const lastOnly = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  // 同一天：当前时间 − 开始时间
  if (firstOnly.getTime() === lastOnly.getTime()) return Math.max(0, (e - s) / 3600000);

  let h = 0;
  const day = new Date(firstOnly);
  while (day.getTime() <= lastOnly.getTime()) {
    const dow = day.getDay(); // 0=周日, 6=周六
    if (dow === 0 || dow === 6) { day.setDate(day.getDate() + 1); continue; } // 周末不计
    if (day.getTime() === firstOnly.getTime()) {
      const fe = new Date(s); fe.setHours(17, 30, 0, 0);
      h += Math.max(0, (fe - s) / 3600000);               // 首日部分
    } else if (day.getTime() === lastOnly.getTime()) {
      const ls = new Date(e); ls.setHours(8, 0, 0, 0);
      h += Math.max(0, (e - ls) / 3600000);                // 末日部分
    } else {
      h += FULL_DAY;                                        // 中间完整工作日
    }
    day.setDate(day.getDate() + 1);
  }
  return h;
}

// 测试工时：在 estimateWorkHours（工作时段 08:00–17:30、周末不计）基础上，
// 按「开始/恢复 → 暂停」的活跃区间累加工时，自动排除每次「暂停→恢复」的暂停时长。
// 当前仍暂停（最后一条为 pause 且无配对 resume）则工时截至暂停时刻；多组暂停全部扣除。
// 若仅暂停未恢复：工时 = 暂停时间 − 开始时间（活跃区间即 [开始, 暂停]）。
function taskWorkHours(it) {
  const d = it.dates || {};
  if (!d.started) return 0;
  const pe = d.pauseEvents || [];
  const now = Date.now();
  // 结束基准：已完成取 completed；当前仍暂停（末条为 pause）取到该暂停时间；否则取到 now
  let endRaw;
  if (d.completed) endRaw = d.completed;
  else {
    const last = pe[pe.length - 1];
    endRaw = (last && last.type === 'pause') ? last.t : now;
  }
  // 按活跃区间累加：遇到暂停则结算 [segStart, pause]，遇到恢复则从该时刻重新计时
  let h = 0;
  let segStart = d.started;
  pe.forEach((e) => {
    if (e.type === 'pause') {
      if (segStart != null) { h += estimateWorkHours(segStart, e.t); segStart = null; }
    } else if (segStart == null) {
      segStart = e.t; // 恢复，重新开始计时
    }
  });
  if (segStart != null) h += estimateWorkHours(segStart, endRaw);
  return Math.max(0, h);
}

function renderReports() {
  const list = items.filter((it) => periodMatch(it, reportFilter) && !reportExcludeTypes.has(it.typeCode));
  const total = list.length;
  const testing = list.filter((i) => i.status === '测试中' || i.status === '暂停中').length;
  const tested = list.filter((i) => i.status === '已测完').length;
  const online = list.filter((i) => i.status === '已上线').length;
  const notStart = list.filter((i) => { const d = i.dates || {}; return !d.started; }).length;

  // 总测试工时：统一按工作时段估算（扣除暂停时长，含结束时间也按此逻辑：跨天/周末折算，整天 8H）
  let hours = 0;
  list.forEach((i) => {
    const d = i.dates || {};
    if (d.started) hours += taskWorkHours(i);
  });
  const rounded = Math.round(hours * 10) / 10; // 保留 1 位小数
  const hoursText = rounded <= 0 ? '0.1H' : rounded.toFixed(1) + 'H'; // 结果为 0.0 时默认最小 0.1H

  document.getElementById('r-total').textContent = total;
  document.getElementById('r-hours').textContent = hoursText;
  document.getElementById('r-testing').textContent = testing;
  document.getElementById('r-tested').textContent = tested;
  document.getElementById('r-online').textContent = online;
  document.getElementById('r-notstart').textContent = notStart;

  // ---------- 两大模块：已进入测试 / 未进入测试 ----------
  const ENTERED = ['测试中', '已测完', '已上线', '暂停中'];
  const entered = list.filter((i) => ENTERED.includes(i.status));
  const notEntered = list.filter((i) => !ENTERED.includes(i.status));

  // 小计测试工时（统一按工作时段估算，扣除暂停时长，与顶部总测试工时口径一致）
  function sumHours(lst) {
    return lst.reduce((s, i) => s + taskWorkHours(i), 0);
  }
  // 已进入测试总工时（作为各分布「工时百分比」的基准）
  const enteredHours = sumHours(entered);
  const enteredHoursRounded = Math.round(enteredHours * 10) / 10;
  const enteredHoursText = enteredHoursRounded <= 0 ? '0.1H' : enteredHoursRounded.toFixed(1) + 'H';
  const ehEl = document.getElementById('rm-entered-hours');
  if (ehEl) ehEl.textContent = '· 合计 ' + enteredHoursText;

  const TYPE_COLOR = { '需求': 'var(--c-需求)', '线上BUG': 'var(--c-线上BUG)', '普通BUG': 'var(--c-普通BUG)' };
  const ENTERED_COLOR = { '测试中': 'var(--c-测试中)', '已测完': 'var(--c-已测完)', '已上线': 'var(--c-已上线)', '暂停中': 'var(--c-暂停中)' };
  const NOT_COLOR = { '已提测': 'var(--c-已提测)', '未开始': '#fa8c16' };

  // 类型分布：按任务类型（需求/线上BUG/普通BUG）计数 + 工时；取消勾选的类型不显示
  function typeRows(lst) {
    return TASK_TYPE_LIST.filter((t) => !reportExcludeTypes.has(t.code)).map((t) => {
      const sub = lst.filter((i) => i.typeCode === t.code);
      return { key: t.code, label: t.name, n: sub.length, h: sumHours(sub) };
    });
  }
  // 已进入测试状态分布：测试中计数与工时仍合并包含暂停中（暂停中为测试中的子状态）；
  // 暂停中单独成行显示，其百分比 = 暂停中工时 ÷ 测试中工时（占测试中的比例），由 renderBars 的 pctOf 实现
  function enteredStatusRows(lst) {
    const testingSub = lst.filter((i) => i.status === '测试中' || i.status === '暂停中');
    const testingH = sumHours(testingSub);                 // 测试中工时已含暂停中工时
    const pausedSub = lst.filter((i) => i.status === '暂停中');
    return [
      { key: '测试中', label: '测试中', n: testingSub.length, h: testingH },
      { key: '暂停中', label: '暂停中', n: pausedSub.length, h: sumHours(pausedSub), pctOf: testingH },
      { key: '已测完', label: '已测完', n: lst.filter((i) => i.status === '已测完').length, h: sumHours(lst.filter((i) => i.status === '已测完')) },
      { key: '已上线', label: '已上线', n: lst.filter((i) => i.status === '已上线').length, h: sumHours(lst.filter((i) => i.status === '已上线')) }
    ];
  }
  // 未进入测试状态分布：已提测（status=已提测）+ 未开始（其余无测试开始时间）
  function notStatusRows(lst) {
    const ti = lst.filter((i) => i.status === '已提测').length;
    const ws = lst.length - ti;
    return [{ key: '已提测', label: '已提测', n: ti }, { key: '未开始', label: '未开始', n: ws }];
  }
  // 渲染进度条：宽度按该小节约最大值成比例，行尾显示个数；
  // 已进入测试额外显示每项测试工时与「工时占比（相对已进入测试总工时）」
  function renderBars(elId, rows, colorMap, opts) {
    opts = opts || {};
    const showHours = !!opts.showHours;
    const totalH = opts.totalHours || 0;
    const box = document.getElementById(elId);
    if (!box) return;
    const max = Math.max(1, ...rows.map((r) => r.n));
    box.innerHTML = rows.map((r) => {
      const pct = r.n === 0 ? 0 : Math.max(6, Math.round((r.n / max) * 100));
      const color = colorMap[r.key] || 'var(--primary)';
      let tail = `<span class="bar-num">${r.n}</span>`;
      if (showHours) {
        const rh = Math.round(r.h * 10) / 10;
        const hDisp = r.n === 0 ? '0.0H' : (rh <= 0 ? '0.1H' : rh.toFixed(1) + 'H');
        const denom = (r.pctOf != null) ? r.pctOf : totalH;   // 暂停中等行可指定占比分母（如占测试中）
        const pp = (denom > 0 && r.h > 0) ? Math.round((r.h / denom) * 100) : 0;
        tail += `<span class="bar-hours">${hDisp}</span><span class="bar-pct">${pp}%</span>`;
      }
      return `<div class="bar-row">
        <span class="bar-label">${r.label}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${color}"></span></span>
        ${tail}
      </div>`;
    }).join('');
  }

  renderBars('rm-type-entered', typeRows(entered), TYPE_COLOR, { showHours: true, totalHours: enteredHours });
  renderBars('rm-status-entered', enteredStatusRows(entered), ENTERED_COLOR, { showHours: true, totalHours: enteredHours });
  renderBars('rm-type-not', typeRows(notEntered), TYPE_COLOR);
  renderBars('rm-status-not', notStatusRows(notEntered), NOT_COLOR);

  updateReportCaption();
}

// ---------- Settings ----------
function getReferenceCount(value, key) {
  if (key === 'dev') return items.filter((it) => it.developers && it.developers.includes(value)).length;
  if (key === 'project') return items.filter((it) => it.project === value).length;
  if (key === 'group') return items.filter((it) => it.group === value).length;
  return 0;
}

// 统计归属某项目的需求组数量（含已归档，关联即计入）
function getGroupCount(projectValue) {
  return settings.groups.filter((g) => g.project === projectValue).length;
}

function updateReferencedValue(oldVal, newVal, key) {
  const settingKey = SETTINGS_KEY_MAP[key];
  const idx = settings[settingKey].findIndex((x) => x.value === oldVal);
  if (idx !== -1) {
    const old = settings[settingKey][idx];
    settings[settingKey][idx] = { value: newVal, enabled: old.enabled !== false, project: old.project || '' };
  }
  if (key === 'dev') {
    items.forEach((it) => {
      if (it.developers && it.developers.includes(oldVal)) {
        it.developers = it.developers.map((d) => (d === oldVal ? newVal : d));
      }
    });
  } else if (key === 'project') {
    items.forEach((it) => { if (it.project === oldVal) it.project = newVal; });
    // 同步更新需求组里记录的所属项目，否则重命名后需求组与项目失联（新增/筛选时找不到）
    settings.groups.forEach((g) => { if (g.project === oldVal) g.project = newVal; });
  } else if (key === 'group') {
    items.forEach((it) => { if (it.group === oldVal) it.group = newVal; });
  }
  saveSettings();
  saveItems();
}

// 设置页各列表的搜索词（dev/project/group）
const listSearch = { dev: '', project: '', group: '' };
// 设置页各列表的状态筛选（dev: 全部/已启用/已停用；project/group: 全部/进行中/已归档）
const listStatus = { dev: '全部', project: '全部', group: '全部' };

function renderSettings() {
  const renderList = (id, arr, key) => {
    const el = document.getElementById(id);
    const q = (listSearch[key] || '').trim().toLowerCase();
    let rows = q ? arr.filter((it) => (it.value || '').toLowerCase().includes(q)) : arr;
    // 状态筛选：开发人员按 已启用/已停用；项目/需求组按 进行中/已归档
    const st = listStatus[key];
    if (st !== '全部') {
      const wantActive = key === 'dev' ? (st === '已启用') : (st === '进行中');
      rows = rows.filter((it) => (it.enabled !== false) === wantActive);
    }
    if (!rows.length) {
      const emptyTip = (q || st !== '全部') ? '无匹配项' : '暂无，请在下方输入框添加';
      el.innerHTML = '<div class="settings-item"><span style="color:var(--muted)">' + emptyTip + '</span></div>';
      return;
    }
    el.innerHTML = rows.map((item) => {
      const v = item.value;
      const enabled = item.enabled !== false;
      const count = getReferenceCount(v, key);
      if (editingSetting && editingSetting.key === key && editingSetting.oldVal === v) {
        return `<div class="settings-item editing" data-edit="${key}" data-old="${escapeHtml(v)}">
          <input type="text" class="edit-input" value="${escapeHtml(v)}" />
          <div class="edit-actions">
            <button class="btn primary btn-save" data-save="${key}" data-old="${escapeHtml(v)}" type="button">保存</button>
            <button class="btn ghost btn-cancel" data-cancel="${key}" type="button">取消</button>
          </div>
        </div>`;
      }
      // 项目：汇总「已引用 · N个任务 · N个需求组」，数量为 0 的段不显示
      let refTag = '';
      if (key === 'project') {
        const grpN = getGroupCount(v);
        const parts = [];
        if (count > 0) parts.push(count + '个任务');
        if (grpN > 0) parts.push(grpN + '个需求组');
        if (parts.length) refTag = `<span class="ref-tag">已引用 · ${parts.join(' · ')}</span>`;
      } else {
        refTag = count > 0 ? `<span class="ref-tag">已引用 · ${count}个任务</span>` : '';
      }
      // 开发人员显示 已启用/已停用；项目/需求组显示 进行中/已归档
      const isDev = key === 'dev';
      const statusBadge = enabled
        ? `<span class="status-badge ${isDev ? 'on' : 'dev'}">${isDev ? '已启用' : '进行中'}</span>`
        : `<span class="status-badge ${isDev ? 'off' : 'arch'}">${isDev ? '已停用' : '已归档'}</span>`;
      // 需求组：显示归属项目（蓝色标签，仅项目名称）
      const grpProj = (key === 'group' && item.project)
        ? `<span class="grp-proj">${escapeHtml(item.project)}</span>` : '';
      // ★ 只保留编辑/删除按钮，移除启停用 toggle 按钮
      const mainBtn = count > 0
        ? `<button class="edit-btn" data-edit="${key}" data-val="${escapeHtml(v)}" type="button" aria-label="编辑">✎</button>`
        : `<button class="del" data-del="${key}" data-val="${escapeHtml(v)}" type="button" aria-label="删除"><span class="del-circle"></span></button>`;
      return `<div class="settings-item settings-item--tappable" data-detail="${key}" data-val="${escapeHtml(v)}">
        <div class="item-left">
          <span class="item-name">${escapeHtml(v)}</span>
          <div class="item-sub">${refTag}${grpProj}${statusBadge}</div>
        </div>
        <div class="item-actions">
          ${mainBtn}
        </div>
      </div>`;
    }).join('');
  };
  renderList('dev-list', settings.developers, 'dev');
  renderList('project-list', settings.projects, 'project');
  renderList('group-list', settings.groups, 'group');
}

// ---------- 详情弹框 ----------
let detailItem = null; // { key: 'dev'|'project'|'group', value: string, item: object }
let detailExpanded = false;
let detailGroupsExpanded = false;

// 打开详情弹框
function openDetail(key, val) {
  const settingKey = SETTINGS_KEY_MAP[key];
  const arr = settings[settingKey];
  const item = arr.find((x) => x.value === val);
  if (!item) return;
  detailItem = { key, settingKey, value: val, item, refCount: getReferenceCount(val, key) };
  detailExpanded = false;
  detailGroupsExpanded = false;

  // 填充内容
  const overlay = document.getElementById('detail-overlay');
  if (!overlay) return;

  // 标题（名称居中）
  document.getElementById('detail-title').textContent = val;

  // 标签行
  const count = detailItem.refCount;
  const refTagEl = document.getElementById('detail-ref-tag');
  if (key === 'project') {
    const grpN = getGroupCount(val);
    const parts = [];
    if (count > 0) parts.push(count + '个任务');
    if (grpN > 0) parts.push(grpN + '个需求组');
    if (parts.length) {
      refTagEl.textContent = '已引用 · ' + parts.join(' · ');
      refTagEl.style.display = '';
    } else {
      refTagEl.style.display = 'none';
    }
  } else {
    refTagEl.textContent = '已引用 · ' + count + '个任务';
    refTagEl.style.display = count > 0 ? '' : 'none';
  }
  // 需求组：详情中显示所属项目标签（蓝色，仅项目名称）
  const grpProjEl = document.getElementById('detail-grp-proj');
  if (grpProjEl) {
    if (key === 'group' && item && item.project) {
      grpProjEl.textContent = item.project;
      grpProjEl.hidden = false;
    } else {
      grpProjEl.hidden = true;
    }
  }
  const badge = document.getElementById('detail-status-badge');
  const isDev = key === 'dev';
  const enabledNow = item.enabled !== false;
  badge.textContent = isDev ? (enabledNow ? '已启用' : '已停用') : (enabledNow ? '进行中' : '已归档');
  badge.className = 'status-badge ' + (isDev ? (enabledNow ? 'on' : 'off') : (enabledNow ? 'dev' : 'arch'));

  // 关联任务列表
  renderDetailTasks();
  // 需求组列表（仅项目详情）
  renderDetailGroups();

  // 胶囊切换按钮状态
  updateDetailCapsule(enabledNow, key);

  // 显示
  overlay.hidden = false;
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

// 渲染关联任务列表
function renderDetailTasks() {
  const container = document.getElementById('detail-tasks');
  const toggleIcon = document.getElementById('detail-tasks-toggle');
  const countEl = document.getElementById('detail-tasks-count');
  const list = document.getElementById('detail-tasks-list');

  if (!container) return;
  const count = detailItem.refCount;

  if (count === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  // ★ 只更新计数 span，避免整体覆盖 header 导致 #detail-tasks-toggle 箭头被销毁
  if (countEl) countEl.textContent = count;
  if (toggleIcon) toggleIcon.textContent = detailExpanded ? '▲' : '▼';

  if (!detailExpanded) {
    list.innerHTML = '';
    list.style.display = 'none';
    return;
  }

  list.style.display = '';

  // 查找引用此设置项的所有任务
  let tasks = [];
  if (detailItem.key === 'dev') {
    tasks = items.filter((it) => it.developers && it.developers.includes(detailItem.value));
  } else if (detailItem.key === 'project') {
    tasks = items.filter((it) => it.project === detailItem.value);
  } else if (detailItem.key === 'group') {
    tasks = items.filter((it) => it.group === detailItem.value);
  }

  if (tasks.length === 0) {
    list.innerHTML = '<div class="detail-empty">无关联任务</div>';
    return;
  }

  list.innerHTML = tasks.map((t) => `
    <div class="detail-task-card">
      <span class="tag type-${t.type}">${t.type}</span>
      <span class="detail-task-title">${escapeHtml(t.title)}</span>
      <span class="tag status-${t.status}">${t.status}</span>
    </div>`).join('');
}

// 展开/收起任务列表
function toggleDetailTasks() {
  detailExpanded = !detailExpanded;
  renderDetailTasks();
}

// 渲染「所属项目」详情中的需求组列表（归属该项目的需求组），默认折叠；非项目详情隐藏
function renderDetailGroups() {
  const container = document.getElementById('detail-groups');
  const toggleIcon = document.getElementById('detail-groups-toggle');
  const countEl = document.getElementById('detail-groups-count');
  const list = document.getElementById('detail-groups-list');
  if (!container || !detailItem) return;

  // 仅项目详情展示需求组区块
  if (detailItem.key !== 'project') {
    container.hidden = true;
    return;
  }
  const groups = settings.groups.filter((g) => g.project === detailItem.value);
  container.hidden = false;

  if (countEl) countEl.textContent = groups.length;
  if (toggleIcon) toggleIcon.textContent = detailGroupsExpanded ? '▲' : '▼';

  if (!detailGroupsExpanded) {
    list.innerHTML = '';
    list.style.display = 'none';
    return;
  }
  list.style.display = '';

  if (groups.length === 0) {
    list.innerHTML = '<div class="detail-empty">无归属需求组</div>';
    return;
  }

  list.innerHTML = groups.map((g) => {
    const enabled = g.enabled !== false;
    const gcount = getReferenceCount(g.value, 'group');
    const badge = `<span class="status-badge ${enabled ? 'dev' : 'arch'}">${enabled ? '进行中' : '已归档'}</span>`;
    // 任务数与设置页需求组一致：始终显示「已引用 · N个任务」
    const ref = `<span class="ref-tag">已引用 · ${gcount}个任务</span>`;
    return `<div class="detail-task-card">
      <span class="detail-task-title">${escapeHtml(g.value)}</span>
      ${ref}${badge}
    </div>`;
  }).join('');
}

// 展开/收起需求组列表
function toggleDetailGroups() {
  detailGroupsExpanded = !detailGroupsExpanded;
  renderDetailGroups();
}

// 更新胶囊切换按钮状态（dev: 停用/启用；project/group: 开发中/已归档）
function updateDetailCapsule(enabled, key) {
  const leftBtn = document.getElementById('detail-capsule-disable');
  const rightBtn = document.getElementById('detail-capsule-enable');
  if (!leftBtn || !rightBtn) return;
  if (key === 'dev') {
    // 左=停用(禁用时高亮红)，右=启用(启用时高亮蓝)
    leftBtn.textContent = '停用';
    rightBtn.textContent = '启用';
    leftBtn.className = 'detail-capsule-btn dev-disable' + (enabled ? '' : ' active');
    rightBtn.className = 'detail-capsule-btn dev-enable' + (enabled ? ' active' : '');
  } else {
    // 左=已归档(停用时高亮深绿)，右=进行中(启用时高亮蓝)，与启用/停用布局一致
    leftBtn.textContent = '已归档';
    rightBtn.textContent = '进行中';
    leftBtn.className = 'detail-capsule-btn pg-arch' + (enabled ? '' : ' active');
    rightBtn.className = 'detail-capsule-btn pg-dev' + (enabled ? ' active' : '');
  }
}

// 胶囊切换点击处理
async function onCapsuleToggle(enable) {
  if (!detailItem) return;
  const key = detailItem.key;

  // 更新状态
  detailItem.item.enabled = enable;
  saveSettings();
  updateDetailCapsule(enable, key);

  // 更新标签
  const badge = document.getElementById('detail-status-badge');
  if (badge) {
    if (key === 'dev') {
      badge.textContent = enable ? '已启用' : '已停用';
      badge.className = 'status-badge ' + (enable ? 'on' : 'off');
    } else {
      badge.textContent = enable ? '进行中' : '已归档';
      badge.className = 'status-badge ' + (enable ? 'dev' : 'arch');
    }
  }

  // 刷新设置列表和表单选项
  renderSettings();
  renderFormOptions();
  toast(key === 'dev' ? (enable ? '已启用' : '已停用') : (enable ? '已设为开发中' : '已归档'));
}

// 胶囊点击：左=停用/归档(关)，右=启用/进行中(开)，对所有类型一致
function onCapsuleClick(e) {
  if (!detailItem) return;
  const isLeft = e.currentTarget.id === 'detail-capsule-disable';
  onCapsuleToggle(!isLeft);
}

// 关闭详情弹框
function closeDetail() {
  const overlay = document.getElementById('detail-overlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.classList.remove('show');
  }
  document.body.style.overflow = '';
  detailItem = null;
}

// ---------- Events ----------

// 任务操作处理器（按动作类型拆分，降低圈复杂度）
const TASK_ACTION_HANDLERS = {
  // ---- 删除（双源适配） ----
  async del(raw, id) {
    var norm = normalizeTask(raw);
    var ok = await customConfirm(`确认删除「${norm.title}」？`, { danger: true });
    if (!ok) return;

    if (raw._source === 'idb') {
      // --- IndexedDB 路径：deleteRequirementTask 内部已做图片/附件/生命流程级联删除 ---
      await RT_REQUIREMENT_TASKS.deleteRequirementTask(id);
    } else {
      // --- Legacy 路径（保持兼容） ---
      await dbDeleteImages(raw.images || []);
      await dbDeleteAttachments(raw.attachments || []);
      raw.updatedBy = getCurrentUser();
      recordOp(raw, '删除', null, '删除');
      items = items.filter(function (i) { return i.id !== id; });
      saveItems();
    }

    await refreshTaskList();   // 双源刷新
    toast('已删除');
  },

  // ---- 状态推进（双源适配） ----
  async advance(raw) {
    var norm = normalizeTask(raw);
    var act = actionLabel(norm.statusText);       // 中文动作名：开发提交/测试开始/测试完成/上线
    var ns = nextStatus(norm.statusText);          // 下一状态中文名
    if (!ns) return;

    var now = Date.now();
    var op = getCurrentUser();

    if (raw._source === 'idb') {
      // 状态码映射：中文 → code
      var STATUS_TEXT_TO_CODE = { '待开发': 'TODO', '已提测': 'SUBMITTED', '测试中': 'TESTING', '已测完': 'TESTED', '已上线': 'ONLINE' };
      var nextStatusCode = STATUS_TEXT_TO_CODE[ns];
      if (!nextStatusCode) return;

      // 操作码映射：中文动作 → code
      var OP_MAP = { '开发提交': 'DEV_SUBMIT', '测试开始': 'TEST_START', '测试完成': 'TEST_DONE', '上线': 'ONLINE' };
      var operationCode = OP_MAP[act] || 'DEV_SUBMIT';

      // 1. 更新任务状态 + 对应生命周期时间（仅首次推进到该阶段时记录，与 legacy 一致）
      var patch = Object.assign({}, raw, { statusCode: nextStatusCode });

      // 状态→生命周期时间字段映射（devSubmit → testStart → testEnd → online）
      var TIME_FIELDS = {
        'SUBMITTED': { time: 'devSubmitTime', by: 'devSubmitBy' },
        'TESTING':   { time: 'testStartTime',  by: 'testStartBy' },
        'TESTED':    { time: 'testEndTime',    by: 'testEndBy' },
        'ONLINE':    { time: 'onlineTime',     by: 'onlineBy' }
      };
      var tf = TIME_FIELDS[nextStatusCode];
      if (tf && raw[tf.time] == null) {        // 仅首次推进到该阶段时记录时间
        patch[tf.time] = now;
        patch[tf.by] = op;
      }

      await RT_REQUIREMENT_TASKS.updateRequirementTask(raw.id, patch, op);

      // 2. 写入生命流程
      await RT_TASK_LIFECYCLES.createTaskLifecycle({
        taskId: raw.id,
        statusCode: nextStatusCode,
        operationCode: operationCode,
        operator: op,
        operateTime: now
      });

    } else {
      // --- Legacy 路径（保持兼容） ---
      raw.status = ns;
      raw.dates = raw.dates || {};
      var dateMap = { '已提测': 'submitted', '测试中': 'started', '已测完': 'completed', '已上线': 'online' };
      if (dateMap[ns] && !raw.dates[dateMap[ns]]) raw.dates[dateMap[ns]] = now;
      raw.updatedAt = now;
      raw.updatedBy = op;
      recordOp(raw, act || '推进');
      saveItems();
    }

    await refreshTaskList();   // 双源刷新
    toast(`状态更新为：${ns}`);
  },

  // ---- 重置（双源适配） ----
  async reset(raw) {
    var now = Date.now();
    var op = getCurrentUser();

    if (raw._source === 'idb') {
      // spread 全量字段，重置 statusCode + 清空生命周期时间字段
      await RT_REQUIREMENT_TASKS.updateRequirementTask(raw.id, Object.assign({}, raw, {
        statusCode: 'TODO',
        devSubmitTime: null, devSubmitBy: '',
        testStartTime: null, testStartBy: '',
        testEndTime: null, testEndBy: '',
        onlineTime: null, onlineBy: ''
      }), op);

      await RT_TASK_LIFECYCLES.createTaskLifecycle({
        taskId: raw.id,
        statusCode: 'TODO',
        operationCode: 'RESET',
        operator: op,
        operateTime: now
      });
    } else {
      // --- Legacy 路径（保持兼容） ---
      raw.status = '待开发';
      raw.dates = { submitted: null, started: null, completed: null, online: null, pauseEvents: [] };
      raw.updatedAt = now;
      raw.updatedBy = op;
      recordOp(raw, '重置');
      saveItems();
    }

    await refreshTaskList();   // 双源刷新
    toast('已重置为待开发');
  },

  // ---- 暂停（双源适配） ----
  async pause(raw) {
    var now = Date.now();
    var op = getCurrentUser();

    if (raw._source === 'idb') {
      // 暂停时不改 statusCode（TASK_STATUS 字典暂未补充 PAUSED），仅记录生命流程
      await RT_TASK_LIFECYCLES.createTaskLifecycle({
        taskId: raw.id,
        statusCode: raw.statusCode,
        operationCode: 'PAUSE',
        operator: op,
        operateTime: now
      });
    } else {
      // --- Legacy 路径（保持兼容） ---
      raw.status = '暂停中';
      raw.dates = raw.dates || {};
      raw.dates.pauseEvents = raw.dates.pauseEvents || [];
      raw.dates.pauseEvents.push({ type: 'pause', t: now });
      raw.updatedAt = now;
      raw.updatedBy = op;
      recordOp(raw, '暂停');
      saveItems();
    }

    await refreshTaskList();   // 双源刷新
    toast('已暂停');
  },

  // ---- 暂停恢复（双源适配） ----
  async resume(raw) {
    var now = Date.now();
    var op = getCurrentUser();

    if (raw._source === 'idb') {
      // 恢复到测试中（之前的状态）
      await RT_REQUIREMENT_TASKS.updateRequirementTask(raw.id, Object.assign({}, raw, {
        statusCode: 'TESTING'
      }), op);

      await RT_TASK_LIFECYCLES.createTaskLifecycle({
        taskId: raw.id,
        statusCode: 'TESTING',
        operationCode: 'RESUME',
        operator: op,
        operateTime: now
      });
    } else {
      // --- Legacy 路径（保持兼容） ---
      raw.status = '测试中';
      raw.dates = raw.dates || {};
      raw.dates.pauseEvents = raw.dates.pauseEvents || [];
      raw.dates.pauseEvents.push({ type: 'resume', t: now });
      raw.updatedAt = now;
      raw.updatedBy = op;
      recordOp(raw, '恢复');
      saveItems();
    }

    await refreshTaskList();   // 双源刷新
    toast('已恢复测试');
  },

  // ---- 编辑（小改：传入 raw 对象含 _source） ----
  async edit(raw, id) {
    editingId = id;
    openModal('编辑任务');
    await setFormData(raw);    // setFormData 内部已支持 raw 对象（含 _source）
  }
};

async function onTaskAction(e) {
  const btn = e.target.closest('button[data-act]');
  if (btn) {
    const id = btn.dataset.id;
    // 双源查找：allTasks 合并了 IndexedDB + legacy 数据
    const raw = allTasks.find((i) => i && i.id === id);
    if (!raw) return;                            // 双源都找不到才放弃
    const act = btn.dataset.act;
    const handler = TASK_ACTION_HANDLERS[act];
    if (handler) await handler(raw, id);         // 传原始对象（含 _source 标记）
    return;
  }
  // 点击任务卡其它区域（标题/描述/标签）→ 打开详情
  const card = e.target.closest('.task-card');
  if (card && card.dataset.id) openTaskDetail(card.dataset.id);
}

// 同步某组筛选 chip 的选中态：selection 为空时「全部」高亮，否则按所选值高亮（支持多选）
function syncFilterChips(groupId, dataAttr, selected) {
  document.querySelectorAll('#' + groupId + ' .chip').forEach((el) => {
    const v = el.dataset[dataAttr];
    const active = v === '全部' ? selected.length === 0 : selected.includes(v);
    el.classList.toggle('active', active);
  });
}

// 填充首页下拉筛选（所属项目 / 需求组）；需求组选项依赖所选项目
function populateFilterSelects() {
  const projSel = document.getElementById('filter-project');
  const dropdownList = document.getElementById('group-dropdown-list');
  if (!projSel || !dropdownList) return;

  // 项目
  projSel.innerHTML = '<option value="">全部项目</option>' +
    (settings.projects || []).map((p) => `<option value="${escapeHtml(p.value)}">${escapeHtml(p.value)}</option>`).join('');
  if (filter.project && !(settings.projects || []).some((p) => p.value === filter.project)) filter.project = '';
  projSel.value = filter.project;

  // 需求组下拉多选
  const groups = filter.project
    ? (settings.groups || []).filter((g) => g.project === filter.project)
    : (settings.groups || []);
  // 清理已不存在的需求组
  filter.group = filter.group.filter((g) => groups.some((sg) => sg.value === g));

  const allChecked = filter.group.length === 0;
  let html = `<div class="dropdown-item select-all${allChecked ? ' checked' : ''}" data-group-val="全部">
    <span class="check-mark">✓</span><span>全部需求组</span></div>`;
  groups.forEach((g) => {
    const checked = filter.group.includes(g.value);
    html += `<div class="dropdown-item${checked ? ' checked' : ''}" data-group-val="${escapeHtml(g.value)}">
      <span class="check-mark">✓</span><span>${escapeHtml(g.value)}</span></div>`;
  });
  dropdownList.innerHTML = html;

  updateGroupTrigger();
}

// 更新需求组触发器显示文字
function updateGroupTrigger() {
  const trigger = document.getElementById('filter-group-trigger');
  const textEl = trigger?.querySelector('.trigger-text');
  const countEl = trigger?.querySelector('.trigger-count');
  if (!trigger || !textEl || !countEl) return;

  if (filter.group.length === 0) {
    textEl.textContent = '全部需求组';
    countEl.hidden = true;
    countEl.textContent = '';
    trigger.classList.remove('has-selection');
  } else if (filter.group.length === 1) {
    // 仅 1 个时直接显示名称，不显示数字，避免「还是 1」的视觉残留
    textEl.textContent = filter.group[0];
    countEl.hidden = true;
    countEl.textContent = '';
    trigger.classList.add('has-selection');
  } else {
    textEl.textContent = '已选';
    countEl.textContent = filter.group.length;
    countEl.hidden = false;
    trigger.classList.add('has-selection');
  }
}

// 需求组多选下拉：展开/收起
function toggleGroupDropdown(show) {
  const dropdown = document.getElementById('group-dropdown');
  if (!dropdown) return;
  if (show === undefined) {
    dropdown.hidden = !dropdown.hidden;
  } else {
    dropdown.hidden = !show;
  }
}

// 需求组多选下拉：点击选项
function onGroupDropdownClick(e) {
  const item = e.target.closest('.dropdown-item');
  if (!item) return;
  const val = item.dataset.groupVal;

  if (val === '全部') {
    filter.group = [];
  } else {
    if (filter.group.includes(val)) {
      filter.group = filter.group.filter((v) => v !== val);
    } else {
      filter.group = [...filter.group, val];
    }
  }

  // 更新选项勾选状态
  const allChecked = filter.group.length === 0;
  const dropdownList = document.getElementById('group-dropdown-list');
  dropdownList.querySelectorAll('.dropdown-item').forEach((el) => {
    const v = el.dataset.groupVal;
    el.classList.toggle('checked', v === '全部' ? allChecked : filter.group.includes(v));
  });

  updateGroupTrigger();
  renderTaskList();
}

function onFilterClick(e) {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  if (btn.dataset.typeCode !== undefined) {
    const val = btn.dataset.typeCode;
    if (val === '全部') {
      filter.typeCode = [];                               // 清空即回到「全部」
    } else {
      filter.typeCode = filter.typeCode.includes(val)
        ? filter.typeCode.filter((v) => v !== val)        // 再次点击取消
        : [...filter.typeCode, val];                      // 点击选中（可多选）
    }
    syncFilterChips('type-chips', 'typeCode', filter.typeCode);
  } else if (btn.dataset.status !== undefined) {
    const val = btn.dataset.status;
    if (val === '全部') {
      filter.status = [];
    } else {
      filter.status = filter.status.includes(val)
        ? filter.status.filter((v) => v !== val)
        : [...filter.status, val];
    }
    syncFilterChips('status-chips', 'status', filter.status);
  } else if (btn.dataset.priority !== undefined) {
    const val = btn.dataset.priority;
    if (val === '全部') {
      filter.priority = [];
    } else {
      filter.priority = filter.priority.includes(val)
        ? filter.priority.filter((v) => v !== val)
        : [...filter.priority, val];
    }
    syncFilterChips('priority-chips', 'priority', filter.priority);
  }
  renderTaskList();
}

function onFormTypeChip(e) {
  const btn = e.target.closest('[data-type-code]');
  if (!btn || btn.parentElement.id !== 'form-type-chips') return;
  formTypeCode = btn.dataset.typeCode;
  renderFormTypeChips();
}

function onFormPriorityChip(e) {
  const btn = e.target.closest('[data-priority-code]');
  if (!btn || btn.parentElement.id !== 'form-priority-chips') return;
  formPriorityCode = btn.dataset.priorityCode;
  renderFormPriorityChips();
}

function onFormDevChip(e) {
  var btn = e.target.closest('[data-user-id]');
  if (!btn) return;
  var uid2 = btn.dataset.userId;
  if (formDeveloperIds.includes(uid2)) {
    formDeveloperIds = formDeveloperIds.filter(function (x) { return x !== uid2; });
  } else {
    formDeveloperIds.push(uid2);
  }
  renderFormDevChips();
}

async function onSubmit(e) {
  e.preventDefault();
  let data = getFormData();
  if (!data.taskName) return toast('请填写任务名称', 'warn');

  const op = getCurrentUser();   // 当前登录用户，作为创建人 / 更新人

  try {
    // 保存前存储配额校验：图片/附件为 Base64，体积大，避免写入时静默失败
    const addedDataUrls = [];
    if (editingId) {
      const old = allTasks.find((i) => i && i.id === editingId);  // 双源查找（idb + legacy）
      const oldImgIds = (old && old.imageIds) || (old && old.images) || [];
      const oldAttIds = (old && old.attachmentIds) || (old && old.attachments) || [];
      formImages.filter((i) => !oldImgIds.includes(i.id)).forEach((i) => i.dataUrl && addedDataUrls.push(i.dataUrl));
      formAttachments.filter((a) => !oldAttIds.includes(a.id)).forEach((a) => a.dataUrl && addedDataUrls.push(a.dataUrl));
    } else {
      formImages.forEach((i) => i.dataUrl && addedDataUrls.push(i.dataUrl));
      formAttachments.forEach((a) => a.dataUrl && addedDataUrls.push(a.dataUrl));
    }
    if (!(await checkQuotaBeforeSave(addedDataUrls))) return; // 配额不足，已 toast 提示并中止保存

    if (editingId) {
      const raw = allTasks.find((i) => i && i.id === editingId);
      if (!raw) { toast('任务不存在', 'warn'); return; }

      // ====== 图片处理（按来源分流） ======
      if (raw._source === 'idb') {
        // --- idb 路径：ID 字段为 imageIds / attachmentIds ---
        const oldImgIds = raw.imageIds || [];
        const newImgIds = data.imageIds;
        const removedImgs = oldImgIds.filter((id) => !newImgIds.includes(id));
        await dbDeleteImages(removedImgs);
        const addedImgs = formImages.filter((i) => !oldImgIds.includes(i.id));
        for (const img of addedImgs) {
          await dbPutImage({ id: img.id, dataUrl: img.dataUrl, taskId: editingId });
        }

        const oldAttIds = raw.attachmentIds || [];
        const newAttIds = data.attachmentIds;
        const removedAtts = oldAttIds.filter((id) => !newAttIds.includes(id));
        await dbDeleteAttachments(removedAtts);
        const addedAtts = formAttachments.filter((a) => !oldAttIds.includes(a.id));
        for (const att of addedAtts) {
          if (!att.dataUrl) continue;
          await dbPutAttachment({ id: att.id, name: att.name, type: att.type,
                                  size: att.size, dataUrl: att.dataUrl, taskId: editingId });
        }
      } else {
        // --- legacy 路径：ID 字段为 images / attachments ---
        const oldImgIds = raw.images || [];
        const newImgIds = data.imageIds;
        const removedImgs = oldImgIds.filter((id) => !newImgIds.includes(id));
        await dbDeleteImages(removedImgs);
        const addedImgs = formImages.filter((i) => !oldImgIds.includes(i.id));
        for (const img of addedImgs) {
          await dbPutImage({ id: img.id, dataUrl: img.dataUrl, taskId: editingId });
        }

        const oldAttIds = raw.attachments || [];
        const newAttIds = data.attachmentIds;
        const removedAtts = oldAttIds.filter((id) => !newAttIds.includes(id));
        await dbDeleteAttachments(removedAtts);
        const addedAtts = formAttachments.filter((a) => !oldAttIds.includes(a.id));
        for (const att of addedAtts) {
          if (!att.dataUrl) continue;
          await dbPutAttachment({ id: att.id, name: att.name, type: att.type,
                                  size: att.size, dataUrl: att.dataUrl, taskId: editingId });
        }
      }

      // ====== 核心写入（按来源分流） ======
      if (raw._source === 'idb') {
        // --- IndexedDB 路径 ---
        // 1. 更新任务本体（getFormData() 已返回完整字段，updateRequirementTask 内部 get+put）
        await RT_REQUIREMENT_TASKS.updateRequirementTask(editingId, data, op);

        // 2. 写入生命流程记录（编辑操作）
        await RT_TASK_LIFECYCLES.createTaskLifecycle({
          taskId: editingId,
          statusCode: raw.statusCode,           // 编辑不改变状态
          operationCode: 'EDIT',
          operator: op,
          operateTime: Date.now()
        });

        toast('已更新');
      } else {
        // --- Legacy 路径（保持向后兼容 + 修复 saveItems 缺失） ---
        const it = items.find((i) => i.id === editingId);
        if (it) {
          const { createdAt, dates, ...rest } = data;
          Object.assign(it, rest);
          if (createdAt) it.createdAt = createdAt;
          if (dates) it.dates = dates;
          it.updatedAt = Date.now();
          it.updatedBy = op;
          recordOp(it, '编辑', op, null);
          saveItems();                             // 修复：补齐缺失的持久化
          toast('已更新');
        }
      }
    } else {
      // 图片/附件配额校验保持不变（checkQuotaBeforeSave）
      const addedDataUrls = [];
      formImages.forEach((i) => i.dataUrl && addedDataUrls.push(i.dataUrl));
      formAttachments.forEach((a) => a.dataUrl && addedDataUrls.push(a.dataUrl));
      if (!(await checkQuotaBeforeSave(addedDataUrls))) return;

      data = getFormData();
      if (!data.taskName) { toast('请填写任务名称', 'warn'); return; }

      try {
        // 写入 requirementTasks 表（自动 genId + 校验字典code + 外键 + 审计字段）
        var created = await RT_REQUIREMENT_TASKS.createRequirementTask(data, op);

        // 图片落库到 IndexedDB（req-tracker-pwa 库，不变）
        for (var img of formImages) {
          await dbPutImage({ id: img.id, dataUrl: img.dataUrl, taskId: created.id });
        }
        for (var att of formAttachments) {
          if (!att.dataUrl) continue;
          await dbPutAttachment({ id: att.id, name: att.name, type: att.type, size: att.size, dataUrl: att.dataUrl, taskId: created.id });
        }

        // 写入生命流程记录（创建操作）
        await RT_TASK_LIFECYCLES.createTaskLifecycle({
          taskId: created.id,
          statusCode: 'TODO',
          operationCode: 'CREATE',
          operator: op,
          operateTime: Date.now()
        });

        toast('已添加');
      } catch (err) {
        console.error('创建失败:', err);
        toast('创建失败：' + (err && err.message || '未知错误'), 'warn');
        return; // 不关闭弹窗，让用户可修正后重试
      }
    }
    // 公共收尾（新旧共用）
    closeModal();
    await refreshTaskList();     // 双源刷新
    warnIfQuotaHigh();
  } catch (err) {
    console.error('保存失败:', err);
    toast('保存失败：' + (err && err.message || '未知错误'), 'warn');
  }
}

const SETTINGS_KEY_MAP = { dev: 'developers', project: 'projects', group: 'groups' };

function onSettingsAdd(e) {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  const key = SETTINGS_KEY_MAP[btn.dataset.add];
  const input = document.getElementById(`${btn.dataset.add}-input`);
  const val = input.value.trim();
  if (!val) return toast('请输入内容');
  if (settings[key].some((x) => x.value === val)) return toast('已存在，请勿重复添加');
  if (key === 'groups') {
    // 打开「选择所属项目」弹框，由用户在弹框内选定项目后确认新增
    openGroupProjectModal(val);
    return;
  }
  settings[key].push({ value: val, enabled: true });
  saveSettings();
  input.value = '';
  renderSettings();
  toast('已添加');
}

async function onSettingsAction(e) {
  const btn = e.target.closest('[data-del], [data-edit], [data-save], [data-cancel]');
  if (!btn) return;

  // 删除
  if (btn.dataset.del) {
    const key = SETTINGS_KEY_MAP[btn.dataset.del];
    const val = btn.dataset.val;
    const ok = await customConfirm(`确认删除「${val}」？`, { danger: true });
    if (!ok) return;
    // 删除项目前，将其下属需求组重新归属到其余首个项目（无项目则清空）
    if (key === 'projects') {
      const remaining = settings.projects.filter((x) => x.value !== val);
      const fallback = remaining.length ? remaining[0].value : '';
      settings.groups.forEach((g) => { if (g.project === val) g.project = fallback; });
      if (settings.selectedProject === val) settings.selectedProject = fallback;
    }
    settings[key] = settings[key].filter((x) => x.value !== val);
    saveSettings();
    renderSettings();
    toast('已删除');
    return;
  }

  // 进入编辑模式
  if (btn.dataset.edit) {
    const key = btn.dataset.edit;
    const val = btn.dataset.val;
    editingSetting = { key, oldVal: val };
    renderSettings();
    const input = document.querySelector(`.settings-item.editing[data-edit="${key}"] .edit-input`);
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    return;
  }

  // 保存编辑
  if (btn.dataset.save) {
    const key = btn.dataset.save;
    const oldVal = btn.dataset.old;
    const input = document.querySelector(`.settings-item.editing[data-edit="${key}"] .edit-input`);
    if (!input) return;
    const newVal = input.value.trim();
    if (!newVal) return toast('请输入内容');
    if (newVal === oldVal) {
      editingSetting = null;
      renderSettings();
      return;
    }
    const settingKey = SETTINGS_KEY_MAP[key];
    if (settings[settingKey].some((x) => x.value === newVal)) return toast('已存在，请勿重复添加');
    const count = getReferenceCount(oldVal, key);
    if (count > 0) {
      const ok = await customConfirm(`「${oldVal}」已被 ${count} 个任务引用，保存后会同步更新这些任务中的文案。`, { title: '同步更新提醒', confirmText: '确认保存', cancelText: '取消' });
      if (!ok) return;
    }
    updateReferencedValue(oldVal, newVal, key);
    editingSetting = null;
    renderSettings();
    renderTaskList();
    toast('已保存');
    return;
  }

  // 取消编辑
  if (btn.dataset.cancel) {
    editingSetting = null;
    renderSettings();
  }
}

// ---------- 新增需求组·选择所属项目弹框 ----------
let gpSelected = null;   // 当前选中的项目名
let gpGroupName = '';     // 待新增的需求组名称

function openGroupProjectModal(name) {
  gpGroupName = name;
  gpSelected = null;
  const nameEl = document.getElementById('gp-group-name');
  if (nameEl) nameEl.textContent = name;
  const err = document.getElementById('gp-error');
  if (err) err.hidden = true;
  const search = document.getElementById('gp-search');
  if (search) search.value = '';
  renderGroupProjectList('');
  const overlay = document.getElementById('group-project-overlay');
  if (overlay) { overlay.hidden = false; overlay.classList.add('show'); }
  document.body.style.overflow = 'hidden';
}

function renderGroupProjectList(q) {
  const list = document.getElementById('gp-list');
  if (!list) return;
  const ql = (q || '').trim().toLowerCase();
  const arr = settings.projects.filter(
    (p) => p.enabled !== false && (!ql || p.value.toLowerCase().includes(ql))
  );
  if (!arr.length) {
    list.innerHTML = '<div class="gp-empty">无匹配项目</div>';
    return;
  }
  // 弹框内项目仅展示、可点选；选中效果与设置页一致（蓝底白字）
  list.innerHTML = arr.map((p) => {
    const sel = gpSelected === p.value;
    return `<div class="settings-item ${sel ? 'selected' : ''}" data-gp="${escapeHtml(p.value)}">
      <div class="item-left"><span class="item-name">${escapeHtml(p.value)}</span></div>
    </div>`;
  }).join('');
}

function closeGroupProjectModal() {
  const overlay = document.getElementById('group-project-overlay');
  if (overlay) { overlay.hidden = true; overlay.classList.remove('show'); }
  document.body.style.overflow = '';
  gpSelected = null;
  gpGroupName = '';
}

function onGroupProjectListClick(e) {
  const row = e.target.closest('[data-gp]');
  if (!row) return;
  gpSelected = row.dataset.gp;
  const err = document.getElementById('gp-error');
  if (err) err.hidden = true;
  const search = document.getElementById('gp-search');
  renderGroupProjectList(search ? search.value : '');
}

function onGroupProjectSearch(e) {
  renderGroupProjectList(e.target.value);
}

function confirmGroupProject() {
  if (!gpSelected) {
    const err = document.getElementById('gp-error');
    if (err) err.hidden = false;
    return;
  }
  // 二次校验重名（理论上打开前已校验）
  if (settings.groups.some((g) => g.value === gpGroupName)) {
    closeGroupProjectModal();
    return toast('已存在，请勿重复添加');
  }
  settings.groups.push({ value: gpGroupName, enabled: true, project: gpSelected });
  saveSettings();
  const input = document.getElementById('group-input');
  if (input) input.value = '';
  closeGroupProjectModal();
  renderSettings();
  toast('已添加');
}

function seedDemoData() {
  if (items.length > 0 || localStorage.getItem(STORE_KEY + '-seeded')) return;
  const now = Date.now();
  items = [
    {
      id: uid(), title: '测试C', typeCode: 'COMMON_BUG', type: '普通BUG', status: '测试中',
      project: '默认项目', group: '默认组', developers: ['开发A'], dueDate: '', desc: '',
      createdAt: now, updatedAt: now, dates: { submitted: now, started: now }
    },
    {
      id: uid(), title: '测试B', typeCode: 'ONLINE_BUG', type: '线上BUG', status: '已提测',
      project: '默认项目', group: '默认组', developers: ['开发A'], dueDate: '', desc: '',
      createdAt: now, updatedAt: now, dates: { submitted: now }
    },
    {
      id: uid(), title: '测试A', typeCode: 'REQ', type: '需求', status: '待开发',
      project: '默认项目', group: '默认组', developers: ['开发A', '开发B', '开发C'], dueDate: '', desc: '描述A',
      createdAt: now - 60000, updatedAt: now - 60000, dates: {}
    }
  ];
  saveItems();
  localStorage.setItem(STORE_KEY + '-seeded', '1');
}


// ---------- Stats ----------
function renderStats(filtered) {
  const data = filtered || items;
  const typeCounts = {};
  TASK_TYPE_LIST.forEach((t) => (typeCounts[t.code] = data.filter((it) => it.typeCode === t.code).length));
  const statusCounts = {};
  STATUSES.forEach((s) => (statusCounts[s] = data.filter((it) => it.statusText === s).length));
  // 统计项「测试中」合并计入「暂停中」
  statusCounts['测试中'] += data.filter((it) => it.statusText === '暂停中').length;

  const grid = document.getElementById('stats-grid');
  const bar = document.getElementById('stats-bar');
  const card = document.getElementById('filter-card');
  const btnStats = document.getElementById('btn-toggle-stats');
  const btnFilters = document.getElementById('btn-toggle-filters');
  if (!grid) return;

  const statItems = [
    { label: '全部任务', value: data.length, color: 'var(--primary)' },
    ...TASK_TYPE_LIST.map((t) => ({ label: t.name, value: typeCounts[t.code] || 0, color: t.color })),
    ...STAT_STATS.map((s) => ({ label: s, value: statusCounts[s], color: `var(--c-${s})` }))
  ];
  grid.innerHTML = statItems
    .map((it) => `
      <div class="stat-card">
        <div class="stat-num" style="color:${it.color}">${it.value}</div>
        <div class="stat-label">${it.label}</div>
      </div>
    `)
    .join('');

  if (bar) bar.classList.toggle('hidden', !uiState.showStats);
  if (card) card.classList.toggle('hidden', !uiState.showFilters);
  if (btnStats) btnStats.textContent = uiState.showStats ? '隐藏统计' : '显示统计';
  if (btnFilters) btnFilters.textContent = uiState.showFilters ? '隐藏筛选' : '显示筛选';
}

function toggleStats() {
  uiState.showStats = !uiState.showStats;
  saveUIState();
  renderStats(items);
}

function toggleFilters() {
  uiState.showFilters = !uiState.showFilters;
  saveUIState();
  renderStats(items);
}


// ---------- Init ----------
async function init() {
  // 照有：任务类型预取
  await ensureTaskTypes();
  migrateItemTypeCodes();
  renderTypeFilterChips();

  // 新增：预取其他主数据（字典+实体表）
  await Promise.all([
    ensurePriorities(),         // 优先级字典
    ensureProjects(),           // 项目表
    ensureProjectVersions(),    // 项目版本表
    ensureDevelopers(),         // 人员表
  ]);

  seedDemoData();

  // Tabs
  document.querySelectorAll('.tab').forEach((el) => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });

  // 报表：维度分段（年度/季度/月度）
  document.querySelectorAll('#rf-seg .rf-tab').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#rf-seg .rf-tab').forEach((t) => t.classList.toggle('is-active', t === el));
      reportFilter.dim = el.dataset.dim;
      renderReportValueRow();
      renderReports();
    });
  });
  // 报表：导出 PDF
  const expBtn = document.getElementById('btn-export-pdf');
  if (expBtn) expBtn.addEventListener('click', exportReportPDF);
  // 初始化报表下拉选项（年份默认全部，行为等同改动前「显示全部」）
  renderReportValueRow();
  // 报表：类型勾选（取消勾选则该类型不统计、分类分布不显示）
  document.querySelectorAll('.rf-type-chk').forEach((chk) => {
    chk.checked = !reportExcludeTypes.has(chk.dataset.typeCode); // 初始态与状态集合同步（默认 COMMON_BUG 不选中）
    chk.addEventListener('change', () => {
      const t = chk.dataset.typeCode;
      if (chk.checked) reportExcludeTypes.delete(t);
      else reportExcludeTypes.add(t);
      renderReports();
    });
  });
  // 报表模块「任务清单」按钮：跳转新页面（已进入 / 未进入测试）
  document.querySelectorAll('.rm-list-btn').forEach((btn) => {
    btn.addEventListener('click', () => openModuleTaskList(btn.dataset.scope));
  });
  // 任务清单页：返回报表
  const tlBack = document.getElementById('tl-back');
  if (tlBack) tlBack.addEventListener('click', () => switchView('report'));
  // 任务清单页：点击卡片打开详情
  const tlList = document.getElementById('tl-list');
  if (tlList) tlList.addEventListener('click', (e) => {
    const card = e.target.closest('.task-card');
    if (card && card.dataset.id) openTaskDetail(card.dataset.id);
  });

  // FAB + Modal
  document.getElementById('fab').addEventListener('click', () => {
    editingId = null;
    document.getElementById('task-form').reset();
    // 新增任务不显示暂停/恢复时间字段
    const peg = document.getElementById('form-pause-events-group');
    if (peg) peg.hidden = true;
    const peb = document.getElementById('form-pause-events');
    if (peb) peb.innerHTML = '';
    formTypeCode = 'REQ';
    formPriorityCode = 'MEDIUM';
    formDeveloperIds = [];
    formImages = [];
    renderFormTypeChips();
    renderFormPriorityChips();
    renderFormDevChips();
    renderFormImageThumbs();
    openModal('新增任务');
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  // 任务详情
  document.getElementById('task-detail-close').addEventListener('click', closeTaskDetail);
  document.getElementById('task-detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'task-detail-overlay') closeTaskDetail();
  });

  // Form
  document.getElementById('task-form').addEventListener('submit', onSubmit);
  document.getElementById('form-type-chips').addEventListener('click', onFormTypeChip);
  document.getElementById('form-priority-chips').addEventListener('click', onFormPriorityChip);
  document.getElementById('form-dev-chips').addEventListener('click', onFormDevChip);
  // 编辑表单：暂停/恢复历史组删除（事件委托 + 确认提示）；暂停与恢复为一组，删除整组
  const peBox = document.getElementById('form-pause-events');
  if (peBox) peBox.addEventListener('click', async (e) => {
    const del = e.target.closest('.pe-pair-del');
    if (!del) return;
    const pair = del.closest('.pe-pair');
    if (!pair) return;
    const ok = await customConfirm('确认删除这条暂停与恢复记录？', { danger: true });
    if (ok) pair.remove();
  });
  // 表单：选择项目后，项目版本下拉联动显示该项目下的版本
  const formProject = document.getElementById('f-project');
  if (formProject) formProject.addEventListener('change', (e) => {
    refreshFormGroupSelect(e.target.value);
  });

  // Filters — chip 点击统一委托到 filter-card（类型/状态/需求组）
  document.getElementById('filter-card').addEventListener('click', onFilterClick);

  // 首页「暂停中」勾选框：与报表普通BUG 同款 .rf-check，同行显示
  const chkPaused = document.getElementById('chk-paused');
  if (chkPaused) chkPaused.addEventListener('change', () => {
    filter.paused = chkPaused.checked ? true : '';
    renderTaskList();
  });
  document.getElementById('search-q').addEventListener('input', (e) => {
    filter.q = e.target.value;
    renderTaskList();
  });

  // 首页下拉筛选：所属项目
  const filterProject = document.getElementById('filter-project');
  if (filterProject) filterProject.addEventListener('change', (e) => {
    filter.project = e.target.value;
    filter.group = [];           // 项目变更则重置需求组选择
    populateFilterSelects();     // 刷新需求组选项（仅显示该项目下）
    renderTaskList();
  });

  // 需求组多选下拉：触发器点击展开/收起
  const groupTrigger = document.getElementById('filter-group-trigger');
  if (groupTrigger) groupTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleGroupDropdown();
  });
  // 需求组多选下拉：选项点击
  const groupDropdown = document.getElementById('group-dropdown');
  if (groupDropdown) groupDropdown.addEventListener('click', onGroupDropdownClick);
  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('group-multi-select');
    if (wrap && !wrap.contains(e.target)) {
      const dd = document.getElementById('group-dropdown');
      if (dd && !dd.hidden) dd.hidden = true;
    }
  });

  // 重置所有筛选条件
  const resetBtn = document.getElementById('btn-reset-filters');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    filter.typeCode = [];
    filter.status = [];
    filter.project = '';
    filter.group = [];
    filter.priority = [];
    filter.paused = '';
    filter.q = '';
    document.getElementById('search-q').value = '';
    syncFilterChips('type-chips', 'typeCode', filter.typeCode);
    syncFilterChips('status-chips', 'status', filter.status);
    syncFilterChips('priority-chips', 'priority', filter.priority);
    const chkPaused = document.getElementById('chk-paused');
    if (chkPaused) chkPaused.checked = false;
    populateFilterSelects();     // 重置项目下拉 + 刷新需求组 chips
    renderTaskList();
  });

  // 首页统计 / 筛选隐藏展开
  document.getElementById('btn-toggle-stats').addEventListener('click', toggleStats);
  document.getElementById('btn-toggle-filters').addEventListener('click', toggleFilters);

  // Task actions
  document.getElementById('task-list').addEventListener('click', onTaskAction);

  // Settings — 列表操作（编辑/删除）+ 详情弹框（点击行）
  document.getElementById('dev-list').addEventListener('click', onSettingsAction);
  document.getElementById('project-list').addEventListener('click', onSettingsAction);
  document.getElementById('group-list').addEventListener('click', onSettingsAction);

  // ★ 点击整行打开详情弹框（排除编辑/删除按钮的点击事件冒泡）
  document.getElementById('dev-list').addEventListener('click', (e) => {
    const t = e.target.closest('[data-detail]');
    if (!t || e.target.closest('[data-edit], [data-del]')) return;
    openDetail(t.dataset.detail, t.dataset.val);
  });
  document.getElementById('project-list').addEventListener('click', (e) => {
    const t = e.target.closest('[data-detail]');
    if (!t || e.target.closest('[data-edit], [data-del]')) return;
    openDetail(t.dataset.detail, t.dataset.val);
  });
  document.getElementById('group-list').addEventListener('click', (e) => {
    const t = e.target.closest('[data-detail]');
    if (!t || e.target.closest('[data-edit], [data-del]')) return;
    openDetail(t.dataset.detail, t.dataset.val);
  });
  document.querySelectorAll('[data-add]').forEach((el) => el.addEventListener('click', onSettingsAdd));

  // Settings — 各列表搜索过滤
  ['dev', 'project', 'group'].forEach((key) => {
    const inp = document.getElementById(key + '-search');
    if (inp) inp.addEventListener('input', (e) => {
      listSearch[key] = e.target.value;
      renderSettings();
    });
  });

  // Settings — 各列表状态筛选（全部/已启用/已停用；全部/进行中/已归档）
  document.querySelectorAll('.status-filter').forEach((box) => {
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg');
      if (!btn || btn.classList.contains('is-active')) return;
      const key = box.dataset.key;
      listStatus[key] = btn.dataset.val;
      box.querySelectorAll('.seg').forEach((s) => s.classList.toggle('is-active', s === btn));
      renderSettings();
    });
  });

  // 新增需求组·选择所属项目弹框
  const gpOverlay = document.getElementById('group-project-overlay');
  if (gpOverlay) {
    gpOverlay.addEventListener('click', (e) => { if (e.target === gpOverlay) closeGroupProjectModal(); });
    document.getElementById('group-project-close').addEventListener('click', closeGroupProjectModal);
    document.getElementById('gp-cancel').addEventListener('click', closeGroupProjectModal);
    document.getElementById('gp-confirm').addEventListener('click', confirmGroupProject);
    document.getElementById('gp-list').addEventListener('click', onGroupProjectListClick);
    const gpSearch = document.getElementById('gp-search');
    if (gpSearch) gpSearch.addEventListener('input', onGroupProjectSearch);
  }


  // 存储与数据：申请持久化存储（须在用户手势中调用）
  const persistBtn = document.getElementById('btn-persist');
  if (persistBtn) {
    persistBtn.addEventListener('click', async () => {
      const ok = await requestPersistentStorage();
      toast(ok ? '已开启持久化存储，数据将更不容易被清理' : '浏览器未授权持久化，数据仍可能被清理', ok ? 'success' : 'warn', 3200);
      refreshStorageInfo();
    });
  }

  // 详情弹框事件
  const detailOverlay = document.getElementById('detail-overlay');
  const detailClose = document.getElementById('detail-close');
  const detailTasksHeader = document.getElementById('detail-tasks-header');
  const capsuleDisable = document.getElementById('detail-capsule-disable');
  const capsuleEnable = document.getElementById('detail-capsule-enable');
  if (detailClose) detailClose.addEventListener('click', closeDetail);
  if (detailOverlay) detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) closeDetail(); });
  if (detailTasksHeader) detailTasksHeader.addEventListener('click', toggleDetailTasks);
  const detailGroupsHeader = document.getElementById('detail-groups-header');
  if (detailGroupsHeader) detailGroupsHeader.addEventListener('click', toggleDetailGroups);
  if (capsuleDisable) capsuleDisable.addEventListener('click', onCapsuleClick);
  if (capsuleEnable) capsuleEnable.addEventListener('click', onCapsuleClick);

  // ---------- 图片上传 ----------
  const imageAddBtn = document.getElementById('image-add-btn');
  const imageInput = document.getElementById('image-input');
  if (imageAddBtn && imageInput) {
    imageAddBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = ''; // 重置 input，允许重复选择同一文件
      if (files.length === 0) return;

      // 检查数量限制
      const remaining = 5 - formImages.length;
      if (remaining <= 0) {
        toast('最多只能上传 5 张图片', 'warn');
        return;
      }
      const toProcess = files.slice(0, remaining);
      if (files.length > remaining) {
        toast(`最多还能添加 ${remaining} 张，已自动选取前 ${remaining} 张`, 'warn');
      }

      // 逐张压缩并添加
      for (const file of toProcess) {
        if (!file.type.startsWith('image/')) {
          toast('仅支持图片格式', 'warn');
          continue;
        }
        try {
          const dataUrl = await compressImage(file);
          formImages.push({ id: genImageId(), dataUrl });
          renderFormImageThumbs();
        } catch (err) {
          toast('图片处理失败：' + (err && err.message || '未知错误'), 'warn');
        }
      }
    });
  }

  // 表单缩略图删除按钮（事件委托）
  const imageThumbs = document.getElementById('image-thumbs');
  if (imageThumbs) {
    imageThumbs.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.image-thumb-remove');
      if (!removeBtn) return;
      const idx = parseInt(removeBtn.dataset.imgIdx, 10);
      if (isNaN(idx) || idx < 0 || idx >= formImages.length) return;
      formImages.splice(idx, 1);
      renderFormImageThumbs();
    });
  }

  // 任务详情中点击图片放大
  const taskDetailImages = document.getElementById('task-detail-images');
  if (taskDetailImages) {
    taskDetailImages.addEventListener('click', (e) => {
      const thumb = e.target.closest('.detail-image-thumb');
      if (!thumb) return;
      const img = thumb.querySelector('img');
      if (img && img.src) openImageViewer(img.src);
    });
  }

  // 图片放大模态框事件
  const imageViewerOverlay = document.getElementById('image-viewer-overlay');
  const imageViewerClose = document.getElementById('image-viewer-close');
  if (imageViewerClose) imageViewerClose.addEventListener('click', closeImageViewer);
  if (imageViewerOverlay) {
    imageViewerOverlay.addEventListener('click', (e) => {
      if (e.target === imageViewerOverlay) closeImageViewer();
    });
  }

  // ---------- 附件上传 ----------
  const attachAddBtn = document.getElementById('attachment-add-btn');
  const attachInput = document.getElementById('attachment-input');
  if (attachAddBtn && attachInput) {
    attachAddBtn.addEventListener('click', () => attachInput.click());
    attachInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length === 0) return;

      const remaining = 3 - formAttachments.length;
      if (remaining <= 0) {
        toast('最多只能上传 3 个附件', 'warn');
        return;
      }
      const toProcess = files.slice(0, remaining);
      if (files.length > remaining) {
        toast(`最多还能添加 ${remaining} 个，已自动选取前 ${remaining} 个`, 'warn');
      }

      for (const file of toProcess) {
        try {
          const dataUrl = await readFileAsDataURL(file);
          formAttachments.push({ id: genAttachId(), name: file.name, type: file.type, size: file.size, dataUrl });
          renderFormAttachments();
        } catch (err) {
          toast('附件读取失败：' + (err && err.message || '未知错误'), 'warn');
        }
      }
    });
  }

  // 表单附件删除（事件委托）
  const attachmentList = document.getElementById('attachment-list');
  if (attachmentList) {
    attachmentList.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.attachment-remove');
      if (!removeBtn) return;
      const idx = parseInt(removeBtn.dataset.attIdx, 10);
      if (isNaN(idx) || idx < 0 || idx >= formAttachments.length) return;
      formAttachments.splice(idx, 1);
      renderFormAttachments();
    });
  }

  // 任务详情中附件操作（下载/预览）
  const taskDetailAttachments = document.getElementById('task-detail-attachments');
  if (taskDetailAttachments) {
    taskDetailAttachments.addEventListener('click', (e) => {
      const dlLink = e.target.closest('a.attachment-download-link');
      const previewBtn = e.target.closest('.attachment-preview');

      if (dlLink) {
        const idx = parseInt(dlLink.dataset.attIdx, 10);
        const att = _detailAttData && _detailAttData[idx];
        if (!att || !att.dataUrl) { e.preventDefault(); toast('附件数据加载失败，请刷新后重试', 'warn'); return; }
        // 统一拦截并走 handleAttachmentDownload：按环境选择最可靠下载方式，
        // 普通浏览器原生下载、PWA 独立窗口弹引导框、移动端系统分享，均带可见反馈。
        e.preventDefault();
        e.stopPropagation();
        handleAttachmentDownload(att);
        return;
      }
      if (previewBtn) {
        e.stopPropagation();
        const idx = parseInt(previewBtn.dataset.attIdx, 10);
        const att = _detailAttData && _detailAttData[idx];
        if (att && att.dataUrl) previewAttachment(att);
        else toast('附件数据加载失败，请刷新后重试', 'warn');
      }
    });
  }

  // PDF 预览模态框事件
  const pdfViewerOverlay = document.getElementById('pdf-viewer-overlay');
  const pdfViewerClose = document.getElementById('pdf-viewer-close');
  if (pdfViewerClose) pdfViewerClose.addEventListener('click', closePdfViewer);
  if (pdfViewerOverlay) {
    pdfViewerOverlay.addEventListener('click', (e) => {
      if (e.target === pdfViewerOverlay) closePdfViewer();
    });
  }

  switchView('task');

  // 初始渲染表单选项 & 列表（改为异步双源刷新）
  await renderFormOptions();
  await refreshTaskList();      // 替代原有的 renderTaskList()
  renderReports();
  renderSettings();

  // 旧版数据迁移：把 localStorage 中内联的 dataUrl 图片/附件转存 IndexedDB（不阻塞渲染）
  migrateImagesToDB().catch((err) => console.warn('图片迁移失败', err));
  migrateAttachmentsToDB().catch((err) => console.warn('附件迁移失败', err));

  // 启动后检查存储占用：高占用时提醒清理（不阻塞渲染）
  warnIfQuotaHigh();

  // 从浏览器打开的 ?dl= 链接：自动触发下载（绕过 PWA standalone 下载限制）
  checkAutoDownloadFromUrl();
}

document.addEventListener('DOMContentLoaded', init);
