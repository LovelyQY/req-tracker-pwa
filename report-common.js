// report-common.js —�? 统计报表共享逻辑（批�? 39 抽取�?
// �? report-task / report-todo / report-bug / report-meeting 各独立页复用�?
// 纯工�? + 共享数据层（字典/实体预取 + 名称映射�?+ todos 卡片（无操作按钮，补�? A）�?
(function (root) {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ============ 共享缓存（由 loadReportData 统一填充�? ============
  var TASK_TYPE_LIST = [], TYPE_CODE_TO_NAME = {}, TYPE_CODE_TO_COLOR = {};
  var priorityList = [], projectList = [], versionList = [], userList = [];
  var allTasks = [], allTodos = [];
  var BUG_STATUS_LIST = [], BUG_STATUS_CODE_TO_NAME = {}, BUG_STATUS_CODE_TO_COLOR = {};
  var TODO_STATUS_LIST = [], TODO_STATUS_CODE_TO_NAME = {}, TODO_STATUS_CODE_TO_COLOR = {};
  var MEETING_STATUS_LIST = [], MEETING_STATUS_CODE_TO_NAME = {}, MEETING_STATUS_CODE_TO_COLOR = {};
  // 批次74：代办操作码 �? 中文名（供单行灰时间标签 OP_NAME[opCode] + '时间' 使用�?
  var TODO_OPERATION_CODE_TO_NAME = {};
  var dataReady = false;

  // 任务状�? code �? 中文（固定映射）
  var STATUS_NAME = { TODO: '待开�?', SUBMITTED: '已提�?', TESTING: '测试�?', TESTED: '已测�?', ONLINE: '已上�?', PAUSED: '暂停�?' };

  function statusName(code) { return STATUS_NAME[code] || (code || ''); }
  function typeName(code) { return TYPE_CODE_TO_NAME[code] || (code || ''); }
  function typeColor(code) { return TYPE_CODE_TO_COLOR[code] || '#8c8c8c'; }
  function priorityName(code) { for (var i = 0; i < priorityList.length; i++) { if (priorityList[i] && priorityList[i].code === code) return priorityList[i].name; } return code || ''; }
  function projectNameById(id) { for (var i = 0; i < projectList.length; i++) { if (projectList[i] && projectList[i].id === id) return projectList[i].projectName; } return id || ''; }
  function versionNameById(id) { for (var i = 0; i < versionList.length; i++) { if (versionList[i] && versionList[i].id === id) return versionList[i].versionName; } return id || ''; }
  // 批次61：关联任务名（遍历已加载 allTasks，raw 记录�? taskName；与待办卡片 resolveTodoRowExtras 等价�?
  function taskNameById(id) { if (!id) return ''; for (var i = 0; i < allTasks.length; i++) { if (allTasks[i] && allTasks[i].id === id) return allTasks[i].taskName || allTasks[i].title || id; } return id; }
  function userNicknamesByIds(ids) {
    if (!ids || !ids.length) return [];
    return ids.map(function (id) {
      for (var i = 0; i < userList.length; i++) { if (userList[i] && userList[i].id === id) return userList[i].nickname || userList[i].name || id; }
      return id;
    });
  }

  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // 日期+时间（如 2024-01-02 13:45），供导出PDF表格使用
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

  // ============ 时间筛选（任务统计：测试开�?/结束时间�? ============
  function inPeriod(t, f) {
    if (!t) return false;
    var d = new Date(t);
    if (d.getFullYear() !== f.year) return false;
    if (f.dim === 'quarter') {
      if (f.quarter !== 'all' && Math.floor(d.getMonth() / 3) + 1 !== f.quarter) return false;
    } else if (f.dim === 'month') {
      if (f.month !== 'all' && d.getMonth() + 1 !== f.month) return false;
    }
    return true;
  }
  // 任务：测试开�?/结束任一落在范围内即计入
  function periodMatch(it, f) {
    if (f.year === 'all') return true;
    var ds = it.dates || {};
    return inPeriod(ds.started, f) || inPeriod(ds.completed, f);
  }

  // todos 候选时间（补充 B 前口径；批次 41�?43 将收紧为单字段）
  function todoCandidateDates(t) {
    return [t.createdAt, t.feedbackTime, t.meetingTime, t.startTime, t.completeTime, t.handoffTime, t.onlineTime].filter(function (x) { return x; });
  }
  function periodMatchByDates(dates, f) {
    if (f.year === 'all') return true;
    for (var i = 0; i < dates.length; i++) { if (inPeriod(dates[i], f)) return true; }
    return false;
  }

  // ============ 任务归一化（requirement_tasks�? ============
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
        started: t.testStartTime || null,
        completed: t.testEndTime || null,
        online: t.onlineTime || null
      },
      raw: t
    };
  }

  // ============ 工时估算 ============
  function estimateWorkHours(start, end) {
    var FULL_DAY = 8;
    var s = new Date(start), e = new Date(end);
    var firstOnly = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    var lastOnly = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    if (firstOnly.getTime() === lastOnly.getTime()) return Math.max(0, (e - s) / 3600000);
    var h = 0;
    var day = new Date(firstOnly);
    while (day.getTime() <= lastOnly.getTime()) {
      var dow = day.getDay();
      if (dow === 0 || dow === 6) { day.setDate(day.getDate() + 1); continue; }
      if (day.getTime() === firstOnly.getTime()) {
        var fe = new Date(s); fe.setHours(17, 30, 0, 0);
        h += Math.max(0, (fe - s) / 3600000);
      } else if (day.getTime() === lastOnly.getTime()) {
        var ls = new Date(e); ls.setHours(8, 0, 0, 0);
        h += Math.max(0, (e - ls) / 3600000);
      } else {
        h += FULL_DAY;
      }
      day.setDate(day.getDate() + 1);
    }
    return h;
  }
  function taskWorkHours(it) {
    var d = it.dates || {};
    if (!d.started) return 0;
    var endRaw = d.completed || Date.now();
    return Math.max(0, estimateWorkHours(d.started, endRaw));
  }

  // ============ 通用渲染工具 ============
  function setNumColor(id, c) { var el = document.getElementById(id); if (el) el.style.color = c; }

  function renderBars(elId, rows, colorMap, opts) {
    opts = opts || {};
    var showHours = !!opts.showHours;
    var totalH = opts.totalHours || 0;
    var box = document.getElementById(elId);
    if (!box) return;
    var max = 1;
    rows.forEach(function (r) { if (r.n > max) max = r.n; });
    box.innerHTML = rows.map(function (r) {
      var pct = r.n === 0 ? 0 : Math.max(6, Math.round((r.n / max) * 100));
      var color = colorMap[r.key] || 'var(--primary)';
      var tail = '<span class="bar-num">' + r.n + '</span>';
      if (showHours) {
        var rh = Math.round(r.h * 10) / 10;
        var hDisp = r.n === 0 ? '0.0H' : (rh <= 0 ? '0.1H' : rh.toFixed(1) + 'H');
        var denom = (r.pctOf != null) ? r.pctOf : totalH;
        var pp = (denom > 0 && r.h > 0) ? Math.round((r.h / denom) * 100) : 0;
        tail += '<span class="bar-hours">' + hDisp + '</span><span class="bar-pct">' + pp + '%</span>';
      }
      return '<div class="bar-row">' +
        '<span class="bar-label">' + escapeHtml(r.label) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%;background:' + color + '"></span></span>' +
        tail +
      '</div>';
    }).join('');
  }

  function buildTimeValueRow(box, filter, years, onFilterChange) {
    if (!box) return;
    var hid = box.id;
    var html = '<select class="rf-select" id="' + hid + '-year" aria-label="年份"><option value="all">全部年份</option>';
    years.forEach(function (y) { html += '<option value="' + y + '">' + y + ' �?</option>'; });
    html += '</select>';
    if (filter.dim === 'quarter') {
      html += '<select class="rf-select" id="' + hid + '-quarter" aria-label="季度"><option value="all">全部季度</option>';
      for (var q = 1; q <= 4; q++) html += '<option value="' + q + '">�? ' + q + ' 季度</option>';
      html += '</select>';
    } else if (filter.dim === 'month') {
      html += '<select class="rf-select" id="' + hid + '-month" aria-label="月份"><option value="all">全部月份</option>';
      for (var m = 1; m <= 12; m++) html += '<option value="' + m + '">' + m + ' �?</option>';
      html += '</select>';
    }
    box.innerHTML = html;
    var yEl = document.getElementById(hid + '-year');
    if (yEl) {
      if (filter.year !== 'all' && years.indexOf(filter.year) === -1) filter.year = 'all';
      yEl.value = String(filter.year);
      yEl.addEventListener('change', function () { filter.year = yEl.value === 'all' ? 'all' : Number(yEl.value); onFilterChange(); });
    }
    var qEl = document.getElementById(hid + '-quarter');
    if (qEl) { qEl.value = String(filter.quarter); qEl.addEventListener('change', function () { filter.quarter = qEl.value === 'all' ? 'all' : Number(qEl.value); onFilterChange(); }); }
    var mEl = document.getElementById(hid + '-month');
    if (mEl) { mEl.value = String(filter.month); mEl.addEventListener('change', function () { filter.month = mEl.value === 'all' ? 'all' : Number(mEl.value); onFilterChange(); }); }
  }

  function wireTimeSeg(segId, filter, onDimChange) {
    var seg = document.getElementById(segId);
    if (!seg) return;
    seg.querySelectorAll('.rf-tab').forEach(function (el) {
      el.addEventListener('click', function () {
        seg.querySelectorAll('.rf-tab').forEach(function (t) { t.classList.toggle('is-active', t === el); });
        filter.dim = el.dataset.dim;
        onDimChange();
      });
    });
  }

  function renderProjectBars(elId, items, donePred, labelOf) {
    var box = document.getElementById(elId);
    if (!box) return;
    if (!items || !items.length) { box.innerHTML = '<div class="rm-empty">该范围暂无数�?</div>'; return; }
    var groups = {};
    items.forEach(function (it) {
      var pid = it.projectId || '';
      if (!groups[pid]) groups[pid] = { pid: pid, total: 0, done: 0 };
      groups[pid].total++;
      if (donePred(it)) groups[pid].done++;
    });
    var arr = Object.keys(groups).map(function (k) { return groups[k]; });
    arr.sort(function (a, b) { return b.total - a.total; });
    var max = 1; arr.forEach(function (g) { if (g.total > max) max = g.total; });
    box.innerHTML = arr.map(function (g) {
      var pct = g.total === 0 ? 0 : Math.round((g.done / g.total) * 100);
      var w = g.total === 0 ? 0 : Math.max(6, Math.round((g.done / g.total) * 100));
      return '<div class="bar-row">' +
        '<span class="bar-label">' + escapeHtml(labelOf(g.pid)) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + w + '%;background:#52c41a"></span></span>' +
        '<span class="bar-num">' + g.done + '/' + g.total + (pct ? ' · ' + pct + '%' : '') + '</span>' +
      '</div>';
    }).join('');
  }

  // ============ 共享数据预取（字�? + 实体表） ============
  function loadReportData() {
    if (dataReady) return Promise.resolve();
    var account = (typeof getSessionAccount === 'function') ? (getSessionAccount() || 'system') : 'system';

    // ����93��������Ȩ�޷�Χ����
    var deployDataScope = (typeof RT_CONFIG !== 'undefined' && RT_CONFIG.featureFlags && RT_CONFIG.featureFlags.dataPermission
      && typeof RT_PERM !== 'undefined' && typeof RT_PERM.getDataScopeFilter === 'function');
    var deptFilterP = deployDataScope ? RT_PERM.getDataScopeFilter(account) : Promise.resolve(null);

    return deptFilterP.then(function (deptFilter) {
    var tasks = [];
    tasks.push(Promise.resolve()
      .then(function () { return (root.RT_DICT && RT_DICT.seedDict) ? RT_DICT.seedDict(account) : null; })
      .catch(function () { return null; }));
    if (root.RT_DICT && RT_DICT.getDictByType && RT_DICT.SEED_TYPE) {
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TASK_TYPE).then(function (list) {
        TASK_TYPE_LIST = Array.isArray(list) ? list : [];
        TASK_TYPE_LIST.forEach(function (t) { if (t && t.code) { TYPE_CODE_TO_NAME[t.code] = t.name; if (t.color) TYPE_CODE_TO_COLOR[t.code] = t.color; } });
      }).catch(function () { TASK_TYPE_LIST = []; }));
      // 批次64：补�? TODO_TYPE（事�?/缺陷/会议）到类型映射，避免报表清单卡片类型色条回落灰�?
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TODO_TYPE).then(function (list) {
        (Array.isArray(list) ? list : []).forEach(function (t) { if (t && t.code) { TYPE_CODE_TO_NAME[t.code] = t.name; if (t.color) TYPE_CODE_TO_COLOR[t.code] = t.color; } });
      }).catch(function () {}));
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.PRIORITY).then(function (list) { priorityList = Array.isArray(list) ? list : []; }).catch(function () { priorityList = []; }));
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.BUG_STATUS).then(function (list) {
        BUG_STATUS_LIST = Array.isArray(list) ? list : [];
        BUG_STATUS_LIST.forEach(function (t) { if (t && t.code) { BUG_STATUS_CODE_TO_NAME[t.code] = t.name; if (t.color) BUG_STATUS_CODE_TO_COLOR[t.code] = t.color; } });
      }).catch(function () { BUG_STATUS_LIST = []; }));
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TODO_STATUS).then(function (list) {
        TODO_STATUS_LIST = Array.isArray(list) ? list : [];
        TODO_STATUS_LIST.forEach(function (t) { if (t && t.code) { TODO_STATUS_CODE_TO_NAME[t.code] = t.name; if (t.color) TODO_STATUS_CODE_TO_COLOR[t.code] = t.color; } });
      }).catch(function () { TODO_STATUS_LIST = []; }));
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.MEETING_STATUS).then(function (list) {
        MEETING_STATUS_LIST = Array.isArray(list) ? list : [];
        MEETING_STATUS_LIST.forEach(function (t) { if (t && t.code) { MEETING_STATUS_CODE_TO_NAME[t.code] = t.name; if (t.color) MEETING_STATUS_CODE_TO_COLOR[t.code] = t.color; } });
      }).catch(function () { MEETING_STATUS_LIST = []; }));
      // 批次74：代办操作码 �? 中文名（供单行灰时间标签 OP_NAME[opCode] + '时间' 使用�?
      tasks.push(RT_DICT.getDictByType(RT_DICT.SEED_TYPE.TODO_OPERATION).then(function (list) {
        (Array.isArray(list) ? list : []).forEach(function (t) { if (t && t.code) { TODO_OPERATION_CODE_TO_NAME[t.code] = t.name; } });
      }).catch(function () {}));
    }
    if (root.RT_PROJECTS && RT_PROJECTS.getAllProjects) tasks.push(RT_PROJECTS.getAllProjects(deptFilter).then(function (l) { projectList = Array.isArray(l) ? l : []; }).catch(function () { projectList = []; }));
    if (root.RT_PROJECT_VERSIONS && RT_PROJECT_VERSIONS.getAllProjectVersions) tasks.push(RT_PROJECT_VERSIONS.getAllProjectVersions().then(function (l) { versionList = Array.isArray(l) ? l : []; }).catch(function () { versionList = []; }));
    if (root.RT_USERS && RT_USERS.getAllUsers) tasks.push(RT_USERS.getAllUsers(deptFilter).then(function (l) { userList = Array.isArray(l) ? l : []; }).catch(function () { userList = []; }));
    if (root.RT_REQUIREMENT_TASKS && RT_REQUIREMENT_TASKS.getAllRequirementTasks) tasks.push(RT_REQUIREMENT_TASKS.getAllRequirementTasks(deptFilter).then(function (l) { allTasks = Array.isArray(l) ? l : []; }).catch(function () { allTasks = []; }));
    if (root.RT_TODOS && RT_TODOS.getAllTodos) tasks.push(RT_TODOS.getAllTodos().then(function (l) { allTodos = Array.isArray(l) ? l : []; }).catch(function () { allTodos = []; }));
    // 批次70/76：拉取全部生命周期流水并�? todoId 分组，为每张清单卡片附加单行灰时间所需的状态操作行（statusOpLine�?
    var lcTask = (root.RT_TODO_LIFECYCLES && RT_TODO_LIFECYCLES.getAllGroupedByTodoId)
      ? RT_TODO_LIFECYCLES.getAllGroupedByTodoId().then(function (map) {
          (allTodos || []).forEach(function (t) {
            t.statusOpLine = (root.RT_TODO_LIFECYCLES && RT_TODO_LIFECYCLES.getStatusOpLine)
              ? RT_TODO_LIFECYCLES.getStatusOpLine(t, map[t.id] || []) : null;
          });
        }).catch(function () {})
      : Promise.resolve();
    return Promise.all(tasks.concat([lcTask])).then(function () {
      // ����93��todos ����Ŀ���Ź��ˣ�getAllTodos δֱ��֧�� deptFilter�����ù��ˣ�
      if (deptFilter instanceof Set) {
        var projDept = {};
        projectList.forEach(function (p) { projDept[p.id] = p.deptId || ''; });
        allTodos = allTodos.filter(function (t) { return deptFilter.has(projDept[t.projectId] || ''); });
      }
      dataReady = true;
    });
    }); // deptFilterP.then
  }

  // ============ 补充 A：todos 卡片（无操作按钮），批次 41�?43 复用 ============
  function buildTodoCardHtml(t) {
    var typeCode = t.typeCode || '';
    var statusCode = t.statusCode || '';
    var sName = '', color = '#8c8c8c';
    if (typeCode === 'BUG') { sName = BUG_STATUS_CODE_TO_NAME[statusCode] || statusCode; color = BUG_STATUS_CODE_TO_COLOR[statusCode] || color; }
    else if (typeCode === 'MEETING') { sName = MEETING_STATUS_CODE_TO_NAME[statusCode] || statusCode; color = MEETING_STATUS_CODE_TO_COLOR[statusCode] || color; }
    else { sName = TODO_STATUS_CODE_TO_NAME[statusCode] || statusCode; color = TODO_STATUS_CODE_TO_COLOR[statusCode] || color; }
    // 批次59：标题取法对齐首页待办卡片（MEETING=name，其�?=desc）；修复�? t.title/t.taskName 对待办记录永远为空→�?(无标�?)�?
    var title = typeCode === 'MEETING' ? (t.name || '未命名会�?') : (t.desc || '无描�?');
    // 批次59：类型色条（复用 .task-card::before，需 --type-color�?
    var typeColorVal = typeColor(typeCode) || '#8c8c8c';
    var proj = projectNameById(t.projectId);
    var ver = versionNameById(t.projectVersionId);
    // 批次59：语义化时间（对齐待办卡片时间口径，标签统一用「：」）
    // 批次60：事�?(TASK_ITEM) 专属——开发人（dev 标签置于版本之后、时间之前，与待办卡片顺序一致）
    // 批次61：缺�?(BUG) 专属——关联任务名 + 反馈(�?/时间)；反馈时间并入反馈标签，故不再单独出时间�?
    // 批次62：会�?(MEETING) 专属——会议地点（置于时间之后，与待办卡片「时间→地点」顺序一致）
    var typeExtra = '';   // 置于版本之后、时间之�?
    var typeExtraAfter = ''; // 置于时间之后
    if (typeCode === 'TASK_ITEM') {
      var devs = userNicknamesByIds(t.relatedDevIds);
      var devText = (devs && devs.length) ? devs.join('�?') : '未指�?';
      typeExtra = '<span class="tag dev">开发：' + escapeHtml(devText) + '</span>';
    } else if (typeCode === 'BUG') {
      var relTask = taskNameById(t.relatedTaskId) || (t.relatedTaskId ? '未知任务' : '无关�?');
      var fb = [t.feedbackBy, fmtDateTime(t.feedbackTime)].filter(Boolean).join(' ');
      typeExtra = '<span class="tag proj">任务�?' + escapeHtml(relTask) + '</span>' +
        (fb ? '<span class="tag grp">反馈�?' + escapeHtml(fb) + '</span>' : '');
    } else if (typeCode === 'MEETING') {
      if (t.location) typeExtraAfter = '<span class="tag proj">地点�?' + escapeHtml(t.location) + '</span>';
    }
    var timeText = '', timeLabel = '';
    if (typeCode === 'MEETING') { timeText = fmtDateTime(t.meetingTime); timeLabel = '会议时间�?'; }
    else if (typeCode === 'BUG') { timeText = ''; timeLabel = ''; } // 反馈时间已并�? typeExtra 反馈标签
    else { var s = fmtDateTime(t.startTime), c = fmtDateTime(t.completeTime); timeText = [s, c].filter(Boolean).join(' ~ '); timeLabel = '时间�?'; }
    var metaParts = [];
    if (proj) metaParts.push('<span class="tag proj">' + escapeHtml(proj) + '</span>');
    if (ver) metaParts.push('<span class="tag grp">' + escapeHtml(ver) + '</span>');
    if (typeExtra) metaParts.push(typeExtra);
    if (timeText) metaParts.push('<span class="tag grp">' + timeLabel + escapeHtml(timeText) + '</span>');
    if (typeExtraAfter) metaParts.push(typeExtraAfter);
    var metaHtml = metaParts.join('');
    // 批次79：单行灰时间——会议按 opCode 映射专属标签（创�?/会议开�?/会议结束/会议取消时间），其余类型用操作码中文�? + '时间'，与首页待办卡片口径一�?
    var line = t.statusOpLine;
    var opLabel;
    if (typeCode === 'MEETING' && line) {
      // 会议专属标签映射；遇未知 opCode 回落通用「操作名 + 时间�?
      var MEETING_OP_LABEL = { TODO_CREATE: '创建时间', TODO_START: '会议开始时�?', TODO_END: '会议结束时间', TODO_CANCEL: '会议取消时间' };
      opLabel = MEETING_OP_LABEL[line.opCode] || ((TODO_OPERATION_CODE_TO_NAME[line.opCode] || line.opCode) + '时间');
    } else {
      opLabel = (line && line.opCode ? (TODO_OPERATION_CODE_TO_NAME[line.opCode] || line.opCode) : '创建') + '时间';
    }
    var singleTimeRow = (line && line.time)
      ? '<div class="task-dates">' + escapeHtml(opLabel) + ' ' + escapeHtml(fmtDateTime(line.time)) + '</div>' : '';
    return '<div class="task-card t-' + escapeHtml(typeCode) + '" style="--type-color:' + typeColorVal + '">' +
      '<div class="task-body">' +
        '<div class="task-header">' +
          '<div class="task-title-row"><h3 class="task-title">' + escapeHtml(title) + '</h3></div>' +
          '<span class="tag status-' + escapeHtml(sName) + '" style="background:' + color + '1a;color:' + color + '">' + escapeHtml(sName) + '</span>' +
        '</div>' +
        (metaHtml ? '<div class="task-meta">' + metaHtml + '</div>' : '') +
        singleTimeRow +
      '</div>' +
    '</div>';
  }

  // ============ 暴露 ============
  root.RT_REPORT_COMMON = {
    escapeHtml: escapeHtml,
    fmtDate: fmtDate,
    fmtDateTime: fmtDateTime,
    statusName: statusName, typeName: typeName, typeColor: typeColor,
    priorityName: priorityName, projectNameById: projectNameById, versionNameById: versionNameById, userNicknamesByIds: userNicknamesByIds,
    inPeriod: inPeriod, periodMatch: periodMatch,
    todoCandidateDates: todoCandidateDates, periodMatchByDates: periodMatchByDates,
    normalizeTask: normalizeTask,
    estimateWorkHours: estimateWorkHours, taskWorkHours: taskWorkHours,
    setNumColor: setNumColor,
    renderBars: renderBars,
    buildTimeValueRow: buildTimeValueRow, wireTimeSeg: wireTimeSeg, renderProjectBars: renderProjectBars,
    loadReportData: loadReportData,
    buildTodoCardHtml: buildTodoCardHtml,
    // 数据访问（供各页读取共享缓存�?
    getData: function () {
      return {
        TASK_TYPE_LIST: TASK_TYPE_LIST, TYPE_CODE_TO_NAME: TYPE_CODE_TO_NAME, TYPE_CODE_TO_COLOR: TYPE_CODE_TO_COLOR,
        priorityList: priorityList, projectList: projectList, versionList: versionList, userList: userList,
        allTasks: allTasks, allTodos: allTodos,
        BUG_STATUS_LIST: BUG_STATUS_LIST, BUG_STATUS_CODE_TO_NAME: BUG_STATUS_CODE_TO_NAME, BUG_STATUS_CODE_TO_COLOR: BUG_STATUS_CODE_TO_COLOR,
        TODO_STATUS_LIST: TODO_STATUS_LIST, TODO_STATUS_CODE_TO_NAME: TODO_STATUS_CODE_TO_NAME, TODO_STATUS_CODE_TO_COLOR: TODO_STATUS_CODE_TO_COLOR,
        MEETING_STATUS_LIST: MEETING_STATUS_LIST, MEETING_STATUS_CODE_TO_NAME: MEETING_STATUS_CODE_TO_NAME, MEETING_STATUS_CODE_TO_COLOR: MEETING_STATUS_CODE_TO_COLOR
      };
    },
    isDataReady: function () { return dataReady; },
    resetCache: function () { dataReady = false; }
  };
})(window);
