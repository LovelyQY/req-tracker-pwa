// process-instances.js —— 流程实例数据层 + 审批引擎（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块管理 process_instances store，
// 并驱动「按工作流节点」的审批流转（本地优先，无后端）。
//
// 依赖（调用期就绪）：
//   RT_PROCESSES.getProcess(id)  → 取流程定义（含 workflowId / formTemplate）
//   RT_WORKFLOWS.getWorkflow(id) → 取工作流定义（含 nodes 结构化节点）
//   二者均在 startInstance 时读取，复制工作流节点为实例节点序列。
//
// 实例状态（实例级，区别于节点状态 WF_NODE_STATUS）：
//   RUNNING（进行中）/ APPROVED（已通过）/ REJECTED（已驳回）/ WITHDRAWN（已撤回）
//
// 审批动作（复用 #23 节点操作枚举 NODE_OPS）：
//   SUBMIT（提交）/ WITHDRAW（撤回）/ APPROVE（同意）/ REJECT（驳回）/ TRANSFER（转办）/ ADDSIGN（加签）
//
// 记录字段：
//   id            string  32 位自动 ID
//   processId     string  关联流程定义 ID
//   processName   string  流程名称（快照，便于列表展示）
//   workflowId    string  关联工作流 ID
//   workflowName  string  工作流名称（快照）
//   nodes         array   实例节点序列（发起时从工作流复制）：{ id, name, status, approver, ops[] }
//   currentNodeIdx number 当前待处理节点下标
//   status        string  实例状态（RUNNING/APPROVED/REJECTED/WITHDRAWN）
//   formData      object  表单模板填写值 { [fieldId]: value }
//   history       array   审批历史 { action, operator, nodeIdx, toAccount?, comment, time }
//   initiator     string  发起人账号
//   sourceRef     object  反向业务回链（批次217 #27）：{ type:'requirementTask'|'todo', id } 或 null；供任务/代办挂流程后回跳
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
(function (root) {
  'use strict';

  var STORE = 'process_instances';
  var STATUS = { RUNNING: 'RUNNING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', WITHDRAWN: 'WITHDRAWN' };
  var ACTIONS = ['SUBMIT', 'WITHDRAW', 'APPROVE', 'REJECT', 'TRANSFER', 'ADDSIGN'];

  // 节点状态常量（复用 #23 WF_NODE_STATUS 的 code）
  var NODE_STATUS = { PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', DONE: 'DONE', REJECTED: 'REJECTED', WITHDRAWN: 'WITHDRAWN' };

  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'processId', path: 'processId' },
        { name: 'workflowId', path: 'workflowId' },
        { name: 'status', path: 'status' },
        { name: 'initiator', path: 'initiator' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  function now() { return Date.now(); }
  function cloneNodes(nodes) {
    return (Array.isArray(nodes) ? nodes : []).map(function (n) {
      return {
        id: n.id,
        name: n.name,
        status: n.status || NODE_STATUS.PENDING,
        approver: (n.approver == null ? '' : String(n.approver)),
        ops: Array.isArray(n.ops) ? n.ops.slice() : []
      };
    });
  }

  // ===================== 软迁移（读取时兼容）=====================
  function normalizeInstance(rec) {
    if (!rec) return rec;
    if (!Array.isArray(rec.nodes)) rec.nodes = [];
    rec.nodes.forEach(function (n) {
      if (!n.id) n.id = (root.RT_DB && root.RT_DB.genId) ? root.RT_DB.genId() : ('n_' + Date.now() + Math.random());
      if (!n.status) n.status = NODE_STATUS.PENDING;
      if (!Array.isArray(n.ops)) n.ops = [];
    });
    if (typeof rec.currentNodeIdx !== 'number' || isNaN(rec.currentNodeIdx)) rec.currentNodeIdx = 0;
    if (!STATUS[rec.status]) rec.status = STATUS.RUNNING;
    if (typeof rec.formData !== 'object' || rec.formData == null) rec.formData = {};
    if (!Array.isArray(rec.history)) rec.history = [];
    if (typeof rec.sourceRef !== 'object' || rec.sourceRef == null) rec.sourceRef = null;
    return rec;
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
  function getInst(db, id) {
    return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) {
      if (!r) { db.close(); throw new Error('流程实例不存在'); }
      return normalizeInstance(r);
    });
  }
  function saveInst(db, rec) {
    rec.updatedAt = now();
    rec.updatedBy = rec.updatedBy || '';
    return reqToPromise(tx(db, 'readwrite').put(rec)).then(function () { db.close(); return rec; })
      .catch(function (err) { db.close(); throw err; });
  }
  function pushHistory(rec, action, operator, extra) {
    var h = { action: action, operator: operator == null ? '' : String(operator), nodeIdx: rec.currentNodeIdx, time: now() };
    if (extra) { if (extra.comment != null) h.comment = String(extra.comment); if (extra.toAccount != null) h.toAccount = String(extra.toAccount); }
    else h.comment = '';
    rec.history.push(h);
    return h;
  }
  function curNode(rec) {
    return rec.nodes && rec.nodes[rec.currentNodeIdx] ? rec.nodes[rec.currentNodeIdx] : null;
  }

  // ===================== 发起流程 =====================
  function startInstance(processId, formData, operator) {
    if (!processId) return Promise.reject(new Error('缺少流程定义 ID'));
    var op = (operator == null ? '' : String(operator));
    var procPromise = (root.RT_PROCESSES && root.RT_PROCESSES.getProcess)
      ? root.RT_PROCESSES.getProcess(processId)
      : Promise.reject(new Error('流程模块未加载'));
    return procPromise.then(function (proc) {
      if (!proc) throw new Error('流程定义不存在');
      if (!proc.workflowId) throw new Error('流程未关联工作流');
      var wfPromise = (root.RT_WORKFLOWS && root.RT_WORKFLOWS.getWorkflow)
        ? root.RT_WORKFLOWS.getWorkflow(proc.workflowId)
        : Promise.reject(new Error('工作流模块未加载'));
      return wfPromise.then(function (wf) {
        if (!wf) throw new Error('关联工作流不存在');
        var ts = now();
        var rec = {
          id: root.RT_DB.genId(),
          processId: proc.id,
          processName: proc.name,
          workflowId: wf.id,
          workflowName: wf.name,
          nodes: cloneNodes(wf.nodes),
          currentNodeIdx: 0,
          status: STATUS.RUNNING,
          formData: (formData && typeof formData === 'object') ? formData : {},
          history: [],
          initiator: op,
          createdBy: op, createdAt: ts, updatedBy: op, updatedAt: ts
        };
        pushHistory(rec, 'SUBMIT', op, { comment: '' });
        if (rec.nodes[0]) rec.nodes[0].status = NODE_STATUS.IN_PROGRESS;
        return openDB().then(function (db) { return saveInst(db, rec); });
      });
    });
  }

  // ===================== 审批流转通知（批次 216 #26）=====================
  // 审批动作完成后向「目标审批人（或发起人，终态）」写一条本地通知。
  // 尊重 master 开关由 notifications.js 内部 gate；此处仅算目标 + 构造 payload。
  // 跳过：目标为空 或 目标 === 操作者自身（不通知自己）。
  function writeFlowNotification(rec, action, operator, extra) {
    if (!root.RT_NOTIFICATIONS || !root.RT_NOTIFICATIONS.addNotification) return;
    if (!root.RT_NOTIFICATIONS.TYPES) return;
    extra = extra || {};
    var op = (operator == null ? '' : String(operator));
    var processName = rec.processName || '';
    var initiator = rec.initiator || '';
    var T = root.RT_NOTIFICATIONS.TYPES;
    var target = '';
    var payload = {
      toAccount: '',
      type: '',
      titleKey: '',
      bodyKey: '',
      refType: 'process_instance',
      refId: rec.id,
      params: { operator: op, processName: processName }
    };

    if (action === 'APPROVE') {
      if (rec.status === STATUS.APPROVED) {
        // 终态：通知发起人「已审批通过」
        target = initiator;
        payload.type = T.APPROVED;
        payload.titleKey = 'notify.title.approved';
        payload.bodyKey = 'notify.body.approved';
      } else {
        // 推进中：通知下一节点审批人
        var n = curNode(rec);
        if (!n) return;
        target = n.approver || '';
        payload.type = T.APPROVE;
        payload.titleKey = 'notify.title.approvePending';
        payload.bodyKey = 'notify.body.approvePending';
        payload.params.nodeName = n.name || '';
      }
    } else if (action === 'REJECT') {
      target = initiator;
      payload.type = T.REJECTED;
      payload.titleKey = 'notify.title.rejected';
      payload.bodyKey = 'notify.body.rejected';
    } else if (action === 'TRANSFER') {
      target = (extra.toAccount == null ? '' : String(extra.toAccount));
      var tn = curNode(rec);
      payload.type = T.TRANSFER;
      payload.titleKey = 'notify.title.transfer';
      payload.bodyKey = 'notify.body.transfer';
      payload.params.nodeName = tn ? (tn.name || '') : '';
    } else if (action === 'ADDSIGN') {
      target = (extra.toAccount == null ? '' : String(extra.toAccount));
      var an = curNode(rec);
      payload.type = T.ADDSIGN;
      payload.titleKey = 'notify.title.addsign';
      payload.bodyKey = 'notify.body.addsign';
      payload.params.nodeName = an ? (an.name || '') : '';
    } else {
      return;
    }

    if (!target || target === op) return; // 跳过空目标 / 自身
    payload.toAccount = target;
    try { root.RT_NOTIFICATIONS.addNotification(payload); } catch (e) { /* 通知失败不阻塞审批 */ }
  }

  // ===================== 审批动作 =====================
  function approve(id, operator, comment) {
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      return getInst(db, id).then(function (rec) {
        if (rec.status !== STATUS.RUNNING) { db.close(); throw new Error('当前状态不可审批'); }
        var node = curNode(rec);
        if (!node) { db.close(); throw new Error('无当前节点'); }
        node.status = NODE_STATUS.DONE;
        if (rec.currentNodeIdx >= rec.nodes.length - 1) {
          rec.status = STATUS.APPROVED;
        } else {
          rec.currentNodeIdx += 1;
          if (rec.nodes[rec.currentNodeIdx]) rec.nodes[rec.currentNodeIdx].status = NODE_STATUS.IN_PROGRESS;
        }
        pushHistory(rec, 'APPROVE', op, { comment: comment });
        return saveInst(db, rec).then(function (saved) {
          writeFlowNotification(saved, 'APPROVE', op);
          return saved;
        });
      });
    });
  }

  function reject(id, operator, comment) {
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      return getInst(db, id).then(function (rec) {
        if (rec.status !== STATUS.RUNNING) { db.close(); throw new Error('当前状态不可驳回'); }
        var node = curNode(rec);
        if (node) node.status = NODE_STATUS.REJECTED;
        rec.status = STATUS.REJECTED;
        pushHistory(rec, 'REJECT', op, { comment: comment });
        return saveInst(db, rec).then(function (saved) {
          writeFlowNotification(saved, 'REJECT', op);
          return saved;
        });
      });
    });
  }

  function withdraw(id, operator, comment) {
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      return getInst(db, id).then(function (rec) {
        if (rec.status === STATUS.APPROVED) { db.close(); throw new Error('已通过的流程不可撤回'); }
        if (rec.initiator && rec.initiator !== op) { /* 允许发起人撤回，非发起人拦截更严格；本地演示宽松处理 */ }
        rec.status = STATUS.WITHDRAWN;
        pushHistory(rec, 'WITHDRAW', op, { comment: comment });
        return saveInst(db, rec);
      });
    });
  }

  function transfer(id, operator, toAccount, comment) {
    var op = (operator == null ? '' : String(operator));
    var to = (toAccount == null ? '' : String(toAccount));
    if (!to) return Promise.reject(new Error('请指定转办人'));
    return openDB().then(function (db) {
      return getInst(db, id).then(function (rec) {
        if (rec.status !== STATUS.RUNNING) { db.close(); throw new Error('当前状态不可转办'); }
        var node = curNode(rec);
        if (!node) { db.close(); throw new Error('无当前节点'); }
        node.approver = to;
        pushHistory(rec, 'TRANSFER', op, { toAccount: to, comment: comment });
        return saveInst(db, rec).then(function (saved) {
          writeFlowNotification(saved, 'TRANSFER', op, { toAccount: to });
          return saved;
        });
      });
    });
  }

  function addsign(id, operator, toAccount, comment) {
    var op = (operator == null ? '' : String(operator));
    var to = (toAccount == null ? '' : String(toAccount));
    if (!to) return Promise.reject(new Error('请指定加签人'));
    return openDB().then(function (db) {
      return getInst(db, id).then(function (rec) {
        if (rec.status !== STATUS.RUNNING) { db.close(); throw new Error('当前状态不可加签'); }
        var node = curNode(rec);
        if (!node) { db.close(); throw new Error('无当前节点'); }
        var newNode = {
          id: (root.RT_DB && root.RT_DB.genId) ? root.RT_DB.genId() : ('n_' + Date.now() + Math.random()),
          name: (node.name || '节点') + '·加签',
          status: NODE_STATUS.PENDING,
          approver: to,
          ops: Array.isArray(node.ops) ? node.ops.slice() : []
        };
        rec.nodes.splice(rec.currentNodeIdx + 1, 0, newNode);
        pushHistory(rec, 'ADDSIGN', op, { toAccount: to, comment: comment });
        return saveInst(db, rec).then(function (saved) {
          writeFlowNotification(saved, 'ADDSIGN', op, { toAccount: to });
          return saved;
        });
      });
    });
  }

  // ===================== 查询 =====================
  function getAllInstances() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = (Array.isArray(list) ? list : []).map(normalizeInstance);
        list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }
  function listByPending(approver) {
    var a = (approver == null ? '' : String(approver));
    return getAllInstances().then(function (list) {
      return list.filter(function (r) {
        if (r.status !== STATUS.RUNNING) return false;
        var n = curNode(r);
        return !!n && (n.approver === a);
      });
    });
  }
  function listByInitiator(account) {
    var a = (account == null ? '' : String(account));
    return getAllInstances().then(function (list) {
      return list.filter(function (r) { return r.initiator === a; });
    });
  }
  function listByStatus(status) {
    return getAllInstances().then(function (list) {
      return status ? list.filter(function (r) { return r.status === status; }) : list;
    });
  }
  // 批次215 首页「我已处理·已审批」：history 中 operator===account 且动作非 SUBMIT 的实例（去重）
  function listByActor(account) {
    var a = (account == null ? '' : String(account));
    return getAllInstances().then(function (list) {
      var seen = {};
      return list.filter(function (r) {
        if (seen[r.id]) return false;
        var acted = (r.history || []).some(function (h) {
          return h.operator === a && h.action && h.action !== 'SUBMIT';
        });
        if (acted) { seen[r.id] = 1; return true; }
        return false;
      });
    });
  }
  function getInstance(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r ? normalizeInstance(r) : null; });
    }).catch(function (err) { db.close(); throw err; });
  }
  function deleteInstance(id) {
    if (!id) return Promise.reject(new Error('缺少实例 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id))
        .then(function () { db.close(); return true; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  // 批次217 #27：写入反向业务回链（任务/代办挂流程后，从实例侧跳回来源）
  function linkSourceRef(id, sourceRef, operator) {
    if (!id) return Promise.reject(new Error('缺少实例 ID'));
    var op = (operator == null ? '' : String(operator));
    var ref = (sourceRef == null || typeof sourceRef !== 'object') ? null : { type: String(sourceRef.type || ''), id: String(sourceRef.id || '') };
    if (ref && (!ref.type || !ref.id)) ref = null;
    return openDB().then(function (db) {
      return getInst(db, id).then(function (rec) {
        rec.sourceRef = ref;
        return saveInst(db, rec).then(function (saved) { return saved; });
      });
    });
  }

  var api = {
    STORE: STORE,
    STATUS: STATUS, ACTIONS: ACTIONS, NODE_STATUS: NODE_STATUS,
    normalizeInstance: normalizeInstance,
    startInstance: startInstance,
    approve: approve, reject: reject, withdraw: withdraw, transfer: transfer, addsign: addsign,
    getAllInstances: getAllInstances,
    listByPending: listByPending,
    listByInitiator: listByInitiator,
    listByStatus: listByStatus,
    listByActor: listByActor,
    getInstance: getInstance,
    deleteInstance: deleteInstance,
    linkSourceRef: linkSourceRef
  };
  root.RT_PROCESS_INSTANCES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
