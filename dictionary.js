// dictionary.js —— 字典表数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 记录字段：
//   id            string   32 位自动 ID
//   code          编码     string  字母/数字组成，类型内唯一（机器可读标识）
//   type          类型     string  字典分类，如：任务类型 / 优先级 / 任务状态 / 任务操作管理
//   name          名称     string  展示文案（中文）
//   order         排序     number  可选，同类内展示顺序（如职级 1..10）；缺省按 code 字母序
//   createdBy     创建人   string  自动填充（种子数据填 'system'）
//   createdAt     创建时间 timestamp 自动填充
//
// 字典表为只读参考数据：本模块只负责「自动播种」系统枚举，页面仅查看，不提供增删改。
// 播种逻辑幂等：仅在 store 为空时写入，避免重复刷新导致数据翻倍。
(function (root) {
  'use strict';

  var STORE = 'dict';
  var SEED_TYPE = { TASK_TYPE: '任务类型', PRIORITY: '优先级', TASK_STATUS: '任务状态', PROJECT_STATUS: '项目状态', EMPLOYEE_STATUS: '人员状态', POSITION_LEVEL: '职级', TASK_OPERATION: '任务操作管理' };

  // 注册 store（db.js 首次打开时创建；跨页面懒注册场景下自动补齐缺失 store）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'type', path: 'type' },
        { name: 'code', path: 'code' },
        { name: 'name', path: 'name' },
        { name: 'createdAt', path: 'createdAt' }
      ]
    });
  }

  // ===================== IndexedDB 底层（委托 db.js）=====================
  function openDB() { return root.RT_DB.openDB(); }
  function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // ===================== 种子数据（自动填充系统枚举）=====================
  // 与 app.js 中由字典驱动的任务类型列表（TASK_TYPE_LIST / FALLBACK_TASK_TYPES）保持一致。
  // code 为稳定的机器可读标识（供将来接口对接），name 为页面展示文案。
  var SEED = [
    // 任务类型（order 固定展示顺序：需求 → 线上BUG → 普通BUG，与 app.js 展示顺序一致；避免回退 code 字母序）
    // color 为可配置展示色（与 styles.css 内置三色一致），任务卡/标签/图表据此上色，新增类型也无需改 CSS
    { type: SEED_TYPE.TASK_TYPE, code: 'REQ',        name: '需求',     order: 1, color: '#096dd9' },
    { type: SEED_TYPE.TASK_TYPE, code: 'ONLINE_BUG',  name: '线上BUG', order: 2, color: '#cf1322' },
    { type: SEED_TYPE.TASK_TYPE, code: 'COMMON_BUG',  name: '普通BUG', order: 3, color: '#ff7a00' },
    // 优先级顺序（order 固定展示顺序：高 → 中 → 低）
    { type: SEED_TYPE.PRIORITY,  code: 'HIGH',   name: '高', order: 1 },
    { type: SEED_TYPE.PRIORITY,  code: 'MEDIUM', name: '中', order: 2 },
    { type: SEED_TYPE.PRIORITY,  code: 'LOW',    name: '低', order: 3 },
    // 任务状态
    // 任务状态顺序（order 固定展示顺序：待开发 → 已提测 → 测试中 → 已测完 → 已上线）
    { type: SEED_TYPE.TASK_STATUS, code: 'TODO',       name: '待开发', order: 1 },
    { type: SEED_TYPE.TASK_STATUS, code: 'SUBMITTED',  name: '已提测', order: 2 },
    { type: SEED_TYPE.TASK_STATUS, code: 'TESTING',    name: '测试中', order: 3 },
    { type: SEED_TYPE.TASK_STATUS, code: 'TESTED',     name: '已测完', order: 4 },
    { type: SEED_TYPE.TASK_STATUS, code: 'ONLINE',     name: '已上线', order: 5 },
    // 任务操作（order 固定展示顺序：创建 → 开发提交 → 测试开始 → 暂停 → 暂停恢复 → 测试完成 → 上线 → 重置）
    { type: SEED_TYPE.TASK_OPERATION, code: 'CREATE',      name: '创建',   order: 0 },
    { type: SEED_TYPE.TASK_OPERATION, code: 'DEV_SUBMIT', name: '开发提交', order: 1 },
    { type: SEED_TYPE.TASK_OPERATION, code: 'TEST_START', name: '测试开始', order: 2 },
    { type: SEED_TYPE.TASK_OPERATION, code: 'PAUSE',      name: '暂停',   order: 3 },
    { type: SEED_TYPE.TASK_OPERATION, code: 'RESUME',     name: '暂停恢复', order: 4 },
    { type: SEED_TYPE.TASK_OPERATION, code: 'TEST_DONE',  name: '测试完成', order: 5 },
    { type: SEED_TYPE.TASK_OPERATION, code: 'ONLINE',     name: '上线',   order: 6 },
    { type: SEED_TYPE.TASK_OPERATION, code: 'RESET',      name: '重置',   order: 7 },
    { type: SEED_TYPE.TASK_OPERATION, code: 'DELETE',     name: '删除',   order: 8 },
    // 项目状态（项目 / 项目版本共用；实体只存 code，文案取自字典）
    // 项目状态顺序（order 固定展示顺序：进行中 → 已归档）
    { type: SEED_TYPE.PROJECT_STATUS, code: 'ACTIVE',   name: '进行中', order: 1 },
    { type: SEED_TYPE.PROJECT_STATUS, code: 'ARCHIVED', name: '已归档', order: 2 },
    // 人员状态（人员管理；实体只存 code，文案取自字典）
    // 人员状态顺序（order 固定展示顺序：正式员工 → 试用期 → 实习生 → 外包 → 离职）
    { type: SEED_TYPE.EMPLOYEE_STATUS, code: 'REGULAR',   name: '正式员工', order: 1 },
    { type: SEED_TYPE.EMPLOYEE_STATUS, code: 'PROBATION', name: '试用期',   order: 2 },
    { type: SEED_TYPE.EMPLOYEE_STATUS, code: 'INTERN',    name: '实习生',   order: 3 },
    { type: SEED_TYPE.EMPLOYEE_STATUS, code: 'OUTSOURCE', name: '外包',     order: 4 },
    { type: SEED_TYPE.EMPLOYEE_STATUS, code: 'LEFT',      name: '离职',     order: 5 },
    // 职级（职位管理；实体只存 code，文案取自字典）；order 决定下拉展示顺序，无 order 的类型回退 code 序
    { type: SEED_TYPE.POSITION_LEVEL, code: 'STAFF',             name: '普通员工', order: 1 },
    { type: SEED_TYPE.POSITION_LEVEL, code: 'SUPERVISOR',        name: '主管',     order: 2 },
    { type: SEED_TYPE.POSITION_LEVEL, code: 'DEPUTY_DIRECTOR',   name: '副主任',   order: 3 },
    { type: SEED_TYPE.POSITION_LEVEL, code: 'DIRECTOR',          name: '主任',     order: 4 },
    { type: SEED_TYPE.POSITION_LEVEL, code: 'DEPUTY_MANAGER',    name: '副经理',   order: 5 },
    { type: SEED_TYPE.POSITION_LEVEL, code: 'MANAGER',           name: '经理',     order: 6 },
    { type: SEED_TYPE.POSITION_LEVEL, code: 'DEPUTY_VP',         name: '副总监',   order: 7 },
    { type: SEED_TYPE.POSITION_LEVEL, code: 'VP',                name: '总监',     order: 8 },
    { type: SEED_TYPE.POSITION_LEVEL, code: 'DEPUTY_PRESIDENT',  name: '副总裁',   order: 9 },
    { type: SEED_TYPE.POSITION_LEVEL, code: 'PRESIDENT',         name: '总裁',     order: 10 }
  ];

  // 幂等播种：按 (type, code) 去重，仅补充缺失枚举，避免重复刷新产生重复数据；
  // 也保证「已存在其它类型数据」的老用户仍能补齐新增类型（如 PROJECT_STATUS）。
  function seedDict(operator) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (existing) {
        existing = Array.isArray(existing) ? existing : [];
        var have = {};
        existing.forEach(function (r) { have[(r.type || '') + '|' + (r.code || '')] = true; });
        var op = (operator == null ? 'system' : String(operator));
        var now = Date.now();
        var missing = SEED.filter(function (s) { return !have[s.type + '|' + s.code]; });

        // 回填：已有但缺少 order / color 的记录按种子补齐（如任务类型，保持与 app.js 展示顺序/配色一致）。
        // 播种本身幂等只补「缺失枚举」，不会更新已有记录，故老用户浏览器里缺字段的任务类型需在此显式补齐。
        var orderByCode = {};
        var colorByCode = {};
        SEED.forEach(function (s) {
          if (s.order != null) orderByCode[s.type + '|' + s.code] = s.order;
          if (s.color != null) colorByCode[s.type + '|' + s.code] = s.color;
        });
        var store = tx(db, 'readwrite');
        var backfills = [];
        existing.forEach(function (r) {
          var key = (r.type || '') + '|' + (r.code || '');
          var changed = false;
          if (orderByCode[key] != null && r.order == null) { r.order = orderByCode[key]; changed = true; }
          if (colorByCode[key] != null && r.color == null) { r.color = colorByCode[key]; changed = true; }
          if (changed) backfills.push(reqToPromise(store.put(r)));
        });

        if (!missing.length && !backfills.length) { db.close(); return { seeded: false, count: existing.length }; }
        var pending = missing.map(function (s) {
          var record = {
            id: root.RT_DB.genId(),
            code: s.code,
            type: s.type,
            name: s.name,
            createdBy: op,
            createdAt: now
          };
          if (s.order != null) record.order = s.order;
          return reqToPromise(store.put(record));
        });
        return Promise.all(pending.concat(backfills)).then(function () {
          db.close();
          return { seeded: !!missing.length, count: existing.length + missing.length, added: missing.length, backfilled: backfills.length };
        });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // ===================== 只读查询 =====================
  function getAllDict() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) {
          if ((a.type || '') !== (b.type || '')) return (a.type || '').localeCompare(b.type || '', 'zh');
          // 有 order 的优先按 order 排（职级等需固定展示顺序）；无 order 的类型回退 code 字母序，保持原行为
          var oa = (a.order == null ? Infinity : a.order);
          var ob = (b.order == null ? Infinity : b.order);
          if (oa !== ob) return oa - ob;
          return (a.code || '').localeCompare(b.code || '', 'en');
        });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function getDictByType(type) {
    return getAllDict().then(function (list) {
      return (Array.isArray(list) ? list : []).filter(function (r) { return r.type === type; });
    });
  }

  // 按 type 分组（用于分组展示）
  function groupByType(list) {
    var byType = {};
    (Array.isArray(list) ? list : []).forEach(function (r) {
      (byType[r.type] = byType[r.type] || []).push(r);
    });
    return byType;
  }

  var api = {
    STORE: STORE,
    SEED_TYPE: SEED_TYPE,
    genId: function () { return root.RT_DB.genId(); },
    seedDict: seedDict,
    getAllDict: getAllDict,
    getDictByType: getDictByType,
    groupByType: groupByType
  };
  root.RT_DICT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
