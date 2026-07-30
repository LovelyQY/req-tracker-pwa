// 需求任务追踪 —— 微信小程序风格 PWA 逻辑
// 数据持久化在 IndexedDB，离线可用

const UI_STATE_KEY = 'req-tracker-v2-ui';
// 任务类型改为字典驱动（单一来源）：TASK_TYPE_LIST 在 init() 预取后填充（元素 {code,name,order,color}）。
// 全站 chips/筛选/图表/报表均读取它，改 dictionary.js 种子即全站生效，无需改业务代码。
// FALLBACK_TASK_TYPES 为字典加载失败时的兜底，保证 UI 不崩。
const FALLBACK_TASK_TYPES = [
  { code: 'REQ', name: '需求', order: 1, color: '#096dd9' },
  { code: 'ONLINE_BUG', name: '线上BUG', order: 2, color: '#cf1322' },
  { code: 'COMMON_BUG', name: '普通BUG', order: 3, color: '#ff7a00' }
];
// FALLBACK_TODO_TYPES 为字典加载失败时的兜底，保证待办类型色不崩（与 dictionary.js 种子色一致）
const FALLBACK_TODO_TYPES = [
  { code: 'TASK_ITEM', name: '任务事项', order: 1, color: '#fa8c16' },
  { code: 'BUG', name: '缺陷追踪', order: 2, color: '#cf1322' },
  { code: 'MEETING', name: '会议', order: 3, color: '#1677ff' }
];
let TASK_TYPE_LIST = [];
let TYPE_CODE_TO_NAME = {};
let TYPE_NAME_TO_CODE = {};
let TYPE_CODE_TO_COLOR = {};
// 由任务记录的 typeCode 解析展示名；找不到时回退记录自身的中文 type（兼容迁移前数据）
// 由 typeCode 解析展示色；缺省中性灰
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

// 待办类型（任务事项/缺陷追踪/会议）颜色字典驱动，与需求任务类型（TASK_TYPE）相互独立，
// 全站待办类型色统一读 TODO_TYPE 字典，改 dictionary.js 种子色即全站同步（可配置）。
let TODO_TYPE_LIST = [];
let TODO_TYPE_CODE_TO_COLOR = {};
// 启动预取：确保字典已播种并取出待办类型列表（含颜色）；异常则走兜底
async function ensureTodoTypes() {
  try {
    if (typeof RT_DICT !== 'undefined' && RT_DICT.seedDict) {
      await RT_DICT.seedDict((typeof getSessionAccount === 'function' ? getSessionAccount() : 'system') || 'system');
    }
    if (typeof RT_DICT !== 'undefined' && RT_DICT.getDictByType && RT_DICT.SEED_TYPE) {
      const list = await RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TODO_TYPE);
      if (list && list.length) { setTodoTypeList(list); return; }
    }
  } catch (e) { /* 字典异常则走兜底 */ }
  setTodoTypeList(FALLBACK_TODO_TYPES);
}

// 操作按钮配色：从 TODO_OPERATION 字典预取 code→color 映射，供卡片按钮注入 --action-color
// 映射规则：TODO_START → start, TODO_COMPLETE → complete 等（去前缀 + 小写）
let TODO_OPERATION_COLOR = {};
function setTodoOperationColors(list) {
  TODO_OPERATION_COLOR = {};
  (Array.isArray(list) ? list : []).forEach(function (d) {
    if (d && d.code && d.color) {
      var act = d.code.replace(/^TODO_/, '').toLowerCase();
      TODO_OPERATION_COLOR[act] = d.color;
    }
  });
}
function resolveTodoOperationColor(act) {
  return TODO_OPERATION_COLOR[act] || '';
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

// 启动时全量同步本地字典到最新 SEED，从根上消除"种子不同→本地缺 code"。
// 用版本门控：上次记录的 rt_dict_seed_ver ≠ 当前 APP_VERSION/DICT_SEED_SIGNATURE 时强制重播。
async function ensureAllDicts() {
  try {
    if (typeof RT_DICT === 'undefined' || !RT_DICT.seedDict || !RT_DICT.SEED_TYPE) return;
    const account = (typeof getSessionAccount === 'function' ? getSessionAccount() : 'system') || 'system';
    const last = (typeof localStorage !== 'undefined' ? (localStorage.getItem('rt_dict_seed_ver') || '') : '');
    const cur = (typeof APP_VERSION !== 'undefined' ? APP_VERSION : (RT_DICT.DICT_SEED_SIGNATURE || ''));
    const changed = last !== cur;
    if (changed) {
      await RT_DICT.seedDict(account, true);
    } else {
      await RT_DICT.seedDict(account);
    }
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('rt_dict_seed_ver', String(cur)); } catch (e) {}
  } catch (e) {}
}

async function ensureProjects() {
  try {
    if (typeof RT_PROJECTS !== 'undefined' && RT_PROJECTS.getAllProjects) {
      setProjectList(await RT_PROJECTS.getAllProjects()); return;
    }
  } catch (e) { /* 异常则走兜底 */ }
  setProjectList([]);
}
async function ensureProjectVersions() {
  try {
    if (typeof RT_PROJECT_VERSIONS !== 'undefined' && RT_PROJECT_VERSIONS.getAllProjectVersions) {
      setVersionList(await RT_PROJECT_VERSIONS.getAllProjectVersions()); return;
    }
  } catch (e) { /* 异常则走兜底 */ }
  setVersionList([]);
}
async function ensureDevelopers() {
  try {
    if (typeof RT_USERS !== 'undefined' && RT_USERS.getAllUsers) {
      setUserList(await RT_USERS.getAllUsers()); return;
    }
  } catch (e) { /* 异常则走兜底 */ }
  setUserList([]);
}
// ===== 展示映射（code→中文名 / id→名称）=====
// priorityName / projectNameById / versionNameById / userNicknamesByIds / fmtDateTime 已抽取至
// report-shared.js（批次130，共享全局存储由主应用 ensure* 填充）；statusName / normalizeTask 因
// 主应用与报表页对 PAUSED 状态口径不同（app 无 PAUSED / 报表含 PAUSED→暂停中），各自本地保留。

// ===== 数据归一化 =====
function normalizeTask(t) {
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
    dates: {
      submitted: t.devSubmitTime || null,
      started:   t.testStartTime  || null,
      completed: t.testEndTime    || null,
      online:    t.onlineTime     || null
    },
    raw: t
  };
}

const STATUSES = ['待开发', '已提测', '测试中', '已测完', '已上线'];
const STAT_STATS = ['已提测', '测试中', '已测完', '已上线'];

const DEFAULT_UI_STATE = { showStats: true, showFilters: true, todoShowStats: true, todoShowFilters: true };

let editingId = null;
let filter = { typeCode: [], status: [], q: '', project: '', group: [], priority: [], paused: '' };
let currentView = 'task';
let formTypeCode = 'REQ';
let formPriorityCode = 'MEDIUM';
let formDeveloperIds = [];  // 替换原来的 formDevs（姓名数组）
let formImages = [];   // 当前表单中的图片（{id, dataUrl} 对象，dataUrl 仅内存态，数据存 IndexedDB）
let formAttachments = []; // 当前表单中的附件（{id, name, type, dataUrl} 对象，dataUrl 仅内存态，数据存 IndexedDB）

let uiState = loadUIState();

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

// 操作人展示文案
function formatOperator(u) {
  if (!u) return '—';
  if (typeof u === 'string') return escapeHtml(u);
  return '—';
}

function lifecycleToOps(lifecycles, rawTask) {
  if (!lifecycles || !lifecycles.length) return [];
  // 操作码→中文 action 映射（复用字典）
  var OP_NAME = {
    'CREATE': '创建', 'EDIT': '编辑', 'DEV_SUBMIT': '开发提交',
    'TEST_START': '测试开始', 'PAUSE': '暂停', 'RESUME': '暂停恢复',
    'TEST_DONE': '测试完成', 'ONLINE': '上线', 'RESET': '重置', 'DELETE': '删除'
  };
  // 状态码→中文 status 映射
  var STATUS_NAME = {
    'TODO': '待开发', 'SUBMITTED': '已提测', 'TESTING': '测试中',
    'TESTED': '已测完', 'ONLINE': '已上线'
  };
  // advance 类操作 → rawTask 阶段时间字段映射
  var TIME_FIELD_MAP = {
    'DEV_SUBMIT': 'devSubmitTime',
    'TEST_START': 'testStartTime',
    'TEST_DONE': 'testEndTime',
    'ONLINE': 'onlineTime'
  };

  return lifecycles.map(function (lc) {
    var op = {
      action: OP_NAME[lc.operationCode] || lc.operationCode || '操作',
      status: STATUS_NAME[lc.statusCode] || lc.statusCode || null,
      by: lc.operator || '',          // 纯 account 字符串（7.1 修复后）
      at: lc.operateTime || 0
    };
    // 附加阶段时间戳（用于时间线中显示）
    var tfKey = TIME_FIELD_MAP[lc.operationCode];
    if (tfKey && rawTask && rawTask[tfKey] != null) {
      op.stageTime = rawTask[tfKey];
    }
    return op;
  });
}

// 由一条操作记录推导其节点状态（用于时间线圆点/标签取真实颜色）
// 新记录直接读取 o.status；历史旧记录按动作名回退推导

// 节点颜色：取实际状态对应的主题色变量；无状态动作（如编辑）用中性灰
// customConfirm 已统一收口到 config.js（批次 120）

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

// ---------- IndexedDB 图片 / 附件存储（共享层，批次 124 抽取）----------
// 配置常量（DB_NAME / DB_VERSION / IMG_STORE / ATT_STORE）与基础 7 函数
// （openImageDB / dbPutImage / dbGetImages / dbPutAttachment / dbGetAttachments /
//  genImageId / genAttachId）已收口到 media-store.js（全局），本文件仅保留
// 首页专属的「读 / 删」辅助函数，依赖 media-store.js 提供的全局符号。
// 注意：index.html 已在 config.js 之后引入 media-store.js，全局符号可用。

function dbGetImage(id) {
  return openImageDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
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

// formatFileSize 已统一收口到 config.js（批次 120）

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
  if (fab) fab.style.display = (view === 'task' || view === 'todo') ? 'flex' : 'none';
  if (view === 'task') populateFilterSelects();
  if (view === 'todo') initTodoView();
  // 首页仪表盘：每次进入实时聚合（批次 180）
  if (view === 'home') renderHome();
  // 反馈 TAB：批次 179 填充渲染
  if (view === 'feedback') renderFeedbackTab();
  // 日历 TAB：批次 181 月历 + 打卡 + 节假日/调休
  if (view === 'calendar') renderCalendar();
  // 统计报表：批次 184（非 TAB 视图，从首页快捷入口进入，TAB 栏不高亮任何项）
  if (view === 'stats') renderStatsView();
}

// ---------- 主页「反馈」TAB（批次 179） ----------
// 读取本地 IndexedDB /feedback store（批次 178 写入），按创建时间倒序展示。
// 云端集合 feedback 的 _owner 过滤在同步层处理；本地展示直接读全量。
function getAllFeedback() {
  return new Promise(function (resolve) {
    try {
      var req = indexedDB.open('req-tracker-feedback', 1);
      req.onsuccess = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('feedback')) { try { db.close(); } catch (_) {} resolve([]); return; }
        var tx = db.transaction('feedback', 'readonly');
        var store = tx.objectStore('feedback');
        var out = [];
        var cur = store.openCursor();
        cur.onsuccess = function (ev) {
          var c = ev.target.result;
          if (c) { out.push(c.value); c.continue(); }
          else { try { db.close(); } catch (_) {} resolve(out); }
        };
        cur.onerror = function () { try { db.close(); } catch (_) {} resolve(out); };
      };
      req.onerror = function () { resolve([]); };
    } catch (e) { resolve([]); }
  });
}

function fbItemHtml(r) {
  if (!r) return '';
  var typeMap = { bug: 'Bug', suggestion: '建议', other: '其他' };
  var statusMap = { pending: '待处理', replied: '已回复', resolved: '已解决' };
  var type = typeMap[r.type] || '其他';
  var status = statusMap[r.status] || '待处理';
  var time = r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
  var reply = (r.reply && String(r.reply).trim())
    ? '<div class="fb-reply"><span class="fb-reply-label">官方回复：</span>' + escapeHtml(r.reply) + '</div>' : '';
  var contact = (r.contact && String(r.contact).trim())
    ? '<div class="fb-meta">联系方式：' + escapeHtml(r.contact) + '</div>' : '';
  var statusCls = r.status === 'pending' ? 'tag-warn' : 'tag-ok';
  return '<div class="fb-item">'
    + '<div class="fb-row">'
    + '<span class="tag">' + escapeHtml(type) + '</span>'
    + '<span class="tag ' + statusCls + '">' + escapeHtml(status) + '</span>'
    + '<span class="fb-time">' + escapeHtml(time) + '</span>'
    + '</div>'
    + '<div class="fb-content">' + escapeHtml(r.content || '') + '</div>'
    + contact
    + reply
    + '</div>';
}

async function renderFeedbackTab() {
  var wrap = document.getElementById('view-feedback');
  if (!wrap) return;
  wrap.innerHTML = '<div class="fb-head">'
    + '<div class="fb-title">我的反馈</div>'
    + '<button class="btn btn-primary fb-new" onclick="navTo(\'settings.html#help\')">我要反馈</button>'
    + '</div><div class="fb-list" id="fbList"></div>';
  var list = document.getElementById('fbList');
  if (!list) return;
  var recs = [];
  try { recs = await getAllFeedback(); } catch (e) { recs = []; }
  recs.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  if (!recs.length) {
    list.innerHTML = '<div class="fb-empty">还没有反馈记录，点击「我要反馈」提交第一条吧～</div>';
    return;
  }
  list.innerHTML = recs.map(fbItemHtml).join('');
}

// ---------- 日历 TAB（批次 181 + 182） ----------
// 四层叠加：attendance 打卡事实表（180） + holidays 节假日推断（181）
//         + 手动 override（181） + leave 请假事实表（182）。
// 月份状态挂在模块级，切走再切回保持用户浏览到的月份；进入 TAB 时不重置到当月。
//
// 交互约定（182 重构，为 183 预留）：
//   点击日期格子 → 展开「当日面板」(#calDayDetail)，而非直接改数据。
//   面板内是唯一的写入入口：调休切换（181）、请假增删（182）、当日详情三栏（183 待加）。
//   —— 181 曾把三态调休绑在格子点击上，与 182/183 抢同一手势，故在此收敛。
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = null;   // 当前展开的当日面板日期，null = 未选中

function calShiftMonth(delta) {
  const d = new Date(calYear, calMonth + delta, 1);
  calYear = d.getFullYear();
  calMonth = d.getMonth();
  renderCalendar();
}

function calGoToday() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
}

// 打卡区：显示今日状态 + 上下班按钮（按钮禁用态由状态推导，避免无效点击后再弹错误 toast）
// 批次 182：工时改用 RT_LEAVE.effectiveHours 扣减请假后的实际工时，并单列「请假」格。
function calClockBarHtml(rec, todayLeaves) {
  const st = window.RT_ATTENDANCE ? RT_ATTENDANCE.statusOf(rec) : 'none';
  const inTime = rec && rec.clockIn ? fmtClockTime(rec.clockIn) : '--:--';
  const outTime = rec && rec.clockOut ? fmtClockTime(rec.clockOut) : '--:--';
  const eff = window.RT_LEAVE
    ? RT_LEAVE.effectiveHours(rec, todayLeaves)
    : { hours: rec && rec.clockIn ? RT_ATTENDANCE.hoursOf(rec) : 0, leaveHours: 0 };
  const hours = fmtHomeHours(eff.hours);
  const leaveMin = window.RT_LEAVE ? RT_LEAVE.totalMinutes(todayLeaves) : 0;
  const leaveTxt = leaveMin > 0 ? RT_LEAVE.fmtDuration(leaveMin) : '无';
  const stMap = { none: '未打卡', working: '工作中', done: '已完成' };
  const stCls = { none: 'tag-warn', working: 'tag', done: 'tag-ok' };
  const now = new Date();
  return '<div class="cal-clock">'
    + '<div class="cal-clock-top">'
    + '<span class="cal-clock-date">' + (now.getMonth() + 1) + '月' + now.getDate() + '日 今日考勤</span>'
    + '<span class="tag ' + (stCls[st] || 'tag') + '">' + (stMap[st] || '未打卡') + '</span>'
    + '</div>'
    + '<div class="cal-clock-times cal-clock-4">'
    + '<div class="cal-clock-cell"><div class="cal-clock-t">' + inTime + '</div><div class="cal-clock-l">上班</div></div>'
    + '<div class="cal-clock-cell"><div class="cal-clock-t">' + outTime + '</div><div class="cal-clock-l">下班</div></div>'
    + '<div class="cal-clock-cell"><div class="cal-clock-t' + (leaveMin > 0 ? ' is-leave' : '') + '">' + leaveTxt + '</div><div class="cal-clock-l">请假</div></div>'
    + '<div class="cal-clock-cell"><div class="cal-clock-t">' + hours + '</div><div class="cal-clock-l">实际工时</div></div>'
    + '</div>'
    + '<div class="cal-clock-btns">'
    + '<button class="btn btn-primary" onclick="doClock(\'in\')"' + (st !== 'none' ? ' disabled' : '') + '>上班打卡</button>'
    + '<button class="btn btn-primary" onclick="doClock(\'out\')"' + (st !== 'working' ? ' disabled' : '') + '>下班打卡</button>'
    + '</div>'
    + '</div>';
}

