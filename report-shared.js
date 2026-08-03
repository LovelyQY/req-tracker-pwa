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

// ============ 统一空状态（批次225：统一回退为邮箱 emoji 📭，可经图标管理配置）============
// 此前批次223 用细线描边、批次224 升级为彩色填充（按 variant 区分场景：box/task/bug/... 各色），
// 现按需求统一回退为单个 emoji 📭（对应原「邮箱 📭」观感），并注册为 page-icons 的
// 'empty' 默认 key，使其可在「图标管理」页显示 / 编辑 / 覆盖。渲染统一走
// config.js 的 getEmptyIconHtml()，忽略 variant，保证「全局一致」。
// 供 app.js（首页任务/代办/流程/通知/统计/反馈/考勤等）与 report-*.js、各基础数据页共用。
function _rtEsc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// 仅返回空状态图标 SVG 字符串（供 .pi-home-empty 等非 .empty 容器直接内嵌）
// 批次225：忽略 variant，全局统一为 📭；优先读图标管理覆盖层，缺失回退默认 emoji。
function rtEmptyIcon(variant) {
  if (typeof getEmptyIconHtml === 'function') return getEmptyIconHtml();
  if (typeof window !== 'undefined' && window.getEmptyIconHtml) return window.getEmptyIconHtml();
  // 兜底（隔离测试环境未加载 config.js）：直接返回默认 emoji SVG
  return '<svg viewBox="0 0 24 24" width="22" height="22"><text x="12" y="17" font-size="18" text-anchor="middle">📭</text></svg>';
}

// 返回标准空状态块：<div class="empty"><div class="empty-icon">SVG</div>文案</div>
function rtEmptyState(text, variant) {
  return '<div class="empty"><div class="empty-icon">' + rtEmptyIcon(variant) +
    '</div>' + _rtEsc(text == null ? '' : text) + '</div>';
}

// ============ 暴露（供主应用直接调用全局名，或经 RT_REPORT_COMMON 透传）============
window.RT_EMPTY_STATE = {
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
