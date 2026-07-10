// ReqTracker —— 需求/任务跟踪 PWA 逻辑
// 数据持久化在 localStorage，离线可用

const STORE_KEY = 'req-tracker-items';
const PRIORITIES = ['低', '中', '高'];
const STATUSES = ['待办', '进行中', '已完成'];

let items = load();
let filter = { status: '全部', priority: '全部', q: '' };
let editingId = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(items));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------- 渲染 ----------
function render() {
  renderStats();
  const list = document.getElementById('list');
  const filtered = items.filter((it) => {
    if (filter.status !== '全部' && it.status !== filter.status) return false;
    if (filter.priority !== '全部' && it.priority !== filter.priority) return false;
    if (filter.q && !(`${it.title} ${it.desc}`.toLowerCase().includes(filter.q.toLowerCase()))) return false;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">暂无需求。在上方添加第一条吧 ✨</div>';
    return;
  }

  list.innerHTML = filtered
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(
      (it) => `
    <div class="item" data-id="${it.id}">
      <div class="top">
        <h3>${escapeHtml(it.title)}</h3>
        <span class="badge s-${it.status}">${it.status}</span>
      </div>
      ${it.desc ? `<p>${escapeHtml(it.desc)}</p>` : ''}
      <div class="meta">
        <span class="badge p-${it.priority}">优先级 ${it.priority}</span>
        <span style="font-size:12px;color:var(--muted)">${fmtDate(it.createdAt)}</span>
      </div>
      <div class="actions">
        <button class="btn sm" data-act="cycle" data-id="${it.id}">切换状态</button>
        <button class="btn sm ghost" data-act="edit" data-id="${it.id}">编辑</button>
        <button class="btn sm danger" data-act="del" data-id="${it.id}">删除</button>
      </div>
    </div>`
    )
    .join('');
}

function renderStats() {
  const total = items.length;
  const doing = items.filter((i) => i.status === '进行中').length;
  const done = items.filter((i) => i.status === '已完成').length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-doing').textContent = doing;
  document.getElementById('stat-done').textContent = done;
}

// ---------- 事件 ----------
function onSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('f-title').value.trim();
  const desc = document.getElementById('f-desc').value.trim();
  const priority = document.getElementById('f-priority').value;
  const status = document.getElementById('f-status').value;
  if (!title) return toast('请填写标题');

  if (editingId) {
    const it = items.find((i) => i.id === editingId);
    if (it) Object.assign(it, { title, desc, priority, status });
    toast('已更新');
  } else {
    items.push({ id: uid(), title, desc, priority, status, createdAt: Date.now() });
    toast('已添加');
  }
  save();
  resetForm();
  render();
}

function onListClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const it = items.find((i) => i.id === id);
  if (!it) return;
  const act = btn.dataset.act;

  if (act === 'del') {
    if (confirm(`确认删除「${it.title}」？`)) {
      items = items.filter((i) => i.id !== id);
      save();
      render();
      toast('已删除');
    }
  } else if (act === 'cycle') {
    const idx = STATUSES.indexOf(it.status);
    it.status = STATUSES[(idx + 1) % STATUSES.length];
    save();
    render();
  } else if (act === 'edit') {
    editingId = id;
    document.getElementById('f-title').value = it.title;
    document.getElementById('f-desc').value = it.desc;
    document.getElementById('f-priority').value = it.priority;
    document.getElementById('f-status').value = it.status;
    document.getElementById('submit-btn').textContent = '保存修改';
    document.getElementById('cancel-btn').style.display = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function resetForm() {
  editingId = null;
  document.getElementById('form').reset();
  document.getElementById('f-status').value = '待办';
  document.getElementById('f-priority').value = '中';
  document.getElementById('submit-btn').textContent = '添加需求';
  document.getElementById('cancel-btn').style.display = 'none';
}

function onFilter() {
  filter.status = document.getElementById('fl-status').value;
  filter.priority = document.getElementById('fl-priority').value;
  filter.q = document.getElementById('fl-q').value;
  render();
}

// ---------- 工具 ----------
function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- 初始化 ----------
function init() {
  document.getElementById('form').addEventListener('submit', onSubmit);
  document.getElementById('list').addEventListener('click', onListClick);
  document.getElementById('cancel-btn').addEventListener('click', resetForm);
  ['fl-status', 'fl-priority', 'fl-q'].forEach((id) =>
    document.getElementById(id).addEventListener('input', onFilter)
  );

  // 演示数据（仅首次且无数据时）
  if (items.length === 0 && !localStorage.getItem(STORE_KEY + '-seeded')) {
    items = [
      { id: uid(), title: '示例：实现需求列表页', desc: '展示所有需求，支持筛选与状态切换。', priority: '高', status: '进行中', createdAt: Date.now() - 3600e3 },
      { id: uid(), title: '示例：支持离线访问', desc: '通过 Service Worker 缓存应用壳。', priority: '中', status: '待办', createdAt: Date.now() - 1800e3 }
    ];
    save();
    localStorage.setItem(STORE_KEY + '-seeded', '1');
  }
  render();
}

document.addEventListener('DOMContentLoaded', init);
