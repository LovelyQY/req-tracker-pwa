/* dayfacts.js — 当日事实聚合层（批次 183）
 *
 * 职责：给定一个日期（YYYY-MM-DD），从「任务 / 待办 / 反馈」三类业务数据中
 *       挑出「当天发生过事情」的记录，并标注当天发生了哪些动作。
 *
 * 设计要点：
 * 1. **多时间点命中**，不是只看 createdAt。一条任务在 3/1 创建、3/5 提测、3/8 上线，
 *    则它在这三天的当日详情里都会出现，且各自标注对应动作标签。
 *    这是「当日详情」的核心语义：回答「这天我干了什么」，而不是「这天建了什么」。
 * 2. **纯函数 + 无 DOM**，便于单元测试；渲染完全交给 app.js。
 * 3. **权限过滤**基于 RT_PERM.getVisibleDeptIds()：
 *    管理员(null) → 全量；否则「本人相关 OR 关联人在可见部门内」。
 *
 * 依赖（全部软依赖，缺失自动降级）：RT_PERM、userList（report-shared.js 全局）。
 */
(function (root) {
  'use strict';

  // ---------- 日期工具 ----------
  function dateKeyOf(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function hhmm(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  // ---------- 动作时间点定义（单一真相源）----------
  // 任务：5 个里程碑，顺序即业务流转顺序
  var TASK_ACTS = [
    { field: 'createdAt',     code: 'create', label: '创建' },
    { field: 'devSubmitTime', code: 'submit', label: '提测' },
    { field: 'testStartTime', code: 'start',  label: '开始测试' },
    { field: 'testEndTime',   code: 'end',    label: '测完' },
    { field: 'onlineTime',    code: 'online', label: '上线' }
  ];

  // 待办：按类型分派不同时间点
  var TODO_ACTS = {
    TASK_ITEM: [
      { field: 'createdAt',    code: 'create',   label: '创建' },
      { field: 'startTime',    code: 'start',    label: '开始' },
      { field: 'completeTime', code: 'complete', label: '完成' }
    ],
    BUG: [
      { field: 'createdAt',    code: 'create',   label: '创建' },
      { field: 'feedbackTime', code: 'feedback', label: '反馈' },
      { field: 'startTime',    code: 'start',    label: '开始' },
      { field: 'completeTime', code: 'complete', label: '修复完成' }
    ],
    MEETING: [
      { field: 'createdAt',    code: 'create',   label: '创建' },
      { field: 'meetingTime',  code: 'meeting',  label: '会议' },
      { field: 'completeTime', code: 'complete', label: '结束' }
    ],
    _default: [
      { field: 'createdAt',    code: 'create',   label: '创建' },
      { field: 'startTime',    code: 'start',    label: '开始' },
      { field: 'completeTime', code: 'complete', label: '完成' }
    ]
  };

  // 给定记录 + 动作定义表 + 目标日期，返回当天命中的动作（按时间升序）
  function hitActs(rec, defs, dateKey) {
    if (!rec || !dateKey) return [];
    var out = [];
    for (var i = 0; i < defs.length; i++) {
      var v = rec[defs[i].field];
      if (v && dateKeyOf(v) === dateKey) {
        out.push({ code: defs[i].code, label: defs[i].label, ts: v, time: hhmm(v) });
      }
    }
    out.sort(function (a, b) { return a.ts - b.ts; });
    return out;
  }

  function matchTask(task, dateKey) { return hitActs(task, TASK_ACTS, dateKey); }
  function matchTodo(todo, dateKey) {
    var defs = TODO_ACTS[todo && todo.typeCode] || TODO_ACTS._default;
    return hitActs(todo, defs, dateKey);
  }
  function matchFeedback(fb, dateKey) {
    if (!fb || !dateKey) return [];
    var out = [];
    if (fb.createdAt && dateKeyOf(fb.createdAt) === dateKey) {
      out.push({ code: 'create', label: '提交', ts: fb.createdAt, time: hhmm(fb.createdAt) });
    }
    if (fb.repliedAt && dateKeyOf(fb.repliedAt) === dateKey) {
      out.push({ code: 'reply', label: '回复', ts: fb.repliedAt, time: hhmm(fb.repliedAt) });
    }
    out.sort(function (a, b) { return a.ts - b.ts; });
    return out;
  }

  // ---------- 权限范围过滤 ----------
  // scope: { deptIds: Set|null, account: string, userId: string }
  //   deptIds === null → 管理员/全量，不过滤
  // 判定：本人创建 OR 本人参与 OR 任一关联人属于可见部门
  function userDeptMap() {
    var map = {};
    var list = root.userList;
    if (Array.isArray(list)) {
      list.forEach(function (u) {
        if (!u) return;
        if (u.id) map[u.id] = u.departmentId || '';
        if (u.account) map['@' + u.account] = u.departmentId || '';
      });
    }
    return map;
  }

  function relatedPeople(rec) {
    var ids = [];
    if (!rec) return ids;
    ['developerIds', 'assigneeIds', 'participantIds'].forEach(function (k) {
      if (Array.isArray(rec[k])) ids = ids.concat(rec[k]);
    });
    ['createdBy', 'updatedBy', 'devSubmitBy', 'testStartBy', 'testEndBy',
      'onlineBy', 'startBy', 'completeBy'].forEach(function (k) {
      if (rec[k]) ids.push('@' + rec[k]);
    });
    return ids;
  }

  function inScope(rec, scope) {
    if (!scope || scope.deptIds === null || scope.deptIds === undefined) return true; // 管理员/降级
    var people = relatedPeople(rec);
    // 无任何关联人信息（历史数据缺审计字段）→ 放行。
    // 宁可多看，不可让用户以为数据丢了；与 buildScope 的失败降级策略一致。
    if (!people.length) return true;
    // 本人相关
    if (scope.account && people.indexOf('@' + scope.account) >= 0) return true;
    if (scope.userId && people.indexOf(scope.userId) >= 0) return true;
    if (!scope.deptIds.size) return false;      // 无部门且非本人 → 不可见
    var dm = scope._deptMap || (scope._deptMap = userDeptMap());
    for (var i = 0; i < people.length; i++) {
      var d = dm[people[i]];
      if (d && scope.deptIds.has(d)) return true;
    }
    return false;
  }

  // 构造 scope。失败一律降级为全量（宁可多看，不可白屏）
  function buildScope(account) {
    var acct = account != null ? account
      : (typeof root.getCurrentUserAccount === 'function' ? root.getCurrentUserAccount() : '');
    var base = { deptIds: null, account: acct || '', userId: '' };
    if (Array.isArray(root.userList)) {
      for (var i = 0; i < root.userList.length; i++) {
        var u = root.userList[i];
        if (u && u.account && u.account === acct) { base.userId = u.id || ''; break; }
      }
    }
    if (!root.RT_PERM || typeof root.RT_PERM.getVisibleDeptIds !== 'function') {
      return Promise.resolve(base);
    }
    return root.RT_PERM.getVisibleDeptIds(acct).then(function (ids) {
      base.deptIds = (ids === null || ids === undefined) ? null : ids;
      return base;
    }).catch(function () { return base; });
  }

  // ---------- 聚合入口 ----------
  // data: { tasks:[], todos:[], feedback:[] }（均为原始记录数组）
  // 返回 { tasks:[{rec,acts}], todos:[{rec,acts}], feedback:[{rec,acts}], counts:{task,todo,feedback,total} }
  function collect(dateKey, data, scope) {
    data = data || {};
    function pick(list, matcher, applyScope) {
      var out = [];
      (Array.isArray(list) ? list : []).forEach(function (rec) {
        var acts = matcher(rec, dateKey);
        if (!acts.length) return;
        if (applyScope && !inScope(rec, scope)) return;
        out.push({ rec: rec, acts: acts, ts: acts[acts.length - 1].ts });
      });
      // 当天最后一个动作时间倒序（最新的动作排前面）
      out.sort(function (a, b) { return b.ts - a.ts; });
      return out;
    }
    var tasks = pick(data.tasks, matchTask, true);
    var todos = pick(data.todos, matchTodo, true);
    var feedback = pick(data.feedback, matchFeedback, false); // 反馈是本人提交的，不做部门过滤
    return {
      tasks: tasks, todos: todos, feedback: feedback,
      counts: {
        task: tasks.length, todo: todos.length, feedback: feedback.length,
        total: tasks.length + todos.length + feedback.length
      }
    };
  }

  root.RT_DAYFACTS = {
    TASK_ACTS: TASK_ACTS,
    TODO_ACTS: TODO_ACTS,
    dateKeyOf: dateKeyOf,
    hhmm: hhmm,
    matchTask: matchTask,
    matchTodo: matchTodo,
    matchFeedback: matchFeedback,
    inScope: inScope,
    buildScope: buildScope,
    collect: collect
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_DAYFACTS;
})(typeof window !== 'undefined' ? window : globalThis);
