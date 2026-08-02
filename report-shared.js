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

// ============ 统一空状态（Batch 223 初版 / Batch 224 升级为彩色填充）============
// 提取「代办暂无」等分散空态为统一组件/样式类，去除 emoji 📭，
// 改用同一套「彩色填充」SVG 图标（Material 实心 path，各场景不同主题色、统一填充风格，
// 类似原 emoji 的观感：有颜色、实心填充），各场景传不同 variant 略有差异。
// 供 app.js（首页任务/代办/流程/通知/统计/反馈/考勤等）与 report-*.js、各基础数据页共用。
// Batch 224：① 由细线描边升级为彩色填充；② 扩展至基础数据/通知等所有页面。
var RT_EMPTY_ICONS = {
  // 默认 / 通用「暂无数据」——收件箱（对应原 emoji 📭，彩色填充）
  box:      { c: '#4C8DFF', p: 'M19 3H4.99C3.88 3 3.01 3.89 3.01 5L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z' },
  // 任务 / 代办：剪贴板
  task:     { c: '#4C8DFF', p: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
  // 缺陷：甲虫（bug_report）
  bug:      { c: '#FF6B6B', p: 'M19.07 4.93L17.66 6.34A8.03 8.03 0 0 1 19 10v1h-3.06A7.97 7.97 0 0 1 13 17.06V20h-2v-2.94A7.97 7.97 0 0 1 8.06 14H5v-1a8.03 8.03 0 0 1 1.34-3.66L4.93 4.93 6.34 3.52 7.75 4.93A8.03 8.03 0 0 1 11 3.76V2h2v1.76a8.03 8.03 0 0 1 3.25.77l1.41-1.41 1.41 1.41zM15 11v1.06A5.98 5.98 0 0 0 13 16.94V18h-2v-1.06A5.98 5.98 0 0 0 9 12.06V11h6zm0-1H9V8h.06A6 6 0 0 0 11 5.06V4h2v1.06A6 6 0 0 0 14.94 8H15v2z' },
  // 会议：日历
  meeting:  { c: '#FFB020', p: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 21c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
  // 流程：分支（account_tree）
  process:  { c: '#A78BFA', p: 'M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v-3h3v3h2v-8h-2zm-9 3H9v-2h4v2zm3-3h-2v-2h2v2z' },
  // 通知：铃铛
  notify:   { c: '#FFB020', p: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z' },
  // 基础数据：存储栈
  data:     { c: '#34C0FA', p: 'M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-2 7h20v-4H2v4zm2-3h2v2H4v-2z' },
  // 统计：柱状图
  stats:    { c: '#34C759', p: 'M5 9.2h3V19H5zM10.6 5h3v14h-3zm5.6 8H19v6h-2.8z' },
  // 反馈：对话气泡
  feedback: { c: '#4C8DFF', p: 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z' },
  // 考勤 / 时间：时钟
  clock:    { c: '#22C2B8', p: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z' },
  // 无结果 / 搜索
  search:   { c: '#9AA5B1', p: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' }
};

// 自带转义兜底（config.js 的 escapeHtml 在两种页面均为全局，但保持防御）
function _rtEsc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// 仅返回 SVG 字符串（供 .pi-home-empty 等非 .empty 容器直接内嵌）
// 彩色填充：svg 设 fill=主题色 + fill-rule=evenodd（Material 实心 path 依赖），
// 各 variant 自带颜色，保证「每个页面稍有区别」且风格统一。
function rtEmptyIcon(variant) {
  var o = RT_EMPTY_ICONS[variant] || RT_EMPTY_ICONS.box;
  return '<svg viewBox="0 0 24 24" fill="' + o.c + '" fill-rule="evenodd" ' +
    'xmlns="http://www.w3.org/2000/svg">' + o.p + '</svg>';
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
