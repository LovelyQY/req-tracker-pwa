// 需求任务追踪 —— 微信小程序风格 PWA 逻辑
// 数据持久化在 localStorage，离线可用

const STORE_KEY = 'req-tracker-v2-items';
const SETTINGS_KEY = 'req-tracker-v2-settings';
const UI_STATE_KEY = 'req-tracker-v2-ui';
const TASK_TYPES = ['需求', '线上BUG', '普通BUG'];
const STATUSES = ['待开发', '已提测', '测试中', '已测完', '已上线'];
const STAT_STATS = ['已提测', '测试中', '已测完', '已上线'];

const DEFAULT_SETTINGS = {
  developers: ['开发A', '开发B', '开发C'],
  projects: ['默认项目'],
  groups: ['默认组']
};

const DEFAULT_UI_STATE = { showStats: true, showFilters: true };

let items = loadItems();
let settings = loadSettings();
let uiState = loadUIState();
let editingId = null;
let filter = { type: '全部', status: '全部', q: '' };
let currentView = 'task';
let formType = '需求';
let formDevs = [];

function loadItems() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
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
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

// 自定义居中确认弹窗（方案 E 风格：白色卡片 + 抬头「提示」+ 一分为二的取消/确认）
// 返回 Promise<boolean>，替代原生 confirm()（避免英文域名提示 & 方形高亮）
function customConfirm(message, opts) {
  opts = opts || {};
  const confirmText = opts.confirmText || '确认';
  const cancelText = opts.cancelText || '取消';
  return new Promise((resolve) => {
    const existing = document.getElementById('cd-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    overlay.id = 'cd-overlay';
    const safeMsg = escapeHtml(message).replace(/\n/g, '<br>');
    overlay.innerHTML =
      '<div class="cd-card" role="dialog" aria-modal="true">' +
        '<div class="cd-header">提示</div>' +
        '<div class="cd-body">' + safeMsg + '</div>' +
        '<div class="cd-actions">' +
          '<button class="cd-btn cd-cancel" type="button">' + escapeHtml(cancelText) + '</button>' +
          '<button class="cd-btn cd-confirm" type="button">' + escapeHtml(confirmText) + '</button>' +
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
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Tabs ----------
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + view));
  const fab = document.getElementById('fab');
  if (fab) fab.style.display = view === 'task' ? 'flex' : 'none';
  if (view === 'report') renderReports();
  if (view === 'settings') renderSettings();
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
  formType = '需求';
  formDevs = [];
  renderFormTypeChips();
  renderFormDevChips();
}

function renderFormOptions() {
  const projectSel = document.getElementById('f-project');
  const groupSel = document.getElementById('f-group');
  projectSel.innerHTML = settings.projects.map((p) => `<option>${escapeHtml(p)}</option>`).join('');
  groupSel.innerHTML = settings.groups.map((g) => `<option>${escapeHtml(g)}</option>`).join('');
  renderFormDevChips();
}

function renderFormTypeChips() {
  const wrap = document.getElementById('form-type-chips');
  wrap.innerHTML = TASK_TYPES.map((t) =>
    `<button class="chip ${formType === t ? 'active' : ''}" data-type="${t}" type="button">${t}</button>`
  ).join('');
}

function renderFormDevChips() {
  const wrap = document.getElementById('form-dev-chips');
  if (settings.developers.length === 0) {
    wrap.innerHTML = '<span style="font-size:12px;color:var(--muted)">请在「设置」中添加开发人员</span>';
    return;
  }
  wrap.innerHTML = settings.developers.map((d) => {
    const active = formDevs.includes(d);
    return `<button class="chip ${active ? 'active' : ''}" data-dev="${escapeHtml(d)}" type="button">${escapeHtml(d)}</button>`;
  }).join('');
}

function getFormData() {
  return {
    title: document.getElementById('f-title').value.trim(),
    type: formType,
    project: document.getElementById('f-project').value,
    group: document.getElementById('f-group').value,
    developers: [...formDevs],
    dueDate: document.getElementById('f-due').value,
    desc: document.getElementById('f-desc').value.trim()
  };
}

function setFormData(item) {
  document.getElementById('f-title').value = item.title;
  document.getElementById('f-due').value = item.dueDate || '';
  document.getElementById('f-desc').value = item.desc || '';
  document.getElementById('f-project').value = item.project;
  document.getElementById('f-group').value = item.group;
  formType = item.type;
  formDevs = [...(item.developers || [])];
  renderFormTypeChips();
  renderFormDevChips();
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

function renderTaskList() {
  const list = document.getElementById('task-list');
  const filtered = items.filter((it) => {
    if (filter.type !== '全部' && it.type !== filter.type) return false;
    if (filter.status !== '全部' && it.status !== filter.status) return false;
    if (filter.q && !(`${it.title} ${it.desc}`.toLowerCase().includes(filter.q.toLowerCase()))) return false;
    return true;
  }).sort((a, b) => b.createdAt - a.createdAt);
  renderStats(filtered);

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>暂无任务，点击右下角 + 添加一条</div>';
    return;
  }

  list.innerHTML = filtered.map((it) => {
    const advance = actionLabel(it.status);
    const devTags = (it.developers || []).map((d) => `<span class="tag meta">${escapeHtml(d)}</span>`).join('');
    const dates = [];
    dates.push(`录入 ${fmtDate(it.createdAt)}`);
    if (it.dates?.submitted) dates.push(`提测 ${fmtDate(it.dates.submitted)}`);
    if (it.dates?.started) dates.push(`起测 ${fmtDate(it.dates.started)}`);
    if (it.dates?.completed) dates.push(`测完 ${fmtDate(it.dates.completed)}`);
    if (it.dates?.online) dates.push(`上线 ${fmtDate(it.dates.online)}`);

    return `
      <div class="task-card t-${it.type}" data-id="${it.id}">
        <div class="task-body">
          <div class="task-header">
            <div class="task-title-row">
              <span class="tag type-${it.type}">${it.type}</span>
              <h3 class="task-title">${escapeHtml(it.title)}</h3>
            </div>
            <span class="tag status-${it.status}">${it.status}</span>
          </div>
          ${it.desc ? `<div class="task-desc">${escapeHtml(it.desc)}</div>` : ''}
          <div class="task-meta">
            <span class="tag meta">${escapeHtml(it.project || '默认项目')}</span>
            <span class="tag meta">${escapeHtml(it.group || '默认组')}</span>
            ${devTags}
          </div>
          <div class="task-dates">${dates.map((d) => `<span>${d}</span>`).join('')}</div>
          <div class="task-actions">
            ${advance ? `<button class="btn action-${advance}" data-act="advance" data-id="${it.id}">${advance}</button>` : ''}
            <button class="btn action-重置" data-act="reset" data-id="${it.id}">重置</button>
            <button class="btn action-编辑" data-act="edit" data-id="${it.id}">编辑</button>
            <button class="btn action-删除" data-act="del" data-id="${it.id}">删除</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ---------- Reports ----------
function renderReports() {
  document.getElementById('r-total').textContent = items.length;
  document.getElementById('r-doing').textContent = items.filter((i) => ['已提测', '测试中'].includes(i.status)).length;
  document.getElementById('r-online').textContent = items.filter((i) => i.status === '已上线').length;

  const wrap = document.getElementById('r-breakdown');
  wrap.innerHTML = STATUSES.map((s) => {
    const n = items.filter((i) => i.status === s).length;
    return `
      <div class="status-row">
        <span><span class="tag status-${s}">${s}</span></span>
        <span style="font-weight:600">${n}</span>
      </div>`;
  }).join('');
}

// ---------- Settings ----------
function renderSettings() {
  const renderList = (id, arr, key) => {
    const el = document.getElementById(id);
    if (!arr.length) {
      el.innerHTML = '<div class="settings-item"><span style="color:var(--muted)">暂无</span></div>';
      return;
    }
    el.innerHTML = arr.map((v) => `
      <div class="settings-item">
        <span>${escapeHtml(v)}</span>
        <button class="del" data-del="${key}" data-val="${escapeHtml(v)}">🗑️</button>
      </div>
    `).join('');
  };
  renderList('dev-list', settings.developers, 'dev');
  renderList('project-list', settings.projects, 'project');
  renderList('group-list', settings.groups, 'group');
}

// ---------- Events ----------
async function onTaskAction(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const it = items.find((i) => i.id === id);
  if (!it) return;
  const act = btn.dataset.act;

  if (act === 'del') {
    const ok = await customConfirm(`确认删除「${it.title}」？`);
    if (ok) {
      items = items.filter((i) => i.id !== id);
      saveItems();
      renderTaskList();
      toast('已删除');
    }
  } else if (act === 'advance') {
    const ns = nextStatus(it.status);
    if (!ns) return;
    it.status = ns;
    it.dates = it.dates || {};
    const now = Date.now();
    if (ns === '已提测') it.dates.submitted = now;
    if (ns === '测试中') it.dates.started = now;
    if (ns === '已测完') it.dates.completed = now;
    if (ns === '已上线') it.dates.online = now;
    saveItems();
    renderTaskList();
    toast(`状态更新为：${ns}`);
  } else if (act === 'reset') {
    it.status = '待开发';
    it.dates = { submitted: null, started: null, completed: null, online: null };
    saveItems();
    renderTaskList();
    toast('已重置为待开发');
  } else if (act === 'edit') {
    editingId = id;
    openModal('编辑任务');
    setFormData(it);
  }
}

function onFilterClick(e) {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  if (btn.dataset.type !== undefined) {
    filter.type = btn.dataset.type;
    document.querySelectorAll('#type-chips .chip').forEach((el) => el.classList.toggle('active', el.dataset.type === filter.type));
  } else if (btn.dataset.status !== undefined) {
    filter.status = btn.dataset.status;
    document.querySelectorAll('#status-chips .chip').forEach((el) => el.classList.toggle('active', el.dataset.status === filter.status));
  }
  renderTaskList();
}

function onFormTypeChip(e) {
  const btn = e.target.closest('[data-type]');
  if (!btn || btn.parentElement.id !== 'form-type-chips') return;
  formType = btn.dataset.type;
  renderFormTypeChips();
}

function onFormDevChip(e) {
  const btn = e.target.closest('[data-dev]');
  if (!btn) return;
  const d = btn.dataset.dev;
  if (formDevs.includes(d)) formDevs = formDevs.filter((x) => x !== d);
  else formDevs.push(d);
  renderFormDevChips();
}

function onSubmit(e) {
  e.preventDefault();
  const data = getFormData();
  if (!data.title) return toast('请填写任务名称');

  if (editingId) {
    const it = items.find((i) => i.id === editingId);
    if (it) {
      Object.assign(it, data);
      toast('已更新');
    }
  } else {
    items.push({
      id: uid(),
      ...data,
      status: '待开发',
      dates: {},
      createdAt: Date.now()
    });
    toast('已添加');
  }
  saveItems();
  closeModal();
  renderTaskList();
}

const SETTINGS_KEY_MAP = { dev: 'developers', project: 'projects', group: 'groups' };

function onSettingsAdd(e) {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  const key = SETTINGS_KEY_MAP[btn.dataset.add];
  const input = document.getElementById(`${btn.dataset.add}-input`);
  const val = input.value.trim();
  if (!val) return toast('请输入内容');
  if (settings[key].includes(val)) return toast('已存在');
  settings[key].push(val);
  saveSettings();
  input.value = '';
  renderSettings();
  toast('已添加');
}

async function onSettingsDel(e) {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  const key = SETTINGS_KEY_MAP[btn.dataset.del];
  const val = btn.dataset.val;
  const ok = await customConfirm(`确认删除「${val}」？`);
  if (!ok) return;
  settings[key] = settings[key].filter((v) => v !== val);
  saveSettings();
  renderSettings();
  toast('已删除');
}

function seedDemoData() {
  if (items.length > 0 || localStorage.getItem(STORE_KEY + '-seeded')) return;
  const now = Date.now();
  items = [
    {
      id: uid(), title: '测试C', type: '普通BUG', status: '测试中',
      project: '默认项目', group: '默认组', developers: ['开发A'], dueDate: '', desc: '',
      createdAt: now, dates: { submitted: now, started: now }
    },
    {
      id: uid(), title: '测试B', type: '线上BUG', status: '已提测',
      project: '默认项目', group: '默认组', developers: ['开发A'], dueDate: '', desc: '',
      createdAt: now, dates: { submitted: now }
    },
    {
      id: uid(), title: '测试A', type: '需求', status: '待开发',
      project: '默认项目', group: '默认组', developers: ['开发A', '开发B', '开发C'], dueDate: '', desc: '描述A',
      createdAt: now - 60000, dates: {}
    }
  ];
  saveItems();
  localStorage.setItem(STORE_KEY + '-seeded', '1');
}

// ---------- 数据备份（导出 / 导入 JSON） ----------
const BACKUP_MAGIC = 'req-tracker-pwa';

function downloadBackup() {
  const backup = {
    app: BACKUP_MAGIC,
    schema: 2,
    exportedAt: Date.now(),
    data: { items, settings }
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  a.href = url;
  a.download = `req-tracker-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已导出 JSON 备份');
}

async function applyBackup(parsed) {
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || !Array.isArray(data.items) || typeof data.settings !== 'object' || data.settings === null) {
    throw new Error('不是有效的备份文件');
  }
  const count = items.length;
  const ok = await customConfirm(
    `导入会用备份覆盖当前 ${count} 条任务与全部设置。\n确定继续？（建议先导出当前备份）`
  );
  if (!ok) return false;
  items = data.items;
  settings = { ...DEFAULT_SETTINGS, ...data.settings };
  saveItems();
  saveSettings();
  renderTaskList();
  renderReports();
  renderSettings();
  toast(`已导入 ${items.length} 条任务`);
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

// ---------- Stats ----------
function renderStats(filtered) {
  const data = filtered || items;
  const typeCounts = {};
  TASK_TYPES.forEach((t) => (typeCounts[t] = data.filter((it) => it.type === t).length));
  const statusCounts = {};
  STATUSES.forEach((s) => (statusCounts[s] = data.filter((it) => it.status === s).length));

  const grid = document.getElementById('stats-grid');
  const bar = document.getElementById('stats-bar');
  const card = document.getElementById('filter-card');
  const btnStats = document.getElementById('btn-toggle-stats');
  const btnFilters = document.getElementById('btn-toggle-filters');
  if (!grid) return;

  const statItems = [
    { label: '全部任务', value: data.length, color: 'var(--primary)' },
    ...TASK_TYPES.map((t) => ({ label: t, value: typeCounts[t], color: `var(--c-${t})` })),
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
function init() {
  seedDemoData();

  // Tabs
  document.querySelectorAll('.tab').forEach((el) => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });

  // FAB + Modal
  document.getElementById('fab').addEventListener('click', () => {
    editingId = null;
    document.getElementById('task-form').reset();
    formType = '需求';
    formDevs = [];
    renderFormTypeChips();
    renderFormDevChips();
    openModal('新增任务');
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  // Form
  document.getElementById('task-form').addEventListener('submit', onSubmit);
  document.getElementById('form-type-chips').addEventListener('click', onFormTypeChip);
  document.getElementById('form-dev-chips').addEventListener('click', onFormDevChip);

  // Filters
  document.getElementById('type-chips').addEventListener('click', onFilterClick);
  document.getElementById('status-chips').addEventListener('click', onFilterClick);
  document.getElementById('search-q').addEventListener('input', (e) => {
    filter.q = e.target.value;
    renderTaskList();
  });

  // 首页统计 / 筛选隐藏展开
  document.getElementById('btn-toggle-stats').addEventListener('click', toggleStats);
  document.getElementById('btn-toggle-filters').addEventListener('click', toggleFilters);

  // Task actions
  document.getElementById('task-list').addEventListener('click', onTaskAction);

  // Settings
  document.getElementById('dev-list').addEventListener('click', onSettingsDel);
  document.getElementById('project-list').addEventListener('click', onSettingsDel);
  document.getElementById('group-list').addEventListener('click', onSettingsDel);
  document.querySelectorAll('[data-add]').forEach((el) => el.addEventListener('click', onSettingsAdd));

  // 数据备份（导出 / 导入 JSON）
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

  switchView('task');
  renderTaskList();
  renderReports();
  renderSettings();
}

document.addEventListener('DOMContentLoaded', init);
