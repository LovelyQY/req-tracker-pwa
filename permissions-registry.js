// permissions-registry.js —— 权限注册表（权限码的单一真相来源）
//
// 代码侧枚举所有「页面 + 操作按钮」及其稳定 code（snake_case）。
// 本文件随发版版本化缓存；DB 的 menus 表是其镜像 + 用户扩展，
// 首次 / 每次启动由 permissions.js 的 seedMenusFromRegistry() 幂等对齐（含重挂父节点）。
//
// 命名规则（PLAN §1.2）：全部 snake_case；叶子权限 code 形如 op_<实体>_<动作>。
//   - 模块 code：mod_<模块>        （如 mod_board / mod_settings）
//   - 页面 code：page_<实体>       （如 page_company / page_board_task / page_report_task）
//   - 操作叶子 code = expandOp(pageCode, action)
//       = 'op_' + <实体> + '_' + <动作>
//       <实体>  = pageCode 去掉前缀 'page_'（如 company / board_task / report_task）
//       <动作>  = 操作后缀（不含 op_ 前缀），如 view / create / edit / delete / export /
//                 assign_role / enable（基础操作），以及生命周期操作 dev_submit / test_start /
//                 pause / resume / test_done / online / reset / start / complete / handoff /
//                 cancel / end。
//
// 关于动作命名（与 PLAN §1.2 叙事示例的细微对齐说明）：
//   PLAN 叙事里出现过 op_task_dev_submit / op_todo_complete 这类示例。为避免「实体已含 task/todo、
//   动作再叠加 task_/todo_ 前缀」造成双重词（如 op_board_task_task_dev_submit），本实现将动作后缀
//   中的冗余 task_/todo_ 前缀去掉——页面实体（board_task / board_todo_bug）已唯一标识类型，
//   故动作直接为 dev_submit / handoff 等，叶子 code 为 op_board_task_dev_submit /
//   op_board_todo_bug_handoff，干净且无歧义。注册表即权限码唯一来源，后续所有批次（含 89+ 接线）
//   统一以此为准（§1.8 强规则）。
//
// 树形结构（批次 207 #14 重构）：
//   - 顶层仅两个模块：mod_board（看板）/ mod_settings（设置），与导航抽屉对齐；
//   - 模块下可直接挂页面（page），页面也可作为「分组页」继续挂子页面（如 设置 > 基础数据 >
//     公司/部门/…），形成任意深度的菜单树；叶子为 op_* 操作按钮；
//   - 菜单名/顺序与导航一致；每个页面登记其按钮级权限（op_*），与对应页 data-perm 一一对应；
//   - 所有历史 op_* 叶子 code 保持稳定（page code 不变 → expandOp 结果不变），现有 data-perm 全部命中。
//
// 完整性基线（PLAN §1.2）：逐项对照 app.js / task-lifecycles.js / todo-lifecycles.js 的真实按钮，
//   看板任务区 8 个生命周期操作 + 三种代办类型各异的按钮集合，全部落为独立叶子。
//
// 批次 82：权限注册表 + 菜单种子 + 已配置判定；批次 207 #14：重构为「看板 / 设置」两模块树。

