// workflows.js —— 工作流表数据层（IndexedDB，基于共享 db.js）
//
// 批次 213（#23 工作流管理重构）重设计：
//   旧模型（批次196）：code/name/description/targets[]/nodes[]（节点名列表）/transitions[]（流转规则文本）
//   新模型（批次213）：code（系统自动生成 PWA+GZL+NNN）/name/description/nodes[]（结构化节点）
//     - 移除 targets（工作流仅定义流程，不关联业务对象）
//     - 移除 transitions（流转由结构化节点的 ops + 流程实例驱动，见 #24）
//     - 节点结构化：{ id, name, status, approver, ops[] }
//         · status  ：节点状态 code，字典驱动（WF_NODE_STATUS，见 dictionary.js）
//         · approver：审批人 account，选自用户目录（getAllUsers）
//         · ops[]   ：该节点可用操作 code，枚举见 NODE_OPS
//
// 软迁移：读取时把旧记录（nodes 为字符串数组 / 含 transitions / targets）兼容转换为新结构，
//   不就地改库；编辑保存时按新结构写回，自然完成迁移。
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
(function (root) {
  'use strict';

  var STORE = 'workflows';
  var LIMITS = { NAME_MAX: 50, DESC_MAX: 200 };

  // 自动编号：PWA + GZL + 零填充序号（从 1）。GZL = 工作流（GongZuoLiu）拼音首字母。
  var CODE_PREFIX = 'PWA';
  var WF_PREFIX = 'GZL';
  var CODE_PAD = 3;

  // 节点操作枚举（提交/撤回/同意/驳回/转办/加签）；label 走 i18n（workflow.op.*）
  var NODE_OPS = ['SUBMIT', 'WITHDRAW', 'APPROVE', 'REJECT', 'TRANSFER', 'ADDSIGN'];

  // 节点状态默认 code（与 dictionary.js WF_NODE_STATUS 种子对齐；字典缺失时回退）
  var NODE_STATUS_DEFAULT = 'PENDING';

  // 注册 store（db.js 首次打开时创建）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'code', path: 'code' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  // ===================== 校验（同步，字段格式）=====================
  // 注意：code 由系统生成（genNextCode），表单不输入，故不校验必填；
  //   name 必填，description 受长度上限约束；nodes 可选（创建时空节点也允许）。
  function validateWorkflow(data) {
    var errors = {};
    data = data || {};
    var name = (data.name == null ? '' : String(data.name)).trim();
    var description = (data.description == null ? '' : String(data.description).trim());

    if (!name) errors.name = '请输入工作流名称';
    else if (name.length > LIMITS.NAME_MAX) errors.name = '工作流名称最多 ' + LIMITS.NAME_MAX + ' 位';

    if (description.length > LIMITS.DESC_MAX) errors.description = '描述最多 ' + LIMITS.DESC_MAX + ' 位';

    var first = null;
    ['name', 'description'].forEach(function (k) {
      if (errors[k] && !first) first = k;
    });
    return { ok: Object.keys(errors).length === 0, errors: errors, first: first };
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

  // ===================== 节点归一化（结构化 + 软迁移）=====================
  // 入参 n 可能是：字符串（旧模型节点名）或对象 { id?, name, status?, approver?, ops? }
  // 统一输出结构化节点；旧字符串节点默认 status=PENDING、无审批人、无操作集。
  function normalizeNode(n) {
    if (typeof n === 'string') {
      return { id: root.RT_DB.genId(), name: n, status: NODE_STATUS_DEFAULT, approver: '', ops: [] };
    }
    n = n || {};
    return {
      id: n.id || root.RT_DB.genId(),
      name: (n.name == null ? '' : String(n.name)),
      status: n.status || NODE_STATUS_DEFAULT,
      approver: n.approver || '',
      ops: Array.isArray(n.ops) ? n.ops.map(function (x) { return String(x); }) : []
    };
  }

  // 记录软迁移：统一为结构化节点，丢弃旧 transitions / targets。
  function normalize(record) {
    if (!record) return record;
    var nodes = Array.isArray(record.nodes) ? record.nodes.map(normalizeNode) : [];
    return {
      id: record.id,
      code: record.code || '',
      name: record.name || '',
      description: record.description || '',
      nodes: nodes,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedBy: record.updatedBy,
      updatedAt: record.updatedAt
    };
  }

  function asNodes(v) {
    if (Array.isArray(v)) return v.map(normalizeNode);
    return [];
  }

  // ===================== 自动编号 PWA+GZL+NNN =====================
  // 读全部 workflows，解析 code 中数字序号，取最大 N，返回 PWA+GZL+(N+1) 零填充。
  function genNextCode() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        var max = 0;
        (list || []).forEach(function (r) {
          var m = /PWA\s*GZL\s*0*(\d+)/i.exec((r && r.code) || '');
          if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
        });
        var seq = String(max + 1);
        while (seq.length < CODE_PAD) seq = '0' + seq;
        return CODE_PREFIX + WF_PREFIX + seq;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // ===================== CRUD =====================
  function createWorkflow(data, operator) {
    var v = validateWorkflow(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    return genNextCode().then(function (code) {
      return openDB().then(function (db) {
        var record = {
          id: root.RT_DB.genId(),
          code: code,
          name: (data.name + '').trim(),
          description: (data.description == null ? '' : String(data.description).trim()),
          nodes: asNodes(data.nodes),
          createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
        };
        return reqToPromise(tx(db, 'readwrite').put(record))
          .then(function () { db.close(); return record; })
          .catch(function (err) { db.close(); throw err; });
      });
    });
  }

  function updateWorkflow(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateWorkflow(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('记录不存在'); }
        old.name = (patch.name + '').trim();
        old.description = (patch.description == null ? '' : String(patch.description).trim());
        old.nodes = asNodes(patch.nodes);
        old.updatedBy = op;
        old.updatedAt = Date.now();
        return reqToPromise(tx(db, 'readwrite').put(old))
          .then(function () { db.close(); return old; });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function deleteWorkflow(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id))
        .then(function () { db.close(); return true; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getWorkflow(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) {
        db.close();
        return r ? normalize(r) : null;
      });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllWorkflows() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'zh'); });
        return list.map(normalize);
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS,
    NODE_OPS: NODE_OPS,
    NODE_STATUS_DEFAULT: NODE_STATUS_DEFAULT,
    CODE_PREFIX: CODE_PREFIX, WF_PREFIX: WF_PREFIX, CODE_PAD: CODE_PAD,
    genId: function () { return root.RT_DB.genId(); },
    validateWorkflow: validateWorkflow,
    genNextCode: genNextCode,
    normalizeNode: normalizeNode,
    createWorkflow: createWorkflow, updateWorkflow: updateWorkflow,
    deleteWorkflow: deleteWorkflow, getWorkflow: getWorkflow,
    getAllWorkflows: getAllWorkflows
  };
  root.RT_WORKFLOWS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