async function renderCalendar() {
  const wrap = document.getElementById('view-calendar');
  if (!wrap) return;
  if (!window.RT_ATTENDANCE) { wrap.innerHTML = '<div class="fb-empty">考勤模块未就绪</div>'; return; }

  // 当月打卡记录 → date 索引，同时抽出 override 供节假日层叠加
  let recMap = {};
  let overrideMap = {};
  try {
    const recs = await RT_ATTENDANCE.getMonth(calYear, calMonth);
    (recs || []).forEach(function (r) {
      if (!r || !r.date) return;
      recMap[r.date] = r;
      if (r.override) overrideMap[r.date] = r.override;
    });
  } catch (e) { recMap = {}; overrideMap = {}; }

  let types = {};
  if (window.RT_HOLIDAY) {
    try { types = await RT_HOLIDAY.monthTypes(calYear, calMonth, overrideMap); } catch (e) { types = {}; }
  }

  // 当月请假条（批次 182）：{ 'YYYY-MM-DD': [rec, ...] }
  let leaveMap = {};
  if (window.RT_LEAVE) {
    try { leaveMap = await RT_LEAVE.getMonth(calYear, calMonth); } catch (e) { leaveMap = {}; }
  }

  const todayRec = recMap[RT_ATTENDANCE.todayStr()] || null;
  const todayIsThisMonth = (new Date().getFullYear() === calYear && new Date().getMonth() === calMonth);
  const todayKey = RT_ATTENDANCE.todayStr();

  // 月度小结：出勤天数 / 实际工时（已扣请假） / 应出勤天数 / 请假合计
  let attendDays = 0, totalHours = 0, shouldDays = 0, leaveMinTotal = 0;
  Object.keys(types).forEach(function (k) { if (!types[k].isRest) shouldDays++; });
  Object.keys(recMap).forEach(function (k) {
    const r = recMap[k];
    if (!r.clockIn) return;
    attendDays++;
    totalHours += window.RT_LEAVE
      ? RT_LEAVE.effectiveHours(r, leaveMap[k] || []).hours
      : RT_ATTENDANCE.hoursOf(r);
  });
  Object.keys(leaveMap).forEach(function (k) {
    leaveMinTotal += RT_LEAVE.totalMinutes(leaveMap[k]);
  });

  const first = new Date(calYear, calMonth, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell is-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = calYear + '-' + pad2(calMonth + 1) + '-' + pad2(d);
    const t = types[key] || { type: 'normal', label: '', isRest: false };
    const r = recMap[key];
    const cls = ['cal-cell'];
    if (t.isRest) cls.push('is-rest');
    if (todayIsThisMonth && key === todayKey) cls.push('is-today');
    if (key === calSelectedDate) cls.push('is-selected');
    // 角标：法定假「休」、调休补班「班」、手动调整「调」
    let badge = '';
    if (t.type === 'holiday') badge = '<i class="cal-badge badge-rest">休</i>';
    else if (t.type === 'workday') badge = '<i class="cal-badge badge-work">班</i>';
    else if (t.type === 'override-rest' || t.type === 'override-work') badge = '<i class="cal-badge badge-adj">调</i>';
    // 状态点：打卡（已完成绿 / 工作中蓝）+ 请假（橙，批次 182），同日可并存
    let dots = '';
    if (r && r.clockIn) dots += '<i class="cal-dot ' + (r.clockOut ? 'cal-dot-done' : 'cal-dot-doing') + '"></i>';
    if ((leaveMap[key] || []).length) dots += '<i class="cal-dot cal-dot-leave"></i>';
    if (dots) dots = '<span class="cal-dots">' + dots + '</span>';
    cells += '<div class="' + cls.join(' ') + '" data-date="' + key + '" onclick="calOnDayClick(\'' + key + '\')">'
      + badge + '<span class="cal-num">' + d + '</span>' + dots + '</div>';
  }

  wrap.innerHTML =
    (todayIsThisMonth ? calClockBarHtml(todayRec, leaveMap[todayKey] || []) : '')
    + '<div class="cal-panel">'
    + '<div class="cal-head">'
    + '<button class="cal-nav" onclick="calShiftMonth(-1)" aria-label="上个月">‹</button>'
    + '<span class="cal-title">' + calYear + '年' + (calMonth + 1) + '月</span>'
    + '<button class="cal-nav" onclick="calShiftMonth(1)" aria-label="下个月">›</button>'
    + '<button class="cal-today" onclick="calGoToday()">回今天</button>'
    + '</div>'
    + '<div class="cal-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>'
    + '<div class="cal-grid">' + cells + '</div>'
    + '<div class="cal-legend">'
    + '<span class="cal-legend-item"><i class="cal-dot cal-dot-done"></i>已完成</span>'
    + '<span class="cal-legend-item"><i class="cal-dot cal-dot-doing"></i>工作中</span>'
    + '<span class="cal-legend-item"><i class="cal-badge badge-rest">休</i>法定假</span>'
    + '<span class="cal-legend-item"><i class="cal-badge badge-work">班</i>调休班</span>'
    + '<span class="cal-legend-item"><i class="cal-badge badge-adj">调</i>手动调整</span>'
    + '<span class="cal-legend-item"><i class="cal-dot cal-dot-leave"></i>请假</span>'
    + '</div>'
    + '<div class="cal-tip">点击日期可查看当日详情、调休与请假</div>'
    + '</div>'
    + '<div class="cal-summary cal-summary-4">'
    + '<div class="stat-card"><div class="stat-num">' + attendDays + '</div><div class="stat-label">出勤天数</div></div>'
    + '<div class="stat-card"><div class="stat-num">' + fmtHomeHours(totalHours) + '</div><div class="stat-label">实际工时</div></div>'
    + '<div class="stat-card"><div class="stat-num">' + shouldDays + '</div><div class="stat-label">应出勤</div></div>'
    + '<div class="stat-card"><div class="stat-num">' + (window.RT_LEAVE ? RT_LEAVE.fmtDuration(leaveMinTotal) : '0') + '</div><div class="stat-label">请假合计</div></div>'
    + '</div>'
    + '<div class="cal-day-detail" id="calDayDetail"></div>';

  if (calSelectedDate) await renderCalDayPanel();
}