(function (root) {
  'use strict';

  // 动作中文名（用于菜单节点 menuName 展示；操作叶子名 = 页面名 + '·' + 动作名）
  var OP_NAMES = {
    view: '查看',
    create: '新建',
    edit: '编辑',
    delete: '删除',
    export: '导出',
    assign_role: '分配角色',
    enable: '启停',
    list: '查看全部/处理',
    reply: '回复处理',
    // 任务生命周期（TASK_OPERATION 派生）
    dev_submit: '开发提交',
    test_start: '测试开始',
    pause: '暂停',
    resume: '恢复',
    test_done: '测试完成',
    online: '上线',
    reset: '重置',
    // 代办生命周期（TODO_OPERATION 派生）
    start: '开始处理',
    complete: '完成',
    handoff: '转交',
    cancel: '取消',
    end: '结束'
  };

  // 注册表：module > page(分组/叶子) > op（每个叶子 op = 一个可守卫的按钮）
  // 分组页用 children（下挂子页面）；叶子页用 ops（下挂操作按钮）。
  // ops 元素：{ op:'动作后缀', name:'动作中文', special?:true(生命周期操作) }
  var RT_PERM_REGISTRY = [
    // ===== 看板（与导航「看板」区对齐：首页 / 任务 / 代办 / 日历 / 反馈）=====
    { code: 'mod_board', name: '看板', children: [
      { code: 'page_home', name: '首页', ops: [
        { op: 'view', name: '查看' }
      ] },
      { code: 'page_board_task', name: '任务', ops: [
        { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
        { op: 'edit', name: '编辑' }, { op: 'export', name: '导出' },
        { op: 'dev_submit', name: '开发提交', special: true },
        { op: 'test_start', name: '测试开始', special: true },
        { op: 'pause', name: '暂停', special: true },
        { op: 'resume', name: '恢复', special: true },
        { op: 'test_done', name: '测试完成', special: true },
        { op: 'online', name: '上线', special: true },
        { op: 'reset', name: '重置', special: true },
        { op: 'delete', name: '删除', special: true }
      ] },
      // 代办：按 TODO_TYPE 拆三个页面，三者权限按钮不同（来源 app.js getTodoActions）
      { code: 'page_todo', name: '代办', children: [
        { code: 'page_board_todo_task_item', name: '任务事项', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' },
          { op: 'start', name: '开始处理', special: true },
          { op: 'complete', name: '完成', special: true },
          { op: 'delete', name: '删除', special: true },
          { op: 'reset', name: '重置', special: true }
        ] },
        { code: 'page_board_todo_bug', name: '缺陷追踪', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' },
          { op: 'start', name: '开始处理', special: true },
          { op: 'complete', name: '完成', special: true },
          { op: 'handoff', name: '转交', special: true },
          { op: 'online', name: '上线', special: true },
          { op: 'delete', name: '删除', special: true },
          { op: 'reset', name: '重置', special: true }
        ] },
        { code: 'page_board_todo_meeting', name: '会议', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' },
          { op: 'start', name: '开始处理', special: true },
          { op: 'cancel', name: '取消', special: true },
          { op: 'end', name: '结束', special: true },
          { op: 'delete', name: '删除', special: true },
          { op: 'reset', name: '重置', special: true }
        ] }
      ] },
      { code: 'page_calendar', name: '日历', ops: [
        { op: 'view', name: '查看' }
      ] },
      { code: 'page_feedback', name: '反馈', ops: [
        { op: 'view', name: '查看' },
        { op: 'list', name: '查看全部/处理' },
        { op: 'reply', name: '回复处理' }
      ] }
    ] },
    // ===== 设置（与导航「设置」区对齐：个人信息 / 账号与安全 / 基础数据 / 统计报表 / 存储与备份 / 设置 / 关于）=====
    { code: 'mod_settings', name: '设置', children: [
      { code: 'page_profile', name: '个人信息', ops: [
        { op: 'view', name: '查看' }, { op: 'edit', name: '编辑' }
      ] },
      { code: 'page_security', name: '账号与安全', ops: [
        { op: 'view', name: '查看' }, { op: 'edit', name: '编辑' }
      ] },
      // 基础数据（分组页：下挂公司/部门/职位/人员/角色/权限/项目/项目版本/字典/图标/工作流/流程）
      { code: 'page_basic_data', name: '基础数据', children: [
        { code: 'page_company', name: '公司管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' }
        ] },
        { code: 'page_dept', name: '部门管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' }
        ] },
        { code: 'page_position', name: '职位管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' }
        ] },
        { code: 'page_user', name: '人员管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' },
          { op: 'assign_role', name: '分配角色' }
        ] },
        { code: 'page_role', name: '角色管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' }
        ] },
        { code: 'page_perm', name: '权限管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' },
          { op: 'enable', name: '启停' }
        ] },
        { code: 'page_project', name: '项目管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' }
        ] },
        { code: 'page_project_ver', name: '项目版本管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' }
        ] },
        { code: 'page_dict', name: '字典管理', ops: [
          { op: 'view', name: '查看' }
        ] },
        { code: 'page_icon_manager', name: '图标管理', ops: [
          { op: 'view', name: '查看' }, { op: 'edit', name: '编辑' }
        ] },
        { code: 'page_workflow', name: '工作流管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' }
        ] },
        { code: 'page_process', name: '流程管理', ops: [
          { op: 'view', name: '查看' }, { op: 'create', name: '新建' },
          { op: 'edit', name: '编辑' }, { op: 'delete', name: '删除' }
        ] }
      ] },
      // 统计报表（分组页：下挂五个统计子页）
      { code: 'page_report', name: '统计报表', children: [
        { code: 'page_report_task', name: '任务统计', ops: [ { op: 'view', name: '查看' }, { op: 'export', name: '导出' } ] },
        { code: 'page_report_bug', name: '缺陷统计', ops: [ { op: 'view', name: '查看' }, { op: 'export', name: '导出' } ] },
        { code: 'page_report_todo', name: '待办统计', ops: [ { op: 'view', name: '查看' }, { op: 'export', name: '导出' } ] },
        { code: 'page_report_meeting', name: '会议统计', ops: [ { op: 'view', name: '查看' }, { op: 'export', name: '导出' } ] },
        { code: 'page_report_stats', name: '考勤工时统计', ops: [ { op: 'view', name: '查看' }, { op: 'export', name: '导出' } ] }
      ] },
      { code: 'page_storage', name: '存储与备份', ops: [ { op: 'view', name: '查看' } ] },
      { code: 'page_settings', name: '设置', ops: [ { op: 'view', name: '查看' } ] },
      { code: 'page_about', name: '关于', ops: [ { op: 'view', name: '查看' } ] }
    ] }
  ];

  // 生命周期操作（源自字典表 TASK_OPERATION / TODO_OPERATION）的动作名集合（递归收集）
  var LIFECYCLE_ACTION_NAMES = {};
  (function buildLifecycle() {
    function walk(list) {
      (list || []).forEach(function (node) {
        if (node.ops) {
          node.ops.forEach(function (o) { if (o.special) LIFECYCLE_ACTION_NAMES[o.op] = true; });
        }
        if (node.children) walk(node.children);
      });
    }
    walk(RT_PERM_REGISTRY);
  })();

  // SPECIAL_OP_PREFIXES：动作名前缀中能标识「生命周期操作」者。
  // 说明：动作后缀已去掉冗余的 task_/todo_（见文件头命名说明），真正的前缀仅 dev_/test_；
  // 其余生命周期动作（pause/resume/online/reset/start/complete/handoff/cancel/end）通过
  // LIFECYCLE_ACTION_NAMES 集合判定，isSpecialOp 同时覆盖两者。
  var SPECIAL_OP_PREFIXES = ['dev_', 'test_'];

  // 动作名 → 中文名（兜底）
  function opName(op) {
    return OP_NAMES[op] || op;
  }

  // 展开单页单动作 → 叶子权限 code
  // pageCode: 'page_company' / 'page_board_task' ...
  // action:   'view' / 'dev_submit' ...（不含 op_ 前缀）
  function expandOp(pageCode, action) {
    var entity = (pageCode || '').indexOf('page_') === 0 ? (pageCode).slice(5) : (pageCode || '');
    var act = (action || '').indexOf('op_') === 0 ? (action).slice(3) : (action || '');
    return 'op_' + entity + '_' + act;
  }

  // 是否为生命周期操作。
  // 入参可为「完整叶子 code」（如 op_board_task_dev_submit，按注册表条目逐码精确判定）
  // 或「动作名」（如 dev_submit / delete，按动作名集合判定）。
  function isSpecialOp(actionOrCode) {
    if (!actionOrCode) return false;
    if (actionOrCode.indexOf('op_') === 0) {
      var entry = getRegistryEntry(actionOrCode);
      if (entry && entry.type === 'op') return !!entry.special;
    }
    var act = (actionOrCode.indexOf('op_') === 0) ? actionOrCode.slice(3) : actionOrCode;
    if (LIFECYCLE_ACTION_NAMES[act]) return true;
    for (var i = 0; i < SPECIAL_OP_PREFIXES.length; i++) {
      if (act.indexOf(SPECIAL_OP_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  var _codeCache = null;       // Set: 全部注册表 code（module + page + op 叶子）
  var _entryCache = null;      // code -> { type, code, name, pageCode?, action?, special? }

  // 递归建缓存（支持 module > page(分组) > page(叶子) > op 任意深度）
  function rebuildCache() {
    var codes = {};
    var entries = {};
    function walk(list, isModule) {
      (list || []).forEach(function (node) {
        var type = isModule ? 'module' : 'page';
        codes[node.code] = true;
        entries[node.code] = { type: type, code: node.code, name: node.name };
        if (node.children && node.children.length) {
          walk(node.children, false);
        } else if (node.ops && node.ops.length) {
          node.ops.forEach(function (o) {
            var leaf = expandOp(node.code, o.op);
            codes[leaf] = true;
            entries[leaf] = {
              type: 'op', code: leaf, name: node.name + '·' + opName(o.op),
              pageCode: node.code, action: o.op, special: !!o.special
            };
          });
        }
      });
    }
    walk(RT_PERM_REGISTRY, true);
    _codeCache = codes;
    _entryCache = entries;
  }

  // 展开全部有效 code 集合（含 module / page / op 叶子）
  function flattenRegistryCodes() {
    if (!_codeCache) rebuildCache();
    return Object.keys(_codeCache);
  }

  // 「已配置」判定：code 是否登记于注册表（权限管理页徽标来源）
  function isCodeConfigured(code) {
    if (!_codeCache) rebuildCache();
    return !!_codeCache[code];
  }

  // 取注册表条目元信息（module / page / op）
  function getRegistryEntry(code) {
    if (!_entryCache) rebuildCache();
    return _entryCache[code] || null;
  }

  // 构建幂等播种用的菜单节点（任意深度树，parentCode 链式指向父 menuCode；带 sortOrder 排序权重）
  function buildSeedMenus() {
    var nodes = [];
    function walk(list, parentCode, isModule) {
      (list || []).forEach(function (node, idx) {
        var nodeType = isModule ? 'module' : 'page';
        nodes.push({
          menuCode: node.code,
          menuName: node.name,
          parentCode: parentCode,
          nodeType: nodeType,
          sortOrder: idx
        });
        if (node.children && node.children.length) {
          walk(node.children, node.code, false);
        } else if (node.ops && node.ops.length) {
          node.ops.forEach(function (o, oi) {
            nodes.push({
              menuCode: expandOp(node.code, o.op),
              menuName: node.name + '·' + opName(o.op),
              parentCode: node.code,
              nodeType: 'op',
              sortOrder: oi
            });
          });
        }
      });
    }
    walk(RT_PERM_REGISTRY, '', true);
    return nodes;
  }

  var api = {
    RT_PERM_REGISTRY: RT_PERM_REGISTRY,
    OP_NAMES: OP_NAMES,
    LIFECYCLE_ACTION_NAMES: LIFECYCLE_ACTION_NAMES,
    SPECIAL_OP_PREFIXES: SPECIAL_OP_PREFIXES,
    expandOp: expandOp,
    isSpecialOp: isSpecialOp,
    flattenRegistryCodes: flattenRegistryCodes,
    isCodeConfigured: isCodeConfigured,
    getRegistryEntry: getRegistryEntry,
    buildSeedMenus: buildSeedMenus
  };

  root.RT_PERM_REGISTRY_API = api;
  root.RT_PERM_REGISTRY = RT_PERM_REGISTRY;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
