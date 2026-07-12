// 需求任务追踪 —— 微信小程序风格 PWA 逻辑
// 数据持久化在 localStorage，离线可用

const STORE_KEY = 'req-tracker-v2-items';
const SETTINGS_KEY = 'req-tracker-v2-settings';
const UI_STATE_KEY = 'req-tracker-v2-ui';
const TASK_TYPES = ['需求', '线上BUG', '普通BUG'];
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
  projectSel.innerHTML = settings.projects
    .filter((p) => p.enabled !== false)
    .map((p) => `<option>${escapeHtml(p.value)}</option>`)
    .join('');
  groupSel.innerHTML = settings.groups
    .filter((g) => g.enabled !== false)
    .map((g) => `<option>${escapeHtml(g.value)}</option>`)
    .join('');
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
  const active = settings.developers.filter((d) => d.enabled !== false);
  if (active.length === 0) {
    wrap.innerHTML = '<span style="font-size:12px;color:var(--muted)">请在「设置」中添加并启用开发人员</span>';
    return;
  }
  wrap.innerHTML = active.map((d) => {
    const on = formDevs.includes(d.value);
    return `<button class="chip ${on ? 'active' : ''}" data-dev="${escapeHtml(d.value)}" type="button">${escapeHtml(d.value)}</button>`;
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
    const dateSpans = [`录入 ${fmtDate(it.createdAt)}`, ...formatTaskDates(it.dates)];

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
          <div class="task-dates">${dateSpans.map((d) => `<span>${d}</span>`).join('')}</div>
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
function getReferenceCount(value, key) {
  if (key === 'dev') return items.filter((it) => it.developers && it.developers.includes(value)).length;
  if (key === 'project') return items.filter((it) => it.project === value).length;
  if (key === 'group') return items.filter((it) => it.group === value).length;
  return 0;
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
  } else if (key === 'group') {
    items.forEach((it) => { if (it.group === oldVal) it.group = newVal; });
  }
  saveSettings();
  saveItems();
}

function renderSettings() {
  const renderList = (id, arr, key) => {
    const el = document.getElementById(id);
    if (!arr.length) {
      el.innerHTML = '<div class="settings-item"><span style="color:var(--muted)">暂无，请在下方输入框添加</span></div>';
      return;
    }
    el.innerHTML = arr.map((item) => {
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
      const refTag = count > 0 ? `<span class="ref-tag">已引用 · ${count}个任务</span>` : '';
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
      // 项目行：左侧选择圆点 + 选中高亮（蓝底白字、编辑按钮变白）
      const isSelected = key === 'project' && settings.selectedProject === v;
      const selectRadio = key === 'project'
        ? `<button class="proj-select ${isSelected ? 'selected' : ''}" data-select="project" data-val="${escapeHtml(v)}" type="button" aria-label="选择项目"></button>`
        : '';
      const cls = 'settings-item settings-item--tappable' + (isSelected ? ' selected' : '');
      return `<div class="${cls}" data-detail="${key}" data-val="${escapeHtml(v)}">
        ${selectRadio}
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
  updateGroupAddHint();
}

// 需求组新增提示：提示将归属到哪个已选项目，未选项目时给出红色警示
function updateGroupAddHint() {
  const hint = document.getElementById('group-add-hint');
  if (!hint) return;
  if (!settings.projects.length) {
    hint.textContent = '⚠️ 请先添加至少一个项目';
    hint.className = 'group-add-hint warn';
  } else if (!settings.selectedProject) {
    hint.textContent = '⚠️ 请先选择一个项目，再新增需求组';
    hint.className = 'group-add-hint warn';
  } else {
    hint.textContent = '📁 新增需求组将归属到「' + settings.selectedProject + '」';
    hint.className = 'group-add-hint';
  }
}

// ---------- 详情弹框 ----------
let detailItem = null; // { key: 'dev'|'project'|'group', value: string, item: object }
let detailExpanded = false;

// 打开详情弹框
function openDetail(key, val) {
  const settingKey = SETTINGS_KEY_MAP[key];
  const arr = settings[settingKey];
  const item = arr.find((x) => x.value === val);
  if (!item) return;
  detailItem = { key, settingKey, value: val, item, refCount: getReferenceCount(val, key) };
  detailExpanded = false;

  // 填充内容
  const overlay = document.getElementById('detail-overlay');
  if (!overlay) return;

  // 标题（名称居中）
  document.getElementById('detail-title').textContent = val;

  // 标签行
  const count = detailItem.refCount;
  document.getElementById('detail-ref-tag').textContent = '已引用 · ' + count + '个任务';
  document.getElementById('detail-ref-tag').style.display = count > 0 ? '' : 'none';
  const badge = document.getElementById('detail-status-badge');
  const isDev = key === 'dev';
  const enabledNow = item.enabled !== false;
  badge.textContent = isDev ? (enabledNow ? '已启用' : '已停用') : (enabledNow ? '进行中' : '已归档');
  badge.className = 'status-badge ' + (isDev ? (enabledNow ? 'on' : 'off') : (enabledNow ? 'dev' : 'arch'));

  // 关联任务列表
  renderDetailTasks();

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
  async del(it, id) {
    const ok = await customConfirm(`确认删除「${it.title}」？`);
    if (!ok) return;
    items = items.filter((i) => i.id !== id);
    saveItems();
    renderTaskList();
    toast('已删除');
  },
  advance(it) {
    const ns = nextStatus(it.status);
    if (!ns) return;
    it.status = ns;
    it.dates = it.dates || {};
    const now = Date.now();
    const dateMap = { '已提测': 'submitted', '测试中': 'started', '已测完': 'completed', '已上线': 'online' };
    if (dateMap[ns]) it.dates[dateMap[ns]] = now;
    saveItems();
    renderTaskList();
    toast(`状态更新为：${ns}`);
  },
  reset(it) {
    it.status = '待开发';
    it.dates = { submitted: null, started: null, completed: null, online: null };
    saveItems();
    renderTaskList();
    toast('已重置为待开发');
  },
  edit(it, id) {
    editingId = id;
    openModal('编辑任务');
    setFormData(it);
  }
};

async function onTaskAction(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const it = items.find((i) => i.id === id);
  if (!it) return;
  const act = btn.dataset.act;
  const handler = TASK_ACTION_HANDLERS[act];
  if (handler) handler(it, id);
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
  if (settings[key].some((x) => x.value === val)) return toast('已存在，请勿重复添加');
  if (key === 'groups') {
    // 新增需求组必须归属某个已选中项目（红色提示已在输入框下方展示，无需 toast）
    if (!settings.selectedProject) { updateGroupAddHint(); return; }
    settings[key].push({ value: val, enabled: true, project: settings.selectedProject });
  } else {
    settings[key].push({ value: val, enabled: true });
  }
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
    const input = document.querySelector(`.settings-item.editing[data-edit="${key}"][data-old="${escapeHtml(val)}"] .edit-input`);
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    return;
  }

  // 保存编辑
  if (btn.dataset.save) {
    const key = btn.dataset.save;
    const oldVal = btn.dataset.old;
    const input = document.querySelector(`.settings-item.editing[data-edit="${key}"][data-old="${escapeHtml(oldVal)}"] .edit-input`);
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

// 项目选择：点击左侧圆点切换「选中项目」（用于需求组归属）
function onProjectSelect(e) {
  const btn = e.target.closest('[data-select]');
  if (!btn) return;
  e.stopPropagation();
  const val = btn.dataset.val;
  // 再次点击已选项目则取消选中
  settings.selectedProject = settings.selectedProject === val ? null : val;
  saveSettings();
  renderSettings();
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
  settings = migrateSettings(data.settings);
  if (!settings.selectedProject && settings.projects.length) settings.selectedProject = settings.projects[0].value;
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

async function onSettingsToggle(e) {
  const btn = e.target.closest('[data-toggle]');
  if (!btn) return;
  const key = SETTINGS_KEY_MAP[btn.dataset.toggle];
  const val = btn.dataset.val;
  const item = settings[key].find((x) => x.value === val);
  if (!item) return;
  if (item.enabled !== false) {
    // 停用前，若已被任务引用则提示
    const count = getReferenceCount(val, key);
    if (count > 0) {
      const ok = await customConfirm(
        `「${val}」已被 ${count} 个任务引用。停用后，新建任务时将无法选择它，但历史任务中的记录仍会保留。`,
        { title: '停用提醒', confirmText: '确认停用', cancelText: '取消', danger: true }
      );
      if (!ok) return;
    }
    item.enabled = false;
    toast('已停用');
  } else {
    item.enabled = true;
    toast('已启用');
  }
  saveSettings();
  renderSettings();
  renderFormOptions();
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
    if (!t || e.target.closest('[data-edit], [data-del], [data-select]')) return;
    openDetail(t.dataset.detail, t.dataset.val);
  });
  // 项目行左侧圆点：选择/取消选中项目（用于需求组归属）
  document.getElementById('project-list').addEventListener('click', onProjectSelect);
  document.getElementById('group-list').addEventListener('click', (e) => {
    const t = e.target.closest('[data-detail]');
    if (!t || e.target.closest('[data-edit], [data-del]')) return;
    openDetail(t.dataset.detail, t.dataset.val);
  });
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

  // 详情弹框事件
  const detailOverlay = document.getElementById('detail-overlay');
  const detailClose = document.getElementById('detail-close');
  const detailTasksHeader = document.getElementById('detail-tasks-header');
  const capsuleDisable = document.getElementById('detail-capsule-disable');
  const capsuleEnable = document.getElementById('detail-capsule-enable');
  if (detailClose) detailClose.addEventListener('click', closeDetail);
  if (detailOverlay) detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) closeDetail(); });
  if (detailTasksHeader) detailTasksHeader.addEventListener('click', toggleDetailTasks);
  if (capsuleDisable) capsuleDisable.addEventListener('click', onCapsuleClick);
  if (capsuleEnable) capsuleEnable.addEventListener('click', onCapsuleClick);

  switchView('task');
  renderTaskList();
  renderReports();
  renderSettings();
}

document.addEventListener('DOMContentLoaded', init);
