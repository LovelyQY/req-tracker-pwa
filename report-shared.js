/* report-shared.js — 名称映射 / 日期格式化 共享（批次130）
 * 被 app.js（主应用 index.html / index-nosw.html）与 report-common.js（报表页）共同复用，
 * 消除两份独立实现的逻辑重复。
 *
 * 数据源一致：RT_DICT / RT_PROJECTS / RT_PROJECT_VERSIONS / RT_USERS。
 *   - 主应用通过 ensure*（app.js）填充下方共享全局存储；
 *   - 报表页通过 report-common.loadReportData 填充同一共享全局存储。
 * 两应用页面互不加载，故共享存储无并发冲突。
 *
 * 仅抽取「行为两文件完全一致」的函数；statusName / normalizeTask 因主应用与报表页对
 * PAUSED 状态口径不同（app 无 PAUSED / 报表含 PAUSED→暂停中），各自本地保留（见 app.js /
 * report-common.js 注释），不纳入共享，确保零行为变更。
 *
 * fmtDate 行为两文件不同（app.js 含时分、report-common 仅日期），亦不纳入共享。
 */

// ============ 共享存储（全局，由主应用 ensure* 或报表页 loadReportData 填充）============
var priorityList = [];
var projectList = [];
var versionList = [];
var userList = [];

function priorityName(code) {
  for (var i = 0; i < priorityList.length; i++) { if (priorityList[i] && priorityList[i].code === code) return priorityList[i].name; }
  return code || '';
}
function projectNameById(id) {
  for (var i = 0; i < projectList.length; i++) { if (projectList[i] && projectList[i].id === id) return projectList[i].projectName; }
  return id || '';
}
function versionNameById(id) {
  for (var i = 0; i < versionList.length; i++) { if (versionList[i] && versionList[i].id === id) return versionList[i].versionName; }
  return id || '';
}
function userNicknamesByIds(ids) {
  if (!ids || !ids.length) return [];
  return ids.map(function (id) {
    for (var i = 0; i < userList.length; i++) { if (userList[i] && userList[i].id === id) return userList[i].nickname || userList[i].name || id; }
    return id;
  });
}

// 日期+时间（如 2024-01-02 13:45），供任务/待办卡片时间标签使用
function fmtDateTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  var hh = ('0' + d.getHours()).slice(-2);
  var mm = ('0' + d.getMinutes()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day + ' ' + hh + ':' + mm;
}

// ============ 统一空状态（Batch 223：首页空状态统一）============
// 提取「代办暂无」等分散空态为统一组件/样式类，去除 emoji 📭，
// 改用同一套线条风格 SVG 图标（Feather 同款 path，stroke-width 1.5、currentColor），
// 各场景可传不同 variant 略有差异。供 app.js（首页任务/代办/流程）与 report-*.js 共用。
var RT_EMPTY_ICONS = {
  // 默认 / 通用「暂无数据」
  box:
    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/>' +
    '<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  // 任务 / 代办：剪贴板 + 勾
  task:
    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
    '<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>' +
    '<path d="M9 12l2 2 4-4"/>',
  // 缺陷：甲虫
  bug:
    '<rect x="8" y="6" width="8" height="14" rx="4"/>' +
    '<path d="M12 2v4M5 7l3 3M19 7l-3 3M5 12h3M16 12h3M5 19l3-3M19 19l-3-3"/>',
  // 会议：日历
  meeting:
    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
    '<path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"/>',
  // 流程：分支
  process:
    '<line x1="6" y1="3" x2="6" y2="15"/>' +
    '<circle cx="18" cy="6" r="3"/>' +
    '<circle cx="6" cy="18" r="3"/>' +
    '<path d="M18 9a9 9 0 0 1-9 9"/>'
};

// 自带转义兜底（config.js 的 escapeHtml 在两种页面均为全局，但保持防御）
function _rtEsc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// 仅返回 SVG 字符串（供 .pi-home-empty 等非 .empty 容器直接内嵌）
function rtEmptyIcon(variant) {
  var p = RT_EMPTY_ICONS[variant] || RT_EMPTY_ICONS.box;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
}

// 返回标准空状态块：<div class="empty"><div class="empty-icon">SVG</div>文案</div>
function rtEmptyState(text, variant) {
  return '<div class="empty"><div class="empty-icon">' + rtEmptyIcon(variant) +
    '</div>' + _rtEsc(text == null ? '' : text) + '</div>';
}

// ============ 暴露（供主应用直接调用全局名，或经 RT_REPORT_COMMON 透传）============
window.RT_EMPTY_STATE = {
  ICONS: RT_EMPTY_ICONS,
  icon: rtEmptyIcon,
  state: rtEmptyState
};
window.RT_NAME_MAPS = {
  priorityName: priorityName,
  projectNameById: projectNameById,
  versionNameById: versionNameById,
  userNicknamesByIds: userNicknamesByIds,
  fmtDateTime: fmtDateTime
};