// 点击某天：展开/收起「当日面板」（批次 182 重构；183 将在面板内追加任务/待办/反馈三栏）
async function calOnDayClick(dateStr) {
  calSelectedDate = (calSelectedDate === dateStr) ? null : dateStr;
  await renderCalendar();
  if (calSelectedDate) {
    const el = document.getElementById('calDayDetail');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function calCloseDayPanel() {
  calSelectedDate = null;
  renderCalendar();
}

// 当日面板：日类型 + 调休切换 + 请假列表/新增（批次 182）
async function renderCalDayPanel() {
  const el = document.getElementById('calDayDetail');
  if (!el || !calSelectedDate) return;
  const date = calSelectedDate;

  let att = null, leaves = [], t = { type: 'normal', label: '工作日', isRest: false };
  try { att = await RT_ATTENDANCE.get(date); } catch (e) {}
  if (window.RT_LEAVE) { try { leaves = await RT_LEAVE.getByDate(date); } catch (e) {} }
  if (window.RT_HOLIDAY) {
    try { t = await RT_HOLIDAY.dayType(date, att && att.override ? att.override : null); } catch (e) {}
  }

  const p = date.split('-');
  const dObj = new Date(+p[0], +p[1] - 1, +p[2]);
  const wk = ['日', '一', '二', '三', '四', '五', '六'][dObj.getDay()];
  const title = (+p[1]) + '月' + (+p[2]) + '日 星期' + wk;
  const typeCls = t.isRest ? 'tag-warn' : 'tag-ok';

  // 考勤摘要
  const eff = window.RT_LEAVE ? RT_LEAVE.effectiveHours(att, leaves) : { hours: 0, leaveHours: 0, grossHours: 0 };
  const attLine = (att && att.clockIn)
    ? fmtClockTime(att.clockIn) + ' – ' + (att.clockOut ? fmtClockTime(att.clockOut) : '进行中')
      + '　实际工时 ' + fmtHomeHours(eff.hours)
      + (eff.leaveHours > 0 ? '（已扣请假 ' + fmtHomeHours(eff.leaveHours) + '）' : '')
    : '当日无打卡记录';

  // 调休：明确的三个按钮，当前态高亮，取代原先隐晦的点击循环
  const cur = att && att.override ? att.override : '';
  const ovBtn = function (val, label) {
    const on = cur === val ? ' is-on' : '';
    return '<button class="cal-ov-btn' + on + '" onclick="calSetOverride(\'' + date + '\',\'' + val + '\')">' + label + '</button>';
  };

  const lvItems = leaves.length
    ? leaves.map(function (lv) {
        return '<div class="lv-item">'
          + '<div class="lv-main">'
          + '<span class="tag">' + escapeHtml(RT_LEAVE.typeLabel(lv.type)) + '</span>'
          + '<span class="lv-time">' + RT_LEAVE.minToHm(lv.startMin) + ' – ' + RT_LEAVE.minToHm(lv.endMin) + '</span>'
          + '<span class="lv-dur">' + RT_LEAVE.fmtDuration(lv.minutes) + '</span>'
          + '</div>'
          + (lv.reason ? '<div class="lv-reason">' + escapeHtml(lv.reason) + '</div>' : '')
          + '<div class="lv-acts">'
          + '<button class="lv-act" onclick="openLeaveModal(\'' + date + '\',\'' + lv.id + '\')">编辑</button>'
          + '<button class="lv-act lv-act-del" onclick="removeLeave(\'' + lv.id + '\')">删除</button>'
          + '</div>'
          + '</div>';
      }).join('')
    : '<div class="lv-empty">当日无请假记录</div>';

  el.innerHTML = '<div class="cal-day-card">'
    + '<div class="cal-day-head">'
    + '<span class="cal-day-title">' + title + '</span>'
    + '<span class="tag ' + typeCls + '">' + escapeHtml(t.label || (t.isRest ? '休息' : '工作日')) + '</span>'
    + '<button class="cal-day-close" onclick="calCloseDayPanel()" aria-label="收起">×</button>'
    + '</div>'
    + '<div class="cal-day-sec">'
    + '<div class="cal-day-sec-t">考勤</div>'
    + '<div class="cal-day-att">' + escapeHtml(attLine) + '</div>'
    + '</div>'
    + '<div class="cal-day-sec">'
    + '<div class="cal-day-sec-t">手动调休</div>'
    + '<div class="cal-ov-btns">'
    + ovBtn('rest', '休息') + ovBtn('work', '上班') + ovBtn('', '自动')
    + '</div>'
    + '</div>'
    + '<div class="cal-day-sec">'
    + '<div class="cal-day-sec-t">请假'
    + '<button class="cal-day-add" onclick="openLeaveModal(\'' + date + '\')">+ 添加</button>'
    + '</div>'
    + '<div class="lv-list">' + lvItems + '</div>'
    + '</div>'
    + '<div class="cal-day-sec">'
    + '<div class="cal-day-sec-t">当日动态</div>'
    + '<div id="dayfBox"><div class="dayf-empty">加载中…</div></div>'
    + '</div>'
    + '</div>';

  await renderCalDayFacts(date);
}

// ---------- 当日详情：任务 / 待办 / 反馈 三栏（批次 183） ----------
// 语义：回答「这天我干了什么」，故按多时间点命中（创建/提测/开始/完成/上线…），
// 而不是只看 createdAt。聚合与权限过滤在 RT_DAYFACTS，此处只负责渲染。
let calDayTab = 'task';            // 'task' | 'todo' | 'feedback'
let calDayFactsCache = null;       // { date, res } 避免切 tab 时重复查库

async function renderCalDayFacts(date) {
  const box = document.getElementById('dayfBox');
  if (!box) return;
  if (!window.RT_DAYFACTS) { box.innerHTML = '<div class="dayf-empty">聚合模块未加载</div>'; return; }

  let res;
  if (calDayFactsCache && calDayFactsCache.date === date) {
    res = calDayFactsCache.res;
  } else {
    let todos = [], feedback = [], scope = null;
    try { todos = await RT_TODOS.getAllTodos(); } catch (e) { todos = []; }
    try { feedback = await getAllFeedback(); } catch (e) { feedback = []; }
    try { scope = await RT_DAYFACTS.buildScope(); } catch (e) { scope = null; }
    res = RT_DAYFACTS.collect(date, {
      tasks: Array.isArray(allTasks) ? allTasks : [],
      todos: todos, feedback: feedback
    }, scope);
    calDayFactsCache = { date: date, res: res };
  }

  const c = res.counts;
  const tab = function (key, label, n) {
    return '<button class="dayf-tab' + (calDayTab === key ? ' is-on' : '') + '"'
      + ' onclick="calSwitchDayTab(\'' + key + '\')">' + label
      + '<span class="dayf-n' + (n ? '' : ' is-zero') + '">' + n + '</span></button>';
  };

  let listHtml;
  if (calDayTab === 'task') listHtml = dayfList(res.tasks, dayfTaskHtml, '当日没有任务动态');
  else if (calDayTab === 'todo') listHtml = dayfList(res.todos, dayfTodoHtml, '当日没有待办动态');
  else listHtml = dayfList(res.feedback, dayfFbHtml, '当日没有反馈记录');

  box.innerHTML = '<div class="dayf-tabs">'
    + tab('task', '任务', c.task) + tab('todo', '待办', c.todo) + tab('feedback', '反馈', c.feedback)
    + '</div>'
    + '<div class="dayf-list">' + listHtml + '</div>';
}

function dayfList(items, fn, emptyText) {
  if (!items || !items.length) return '<div class="dayf-empty">' + emptyText + '</div>';
  return items.map(fn).join('');
}

// 当天发生的动作标签（可能多个，如同一天「提测 + 开始测试」）
function dayfActsHtml(acts) {
  return (acts || []).map(function (a) {
    return '<span class="dayf-act dayf-act-' + a.code + '">' + a.time + ' ' + escapeHtml(a.label) + '</span>';
  }).join('');
}

function dayfTaskHtml(x) {
  const t = x.rec;
  const meta = [];
  const proj = projectNameById(t.projectId);
  if (proj && proj !== t.projectId) meta.push('<span class="tag proj">' + escapeHtml(proj) + '</span>');
  const ver = versionNameById(t.projectVersionId);
  if (ver && ver !== t.projectVersionId) meta.push('<span class="tag grp">' + escapeHtml(ver) + '</span>');
  const devs = userNicknamesByIds(t.developerIds);
  if (devs && devs.length) meta.push('<span class="tag dev">' + escapeHtml(devs.join('、')) + '</span>');
  return '<div class="dayf-item" onclick="openTaskDetail(\'' + t.id + '\')">'
    + '<div class="dayf-top">'
    + '<span class="dayf-title">' + escapeHtml(t.taskName || '未命名任务') + '</span>'
    + '<span class="tag">' + escapeHtml(statusName(t.statusCode) || '') + '</span>'
    + '</div>'
    + '<div class="dayf-acts">' + dayfActsHtml(x.acts) + '</div>'
    + (meta.length ? '<div class="dayf-meta">' + meta.join('') + '</div>' : '')
    + '</div>';
}

function dayfTodoHtml(x) {
  const t = x.rec;
  const TYPE_LABEL = { TASK_ITEM: '任务项', BUG: 'Bug', MEETING: '会议' };
  const title = t.typeCode === 'MEETING' ? (t.name || '未命名会议') : (t.desc || '无描述');
  return '<div class="dayf-item" onclick="openTodoDetail(\'' + t.id + '\')">'
    + '<div class="dayf-top">'
    + '<span class="dayf-title">' + escapeHtml(title) + '</span>'
    + '<span class="tag">' + escapeHtml(TYPE_LABEL[t.typeCode] || t.typeCode || '') + '</span>'
    + '</div>'
    + '<div class="dayf-acts">' + dayfActsHtml(x.acts) + '</div>'
    + '</div>';
}

function dayfFbHtml(x) {
  const r = x.rec;
  const typeMap = { bug: 'Bug', suggestion: '建议', other: '其他' };
  const statusMap = { pending: '待处理', replied: '已回复', resolved: '已解决' };
  const statusCls = r.status === 'pending' ? 'tag-warn' : 'tag-ok';
  return '<div class="dayf-item">'
    + '<div class="dayf-top">'
    + '<span class="dayf-title">' + escapeHtml(r.content || '') + '</span>'
    + '<span class="tag ' + statusCls + '">' + escapeHtml(statusMap[r.status] || '待处理') + '</span>'
    + '</div>'
    + '<div class="dayf-acts">' + dayfActsHtml(x.acts)
    + '<span class="tag">' + escapeHtml(typeMap[r.type] || '其他') + '</span></div>'
    + (r.reply ? '<div class="dayf-reply">回复：' + escapeHtml(r.reply) + '</div>' : '')
    + '</div>';
}

async function calSwitchDayTab(tab) {
  calDayTab = tab;
  if (calSelectedDate) await renderCalDayFacts(calSelectedDate);
}

// ---------- 统计报表：日 / 周 / 综合（批次 184） ----------
// 聚合口径全部委托 RT_STATS（它又复用 182 工时公式 / 181 节假日 / 183 业务计数），
// 本处只负责「选期 → 取数 → 画卡片和条形图」。图表用纯 CSS，不引图表库。
let statsMode = 'day';                       // 'day' | 'week' | 'overall'
let statsAnchor = null;                      // 锚点日期 YYYY-MM-DD（日/周模式）
let statsMonth = null;                       // 综合模式的月份 { y, m }

function statsEnsureAnchor() {
  if (!statsAnchor) statsAnchor = window.RT_ATTENDANCE ? RT_ATTENDANCE.todayStr() : RT_STATS.keyOf(new Date());
  if (!statsMonth) { const d = RT_STATS.parseKey(statsAnchor); statsMonth = { y: d.getFullYear(), m: d.getMonth() }; }
}

// 当前模式对应的日期区间 + 标题
function statsRange() {
  statsEnsureAnchor();
  if (statsMode === 'day') {
    const d = RT_STATS.parseKey(statsAnchor);
    const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return { from: statsAnchor, to: statsAnchor, title: (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + wk };
  }
  if (statsMode === 'week') {
    const r = RT_STATS.weekRange(statsAnchor);
    const a = RT_STATS.parseKey(r.from), b = RT_STATS.parseKey(r.to);
    return { from: r.from, to: r.to, title: (a.getMonth() + 1) + '/' + a.getDate() + ' – ' + (b.getMonth() + 1) + '/' + b.getDate() };
  }
  const r = RT_STATS.monthRange(statsMonth.y, statsMonth.m);
  return { from: r.from, to: r.to, title: statsMonth.y + ' 年 ' + (statsMonth.m + 1) + ' 月' };
}

// 上一期 / 下一期（日→天，周→7天，综合→月）
function statsShift(delta) {
  statsEnsureAnchor();
  if (statsMode === 'overall') {
    let m = statsMonth.m + delta, y = statsMonth.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    statsMonth = { y: y, m: m };
  } else {
    const step = statsMode === 'week' ? 7 : 1;
    const d = RT_STATS.parseKey(statsAnchor);
    d.setDate(d.getDate() + delta * step);
    statsAnchor = RT_STATS.keyOf(d);
  }
  renderStatsView();
}

function statsSwitchMode(mode) { statsMode = mode; renderStatsView(); }
function statsGoToday() {
  statsAnchor = window.RT_ATTENDANCE ? RT_ATTENDANCE.todayStr() : RT_STATS.keyOf(new Date());
  const d = RT_STATS.parseKey(statsAnchor);
  statsMonth = { y: d.getFullYear(), m: d.getMonth() };
  renderStatsView();
}

async function renderStatsView() {
  const wrap = document.getElementById('view-stats');
  if (!wrap) return;
  if (!window.RT_STATS) { wrap.innerHTML = '<div class="st-empty">统计模块未加载</div>'; return; }

  const rg = statsRange();
  const modeBtn = (k, label) =>
    '<button class="st-mode' + (statsMode === k ? ' is-on' : '') + '" onclick="statsSwitchMode(\'' + k + '\')">' + label + '</button>';

  wrap.innerHTML = '<div class="st-head">'
    + '<button class="st-back" onclick="switchView(\'home\')" aria-label="返回">‹</button>'
    + '<span class="st-h-title">统计报表</span>'
    + '<button class="st-today" onclick="statsGoToday()">今天</button>'
    + '</div>'
    + '<div class="st-modes">' + modeBtn('day', '日统计') + modeBtn('week', '周统计') + modeBtn('overall', '综合统计') + '</div>'
    + '<div class="st-nav">'
    + '<button class="st-nav-btn" onclick="statsShift(-1)">‹</button>'
    + '<span class="st-nav-title">' + escapeHtml(rg.title) + '</span>'
    + '<button class="st-nav-btn" onclick="statsShift(1)">›</button>'
    + '</div>'
    + '<div id="stBody"><div class="st-empty">加载中…</div></div>';

  const body = document.getElementById('stBody');
  let res, biz;
  try {
    res = await RT_STATS.rangeStats(rg.from, rg.to);
  } catch (e) {
    body.innerHTML = '<div class="st-empty">统计数据加载失败</div>';
    return;
  }
  try {
    let todos = [], feedback = [], scope = null;
    try { todos = await RT_TODOS.getAllTodos(); } catch (e) {}
    try { feedback = await getAllFeedback(); } catch (e) {}
    try { scope = await RT_DAYFACTS.buildScope(); } catch (e) {}
    biz = RT_STATS.bizStats(rg.from, rg.to, {
      tasks: Array.isArray(allTasks) ? allTasks : [], todos: todos, feedback: feedback
    }, scope);
  } catch (e) { biz = { task: 0, todo: 0, feedback: 0, total: 0, perDay: {}, statusDist: {}, actDist: {} }; }

  if (statsMode === 'day') body.innerHTML = stDayHtml(res, biz, rg);
  else if (statsMode === 'week') body.innerHTML = stWeekHtml(res, biz, rg);
  else body.innerHTML = stOverallHtml(res, biz, rg);
}

function stCard(num, label, cls) {
  return '<div class="stat-card' + (cls ? ' ' + cls : '') + '">'
    + '<div class="stat-num">' + num + '</div><div class="stat-label">' + label + '</div></div>';
}
function stSec(title, inner) {
  return '<div class="st-sec"><div class="st-sec-t">' + title + '</div>' + inner + '</div>';
}

// ===== 日统计 =====
function stDayHtml(res, biz, rg) {
  const d = res.days[0];
  if (!d) return '<div class="st-empty">无数据</div>';
  const S = RT_STATS;
  const clockLine = d.hasClock
    ? fmtClockTime(d.clockIn) + ' – ' + (d.clockOut ? fmtClockTime(d.clockOut) : '进行中')
    : (d.isRest ? '休息日' : '未打卡');

  const flags = [];
  if (d.isLate) flags.push('<span class="st-flag st-flag-bad">迟到 ' + S.fmtMin(d.lateMin) + '</span>');
  if (d.isEarly) flags.push('<span class="st-flag st-flag-bad">早退 ' + S.fmtMin(d.earlyMin) + '</span>');
  if (d.absent) flags.push('<span class="st-flag st-flag-bad">缺勤</span>');
  if (d.leaveCount) flags.push('<span class="st-flag st-flag-warn">请假 ' + S.fmtMin(d.leaveMin) + '</span>');
  if (!flags.length && d.hasClock) flags.push('<span class="st-flag st-flag-ok">全勤</span>');
  if (d.isRest) flags.push('<span class="st-flag">休息日</span>');

  const c = biz.perDay[d.date] || { task: 0, todo: 0, feedback: 0 };
  return stSec('考勤',
      '<div class="st-line">' + escapeHtml(clockLine) + '</div>'
      + '<div class="st-flags">' + flags.join('') + '</div>'
      + '<div class="st-grid">'
      + stCard(S.fmtHours(d.hours), '实际工时')
      + stCard(S.fmtHours(d.grossHours), '在岗时长')
      + stCard(S.fmtMin(d.leaveMin), '请假时长')
      + '</div>')
    + stSec('业务动态',
      '<div class="st-grid">'
      + stCard(c.task, '任务动态') + stCard(c.todo, '待办动态') + stCard(c.feedback, '反馈')
      + '</div>'
      + (biz.total ? '' : '<div class="st-empty-s">当日没有业务动态</div>'));
}

// ===== 周统计 =====
function stWeekHtml(res, biz, rg) {
  const S = RT_STATS, s = res.summary;
  const max = Math.max.apply(null, res.days.map((x) => x.hours).concat([1]));
  const WK = ['一', '二', '三', '四', '五', '六', '日'];
  const bars = res.days.map(function (d, i) {
    const h = max > 0 ? Math.round((d.hours / max) * 100) : 0;
    const cls = d.absent ? ' is-absent' : (d.isRest ? ' is-rest' : (d.isLate || d.isEarly ? ' is-warn' : ''));
    return '<div class="st-bar-col" title="' + d.date + ' ' + S.fmtHours(d.hours) + '">'
      + '<div class="st-bar-v">' + (d.hours ? S.fmtHours(d.hours) : '') + '</div>'
      + '<div class="st-bar-track"><div class="st-bar-fill' + cls + '" style="height:' + h + '%"></div></div>'
      + '<div class="st-bar-x">' + WK[i] + '</div></div>';
  }).join('');

  return stSec('工时分布', '<div class="st-bars">' + bars + '</div>')
    + stSec('考勤汇总',
      '<div class="st-grid">'
      + stCard(S.fmtHours(s.totalHours), '汇总工时')
      + stCard(S.fmtHours(s.avgHours), '日均工时')
      + stCard(s.attendDays + ' / ' + s.shouldDays, '出勤 / 应出勤')
      + stCard(s.absentDays, '缺勤天数')
      + '</div>'
      + '<div class="st-flags">'
      + '<span class="st-flag' + (s.lateDays ? ' st-flag-bad' : '') + '">迟到 ' + s.lateDays + ' 天</span>'
      + '<span class="st-flag' + (s.earlyDays ? ' st-flag-bad' : '') + '">早退 ' + s.earlyDays + ' 天</span>'
      + '<span class="st-flag' + (s.leaveDays ? ' st-flag-warn' : '') + '">请假 ' + s.leaveDays + ' 天 · ' + S.fmtMin(s.leaveMin) + '</span>'
      + '</div>')
    + stSec('业务动态',
      '<div class="st-grid">'
      + stCard(biz.task, '任务动态') + stCard(biz.todo, '待办动态') + stCard(biz.feedback, '反馈')
      + '</div>');
}

// ===== 综合统计 =====
function stOverallHtml(res, biz, rg) {
  const S = RT_STATS, s = res.summary;
  const STATUS_LABEL = { TODO: '待开发', SUBMITTED: '已提测', TESTING: '测试中', TESTED: '已测完', ONLINE: '已上线', PAUSED: '暂停中' };
  const STATUS_COLOR = { TODO: '#8c8c8c', SUBMITTED: '#faad14', TESTING: '#1890ff', TESTED: '#52c41a', ONLINE: '#722ed1', PAUSED: '#bfbfbf' };

  // 任务状态分布条（占比堆叠，纯 CSS）
  const keys = Object.keys(biz.statusDist);
  const distTotal = keys.reduce((n, k) => n + biz.statusDist[k], 0);
  let dist = '<div class="st-empty-s">本月没有任务动态</div>';
  if (distTotal) {
    const seg = keys.map(function (k) {
      const pct = (biz.statusDist[k] / distTotal) * 100;
      return '<div class="st-dist-seg" style="width:' + pct + '%;background:' + (STATUS_COLOR[k] || '#8c8c8c') + '"'
        + ' title="' + escapeHtml(STATUS_LABEL[k] || k) + ' ' + biz.statusDist[k] + '"></div>';
    }).join('');
    const lg = keys.map(function (k) {
      return '<span class="st-dist-lg"><i style="background:' + (STATUS_COLOR[k] || '#8c8c8c') + '"></i>'
        + escapeHtml(STATUS_LABEL[k] || k) + ' ' + biz.statusDist[k] + '</span>';
    }).join('');
    dist = '<div class="st-dist">' + seg + '</div><div class="st-dist-lgs">' + lg + '</div>';
  }

  // 完成率：本月「已测完 + 已上线」占本月有动态任务的比例
  const done = (biz.statusDist.TESTED || 0) + (biz.statusDist.ONLINE || 0);
  const doneRate = distTotal ? done / distTotal : 0;

  return stSec('工时与出勤',
      '<div class="st-grid">'
      + stCard(S.fmtHours(s.totalHours), '总工时')
      + stCard(S.fmtHours(s.avgHours), '平均日工时')
      + stCard(S.fmtRate(s.attendRate), '出勤率')
      + stCard(s.attendDays + ' / ' + s.shouldDays, '出勤 / 应出勤')
      + '</div>'
      + stRateBar('出勤率', s.attendRate))
    + stSec('异常与请假',
      '<div class="st-grid">'
      + stCard(s.lateDays, '迟到天数') + stCard(s.earlyDays, '早退天数')
      + stCard(s.absentDays, '缺勤天数') + stCard(S.fmtMin(s.leaveMin), '请假合计')
      + '</div>')
    + stSec('任务状态分布（' + (biz.taskUnique || 0) + ' 个任务）', dist + stRateBar('完成率', doneRate))
    + stSec('业务动态合计',
      '<div class="st-grid">'
      + stCard(biz.task, '任务动态') + stCard(biz.todo, '待办动态')
      + stCard(biz.feedback, '反馈') + stCard(biz.total, '合计')
      + '</div>');
}

function stRateBar(label, rate) {
  const pct = Math.round((rate || 0) * 100);
  return '<div class="st-rate">'
    + '<div class="st-rate-top"><span>' + escapeHtml(label) + '</span><span class="st-rate-n">' + pct + '%</span></div>'
    + '<div class="st-rate-track"><div class="st-rate-fill" style="width:' + pct + '%"></div></div>'
    + '</div>';
}

// 设置调休（面板内按钮，'' 表示恢复自动推断）
async function calSetOverride(dateStr, val) {
  if (!window.RT_ATTENDANCE) return;
  try {
    await RT_ATTENDANCE.setOverride(dateStr, val || null);
    toast(val === 'rest' ? '已标记为休息' : val === 'work' ? '已标记为上班' : '已恢复自动推断', 'success');
    await renderCalendar();
  } catch (e) {
    toast('调休设置失败：' + (e && e.message ? e.message : e), 'error');
  }
}

// ---------- 请假表单弹窗（批次 182） ----------
let leaveEditingId = null;
let leaveEditingDate = null;

function openLeaveModal(dateStr, id) {
  if (!window.RT_LEAVE) { toast('请假模块未就绪', 'warn'); return; }
  leaveEditingDate = dateStr;
  leaveEditingId = id || null;
  const overlay = document.getElementById('leave-modal-overlay');
  if (!overlay) return;

  // 类型 chips：从 RT_LEAVE.TYPES 注册表渲染，避免文案散落
  const chips = document.getElementById('lv-f-type-chips');
  if (chips) {
    chips.innerHTML = RT_LEAVE.TYPES.map(function (t, i) {
      return '<button type="button" class="chip' + (i === 0 ? ' active' : '') + '" data-val="' + t.key + '">' + t.label + '</button>';
    }).join('');
    chips.querySelectorAll('.chip').forEach(function (c) {
      c.onclick = function () {
        chips.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        c.classList.add('active');
      };
    });
  }

  const startEl = document.getElementById('lv-f-start');
  const endEl = document.getElementById('lv-f-end');
  const reasonEl = document.getElementById('lv-f-reason');
  const titleEl = document.getElementById('leave-modal-title');
  const delBtn = document.getElementById('lv-delete');

  const fill = function (rec) {
    if (titleEl) titleEl.textContent = (rec ? '编辑请假' : '添加请假') + ' · ' + dateStr;
    if (startEl) startEl.value = rec ? RT_LEAVE.minToHm(rec.startMin) : '09:00';
    if (endEl) endEl.value = rec ? RT_LEAVE.minToHm(rec.endMin) : '11:00';
    if (reasonEl) reasonEl.value = rec ? (rec.reason || '') : '';
    if (chips && rec) {
      chips.querySelectorAll('.chip').forEach(function (x) {
        x.classList.toggle('active', x.dataset.val === rec.type);
      });
    }
    if (delBtn) delBtn.hidden = !rec;
    updateLeaveDuration();
  };

  if (id) {
    RT_LEAVE.getByDate(dateStr).then(function (list) {
      fill(list.filter(function (x) { return x.id === id; })[0] || null);
    });
  } else {
    fill(null);
  }

  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeLeaveModal() {
  const overlay = document.getElementById('leave-modal-overlay');
  if (overlay) overlay.classList.remove('show');
  document.body.style.overflow = '';
  leaveEditingId = null;
  leaveEditingDate = null;
}

// 时长自动算：起止任一变化即刷新，非法组合给出即时提示而非等到提交
function updateLeaveDuration() {
  const out = document.getElementById('lv-f-duration');
  if (!out || !window.RT_LEAVE) return;
  const s = RT_LEAVE.hmToMin((document.getElementById('lv-f-start') || {}).value);
  const e = RT_LEAVE.hmToMin((document.getElementById('lv-f-end') || {}).value);
  if (isNaN(s) || isNaN(e)) { out.textContent = '--'; out.className = 'lv-duration'; return; }
  if (e <= s) { out.textContent = '结束需晚于开始'; out.className = 'lv-duration is-err'; return; }
  out.textContent = RT_LEAVE.fmtDuration(e - s);
  out.className = 'lv-duration';
}

async function submitLeave() {
  if (!window.RT_LEAVE || !leaveEditingDate) return;
  const chips = document.getElementById('lv-f-type-chips');
  const active = chips ? chips.querySelector('.chip.active') : null;
  const payload = {
    id: leaveEditingId || undefined,
    date: leaveEditingDate,
    type: active ? active.dataset.val : 'personal',
    startMin: RT_LEAVE.hmToMin((document.getElementById('lv-f-start') || {}).value),
    endMin: RT_LEAVE.hmToMin((document.getElementById('lv-f-end') || {}).value),
    reason: (document.getElementById('lv-f-reason') || {}).value || ''
  };
  try {
    await RT_LEAVE.save(payload);
    toast(leaveEditingId ? '请假已更新' : '请假已添加', 'success');
    closeLeaveModal();
    await renderCalendar();
  } catch (e) {
    toast(e && e.message ? e.message : '保存失败', 'error');
  }
}

async function removeLeave(id) {
  if (!window.RT_LEAVE) return;
  const ok = await customConfirm('确定删除这条请假记录吗？', { title: '删除请假', confirmText: '删除', danger: true });
  if (!ok) return;
  try {
    await RT_LEAVE.remove(id);
    toast('请假已删除', 'success');
    await renderCalendar();
  } catch (e) {
    toast('删除失败：' + (e && e.message ? e.message : e), 'error');
  }
}

// ---------- 首页仪表盘（批次 180） ----------
// 说明：首页不依赖任务列表数据，进入即从 attendance / todos / tasks 实时聚合。
// 考勤记录来自 window.RT_ATTENDANCE（attendance.js，本地 IndexedDB），
// 打卡动作与其共享同一张事实表，批次 181 的日历层在其上叠加节假日/调休推断。

function fmtHomeDate(d) {
  const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + wk;
}
function fmtClockTime(ts) {
  const d = new Date(ts);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function fmtHomeHours(h) {
  if (!h || h <= 0) return '0 时';
  return (Math.round(h * 10) / 10) + ' 时';
}
function clockShortText(st) {
  return st === 'none' ? '未打卡' : st === 'working' ? '进行中' : '已完成';
}

// 会话昵称：优先本地人员表，否则退回账号
async function homeUserName() {
  try {
    const acct = (typeof getCurrentUserAccount === 'function' ? getCurrentUserAccount() : '') ||
                 (typeof getSessionAccount === 'function' ? getSessionAccount() : '');
    if (!acct) return '';
    if (window.RT_USERS && typeof RT_USERS.getUser === 'function') {
      const u = await RT_USERS.getUser(acct).catch(() => null);
      if (u) return u.nickname || u.name || acct;
    }
    return acct;
  } catch (e) { return ''; }
}

async function renderHome() {
  const now = new Date();
  const h = now.getHours();
  let greet = '你好';
  if (h < 6) greet = '凌晨好';
  else if (h < 12) greet = '早上好';
  else if (h < 14) greet = '中午好';
  else if (h < 18) greet = '下午好';
  else greet = '晚上好';
  const gEl = document.getElementById('homeGreeting');
  if (gEl) gEl.textContent = greet;
  const name = await homeUserName();
  const nEl = document.getElementById('homeName');
  if (nEl) nEl.textContent = name ? '，' + name : '';
  const dEl = document.getElementById('homeDate');
  if (dEl) dEl.textContent = fmtHomeDate(now);

  await renderHomeAttendance();
  await renderHomeMetrics();
  await renderHomeCalendar();
}

async function renderHomeAttendance() {
  const dot = document.getElementById('homeClockDot');
  const statusEl = document.getElementById('homeClockStatus');
  const timeEl = document.getElementById('homeClockTime');
  const btnIn = document.getElementById('btnClockIn');
  const btnOut = document.getElementById('btnClockOut');
  if (!window.RT_ATTENDANCE) {
    if (statusEl) statusEl.textContent = '考勤模块未加载';
    return;
  }
  let rec = null;
  try { rec = await RT_ATTENDANCE.get(RT_ATTENDANCE.todayStr()); } catch (e) { rec = null; }
  const st = window.RT_ATTENDANCE.statusOf(rec);
  if (dot) dot.className = 'home-clock-dot' + (st === 'working' ? ' dot-working' : st === 'done' ? ' dot-done' : '');
  if (statusEl) statusEl.textContent = st === 'none' ? '尚未打卡' : st === 'working' ? '已上班 · 待下班' : '已完成打卡';
  if (btnIn) btnIn.disabled = (st !== 'none');
  if (btnOut) btnOut.disabled = (st === 'done');
  let t = '';
  if (rec && rec.clockIn) t += '上班 ' + fmtClockTime(rec.clockIn);
  if (rec && rec.clockOut) t += (t ? '　·　' : '') + '下班 ' + fmtClockTime(rec.clockOut);
  if (timeEl) timeEl.textContent = t;
}

async function renderHomeMetrics() {
  const grid = document.getElementById('home-stats-grid');
  if (!grid) return;
  const todayKey = window.RT_ATTENDANCE ? RT_ATTENDANCE.todayStr() : null;
  // 今日任务数
  let todayTasks = 0;
  if (Array.isArray(allTasks) && todayKey) {
    todayTasks = allTasks.filter(function (t) {
      return t.createdAt && RT_ATTENDANCE.dateKey(new Date(t.createdAt)) === todayKey;
    }).length;
  }
  // 待办数
  let todoCount = 0;
  try { const all = await RT_TODOS.getAllTodos(); todoCount = Array.isArray(all) ? all.length : 0; } catch (e) {}
  // 考勤工时
  let rec = null, weekHours = 0, todayHours = 0;
  if (window.RT_ATTENDANCE) {
    try { rec = await RT_ATTENDANCE.get(todayKey); } catch (e) {}
    todayHours = window.RT_ATTENDANCE.hoursOf(rec);
    try {
      const wk = await RT_ATTENDANCE.getWeek();
      weekHours = (wk || []).reduce(function (s, r) { return s + (window.RT_ATTENDANCE.hoursOf(r) || 0); }, 0);
    } catch (e) {}
  }
  const clockShort = rec ? clockShortText(window.RT_ATTENDANCE.statusOf(rec)) : '未打卡';
  // 请假：独立请假表（批次 182/183）接入前显示「未请假」
  const cards = [
    { label: '今日打卡', value: clockShort, color: 'var(--primary)' },
    { label: '今日工时', value: fmtHomeHours(todayHours), color: 'var(--c-已上线)' },
    { label: '本周工时', value: fmtHomeHours(weekHours), color: 'var(--c-已测完)' },
    { label: '待办数', value: String(todoCount), color: 'var(--c-已提测)' },
    { label: '今日任务', value: String(todayTasks), color: 'var(--c-测试中)' },
    { label: '请假', value: '未请假', color: 'var(--muted)' }
  ];
  grid.innerHTML = cards.map(function (it) {
    return '<div class="stat-card"><div class="stat-num" style="color:' + it.color + '">' + it.value + '</div><div class="stat-label">' + it.label + '</div></div>';
  }).join('');
}

async function renderHomeCalendar() {
  const titleEl = document.getElementById('homeCalTitle');
  const grid = document.getElementById('homeCalDays');
  if (!grid) return;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (titleEl) titleEl.textContent = y + '年' + (m + 1) + '月';
  const recMap = {};
  if (window.RT_ATTENDANCE) {
    try {
      const recs = await RT_ATTENDANCE.getMonth(y, m);
      (recs || []).forEach(function (r) {
        if (!r || !r.date) return;
        if (r.clockIn) recMap[r.date] = 'done';
        else if (r.override === 'rest') recMap[r.date] = 'rest';
        else if (r.override === 'work') recMap[r.date] = 'work';
      });
    } catch (e) {}
  }
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = window.RT_ATTENDANCE ? RT_ATTENDANCE.todayStr() : (y + '-' + pad2(m + 1) + '-' + pad2(now.getDate()));
  let html = '';
  for (let i = 0; i < startDow; i++) html += '<span class="home-cal-cell is-empty"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = y + '-' + pad2(m + 1) + '-' + pad2(d);
    const cls = ['home-cal-cell'];
    if (key === todayKey) cls.push('is-today');
    const mark = recMap[key];
    if (mark === 'done') cls.push('has-clock');
    else if (mark === 'rest') cls.push('is-rest');
    else if (mark === 'work') cls.push('is-work');
    html += '<span class="' + cls.join(' ') + '">' + d;
    if (mark === 'done') html += '<i class="cal-dot cal-dot-done"></i>';
    else if (mark === 'rest') html += '<i class="cal-dot cal-dot-rest"></i>';
    else if (mark === 'work') html += '<i class="cal-dot cal-dot-work"></i>';
    html += '</span>';
  }
  grid.innerHTML = html;
}

async function doClock(type) {
  if (!window.RT_ATTENDANCE) { toast('考勤模块未就绪', 'warn'); return; }
  try {
    await RT_ATTENDANCE.clock(type);
    toast(type === 'in' ? '上班打卡成功' : '下班打卡成功', 'success');
    // 首页与日历共享同一张考勤表，哪个视图在前台就刷哪个（批次 181）
    if (currentView === 'home') await renderHome();
    else if (currentView === 'calendar') await renderCalendar();
  } catch (e) {
    toast('打卡失败：' + (e && e.message ? e.message : e), 'error');
  }
}

// ---------- 代办视图（批次04框架 + 批次05筛选栏）----------
let todoViewInited = false;
let currentTodoType = 'TASK_ITEM';
let todoFilter = { typeCode: 'TASK_ITEM', statusCodes: [], projectId: '', projectVersionId: '', keyword: '' };
let todoSearchTimer = null;
// 代办新建/编辑表单状态（批次07）
let editingTodoId = null;        // 编辑中的代办 ID；null 表示新增
let todoFormTypeCode = 'TASK_ITEM';
let todoFormDevIds = [];         // 关联开发多选（用户 ID 数组）
let currentTodoDetailId = null;  // 当前打开的代办详情 ID（批次08）

// 待办状态字典「类型 code → 字典 type」映射。
// ★ 必须在「调用时」惰性读取 window.RT_DICT.SEED_TYPE，不能顶层固化：
//   index.html 中 app.js 为无 defer 的内联引入（<body> 末尾），早于 dictionary.js（defer）执行；
//   若顶层固化，window.RT_DICT 尚为 undefined → 回退成英文兜底串 'TODO_STATUS'/'BUG_STATUS'/'MEETING_STATUS'，
//   而真实字典 type 为中文字串（'代办事项状态' 等），getDictByType 永远查空 →
//   待办状态 chips 与统计全部为空（本次修复的 Bug）。

async function initTodoView() {
  if (todoViewInited) return;
  todoViewInited = true;
  try {
    await Promise.all([ensureProjects(), ensureProjectVersions(), ensureDevelopers(), ensureTodoTypes()]);
  } catch (e) { /* 字典/主数据为本地种子，失败不影响框架渲染 */ }
  // 预取操作按钮配色（TODO_OPERATION 字典 → 全局映射，供卡片按钮 --action-color 注入）
  try {
    if (typeof RT_DICT !== 'undefined' && RT_DICT.SEED_TYPE && RT_DICT.SEED_TYPE.TODO_OPERATION) {
      RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TODO_OPERATION).then(function (l) {
        setTodoOperationColors(l);
      }).catch(function () {});
    }
  } catch (e) { /* 操作颜色预取静默失败，按钮回退蓝色 */ }
  renderTodoTypeChips();
  renderTodoStatusChips();
  populateTodoProjectOptions();
  populateTodoVersionOptions();
  bindTodoFilters();
  const bts = document.getElementById('btn-todo-toggle-stats');
  if (bts) bts.addEventListener('click', toggleTodoStats);
  const btf = document.getElementById('btn-todo-toggle-filters');
  if (btf) btf.addEventListener('click', toggleTodoFilters);
  renderTodoVisibility();
  renderTodoStats();
  renderTodoList();
}

function renderTodoTypeChips() {
  const wrap = document.getElementById('todo-type-chips');
  if (!wrap || !window.RT_DICT) return;
  const SEED = window.RT_DICT.SEED_TYPE;
  if (!SEED) return;
  window.RT_DICT.getDictByType(SEED.TODO_TYPE).then((list) => {
    const items = (Array.isArray(list) ? list : []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    wrap.innerHTML = items.map((d) => {
      const active = d.code === currentTodoType ? ' active' : '';
      const c = d.color ? ' style="--chip-color:' + d.color + '"' : '';
      return '<button class="chip' + active + '" data-todo-type="' + d.code + '"' + c + '>' + (d.name || d.code) + '</button>';
    }).join('');
    wrap.querySelectorAll('.chip').forEach((el) => {
      el.addEventListener('click', () => {
        currentTodoType = el.dataset.todoType;
        todoFilter.typeCode = currentTodoType;
        todoFilter.statusCodes = [];
        renderTodoTypeChips();
        renderTodoStatusChips();
        renderTodoStats();
        renderTodoList();
      });
    });
  }).catch(function () {});
}

function renderTodoStatusChips() {
  const wrap = document.getElementById('todo-status-chips');
  if (!wrap || !window.RT_DICT) return;
  const SEED = window.RT_DICT.SEED_TYPE;
  const dictType = SEED && TODO_STATUS_DICT(currentTodoType);
  if (!dictType) return;
  window.RT_DICT.getDictByType(dictType).then((list) => {
    const items = (Array.isArray(list) ? list : []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    let html = '<button class="chip' + (todoFilter.statusCodes.length === 0 ? ' active' : '') + '" data-status="__all__">全部状态</button>';
    html += items.map((d) => {
      const active = todoFilter.statusCodes.indexOf(d.code) >= 0 ? ' active' : '';
      const c = d.color ? ' style="--chip-color:' + d.color + '"' : '';
      return '<button class="chip' + active + '" data-status="' + d.code + '"' + c + '>' + (d.name || d.code) + '</button>';
    }).join('');
    wrap.innerHTML = html;
    wrap.querySelectorAll('.chip').forEach((el) => {
      el.addEventListener('click', () => {
        const s = el.dataset.status;
        if (s === '__all__') todoFilter.statusCodes = [];
        else {
          const i = todoFilter.statusCodes.indexOf(s);
          if (i >= 0) todoFilter.statusCodes.splice(i, 1);
          else todoFilter.statusCodes.push(s);
        }
        renderTodoStatusChips();
        renderTodoStats();
        renderTodoList();
      });
    });
  }).catch(function () {});
}

function populateTodoProjectOptions() {
  const sel = document.getElementById('todo-filter-project');
  if (!sel) return;
  const list = (typeof projectList !== 'undefined' && projectList) ? projectList : [];
  sel.innerHTML = '<option value="">全部项目</option>' +
    list.map(function (p) { return '<option value="' + p.id + '">' + escapeHtml(p.projectName) + '</option>'; }).join('');
  sel.value = todoFilter.projectId;
  sel.onchange = function () {
    todoFilter.projectId = sel.value;
    todoFilter.projectVersionId = '';
    populateTodoVersionOptions();
    renderTodoStats();
    renderTodoList();
  };
}

function populateTodoVersionOptions() {
  const sel = document.getElementById('todo-filter-version');
  if (!sel) return;
  const all = (typeof versionList !== 'undefined' && versionList) ? versionList : [];
  const list = todoFilter.projectId ? all.filter(function (v) { return v.projectId === todoFilter.projectId; }) : all;
  sel.innerHTML = '<option value="">全部版本</option>' +
    list.map(function (v) { return '<option value="' + v.id + '">' + escapeHtml(v.versionName) + '</option>'; }).join('');
  sel.value = todoFilter.projectVersionId;
  sel.onchange = function () {
    todoFilter.projectVersionId = sel.value;
    renderTodoStats();
    renderTodoList();
  };
}

function bindTodoFilters() {
  const search = document.getElementById('todo-search-q');
  if (search) {
    search.oninput = function () {
      const kw = search.value.trim();
      if (todoSearchTimer) clearTimeout(todoSearchTimer);
      todoSearchTimer = setTimeout(function () {
        todoFilter.keyword = kw;
        renderTodoList();
      }, 200);
    };
  }
  const reset = document.getElementById('btn-todo-reset-filters');
  if (reset) {
    reset.onclick = function () {
      todoFilter.statusCodes = [];
      todoFilter.projectId = '';
      todoFilter.projectVersionId = '';
      todoFilter.keyword = '';
      if (search) search.value = '';
      renderTodoTypeChips();
      renderTodoStatusChips();
      populateTodoProjectOptions();
      populateTodoVersionOptions();
      renderTodoStats();
      renderTodoList();
    };
  }
  // 列表点击委托：打开详情（批次08实现详情页，此处先接入口）
  const listBox = document.getElementById('todo-list');
  if (listBox) {
    listBox.onclick = function (e) {
      const card = e.target.closest('.task-card');
      if (card && card.dataset.id) openTodoDetail(card.dataset.id);
    };
  }
}

function renderTodoStats() {
  const grid = document.getElementById('todo-stats-grid');
  if (!grid || !window.RT_DICT) return;
  const SEED = window.RT_DICT.SEED_TYPE;
  const dictType = SEED && TODO_STATUS_DICT(currentTodoType);
  if (!dictType) { grid.innerHTML = ''; return; }
  window.RT_DICT.getDictByType(dictType).then((list) => {
    const items = (Array.isArray(list) ? list : []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    return RT_TODOS.getAllTodos().then(function (all) {
      const sub = (Array.isArray(all) ? all : []).filter(function (t) { return t.typeCode === currentTodoType; });
      const total = sub.length;
      const totalCard = '<div class="stat-card stat-total"><div class="stat-num">' + total + '</div><div class="stat-label">总计</div></div>';
      const statusCards = items.map(function (d) {
        const n = sub.filter(function (t) { return t.statusCode === d.code; }).length;
        // 颜色统一取自字典（d.color）；老库脏值经 seedDict 颜色回填自动对齐，
        // 改字典种子颜色即全站同步（可配置）。
        const c = d.color || 'var(--gray)';
        return '<div class="stat-card status-colored" style="--status-color:' + c + '"><div class="stat-num">' + n + '</div><div class="stat-label">' + (d.name || d.code) + '</div></div>';
      }).join('');
      const cards = totalCard + statusCards;
      grid.innerHTML = cards;
      // 动态列：4 张（总计+3状态）→ 一行 4 列；6 张（总计+5状态）→ 2×3
      const cardCount = items.length + 1;
      grid.classList.toggle('is-4col', cardCount <= 4);
      grid.classList.toggle('is-6col', cardCount > 4);
      renderTodoVisibility();
    });
  }).catch(function () {});
}

// 代办统计栏 / 筛选卡显隐 + 按钮文案同步（与任务页同款 uiState 持久化）
function renderTodoVisibility() {
  const bar = document.getElementById('todo-stats-bar');
  const card = document.getElementById('todo-filter-card');
  const btnStats = document.getElementById('btn-todo-toggle-stats');
  const btnFilters = document.getElementById('btn-todo-toggle-filters');
  if (bar) bar.classList.toggle('hidden', !uiState.todoShowStats);
  if (card) card.classList.toggle('hidden', !uiState.todoShowFilters);
  if (btnStats) btnStats.textContent = uiState.todoShowStats ? '隐藏统计' : '显示统计';
  if (btnFilters) btnFilters.textContent = uiState.todoShowFilters ? '隐藏筛选' : '显示筛选';
}

function toggleTodoStats() {
  uiState.todoShowStats = !uiState.todoShowStats;
  saveUIState();
  renderTodoVisibility();
}

function toggleTodoFilters() {
  uiState.todoShowFilters = !uiState.todoShowFilters;
  saveUIState();
  renderTodoVisibility();
}

// 解析行内关联名（关联开发 / 关联任务），按需异步读取
function resolveTodoRowExtras(t) {
  const devIds = Array.isArray(t.relatedDevIds) ? t.relatedDevIds : [];
  const devPromises = devIds.map(function (id) {
    if (window.RT_USERS && typeof RT_USERS.getUser === 'function') {
      return RT_USERS.getUser(id).then(function (u) { return u ? (u.name || u.nickname || u.account || id) : id; }).catch(function () { return id; });
    }
    return Promise.resolve(id);
  });
  const taskPromise = (t.relatedTaskId && window.RT_REQUIREMENT_TASKS && typeof RT_REQUIREMENT_TASKS.getRequirementTask === 'function')
    ? RT_REQUIREMENT_TASKS.getRequirementTask(t.relatedTaskId).then(function (r) { return r ? (r.taskName || t.relatedTaskId) : ''; }).catch(function () { return ''; })
    : Promise.resolve('');
  return Promise.all([Promise.all(devPromises), taskPromise]).then(function (res) {
    return {
      devNames: res[0],
      taskName: res[1],
      projectName: projectNameById(t.projectId),
      versionName: versionNameById(t.projectVersionId)
    };
  });
}

function renderTodoList() {
  calDayFactsCache = null;   // 待办数据可能已变，当日动态缓存作废（批次183）
  const box = document.getElementById('todo-list');
  if (!box) return;
  if (typeof RT_TODOS === 'undefined' || !RT_TODOS) { box.innerHTML = ''; return; }
  const SEED = window.RT_DICT && window.RT_DICT.SEED_TYPE;
  const dictType = SEED && TODO_STATUS_DICT(currentTodoType);
  const nameMap = {};
  const colorMap = {};
  // 批次74：代办操作码 → 中文名（供单行灰时间标签 OP_NAME[opCode] + '时间' 使用）
  const opNameMap = {};
  const dictPromise = (dictType && window.RT_DICT) ? window.RT_DICT.getDictByType(dictType) : Promise.resolve([]);
  const opDictPromise = (window.RT_DICT && SEED) ? window.RT_DICT.getDictByType(SEED.TODO_OPERATION) : Promise.resolve([]);
  dictPromise.then(function (list) {
    (Array.isArray(list) ? list : []).forEach(function (d) { nameMap[d.code] = d.name || d.code; colorMap[d.code] = d.color || '#8c8c8c'; });
    return RT_TODOS.getAllTodos();
  }).then(function (all) {
    const list = (Array.isArray(all) ? all : []).filter(function (t) {
      if (t.typeCode !== todoFilter.typeCode) return false;
      if (todoFilter.statusCodes.length && todoFilter.statusCodes.indexOf(t.statusCode) < 0) return false;
      if (todoFilter.projectId && t.projectId !== todoFilter.projectId) return false;
      if (todoFilter.projectVersionId && t.projectVersionId !== todoFilter.projectVersionId) return false;
      if (todoFilter.keyword) {
        const kw = todoFilter.keyword.toLowerCase();
        const hay = ((t.desc || '') + ' ' + (t.name || '')).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    if (!list.length) { box.innerHTML = '<div class="empty-tip">暂无代办</div>'; return; }
    // 批次71：批量拉取生命周期流水并按 todoId 分组，为每张卡片附加「最新状态对应操作的操作时间」（灰显用）
    var lcPromise = (typeof RT_TODO_LIFECYCLES !== 'undefined' && RT_TODO_LIFECYCLES.getAllGroupedByTodoId)
      ? RT_TODO_LIFECYCLES.getAllGroupedByTodoId() : Promise.resolve({});
    return Promise.all([lcPromise, opDictPromise]).then(function (results) {
      var lcMap = results[0];
      var opList = results[1];
      (Array.isArray(opList) ? opList : []).forEach(function (d) { opNameMap[d.code] = d.name || d.code; });
      list.forEach(function (t) {
        t.statusOpLine = (typeof RT_TODO_LIFECYCLES !== 'undefined' && RT_TODO_LIFECYCLES.getStatusOpLine)
          ? RT_TODO_LIFECYCLES.getStatusOpLine(t, lcMap[t.id] || []) : null;
      });
      // 解析关联名后按类型分行渲染
      return Promise.all(list.map(resolveTodoRowExtras));
    }).then(function (extras) {
      box.innerHTML = list.map(function (t, i) { return buildTodoCard(t, nameMap, colorMap, extras[i], opNameMap); }).join('');
      // 操作按钮事件委托（stopPropagation 防止冒泡触发详情页）
      box.querySelectorAll('[data-todo-act]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          const act = btn.dataset.todoAct;
          const id = btn.dataset.id;
          const handler = TODO_ACTION_HANDLERS[act];
          if (handler) handler(id);
        });
      });
      // 防御性重绑：点击卡片（非操作按钮）打开详情页，而非编辑页
      box.onclick = function (e) {
        if (e.target.closest('[data-todo-act]')) return;
        const card = e.target.closest('.task-card');
        if (card && card.dataset.id) openTodoDetail(card.dataset.id);
      };
    });
  }).catch(function () { box.innerHTML = ''; });
}

// 按子类型渲染不同字段布局（不展示 32 位系统 ID）
function buildTodoCard(t, nameMap, colorMap, extras, opNameMap) {
  const title = t.typeCode === 'MEETING' ? (t.name || '未命名会议') : (t.desc || '无描述');
  const statusText = nameMap[t.statusCode] || t.statusCode || '';
  const statusColor = (colorMap && colorMap[t.statusCode]) || '#8c8c8c';
  const color = resolveTodoTypeColor(t.typeCode);
  let meta = '';
  if (t.typeCode === 'TASK_ITEM') {
    const devs = (extras && extras.devNames && extras.devNames.length) ? extras.devNames.join('、') : '未指派';
    const time = [fmtDateTime(t.startTime), fmtDateTime(t.completeTime)].filter(Boolean).join(' ~ ');
    meta = '<span class="tag dev">开发：' + escapeHtml(devs) + '</span>' +
      (time ? '<span class="tag grp">时间：' + escapeHtml(time) + '</span>' : '');
  } else if (t.typeCode === 'BUG') {
    const task = (extras && extras.taskName) ? extras.taskName : (t.relatedTaskId ? '未知任务' : '无关联');
    const fb = [escapeHtml(t.feedbackBy || ''), fmtDateTime(t.feedbackTime)].filter(Boolean).join(' ');
    meta = '<span class="tag proj">任务：' + escapeHtml(task) + '</span>' +
      (fb ? '<span class="tag grp">反馈：' + fb + '</span>' : '');
  } else if (t.typeCode === 'MEETING') {
    const mt = fmtDateTime(t.meetingTime);
    const loc = t.location || '';
    meta = (mt ? '<span class="tag grp">时间：' + escapeHtml(mt) + '</span>' : '') +
      (loc ? '<span class="tag proj">地点：' + escapeHtml(loc) + '</span>' : '');
  }
  // 批次24：项目 / 版本（三类统一前置）
  const projTag = (extras && extras.projectName) ? '<span class="tag proj">' + escapeHtml(extras.projectName) + '</span>' : '';
  const verTag = (extras && extras.versionName) ? '<span class="tag grp">' + escapeHtml(extras.versionName) + '</span>' : '';
  meta = projTag + verTag + meta;
  // 操作按钮行（批次23：按状态 + 类型动态显示）
  const actions = getTodoActions(t.statusCode, t.typeCode);
  const actionBtns = actions.map(function (a) {
    const opc = resolveTodoOperationColor(a.act);
    const opStyle = opc ? ' style="--action-color:' + opc + '"' : '';
    return '<button class="btn action-' + a.act + '"' + opStyle + ' type="button" data-todo-act="' + a.act + '" data-id="' + t.id + '">' + escapeHtml(a.label) + '</button>';
  }).join('');

  // 批次79：单行灰时间——会议按 opCode 映射专属标签（创建/会议开始/会议结束/会议取消时间），其余类型用操作码中文名 + '时间'
  // 合并原「创建时间」（批次24）与「状态时间」（批次71）两行灰时间为单行
  const line = t.statusOpLine;
  let opLabel;
  if (t.typeCode === 'MEETING' && line) {
    // 会议专属标签映射；遇未知 opCode 回落通用「操作名 + 时间」
    const MEETING_OP_LABEL = { TODO_CREATE: '创建时间', TODO_START: '会议开始时间', TODO_END: '会议结束时间', TODO_CANCEL: '会议取消时间' };
    opLabel = MEETING_OP_LABEL[line.opCode] || ((opNameMap[line.opCode] || line.opCode) + '时间');
  } else {
    opLabel = (line && line.opCode ? (opNameMap[line.opCode] || line.opCode) : '创建') + '时间';
  }
  const singleTimeRow = (line && line.time)
    ? '<div class="task-dates">' + escapeHtml(opLabel) + ' ' + escapeHtml(fmtDateTime(line.time)) + '</div>' : '';

  return '<div class="task-card t-' + (t.typeCode || '') + '" data-id="' + t.id + '" style="--type-color:' + color + '">' +
    '<div class="task-body">' +
      '<div class="task-header">' +
        '<div class="task-title-row"><h3 class="task-title">' + escapeHtml(title) + '</h3></div>' +
        '<span class="tag status-' + escapeHtml(t.statusCode || '') + '" style="background:' + statusColor + '1a;color:' + statusColor + '">' + escapeHtml(statusText) + '</span>' +
      '</div>' +
      (meta ? '<div class="task-meta">' + meta + '</div>' : '') +
      singleTimeRow +
      (actionBtns ? '<div class="task-actions">' + actionBtns + '</div>' : '') +
    '</div>' +
  '</div>';
}

// ---------- 代办新建/编辑表单（批次07）----------
function renderTodoFormTypeChips() {
  const wrap = document.getElementById('todo-form-type-chips');
  if (!wrap || !window.RT_DICT) return;
  const SEED = window.RT_DICT.SEED_TYPE;
  if (!SEED) return;
  window.RT_DICT.getDictByType(SEED.TODO_TYPE).then(function (list) {
    const items = (Array.isArray(list) ? list : []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    wrap.innerHTML = items.map(function (d) {
      const active = d.code === todoFormTypeCode ? ' active' : '';
      const color = d.color ? ' style="--chip-color:' + d.color + '"' : '';
      return '<button class="chip' + active + '" data-todo-type="' + d.code + '" type="button"' + color + '>' + (d.name || d.code) + '</button>';
    }).join('');
  }).catch(function () {});
}

function onTodoFormTypeChip(e) {
  const chip = e.target.closest('.chip');
  if (!chip || !chip.dataset.todoType) return;
  if (chip.dataset.todoType === todoFormTypeCode) return;
  todoFormTypeCode = chip.dataset.todoType;
  renderTodoFormTypeChips();
  renderTodoFormStatusOptions(todoFormTypeCode);
  showHideTodoFormFields(todoFormTypeCode);
}

// 状态下拉（按当前 typeCode 取对应状态字典）；presetCode 用于编辑回填
function renderTodoFormStatusOptions(typeCode, presetCode) {
  const wrap = document.getElementById('todo-f-status-chips');
  const hidden = document.getElementById('todo-f-status');
  if (!wrap || !hidden || !window.RT_DICT) return Promise.resolve();
  const SEED = window.RT_DICT.SEED_TYPE;
  const dictType = SEED && TODO_STATUS_DICT(typeCode);
  if (!dictType) { wrap.innerHTML = ''; hidden.value = ''; return Promise.resolve(); }
  return window.RT_DICT.getDictByType(dictType).then(function (list) {
    const items = (Array.isArray(list) ? list : []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    // 无 preset 时默认选中首项（状态为必填），保证提交时 statusCode 有效
    const cur = presetCode || (items.length ? items[0].code : '');
    wrap.innerHTML = items.map(function (d) {
      const active = d.code === cur ? ' active' : '';
      const c = d.color ? ' style="--chip-color:' + d.color + '"' : '';
      return '<button type="button" class="chip' + active + '" data-status="' + d.code + '"' + c + '>' + escapeHtml(d.name || d.code) + '</button>';
    }).join('');
    wrap.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        hidden.value = chip.dataset.status;
        wrap.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        chip.classList.add('active');
        const err = document.getElementById('todo-err-status');
        if (err) err.hidden = true;
      });
    });
    hidden.value = cur;
  }).catch(function () { wrap.innerHTML = ''; hidden.value = ''; });
}

function showHideTodoFormFields(typeCode) {
  const isMeeting = typeCode === 'MEETING';
  const isBug = typeCode === 'BUG';
  document.querySelectorAll('#todo-form .tf-meeting').forEach(function (el) { el.hidden = !isMeeting; });
  document.querySelectorAll('#todo-form .tf-bug').forEach(function (el) { el.hidden = !isBug; });
  document.querySelectorAll('#todo-form .tf-desc').forEach(function (el) { el.hidden = isMeeting; });
  document.querySelectorAll('#todo-form .tf-time-taskitem').forEach(function (el) { el.hidden = typeCode !== 'TASK_ITEM'; });
  document.querySelectorAll('#todo-form .tf-time-bug').forEach(function (el) { el.hidden = typeCode !== 'BUG'; });
  document.querySelectorAll('#todo-form .tf-time-meeting').forEach(function (el) { el.hidden = typeCode !== 'MEETING'; });
}

function setTodoTimeField(id, val) {
  var el = document.getElementById(id);
  if (el) el.value = val;
}

function renderTodoFormProjectOptions() {
  const sel = document.getElementById('todo-f-project');
  if (!sel) return;
  const list = (typeof projectList !== 'undefined' && projectList) ? projectList : [];
  sel.innerHTML = '<option value="">请选择项目</option>' +
    list.filter(function (p) { return p; }).map(function (p) {
      return '<option value="' + p.id + '">' + escapeHtml(p.projectName) + '</option>';
    }).join('');
}

function renderTodoFormVersionOptions() {
  const sel = document.getElementById('todo-f-version');
  if (!sel) return;
  const projId = (document.getElementById('todo-f-project') || {}).value || '';
  const all = (typeof versionList !== 'undefined' && versionList) ? versionList : [];
  const list = projId ? all.filter(function (v) { return v.projectId === projId; }) : all;
  sel.innerHTML = '<option value="">请选择版本</option>' +
    list.map(function (v) { return '<option value="' + v.id + '">' + escapeHtml(v.versionName) + '</option>'; }).join('');
}

function renderTodoFormDevChips() {
  const wrap = document.getElementById('todo-f-dev-chips');
  if (!wrap) return;
  if (!userList.length) { wrap.innerHTML = '<span class="text-muted-sm">请先在基础数据中添加人员</span>'; return; }
  wrap.innerHTML = userList.map(function (u) {
    if (!u || !u.id) return '';
    const on = todoFormDevIds.indexOf(u.id) >= 0 ? ' active' : '';
    return '<button class="chip' + on + '" data-user-id="' + u.id + '" type="button">' + escapeHtml(u.nickname || u.name || u.id) + '</button>';
  }).join('');
}

function onTodoFormDevChip(e) {
  const chip = e.target.closest('.chip');
  if (!chip || !chip.dataset.userId) return;
  const id = chip.dataset.userId;
  const i = todoFormDevIds.indexOf(id);
  if (i >= 0) todoFormDevIds.splice(i, 1); else todoFormDevIds.push(id);
  renderTodoFormDevChips();
}

// 关联任务下拉（仅 BUG）；presetId 用于编辑回填
function renderTodoFormRelatedTaskOptions(presetId) {
  const sel = document.getElementById('todo-f-related-task');
  if (!sel) return Promise.resolve();
  const html0 = '<option value="">不关联</option>';
  if (!(window.RT_REQUIREMENT_TASKS && typeof RT_REQUIREMENT_TASKS.getAllRequirementTasks === 'function')) {
    sel.innerHTML = html0; return Promise.resolve();
  }
  return RT_REQUIREMENT_TASKS.getAllRequirementTasks().then(function (list) {
    const items = (Array.isArray(list) ? list : []).slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    sel.innerHTML = html0 + items.map(function (t) {
      return '<option value="' + t.id + '">' + escapeHtml(t.taskName || t.id) + '</option>';
    }).join('');
    if (presetId) sel.value = presetId;
  }).catch(function () { sel.innerHTML = html0; });
}

function clearTodoFormErrors() {
  ['todo-err-status', 'todo-err-desc', 'todo-err-name', 'todo-err-project', 'todo-err-remark', 'todo-err-location', 'todo-err-minutes'].forEach(function (id) {
    const span = document.getElementById(id);
    if (span) { span.hidden = true; span.textContent = ''; }
  });
  const groups = document.querySelectorAll('#todo-form .form-group.invalid');
  groups.forEach(function (g) { g.classList.remove('invalid'); });
}

function showTodoFormErrors(errors) {
  const map = {
    statusCode: 'todo-err-status', desc: 'todo-err-desc', name: 'todo-err-name',
    projectId: 'todo-err-project', remark: 'todo-err-remark',
    location: 'todo-err-location', minutes: 'todo-err-minutes'
  };
  const mapped = Object.keys(map);
  Object.keys(errors).forEach(function (k) {
    const spanId = map[k];
    if (spanId) {
      const span = document.getElementById(spanId);
      if (span) { span.textContent = errors[k]; span.hidden = false; }
      const group = span && span.closest('.form-group');
      if (group) group.classList.add('invalid');
    }
  });
  const extras = Object.keys(errors).filter(function (k) { return mapped.indexOf(k) < 0; });
  if (extras.length) toast(errors[extras[0]], 'error');
}

function collectTodoForm() {
  const typeCode = todoFormTypeCode;
  const data = {
    typeCode: typeCode,
    statusCode: (document.getElementById('todo-f-status') || {}).value || '',
    projectId: (document.getElementById('todo-f-project') || {}).value || '',
    projectVersionId: (document.getElementById('todo-f-version') || {}).value || '',
    relatedDevIds: todoFormDevIds.slice(),
    remark: (document.getElementById('todo-f-remark') || {}).value.trim()
  };
  if (typeCode === 'TASK_ITEM' || typeCode === 'BUG') {
    data.desc = (document.getElementById('todo-f-desc') || {}).value.trim();
  }
  if (typeCode === 'TASK_ITEM') {
    data.startTime = localInputToTs((document.getElementById('todo-f-start-time') || {}).value);
    data.completeTime = localInputToTs((document.getElementById('todo-f-complete-time') || {}).value);
  }
  if (typeCode === 'MEETING') {
    data.name = (document.getElementById('todo-f-name') || {}).value.trim();
    data.meetingTime = localInputToTs((document.getElementById('todo-f-meeting-time') || {}).value);
    data.location = (document.getElementById('todo-f-location') || {}).value.trim();
    data.minutes = (document.getElementById('todo-f-minutes') || {}).value;
    data.startTime = localInputToTs((document.getElementById('todo-f-start-time-meeting') || {}).value);
    data.completeTime = localInputToTs((document.getElementById('todo-f-end-time') || {}).value);
    data.cancelTime = localInputToTs((document.getElementById('todo-f-cancel-time') || {}).value);
  }
  if (typeCode === 'BUG') {
    data.relatedTaskId = (document.getElementById('todo-f-related-task') || {}).value || '';
    data.feedbackBy = (document.getElementById('todo-f-feedback-by') || {}).value.trim();
    data.feedbackTime = localInputToTs((document.getElementById('todo-f-feedback-time') || {}).value);
    data.startTime = localInputToTs((document.getElementById('todo-f-start-time-bug') || {}).value);
    data.completeTime = localInputToTs((document.getElementById('todo-f-complete-time-bug') || {}).value);
    data.handoffTime = localInputToTs((document.getElementById('todo-f-handoff-time') || {}).value);
    data.onlineTime = localInputToTs((document.getElementById('todo-f-online-time') || {}).value);
  }
  return data;
}

async function openTodoModal() {
  if (typeof RT_TODOS === 'undefined' || !RT_TODOS) { toast('代办模块未就绪', 'error'); return; }
  editingTodoId = null;
  todoFormTypeCode = currentTodoType || 'TASK_ITEM';
  todoFormDevIds = [];
  clearTodoFormErrors();
  document.getElementById('todo-form').reset();
  document.getElementById('todo-modal-title').textContent = '新增代办';
  try { await Promise.all([ensureProjects(), ensureProjectVersions(), ensureDevelopers()]); } catch (e) {}
  renderTodoFormTypeChips();
  await renderTodoFormStatusOptions(todoFormTypeCode);
  renderTodoFormProjectOptions();
  renderTodoFormVersionOptions();
  renderTodoFormDevChips();
  await renderTodoFormRelatedTaskOptions();
  showHideTodoFormFields(todoFormTypeCode);
  document.getElementById('todo-modal-overlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

async function openTodoEdit(id) {
  if (typeof RT_TODOS === 'undefined' || !RT_TODOS) { toast('代办模块未就绪', 'error'); return; }
  let todo = null;
  try { todo = await RT_TODOS.getTodo(id); } catch (e) { todo = null; }
  if (!todo) { toast('代办不存在', 'error'); return; }
  editingTodoId = id;
  todoFormTypeCode = todo.typeCode || 'TASK_ITEM';
  todoFormDevIds = Array.isArray(todo.relatedDevIds) ? todo.relatedDevIds.slice() : [];
  clearTodoFormErrors();
  document.getElementById('todo-modal-title').textContent = '编辑代办';
  try { await Promise.all([ensureProjects(), ensureProjectVersions(), ensureDevelopers()]); } catch (e) {}
  renderTodoFormTypeChips();
  await renderTodoFormStatusOptions(todoFormTypeCode, todo.statusCode);
  renderTodoFormProjectOptions();
  renderTodoFormVersionOptions();
  renderTodoFormDevChips();
  await renderTodoFormRelatedTaskOptions(todo.relatedTaskId);
  showHideTodoFormFields(todoFormTypeCode);
  // 回填字段（项目/版本为同步下拉，先设项目再据级联刷新版本后设版本）
  document.getElementById('todo-f-project').value = todo.projectId || '';
  renderTodoFormVersionOptions();
  document.getElementById('todo-f-version').value = todo.projectVersionId || '';
  document.getElementById('todo-f-desc').value = todo.desc || '';
  document.getElementById('todo-f-name').value = todo.name || '';
  document.getElementById('todo-f-meeting-time').value = tsToLocalInput(todo.meetingTime);
  document.getElementById('todo-f-location').value = todo.location || '';
  document.getElementById('todo-f-minutes').value = todo.minutes || '';
  document.getElementById('todo-f-feedback-by').value = todo.feedbackBy || '';
  document.getElementById('todo-f-feedback-time').value = tsToLocalInput(todo.feedbackTime);
  document.getElementById('todo-f-remark').value = todo.remark || '';
  // 批次46b：回填时间字段（默认值为流转环节最后时间）
  setTodoTimeField('todo-f-start-time', tsToLocalInput(todo.startTime));
  setTodoTimeField('todo-f-complete-time', tsToLocalInput(todo.completeTime));
  setTodoTimeField('todo-f-start-time-bug', tsToLocalInput(todo.startTime));
  setTodoTimeField('todo-f-complete-time-bug', tsToLocalInput(todo.completeTime));
  setTodoTimeField('todo-f-handoff-time', tsToLocalInput(todo.handoffTime));
  setTodoTimeField('todo-f-online-time', tsToLocalInput(todo.onlineTime));
  setTodoTimeField('todo-f-start-time-meeting', tsToLocalInput(todo.startTime));
  setTodoTimeField('todo-f-end-time', tsToLocalInput(todo.completeTime)); // meeting end → completeTime
  setTodoTimeField('todo-f-cancel-time', tsToLocalInput(todo.cancelTime));
  // 创建时间（只读展示，三类型各一）
  var caEl = null;
  if (todoFormTypeCode === 'TASK_ITEM') caEl = document.getElementById('todo-f-created-at');
  else if (todoFormTypeCode === 'BUG') caEl = document.getElementById('todo-f-created-at-bug');
  else caEl = document.getElementById('todo-f-created-at-meeting');
  if (caEl) caEl.textContent = todo.createdAt ? fmtDateTime(todo.createdAt) : '—';
  document.getElementById('todo-modal-overlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

async function submitTodoForm(e) {
  e.preventDefault();
  clearTodoFormErrors();
  const data = collectTodoForm();
  if (typeof RT_TODOS === 'undefined' || !RT_TODOS) { toast('代办模块未就绪', 'error'); return; }
  const v = RT_TODOS.validateTodo(data);
  if (!v.ok) { showTodoFormErrors(v.errors); return; }
  const op = getCurrentUser();
  const operator = (op && op.account) ? op.account : (op ? String(op) : '');
  try {
    if (editingTodoId) {
      await RT_TODOS.updateTodo(editingTodoId, data, op);
      await RT_TODO_LIFECYCLES.createTodoLifecycle({
        todoId: editingTodoId, statusCode: data.statusCode,
        operationCode: 'TODO_EDIT', operator: operator, operateTime: Date.now()
      });
      toast('已保存', 'success');
    } else {
      const rec = await RT_TODOS.createTodo(data, op);
      await RT_TODO_LIFECYCLES.createTodoLifecycle({
        todoId: rec.id, statusCode: data.statusCode,
        operationCode: 'TODO_CREATE', operator: operator, operateTime: Date.now()
      });
      toast('已创建', 'success');
    }
    closeTodoModal();
    renderTodoStats();
    renderTodoList();
  } catch (err) {
    toast((err && err.message) ? err.message : '保存失败', 'error');
  }
}

function closeTodoModal() {
  const ov = document.getElementById('todo-modal-overlay');
  if (ov) ov.classList.remove('show');
  document.body.style.overflow = '';
  editingTodoId = null;
  todoFormTypeCode = 'TASK_ITEM';
  todoFormDevIds = [];
  const form = document.getElementById('todo-form');
  if (form) form.reset();
  clearTodoFormErrors();
}

// ---------- 代办详情页（批次08）----------
function todoDetailSection(label, html, pre) {
  return '<div class="task-detail-section">' +
    '<div class="task-detail-label">' + escapeHtml(label) + '</div>' +
    '<div class="task-detail-desc"' + (pre ? ' style="white-space:pre-wrap"' : '') + '>' + html + '</div>' +
    '</div>';
}

// 流转时间线：读 todoLifecycles，按操作/状态字典映射中文名（最新在前）
// 批次30：节点圆点/状态标签按状态字典色上色（对齐任务详情）；编辑等无状态动作中性灰；会议取消节点追加取消原因
async function renderTodoLifecycleTimeline(todoId, typeCode) {
  const box = document.getElementById('todo-detail-ops');
  if (!box) return;
  let lc = [];
  try { lc = await RT_TODO_LIFECYCLES.getByTodoId(todoId); } catch (e) { lc = []; }
  if (!Array.isArray(lc) || !lc.length) { box.innerHTML = '<div class="task-detail-empty">暂无流转记录</div>'; return; }
  const SEED = (window.RT_DICT && window.RT_DICT.SEED_TYPE) || {};
  const opType = SEED.TODO_OPERATION;
  const stType = SEED && TODO_STATUS_DICT(typeCode);
  const dicts = await Promise.all([
    opType ? window.RT_DICT.getDictByType(opType) : Promise.resolve([]),
    stType ? window.RT_DICT.getDictByType(stType) : Promise.resolve([])
  ]);
  const opName = {}; (dicts[0] || []).forEach(function (d) { opName[d.code] = d.name || d.code; });
  const stName = {}; const stColor = {};
  (dicts[1] || []).forEach(function (d) { stName[d.code] = d.name || d.code; stColor[d.code] = d.color || '#94a3b8'; });
  // 会议取消原因（取自代办记录）
  let cancelReason = '';
  try { const t = await RT_TODOS.getTodo(todoId); if (t) cancelReason = t.cancelReason || ''; } catch (e) {}
  box.innerHTML = '<div class="lc-timeline">' + lc.slice().reverse().map(function (r) {
    const op = opName[r.operationCode] || r.operationCode || '操作';
    const st = stName[r.statusCode] || r.statusCode || '';
    const isEdit = r.operationCode === 'TODO_EDIT';
    const rawColor = (!isEdit && stColor[r.statusCode]) ? stColor[r.statusCode] : '#94a3b8';
    const who = escapeHtml(r.operator || '');
    const when = r.operateTime ? fmtDateTime(r.operateTime) : '';
    const neutral = isEdit || rawColor === '#94a3b8';
    const badge = (st && !neutral)
      ? '<span class="lc-badge" style="background:' + rawColor + '1a;color:' + rawColor + '">' + escapeHtml(st) + '</span>'
      : '<span class="lc-badge chip-muted">' + (isEdit ? '编辑' : '操作') + '</span>';
    const reasonLine = (r.operationCode === 'TODO_CANCEL' && cancelReason)
      ? '<div class="lc-meta lc-cancel-reason">取消原因：' + escapeHtml(cancelReason) + '</div>'
      : '';
    return '<div class="lc-item" style="--c:' + rawColor + '">' +
      '<span class="lc-dot"></span>' +
      '<div class="lc-body">' +
      '<div class="lc-head"><span class="lc-action">' + escapeHtml(op) + '</span>' + badge + '</div>' +
      '<div class="lc-meta">操作人 <span class="op">' + who + '</span> · ' + escapeHtml(when) + '</div>' +
      reasonLine +
      '</div></div>';
  }).join('') + '</div>';
}

async function openTodoDetail(id) {
  if (typeof RT_TODOS === 'undefined' || !RT_TODOS) { toast('代办模块未就绪', 'error'); return; }
  let todo = null;
  try { todo = await RT_TODOS.getTodo(id); } catch (e) { todo = null; }
  if (!todo) { toast('代办不存在', 'error'); return; }
  currentTodoDetailId = id;
  const SEED = (window.RT_DICT && window.RT_DICT.SEED_TYPE) || {};
  const [typeName, statusName, statusColor] = await Promise.all([
    (SEED.TODO_TYPE ? window.RT_DICT.getDictByType(SEED.TODO_TYPE) : Promise.resolve([])).then(function (l) {
      const d = (l || []).find(function (x) { return x.code === todo.typeCode; }); return d ? d.name : todo.typeCode;
    }),
    (function () {
      const stType = SEED && TODO_STATUS_DICT(todo.typeCode);
      if (!stType) return Promise.resolve(todo.statusCode);
      return window.RT_DICT.getDictByType(stType).then(function (l) {
        const d = (l || []).find(function (x) { return x.code === todo.statusCode; }); return d ? d.name : todo.statusCode;
      });
    })(),
    (function () {
      const stType = SEED && TODO_STATUS_DICT(todo.typeCode);
      if (!stType) return Promise.resolve('#8c8c8c');
      return window.RT_DICT.getDictByType(stType).then(function (l) {
        const d = (l || []).find(function (x) { return x.code === todo.statusCode; });
        return (d && d.color) || '#8c8c8c';
      });
    })()
  ]);

  // 关联名解析
  const devNames = (Array.isArray(todo.relatedDevIds) ? todo.relatedDevIds : []).map(function (did) {
    return (userNicknamesByIds([did]) || [])[0] || did;
  });
  const projectName = projectNameById(todo.projectId);
  const versionName = versionNameById(todo.projectVersionId);
  let taskName = '';
  if (todo.relatedTaskId && window.RT_REQUIREMENT_TASKS && typeof RT_REQUIREMENT_TASKS.getRequirementTask === 'function') {
    try {
      const t = await RT_REQUIREMENT_TASKS.getRequirementTask(todo.relatedTaskId);
      taskName = t ? (t.taskName || todo.relatedTaskId) : '';
    } catch (e) { taskName = ''; }
  }

  // 标题：会议用名称，其余用描述
  document.getElementById('todo-detail-name').textContent =
    todo.typeCode === 'MEETING' ? (todo.name || '未命名会议') : (todo.desc || '无描述');

  // 主标签：类型 + 状态
  const color = resolveTodoTypeColor(todo.typeCode);
  document.getElementById('todo-detail-tags-main').innerHTML = [
    '<span class="tag" style="background:' + (color || '#8c8c8c') + '1a;color:' + (color || '#8c8c8c') + '">' + escapeHtml(typeName) + '</span>',
    '<span class="tag status-' + escapeHtml(todo.statusCode || '') + '" style="background:' + statusColor + '1a;color:' + statusColor + '">' + escapeHtml(statusName) + '</span>'
  ].join('');
  // 次标签：项目 + 版本
  document.getElementById('todo-detail-tags-meta').innerHTML = [
    '<span class="tag proj">' + escapeHtml(projectName || '未指定项目') + '</span>',
    '<span class="tag grp">' + escapeHtml(versionName || '未指定版本') + '</span>'
  ].join('');

  // 字段区块（按类型动态显隐，不展示 32 位 ID）
  const sections = [];
  if (todo.typeCode === 'TASK_ITEM' || todo.typeCode === 'BUG') {
    sections.push(todoDetailSection('描述', escapeHtml(todo.desc || ''), true));
  }
  if (todo.typeCode === 'MEETING') {
    if (todo.meetingTime) sections.push(todoDetailSection('会议时间', escapeHtml(fmtDateTime(todo.meetingTime))));
    if (todo.location) sections.push(todoDetailSection('会议地点', escapeHtml(todo.location)));
    if (todo.minutes) sections.push(todoDetailSection('会议纪要', escapeHtml(todo.minutes), true));
  }
  if (todo.typeCode === 'BUG') {
    if (taskName) sections.push(todoDetailSection('关联任务', escapeHtml(taskName)));
    if (todo.feedbackBy) sections.push(todoDetailSection('反馈人员', escapeHtml(todo.feedbackBy)));
    if (todo.feedbackTime) sections.push(todoDetailSection('反馈时间', escapeHtml(fmtDateTime(todo.feedbackTime))));
  }
  if (devNames.length) {
    sections.push(todoDetailSection('关联开发', devNames.map(function (n) {
      return '<span class="tag dev">' + escapeHtml(n) + '</span>';
    }).join('')));
  }
  if (todo.remark) sections.push(todoDetailSection('备注', escapeHtml(todo.remark), true));
  // 会议取消信息（批次23：取消原因 / 取消人 / 取消时间）
  if (todo.typeCode === 'MEETING' && todo.statusCode === 'MT_CANCELLED') {
    const cancelParts = [];
    if (todo.cancelReason) cancelParts.push(todoDetailSection('取消原因', escapeHtml(todo.cancelReason), true));
    if (todo.cancelBy) cancelParts.push(todoDetailSection('取消人', escapeHtml(todo.cancelBy)));
    if (todo.cancelTime) cancelParts.push(todoDetailSection('取消时间', escapeHtml(fmtDateTime(todo.cancelTime))));
    if (cancelParts.length) sections.push(cancelParts.join(''));
  }
  // 流转记录区块（异步填充）
  sections.push('<div class="task-detail-section"><div class="task-detail-label">流转记录</div><div id="todo-detail-ops"></div></div>');
  document.getElementById('todo-detail-body').innerHTML = sections.join('');

  const ov = document.getElementById('todo-detail-overlay');
  ov.hidden = false;
  ov.classList.add('show');
  document.body.style.overflow = 'hidden';

  // 异步填充流转时间线（BUG 与普通类型均展示）
  renderTodoLifecycleTimeline(id, todo.typeCode);
}

function closeTodoDetail() {
  const ov = document.getElementById('todo-detail-overlay');
  if (ov) { ov.classList.remove('show'); ov.hidden = true; }
  document.body.style.overflow = '';
  currentTodoDetailId = null;
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
async function openTaskDetail(id) {
  // 从 allTasks（IndexedDB）查找 + normalizeTask 归一化后展示
  const raw = allTasks.find((i) => i && i.id === id);
  if (!raw) return;
  const it = normalizeTask(raw);

  // 标题栏固定为「任务详情」；任务名称单独成行（居中）显示在标题栏下方
  const nameEl = document.getElementById('task-detail-name');
  if (nameEl) nameEl.textContent = it.title || '未命名任务';

  // 主标签行：任务类型 / 优先级 / 状态 / 开发人员（依次、居中）
  const devTags = (it.developerNames || []).map(function (d) {
    return '<span class="tag dev">' + escapeHtml(d) + '</span>';
  }).join('');
  const mainTags = [
    `<span class="tag type-${it.typeCode || ''}" style="background:${resolveTypeColor(it.typeCode)}1a;color:${resolveTypeColor(it.typeCode)}">${escapeHtml(resolveTypeName(it.typeCode, it.type))}</span>`,
    `<span class="tag pri-${it.priorityText || '中'}">${escapeHtml(it.priorityText || '中')}</span>`,
    `<span class="tag status-${it.statusText}">${escapeHtml(it.statusText || '')}</span>`,
    devTags
  ].join('');
  // 次标签行：所属项目 / 需求组（居中）
  const metaTags = [
    '<span class="tag proj">' + escapeHtml(it.projectName || '默认项目') + '</span>',
    '<span class="tag grp">' + escapeHtml(it.versionName || '默认组') + '</span>'
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
  // ---- 生命流程记录 ----
  var opsForDisplay = [];
  // 从 taskLifecycles 表按 taskId 查询，映射为 ops 格式
  try {
    var lifecycles = await RT_TASK_LIFECYCLES.getByTaskId(raw.id);
    opsForDisplay = lifecycleToOps(lifecycles || [], raw);
  } catch (e) {
    opsForDisplay = [];
  }

  var opsHtml = opsForDisplay.length
    ? '<div class="lc-timeline">' + opsForDisplay.slice().reverse().map(function (o) {
        var status = statusForOp(o);
        var color = lifeColor(status);
        var who = formatOperator(o.by);
        var when = o.at ? fmtDate(o.at) : '';
        var action = escapeHtml(o.action || '操作');
        var badge = status
          ? '<span class="lc-badge" style="background:var(--c-' + status + '-bg);color:' + color + '">' + escapeHtml(status) + '</span>'
          : '<span class="lc-badge chip-muted">编辑</span>';
        return '<div class="lc-item" style="--c:' + color + '">' +
          '<span class="lc-dot"></span>' +
          '<div class="lc-body">' +
          '<div class="lc-head"><span class="lc-action">' + action + '</span>' + badge + '</div>' +
          '<div class="lc-meta">操作人 <span class="op">' + who + '</span> · ' + escapeHtml(when) + '</div>' +
          (o.stageTime ? '<div class="lc-meta lc-stage-time">阶段时间 ' + escapeHtml(fmtDate(o.stageTime)) + '</div>' : '') +
          '</div></div>';
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
    wrap.innerHTML = '<span class="text-muted-sm">请先在基础数据中添加人员</span>';
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

  // 项目/版本/开发者/优先级
  await renderFormOptions();
  document.getElementById('f-project').value = item.projectId || '';
  await refreshFormGroupSelect(item.projectId);
  document.getElementById('f-group').value = item.projectVersionId || '';
  formDeveloperIds = item.developerIds ? item.developerIds.slice() : [];
  formPriorityCode = item.priorityCode || 'MEDIUM';
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
  // 编辑时加载图片和附件数据
  var imgIds = item.imageIds || [];
  var attIds = item.attachmentIds || [];
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

var allTasks = [];   // 统一单数据源用于渲染

// IndexedDB 刷新任务列表
async function refreshTaskList() {
  calDayFactsCache = null;   // 任务数据变了，当日动态缓存作废（批次183）
  try {
    allTasks = await RT_REQUIREMENT_TASKS.getAllRequirementTasks();
    allTasks = (allTasks || []).map(function (t) { return Object.assign({}, t, { _source: 'idb' }); });
  } catch (e) { allTasks = []; }
  renderTaskList();
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
  const devTags = (it.developerNames || []).map(function (d) {
    return '<span class="tag dev">' + escapeHtml(d) + '</span>';
  }).join('');
  const dateSpans = [primaryTimeText(it)];
  const imgCount = (it.images && it.images.length) ? it.images.length : 0;
  if (imgCount > 0) dateSpans.push(`📷 ${imgCount} 张图片`);
  const attCount = (it.attachments && it.attachments.length) ? it.attachments.length : 0;
  if (attCount > 0) dateSpans.push(`📎 ${attCount} 个附件`);

  // 任务 ID/子 ID：优先 zentaoId/zentaoSubId，回退 taskId/subId
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
          <span class="tag proj">${escapeHtml(it.projectName || '默认项目')}</span>
          <span class="tag grp">${escapeHtml(it.versionName || '默认组')}</span>
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

// ---------- Task actions & filters ----------
const TASK_ACTION_HANDLERS = {
  // ---- 删除 ----
  async del(raw, id) {
    var norm = normalizeTask(raw);
    var ok = await customConfirm('确认删除「' + norm.title + '」？', { danger: true });
    if (!ok) return;

    await RT_REQUIREMENT_TASKS.deleteRequirementTask(id);

    await refreshTaskList();
    toast('已删除');
  },

  // ---- 状态推进 ----
  async advance(raw) {
    var norm = normalizeTask(raw);
    var act = actionLabel(norm.statusText);
    var ns = nextStatus(norm.statusText);
    if (!ns) return;

    var now = Date.now();
    var op = getCurrentUser();

    var STATUS_TEXT_TO_CODE = { '待开发': 'TODO', '已提测': 'SUBMITTED', '测试中': 'TESTING', '已测完': 'TESTED', '已上线': 'ONLINE' };
    var nextStatusCode = STATUS_TEXT_TO_CODE[ns];
    if (!nextStatusCode) return;

    var OP_MAP = { '开发提交': 'DEV_SUBMIT', '测试开始': 'TEST_START', '测试完成': 'TEST_DONE', '上线': 'ONLINE' };
    var operationCode = OP_MAP[act] || 'DEV_SUBMIT';

    var patch = Object.assign({}, raw, { statusCode: nextStatusCode });

    var TIME_FIELDS = {
      'SUBMITTED': { time: 'devSubmitTime', by: 'devSubmitBy' },
      'TESTING':   { time: 'testStartTime',  by: 'testStartBy' },
      'TESTED':    { time: 'testEndTime',    by: 'testEndBy' },
      'ONLINE':    { time: 'onlineTime',     by: 'onlineBy' }
    };
    var tf = TIME_FIELDS[nextStatusCode];
    if (tf && raw[tf.time] == null) {
      patch[tf.time] = now;
      patch[tf.by] = op;
    }

    await RT_REQUIREMENT_TASKS.updateRequirementTask(raw.id, patch, op);

    await RT_TASK_LIFECYCLES.createTaskLifecycle({
      taskId: raw.id,
      statusCode: nextStatusCode,
      operationCode: operationCode,
      operator: op,
      operateTime: now
    });

    await refreshTaskList();
    toast('状态更新为：' + ns);
  },

  // ---- 重置 ----
  async reset(raw) {
    var now = Date.now();
    var op = getCurrentUser();

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

    await refreshTaskList();
    toast('已重置为待开发');
  },

  // ---- 暂停 ----
  async pause(raw) {
    var now = Date.now();
    var op = getCurrentUser();

    await RT_TASK_LIFECYCLES.createTaskLifecycle({
      taskId: raw.id,
      statusCode: raw.statusCode,
      operationCode: 'PAUSE',
      operator: op,
      operateTime: now
    });

    await refreshTaskList();
    toast('已暂停');
  },

  // ---- 暂停恢复 ----
  async resume(raw) {
    var now = Date.now();
    var op = getCurrentUser();

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

    await refreshTaskList();
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
    // 从 allTasks 查找（纯 IndexedDB 数据）
    const raw = allTasks.find((i) => i && i.id === id);
    if (!raw) return;
    const act = btn.dataset.act;
    const handler = TASK_ACTION_HANDLERS[act];
    if (handler) await handler(raw, id);         // 传原始对象（含 _source 标记）
    return;
  }
  // 点击任务卡其它区域（标题/描述/标签）→ 打开详情
  const card = e.target.closest('.task-card');
  if (card && card.dataset.id) openTaskDetail(card.dataset.id);
}

// ---------- 代办操作处理器（批次 23）----------
// 当前登录用户 + 其账号串（lifecycle 的 operator 需为字符串）
function currentTodoOperator() {
  const u = getCurrentUser();
  const account = (u && u.account) ? u.account : (u ? String(u) : '');
  return { user: u, account: account };
}

// 状态 → 可用操作映射（删除仅初始态；缺陷追踪「已完成」无「上线」；会议「未开始」额外提供「取消」）
function getTodoActions(statusCode, typeCode) {
  const MAP = {
    'TD_TODO':       ['start', 'edit', 'del'],
    'TD_DOING':      ['complete', 'edit'],
    'TD_DONE':       ['edit'],
    'BUG_TODO':      ['start', 'edit', 'del'],
    'BUG_DOING':     ['complete', 'handoff', 'edit'],
    'BUG_DONE':      ['edit'],
    'BUG_WAIT_DEV':  ['online', 'edit'],
    'BUG_ONLINE':    ['edit'],
    'MT_NOT_STARTED':['start', 'cancel', 'edit', 'del'],
    'MT_IN_PROGRESS':['end', 'edit'],
    'MT_ENDED':      ['edit'],
    'MT_CANCELLED':  ['edit']
  };
  const LABELS = {
    // 「开始」按钮：仅会议显示「开始」，任务事项/缺陷追踪显示「开始处理」
    start: (typeCode === 'MEETING') ? '开始' : '开始处理',
    complete: '完成', handoff: '转交', end: '结束',
    online: '上线', cancel: '取消', edit: '编辑', del: '删除',
    reset: '重置'
  };
  // 重置按钮：任意状态都显示，且恒在「编辑」之前（操作与编辑之间）
  return (MAP[statusCode] || ['edit']).map(function (act) {
    return { act: act, label: LABELS[act] || act };
  }).reduce(function (acc, item) {
    if (item.act === 'edit') acc.push({ act: 'reset', label: LABELS.reset });
    acc.push(item);
    return acc;
  }, []);
}

const TODO_ACTION_HANDLERS = {
  // ---- 状态推进 ----
  // 批次29：状态推进后「就地重绘卡片」——renderTodoStats/renderTodoList 置于 finally，
  // 无论流转记录(createTodoLifecycle)是否写入成功，卡片状态与按钮都即时刷新，无需刷新页面。
  async start(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const { user, account } = currentTodoOperator();
    const nextCode = (todo.typeCode === 'BUG') ? 'BUG_DOING' : (todo.typeCode === 'MEETING' ? 'MT_IN_PROGRESS' : 'TD_DOING');
    try {
      await RT_TODOS.updateTodo(id, { statusCode: nextCode, startTime: Date.now(), startBy: account }, user);
      toast(todo.typeCode === 'MEETING' ? '会议已开始' : '已开始处理');
      try {
        await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, statusCode: nextCode, operationCode: 'TODO_START', operator: account });
      } catch (e) { toast('状态已更新，但流转记录写入失败：' + (e && e.message ? e.message : ''), 'warn'); }
    } catch (e) { toast((e && e.message) ? e.message : '操作失败', 'error'); }
    finally { renderTodoStats(); renderTodoList(); }
  },
  async complete(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const { user, account } = currentTodoOperator();
    const nextCode = (todo.typeCode === 'BUG') ? 'BUG_DONE' : 'TD_DONE';
    try {
      await RT_TODOS.updateTodo(id, { statusCode: nextCode, completeTime: Date.now(), completeBy: account }, user);
      toast('已完成');
      try {
        await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, statusCode: nextCode, operationCode: 'TODO_COMPLETE', operator: account });
      } catch (e) { toast('状态已更新，但流转记录写入失败：' + (e && e.message ? e.message : ''), 'warn'); }
    } catch (e) { toast((e && e.message) ? e.message : '操作失败', 'error'); }
    finally { renderTodoStats(); renderTodoList(); }
  },
  async handoff(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    if (todo.typeCode !== 'BUG') return; // 仅缺陷追踪有「转交」：处理中 → 待开发
    const { user, account } = currentTodoOperator();
    const nextCode = 'BUG_WAIT_DEV';
    try {
      await RT_TODOS.updateTodo(id, { statusCode: nextCode, handoffTime: Date.now(), handoffBy: account }, user);
      toast('已转交至待开发');
      try {
        await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, statusCode: nextCode, operationCode: 'TODO_HANDOFF', operator: account });
      } catch (e) { toast('状态已更新，但流转记录写入失败：' + (e && e.message ? e.message : ''), 'warn'); }
    } catch (e) { toast((e && e.message) ? e.message : '操作失败', 'error'); }
    finally { renderTodoStats(); renderTodoList(); }
  },
  async online(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const { user, account } = currentTodoOperator();
    try {
      await RT_TODOS.updateTodo(id, { statusCode: 'BUG_ONLINE', onlineTime: Date.now(), onlineBy: account }, user);
      toast('已上线');
      try {
        await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, statusCode: 'BUG_ONLINE', operationCode: 'TODO_ONLINE', operator: account });
      } catch (e) { toast('状态已更新，但流转记录写入失败：' + (e && e.message ? e.message : ''), 'warn'); }
    } catch (e) { toast((e && e.message) ? e.message : '操作失败', 'error'); }
    finally { renderTodoStats(); renderTodoList(); }
  },
  // ---- 会议结束（新增）----
  async end(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const { user, account } = currentTodoOperator();
    try {
      await RT_TODOS.updateTodo(id, { statusCode: 'MT_ENDED', completeTime: Date.now(), completeBy: account }, user);
      toast('会议已结束');
      try {
        await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, statusCode: 'MT_ENDED', operationCode: 'TODO_END', operator: account });
      } catch (e) { toast('状态已更新，但流转记录写入失败：' + (e && e.message ? e.message : ''), 'warn'); }
    } catch (e) { toast((e && e.message) ? e.message : '操作失败', 'error'); }
    finally { renderTodoStats(); renderTodoList(); }
  },
  // ---- 会议取消（新增，需填原因）----
  async cancel(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const reason = await promptCancelReason('请填写会议取消原因（必填）');
    if (reason == null) return;                 // 用户点「取消」
    if (!reason.trim()) { toast('取消原因不能为空', 'error'); return; }
    const { user, account } = currentTodoOperator();
    try {
      await RT_TODOS.updateTodo(id, {
        statusCode: 'MT_CANCELLED',
        cancelTime: Date.now(),
        cancelBy: account,
        cancelReason: reason.trim()
      }, user);
      toast('会议已取消');
      try {
        await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, statusCode: 'MT_CANCELLED', operationCode: 'TODO_CANCEL', operator: account });
      } catch (e) { toast('状态已更新，但流转记录写入失败：' + (e && e.message ? e.message : ''), 'warn'); }
    } catch (e) { toast((e && e.message) ? e.message : '操作失败', 'error'); }
    finally { renderTodoStats(); renderTodoList(); }
  },
  // ---- 编辑 ----
  async edit(id) { openTodoEdit(id); },
  // ---- 删除 ----
  async del(id) {
    const ok = await customConfirm('确认删除该代办？删除后将一并清理其流转记录，且不可恢复。', { danger: true });
    if (!ok) return;
    try {
      await RT_TODOS.deleteTodo(id);
      toast('已删除', 'success');
    } catch (e) { toast((e && e.message) ? e.message : '删除失败', 'error'); }
    finally { renderTodoStats(); renderTodoList(); }
  },
  // ---- 重置：回到初始状态，重新开始 ----
  async reset(id) {
    const todo = await RT_TODOS.getTodo(id);
    if (!todo) return;
    const { user, account } = currentTodoOperator();
    const initCode = (todo.typeCode === 'BUG')    ? 'BUG_TODO'
                   : (todo.typeCode === 'MEETING') ? 'MT_NOT_STARTED'
                   :                                  'TD_TODO';
    try {
      await RT_TODOS.updateTodo(id, { statusCode: initCode }, user);
      toast('已重置到初始状态');
      try {
        await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, statusCode: initCode, operationCode: 'TODO_RESET', operator: account });
      } catch (e) { toast('状态已重置，但流转记录写入失败：' + (e && e.message ? e.message : ''), 'warn'); }
    } catch (e) { toast((e && e.message) ? e.message : '操作失败', 'error'); }
    finally { renderTodoStats(); renderTodoList(); }
  }
};

