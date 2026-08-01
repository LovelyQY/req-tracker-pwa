// processes.js —— 流程定义数据层（IndexedDB，基于共享 db.js）
//
// 数据库由 db.js 统一拥有（库 'req-tracker'）。本模块只注册自己的 store 与索引，
// 并通过 RT_DB.openDB() 打开数据库、RT_DB.genId() 生成 32 位 ID。
//
// 批次 214（#24 流程管理重构）重设计：
//   - 移除 targetKey（不再挂具体报表页，流程只定义「模板 + 关联工作流」）
//   - 新增 formTemplate 可配置表单模板（字段类型：文本框/文本域/筛选框/多选框/图片/附件）
//   - 编码自动生成 PWA+LCL+NNN（只读，用户不可改）
//   - 软迁移：旧记录（含 targetKey / 手动 code）读取时兼容转换
//
// 记录字段：
//   id            string  32 位自动 ID
//   code          string  自动生成 PWA+LCL+001（只读，系统生成）
//   name          string  1–50 位（主页/列表显示名）
//   description   string  最多 200 位（可空）
//   workflowId    string  关联工作流 ID（外键，必填）
//   formTemplate  array   可配置表单模板字段（见 FIELD 结构）
//   iconKey       string  列表图标 key（默认 'process'）
//   sort          number  TAB/列表排序权重
//   enabled       bool    是否启用
//   createdBy / createdAt / updatedBy / updatedAt  审计字段
//
// formTemplate 字段结构：
//   { id: string, label: string, type: 'text'|'textarea'|'select'|'multiselect'|'image'|'attachment',
//     options?: string[], required?: bool, placeholder?: string }
//
// 流程为独立定义；运行态在 process_instances store（见 process-instances.js）。
(function (root) {
  'use strict';

  var STORE = 'processes';
  var LIMITS = { CODE_MAX: 12, NAME_MAX: 50, DESC_MAX: 200 };
  // 编码前缀：PWA（项目前缀）+ LCL（LiuCheng/流程）+ 3 位零填充序号
  var CODE_PREFIX = 'PWA';
  var PROCESS_PREFIX = 'LCL';
  var CODE_PAD = 3;
  // 表单字段类型（与 #24 处置一致）
  var FORM_FIELD_TYPES = ['text', 'textarea', 'select', 'multiselect', 'image', 'attachment'];

  // 注册 store（db.js 首次打开时创建；升级时探测缺失 store 自动补建）
  if (root.RT_DB && typeof root.RT_DB.registerStore === 'function') {
    root.RT_DB.registerStore(STORE, {
      keyPath: 'id',
      indexes: [
        { name: 'code', path: 'code' },
        { name: 'workflowId', path: 'workflowId' },
        { name: 'enabled', path: 'enabled' },
        { name: 'sort', path: 'sort' },
        { name: 'updatedAt', path: 'updatedAt' }
      ]
    });
  }

  function zeroPad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  // ===================== 软迁移（读取时兼容旧记录）=====================
  function normalizeProcess(rec) {
    if (!rec) return rec;
    // 丢弃旧 targetKey 字段（#24 移除）
    if ('targetKey' in rec) delete rec.targetKey;
    // formTemplate 缺省为空数组；非数组兜底
    if (!Array.isArray(rec.formTemplate)) rec.formTemplate = [];
    rec.formTemplate.forEach(function (f) {
      if (!f) return;
      if (!f.id) f.id = (root.RT_DB && root.RT_DB.genId) ? root.RT_DB.genId() : ('f_' + Date.now() + Math.random());
      if (!f.type || FORM_FIELD_TYPES.indexOf(f.type) < 0) f.type = 'text';
      if (f.type === 'select' || f.type === 'multiselect') {
        if (!Array.isArray(f.options)) f.options = [];
      } else {
        delete f.options;
      }
      f.required = !!f.required;
    });
    if (!rec.iconKey) rec.iconKey = 'process';
    return rec;
  }

  // ===================== 表单模板字段校验 =====================
  function validateField(f, idx) {
    if (!f || typeof f !== 'object') return '字段 #' + (idx + 1) + ' 格式无效';
    var label = (f.label == null ? '' : String(f.label)).trim();
    if (!label) return '字段 #' + (idx + 1) + ' 缺少标签';
    if (FORM_FIELD_TYPES.indexOf(f.type) < 0) return '字段「' + label + '」类型无效';
    if (f.type === 'select' || f.type === 'multiselect') {
      if (!Array.isArray(f.options) || f.options.length === 0) return '字段「' + label + '」需至少配置一个选项';
    }
    return null;
  }

  // ===================== 校验（同步，字段格式）=====================
  function validateProcess(data, opts) {
    opts = opts || {};
    var errors = {};
    data = data || {};
    var name = (data.name == null ? '' : String(data.name)).trim();
    var description = (data.description == null ? '' : String(data.description)).trim();
    var workflowId = (data.workflowId == null ? '' : String(data.workflowId));

    if (!name) errors.name = '请输入流程名称';
    else if (name.length > LIMITS.NAME_MAX) errors.name = '流程名称最多 ' + LIMITS.NAME_MAX + ' 位';

    if (description.length > LIMITS.DESC_MAX) errors.description = '描述最多 ' + LIMITS.DESC_MAX + ' 位';

    if (!workflowId) errors.workflowId = '请选择关联工作流';
    // 注：code 由系统生成（genNextCode），不要求用户输入，故不在校验中强制

    // 表单模板校验（仅当提供了 formTemplate 时；空模板允许）
    var tmpl = data.formTemplate;
    if (tmpl != null) {
      if (!Array.isArray(tmpl)) {
        errors.formTemplate = '表单模板格式无效';
      } else {
        for (var i = 0; i < tmpl.length; i++) {
          var fe = validateField(tmpl[i], i);
          if (fe) { errors.formTemplate = fe; break; }
        }
      }
    }

    var first = null;
    ['name', 'description', 'workflowId', 'formTemplate'].forEach(function (k) {
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

  function normEnabled(v) {
    if (v === true || v === 'true' || v === 1 || v === '1') return true;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true; // 默认启用
  }
  function normSort(v) {
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }
  function normField(f) {
    var nf = {
      id: (f && f.id) ? String(f.id) : ((root.RT_DB && root.RT_DB.genId) ? root.RT_DB.genId() : ('f_' + Date.now() + Math.random())),
      label: (f && f.label != null ? String(f.label) : '').trim(),
      type: (f && f.type && FORM_FIELD_TYPES.indexOf(f.type) >= 0) ? f.type : 'text',
      required: !!(f && f.required)
    };
    if (nf.type === 'select' || nf.type === 'multiselect') {
      nf.options = (f && Array.isArray(f.options)) ? f.options.map(function (o) { return String(o); }) : [];
    }
    if (f && f.placeholder != null) nf.placeholder = String(f.placeholder);
    return nf;
  }
  function normTemplate(tmpl) {
    if (!Array.isArray(tmpl)) return [];
    return tmpl.map(normField);
  }

  // ===================== 自动编号 PWA+LCL+NNN =====================
  function genNextCode() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        var max = 0;
        var re = new RegExp('^' + CODE_PREFIX + '\\+' + PROCESS_PREFIX + '\\+' + '(\\d+)$');
        list.forEach(function (r) {
          if (!r || !r.code) return;
          var m = re.exec(String(r.code));
          if (m) {
            var n = parseInt(m[1], 10);
            if (!isNaN(n) && n > max) max = n;
          }
        });
        return CODE_PREFIX + '+' + PROCESS_PREFIX + '+' + zeroPad(max + 1, CODE_PAD);
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  // ===================== CRUD =====================
  function createProcess(data, operator) {
    var v = validateProcess(data);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var now = Date.now();
    var op = (operator == null ? '' : String(operator));
    return genNextCode().then(function (code) {
      return openDB().then(function (db) {
        var record = {
          id: root.RT_DB.genId(),
          code: code,
          name: (data.name + '').trim(),
          description: (data.description == null ? '' : String(data.description)).trim(),
          workflowId: String(data.workflowId),
          formTemplate: normTemplate(data.formTemplate),
          iconKey: ((data.iconKey == null ? '' : String(data.iconKey)).trim() || 'process'),
          sort: normSort(data.sort),
          enabled: normEnabled(data.enabled),
          createdBy: op, createdAt: now, updatedBy: op, updatedAt: now
        };
        return reqToPromise(tx(db, 'readwrite').put(record)).then(function () { db.close(); return record; })
          .catch(function (err) { db.close(); throw err; });
      });
    });
  }

  function updateProcess(id, patch, operator) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    var v = validateProcess(patch);
    if (!v.ok) return Promise.reject(new Error(v.errors[v.first] || '字段校验失败'));
    var op = (operator == null ? '' : String(operator));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (old) {
        if (!old) { db.close(); throw new Error('记录不存在'); }
        old.name = (patch.name + '').trim();
        old.description = (patch.description == null ? '' : String(patch.description)).trim();
        old.workflowId = String(patch.workflowId);
        old.formTemplate = normTemplate(patch.formTemplate);
        old.iconKey = ((patch.iconKey == null ? '' : String(patch.iconKey)).trim() || 'process');
        old.sort = normSort(patch.sort);
        old.enabled = normEnabled(patch.enabled);
        // code 保持不变（系统生成，不可改）
        old.updatedBy = op;
        old.updatedAt = Date.now();
        return reqToPromise(tx(db, 'readwrite').put(old)).then(function () { db.close(); return old; });
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  function deleteProcess(id) {
    if (!id) return Promise.reject(new Error('缺少记录 ID'));
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readwrite').delete(id))
        .then(function () { db.close(); return true; })
        .catch(function (err) { db.close(); throw err; });
    });
  }

  function getProcess(id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').get(id)).then(function (r) { db.close(); return r ? normalizeProcess(r) : null; });
    }).catch(function (err) { db.close(); throw err; });
  }

  function getAllProcesses() {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, 'readonly').getAll()).then(function (list) {
        db.close();
        list = Array.isArray(list) ? list : [];
        list = list.map(normalizeProcess);
        list.sort(function (a, b) {
          var sa = (a.sort == null ? 0 : Number(a.sort)) || 0;
          var sb = (b.sort == null ? 0 : Number(b.sort)) || 0;
          if (sa !== sb) return sa - sb;
          return (a.name || '').localeCompare(b.name || '', 'zh');
        });
        return list;
      }).catch(function (err) { db.close(); throw err; });
    });
  }

  var api = {
    STORE: STORE,
    LIMITS: LIMITS,
    FORM_FIELD_TYPES: FORM_FIELD_TYPES,
    CODE_PREFIX: CODE_PREFIX, PROCESS_PREFIX: PROCESS_PREFIX, CODE_PAD: CODE_PAD,
    genId: function () { return root.RT_DB.genId(); },
    normalizeProcess: normalizeProcess,
    validateProcess: validateProcess,
    validateField: validateField,
    genNextCode: genNextCode,
    createProcess: createProcess, updateProcess: updateProcess,
    deleteProcess: deleteProcess, getProcess: getProcess,
    getAllProcesses: getAllProcesses
  };
  root.RT_PROCESSES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
