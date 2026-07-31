// dict-init.js —— 字典预取 / 状态·类型·优先级 查找与设置（批次133 从 app.js 抽取）
// 仅抽取「纯查找 / 设置」函数；共享可变状态（TASK_TYPE_LIST / versionList 等）仍保留在 app.js，
// 本文件在 index.html 中于 app.js 之前加载，函数均为全局，运行时调用不受影响。
// 与 report-common.js / report-task.js 内的 statusName 互不影响（后者位于各自 IIFE 内，非全局）。

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

function resolveTypeName(code, fallbackType) {
  if (code && TYPE_CODE_TO_NAME[code]) return TYPE_CODE_TO_NAME[code];
  return fallbackType || code || '';
}

function resolveTypeColor(code) {
  return (code && TYPE_CODE_TO_COLOR[code]) || '#8c8c8c';
}

function setTodoTypeList(list) {
  TODO_TYPE_LIST = Array.isArray(list) ? list.slice() : [];
  TODO_TYPE_CODE_TO_COLOR = {};
  TODO_TYPE_LIST.forEach(function (t) {
    if (!t || !t.code) return;
    if (t.color) TODO_TYPE_CODE_TO_COLOR[t.code] = t.color;
  });
}

function resolveTodoTypeColor(code) {
  return (code && TODO_TYPE_CODE_TO_COLOR[code]) || '#8c8c8c';
}

function setPriorityList(list) {
  priorityList = Array.isArray(list) ? list.slice() : [];
}

function setProjectList(list) { projectList = Array.isArray(list) ? list : []; }


function setVersionList(list) { versionList = Array.isArray(list) ? list : []; }


function setUserList(list) { userList = Array.isArray(list) ? list : []; }


// 状态名：字典驱动（单一真相源 = dictionary.js 的 TASK_STATUS 种子）。
// 启动由 ensureStatuses()（app.js）把 TASK_STATUS 读入内存映射 STATUS_CODE_TO_NAME；
// statusName 仅查该映射，找不到时回退 code（极简兜底，不再硬编码中文映射）。
let STATUS_CODE_TO_NAME = {};
function setStatusNameMap(list) {
  STATUS_CODE_TO_NAME = {};
  (Array.isArray(list) ? list : []).forEach(function (s) {
    if (s && s.code) STATUS_CODE_TO_NAME[s.code] = s.name;
  });
}

function statusName(code) {
  if (!code) return '';
  return STATUS_CODE_TO_NAME[code] || String(code);
}

function versionsByProject(projectId) {
  if (!projectId) return versionList;
  return versionList.filter(function (v) { return v && v.projectId === projectId; });
}

function statusForOp(o) {
  if (o.status) return o.status;
  const m = {
    '创建': '待开发', '编辑': null, '删除': '删除', '重置': '待开发',
    '暂停': '暂停中', '恢复': '测试中', '开发提交': '已提测',
    '测试开始': '测试中', '测试完成': '已测完', '上线': '已上线', '推进': null
  };
  return (o.action && m[o.action] !== undefined) ? m[o.action] : null;
}

function lifeColor(status) {
  if (!status) return '#94a3b8';
  return `var(--c-${status})`;
}

function TODO_STATUS_DICT(code) {
  const SEED = (typeof window !== 'undefined' && window.RT_DICT && window.RT_DICT.SEED_TYPE) || {};
  const MAP = {
    TASK_ITEM: SEED.TODO_STATUS || 'TODO_STATUS',
    BUG: SEED.BUG_STATUS || 'BUG_STATUS',
    MEETING: SEED.MEETING_STATUS || 'MEETING_STATUS'
  };
  return MAP[code] || 'TODO_STATUS';
}