// 会议取消原因输入框（复用 .modal-overlay/.modal 弹窗）
function promptCancelReason(message) {
  return new Promise(function (resolve) {
    const existing = document.getElementById('todo-cancel-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'todo-cancel-overlay';
    overlay.innerHTML =
      '<div class="modal">' +
        '<div class="modal-header"><h3>' + escapeHtml(message) + '</h3></div>' +
        '<div class="modal-body">' +
          '<textarea id="todo-cancel-reason" rows="3" placeholder="请输入取消原因..." ' +
            'style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--border);border-radius:8px;font:inherit;resize:vertical"></textarea>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn ghost" type="button" data-action="cancel">取消</button>' +
          '<button class="btn primary" type="button" data-action="confirm">确认取消</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    const textarea = overlay.querySelector('#todo-cancel-reason');
    const close = function (val) { if (overlay.parentNode) overlay.remove(); resolve(val); };
    overlay.querySelector('[data-action="cancel"]').onclick = function () { close(null); };
    overlay.querySelector('[data-action="confirm"]').onclick = function () { close(textarea.value); };
    textarea.focus();
  });
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
    (projectList || []).map(function (p) { return '<option value="' + escapeHtml(p.projectName) + '">' + escapeHtml(p.projectName) + '</option>'; }).join('');
  if (filter.project && !(projectList || []).some(function (p) { return p.projectName === filter.project; })) filter.project = '';
  projSel.value = filter.project;

  // 需求组下拉多选
  var groups;
  if (filter.project) {
    var proj = projectList.find(function (p) { return p.projectName === filter.project; });
    groups = proj ? (versionList || []).filter(function (g) { return g.projectId === proj.id; }) : [];
  } else {
    groups = (versionList || []);
  }
  // 清理已不存在的需求组
  filter.group = filter.group.filter(function (g) { return groups.some(function (sg) { return sg.versionName === g; }); });

  const allChecked = filter.group.length === 0;
  let html = `<div class="dropdown-item select-all${allChecked ? ' checked' : ''}" data-group-val="全部">
    <span class="check-mark">✓</span><span>全部需求组</span></div>`;
  groups.forEach(function (g) {
    var name = g.versionName || '';
    var checked = filter.group.includes(name);
    html += '<div class="dropdown-item' + (checked ? ' checked' : '') + '" data-group-val="' + escapeHtml(name) + '">' +
      '<span class="check-mark">✓</span><span>' + escapeHtml(name) + '</span></div>';
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

// ---------- Task form submit ----------
async function onSubmit(e) {
  e.preventDefault();
  let data = getFormData();
  if (!data.taskName) return toast('请填写任务名称', 'warn');

  const op = getCurrentUser();   // 当前登录用户，作为创建人 / 更新人

  try {
    // 保存前存储配额校验：图片/附件为 Base64，体积大，避免写入时静默失败
    const addedDataUrls = [];
    if (editingId) {
      const old = allTasks.find((i) => i && i.id === editingId);
      const oldImgIds = (old && old.imageIds) || [];
      const oldAttIds = (old && old.attachmentIds) || [];
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

      // ====== 图片处理 ======
      var oldImgIds = raw.imageIds || [];
      var newImgIds = data.imageIds;
      var removedImgs = oldImgIds.filter(function (id) { return !newImgIds.includes(id); });
      await dbDeleteImages(removedImgs);
      var addedImgs = formImages.filter(function (i) { return !oldImgIds.includes(i.id); });
      for (var img of addedImgs) {
        await dbPutImage({ id: img.id, dataUrl: img.dataUrl, taskId: editingId });
      }

      var oldAttIds = raw.attachmentIds || [];
      var newAttIds = data.attachmentIds;
      var removedAtts = oldAttIds.filter(function (id) { return !newAttIds.includes(id); });
      await dbDeleteAttachments(removedAtts);
      var addedAtts = formAttachments.filter(function (a) { return !oldAttIds.includes(a.id); });
      for (var att of addedAtts) {
        if (!att.dataUrl) continue;
        await dbPutAttachment({ id: att.id, name: att.name, type: att.type,
                                size: att.size, dataUrl: att.dataUrl, taskId: editingId });
      }

      // ====== 核心写入 ======
      await RT_REQUIREMENT_TASKS.updateRequirementTask(editingId, data, op);

      await RT_TASK_LIFECYCLES.createTaskLifecycle({
        taskId: editingId,
        statusCode: raw.statusCode,
        operationCode: 'EDIT',
        operator: op,
        operateTime: Date.now()
      });

      toast('已更新');
    } else {
      // 新建：配额检查期间表单可能被修改，重新获取
      data = getFormData();
      if (!data.taskName) { toast('请填写任务名称', 'warn'); return; }

      // 写入 requirementTasks 表（自动 genId + 校验字典code + 外键 + 审计字段）
      var created = await RT_REQUIREMENT_TASKS.createRequirementTask(data, op);

      // 图片落库到 IndexedDB
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
    }
    // 公共收尾
    closeModal();
    await refreshTaskList();
    warnIfQuotaHigh();
  } catch (err) {
    toast('保存失败：' + (err && err.message || '未知错误'), 'warn');
  }
}

// ---------- Form chip handlers ----------
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

// ---------- Stats ----------
function renderStats(filtered) {
  const data = filtered || allTasks.map(normalizeTask);
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
  renderStats(allTasks.map(normalizeTask));
}

function toggleFilters() {
  uiState.showFilters = !uiState.showFilters;
  saveUIState();
  renderStats(allTasks.map(normalizeTask));
}

// 重新加载主数据（项目/版本/人员），用于增删改后刷新内存缓存
async function refreshMasterData() {
  await Promise.all([
    ensureProjects(),
    ensureProjectVersions(),
    ensureDevelopers(),
  ]);
}

// ---------- Init ----------
async function init() {
  // 启动即全量字典播种（治本：版本门控 → 发版即强制重播）
  await ensureAllDicts();

  // 照有：任务类型预取
  await ensureTaskTypes();
  renderTypeFilterChips();

  // 新增：预取其他主数据（字典+实体表）
  await Promise.all([
    ensurePriorities(),         // 优先级字典
    ensureProjects(),           // 项目表
    ensureProjectVersions(),    // 项目版本表
    ensureDevelopers(),         // 人员表
  ]);

  // Tabs
  document.querySelectorAll('.tab').forEach((el) => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });

  // 首页：快捷打卡按钮（批次 180）
  const homeClockIn = document.getElementById('btnClockIn');
  if (homeClockIn) homeClockIn.addEventListener('click', () => doClock('in'));
  const homeClockOut = document.getElementById('btnClockOut');
  if (homeClockOut) homeClockOut.addEventListener('click', () => doClock('out'));
  // 首页：快捷入口跳转各 TAB
  document.querySelectorAll('#view-home .home-quick-item').forEach((el) => {
    el.addEventListener('click', () => {
      const go = el.getAttribute('data-go');
      if (go) switchView(go);
    });
  });

  // FAB + Modal
  document.getElementById('fab').addEventListener('click', () => {
    if (currentView === 'todo') { openTodoModal(); return; }
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

  // 代办模态框（批次07）
  const todoModalClose = document.getElementById('todo-modal-close');
  if (todoModalClose) todoModalClose.addEventListener('click', closeTodoModal);
  const todoModalCancel = document.getElementById('todo-modal-cancel');
  if (todoModalCancel) todoModalCancel.addEventListener('click', closeTodoModal);
  const todoModalOverlay = document.getElementById('todo-modal-overlay');
  if (todoModalOverlay) todoModalOverlay.addEventListener('click', (e) => {
    if (e.target.id === 'todo-modal-overlay') closeTodoModal();
  });
  const todoFormEl = document.getElementById('todo-form');
  if (todoFormEl) todoFormEl.addEventListener('submit', submitTodoForm);
  const todoTypeChips = document.getElementById('todo-form-type-chips');
  if (todoTypeChips) todoTypeChips.addEventListener('click', onTodoFormTypeChip);
  const todoDevChips = document.getElementById('todo-f-dev-chips');
  if (todoDevChips) todoDevChips.addEventListener('click', onTodoFormDevChip);
  const todoProjectSel = document.getElementById('todo-f-project');
  if (todoProjectSel) todoProjectSel.addEventListener('change', renderTodoFormVersionOptions);

  // 请假模态框（批次182）
  const lvClose = document.getElementById('leave-modal-close');
  if (lvClose) lvClose.addEventListener('click', closeLeaveModal);
  const lvCancel = document.getElementById('leave-modal-cancel');
  if (lvCancel) lvCancel.addEventListener('click', closeLeaveModal);
  const lvOverlay = document.getElementById('leave-modal-overlay');
  if (lvOverlay) lvOverlay.addEventListener('click', (e) => {
    if (e.target.id === 'leave-modal-overlay') closeLeaveModal();
  });
  const lvForm = document.getElementById('leave-form');
  if (lvForm) lvForm.addEventListener('submit', (e) => { e.preventDefault(); submitLeave(); });
  const lvStart = document.getElementById('lv-f-start');
  if (lvStart) lvStart.addEventListener('change', updateLeaveDuration);
  const lvEnd = document.getElementById('lv-f-end');
  if (lvEnd) lvEnd.addEventListener('change', updateLeaveDuration);
  const lvDel = document.getElementById('lv-delete');
  if (lvDel) lvDel.addEventListener('click', () => {
    const id = leaveEditingId;
    if (!id) return;
    closeLeaveModal();
    removeLeave(id);
  });

  // 任务详情
  document.getElementById('task-detail-close').addEventListener('click', closeTaskDetail);
  document.getElementById('task-detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'task-detail-overlay') closeTaskDetail();
  });

  // 代办详情页（批次08）
  const todoDetailClose = document.getElementById('todo-detail-close');
  if (todoDetailClose) todoDetailClose.addEventListener('click', closeTodoDetail);
  const todoDetailOverlay = document.getElementById('todo-detail-overlay');
  if (todoDetailOverlay) todoDetailOverlay.addEventListener('click', (e) => {
    if (e.target.id === 'todo-detail-overlay') closeTodoDetail();
  });
  // 代办详情只读（批次27）：编辑/删除按钮已移除，操作按钮将于批次29内嵌

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

  switchView('home');           // 批次 180：默认进入首页仪表盘

  // 初始渲染表单选项 & 列表（异步刷新）
  await renderFormOptions();
  await refreshTaskList();      // 替代原有的 renderTaskList()
  // 列表刷新后若停留在首页，重渲染指标（此时 allTasks 已就绪，今日任务数才准确）
  if (currentView === 'home') renderHome();

  // 启动后检查存储占用：高占用时提醒清理（不阻塞渲染）
  warnIfQuotaHigh();

  // 从浏览器打开的 ?dl= 链接：自动触发下载（绕过 PWA standalone 下载限制）
  checkAutoDownloadFromUrl();

  // 批次 89：权限守卫。登录态预热权限缓存，渲染后按 [data-perm] 隐藏无权限元素。
  if (typeof RT_PERM !== 'undefined' && RT_PERM.cachePermissions) {
    const acct = (typeof getCurrentUserAccount === 'function' ? getCurrentUserAccount() : '') || '';
    if (acct) {
      RT_PERM.cachePermissions(acct)
        .then(function () { if (typeof RT_PERM.guard === 'function') return RT_PERM.guard(document); })
        .catch(function () {});
    }
  }
}

document.addEventListener('DOMContentLoaded', init);