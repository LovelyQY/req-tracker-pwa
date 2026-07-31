/* crud-factory.js — 通用 CRUD 工厂（批次128）
 * 抽取 5 个实体管理页（company / department / position / project / project-version）
 * 一致的 save / doDelete / openConfirm 生命周期，零行为变更。
 *
 * 设计取舍（与计划"7 页完全一致"的前提不符，按实测调整）：
 *   - dictionary 为只读页，本就无 save/openEdit/doDelete，无需接入；
 *   - user 页含角色分配（saveUserRoles）、12s 超时保护、双层 try-catch、refresh()
 *     等特有逻辑，强行泛型化风险高，保留本地实现；
 *   - 仅抽取结构真正一致的 5 页：保存按钮生命周期 + 创建/更新 + 删除 + 确认弹窗。
 *
 * 依赖（页面 / 全局，均在调用期就绪）：
 *   editingId、deletingId、render、setErr、$、toast、closeSheet、closeConfirm、getSessionAccount。
 *
 * store 允许传模块对象或全局名字符串；字符串在调用时经 window[名] 解析，
 * 以规避内联脚本解析期数据模块（defer）尚未就绪的问题。
 */

function crudErrMsg(err) {
  if (!err) return '';
  if (err && typeof err.message === 'string') return err.message;
  try { return String(err); } catch (e) { return ''; }
}

function crudResolveStore(store) {
  return (typeof store === 'string') ? window[store] : store;
}

/* 统一保存 / 创建 / 更新生命周期。
 * opts:
 *   store     — 数据模块对象 或 全局名字符串（如 'RT_COMPANIES'）
 *   create    — store 上创建方法名
 *   update    — store 上更新方法名
 *   validate  — store 上校验方法名：validate(data) -> { ok, errors, first }
 *   getData   — function() 读取并构造 data 对象
 *   fieldMap  — { 字段名: 输入框id }，校验失败时逐字段 setErr 并聚焦首个错误字段
 *   pre       — 可选：function(data) -> Promise<data>，保存前数据预处理（如部门带出所属公司）
 */
function crudSave(opts) {
  var saveBtn = $('saveBtn');
  if (saveBtn && saveBtn.disabled) return;
  try {
    var data = opts.getData();
    var store = crudResolveStore(opts.store);
    var v = store[opts.validate](data);
    if (!v.ok) {
      Object.keys(opts.fieldMap).forEach(function (f) { setErr(f, (v.errors && v.errors[f]) || ''); });
      var input = $(opts.fieldMap[v.first]);
      if (input) input.focus();
      return;
    }
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = t('common.saving'); }
    var operator = getSessionAccount() || '';
    var doIt = opts.pre ? opts.pre(data) : Promise.resolve(data);
    doIt.then(function (d) {
      var p = editingId
        ? store[opts.update](editingId, d, operator)
        : store[opts.create](d, operator);
      p.then(function (rec) {
        if (root.RT_SYNC && typeof root.RT_SYNC.enqueue === 'function' && typeof opts.store === 'string') {
          var rid = (rec && rec.id != null) ? rec.id : editingId;
          if (rid != null) root.RT_SYNC.enqueue(opts.store, rid, 'put');
        }
        closeSheet(); toast(editingId ? t('common.saved') : t('common.created')); render();
      })
       .catch(function (err) { toast(t('common.operationFailed') + crudErrMsg(err)); })
       .then(function () { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = editingId ? t('common.save') : t('common.create'); } });
    }).catch(function (err) {
      toast(t('common.operationFailed') + crudErrMsg(err));
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = editingId ? t('common.save') : t('common.create'); }
    });
  } catch (e) {
    toast(t('common.saveError') + crudErrMsg(e));
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = editingId ? t('common.save') : t('common.create'); }
  }
}

/* 统一删除生命周期 */
function crudDelete(opts) {
  if (!deletingId) return;
  var id = deletingId;
  var store = crudResolveStore(opts.store);
  store[opts.del](id).then(function () {
    if (root.RT_SYNC && typeof root.RT_SYNC.enqueue === 'function' && typeof opts.store === 'string') {
      root.RT_SYNC.enqueue(opts.store, id, 'delete');
    }
    closeConfirm(); toast(t('common.deleted')); render();
  }).catch(function (err) {
    closeConfirm(); toast(t('common.deleteFailed') + crudErrMsg(err));
  });
}

/* 生成 openConfirm：设置 deletingId、异步取记录、填充确认文案、显示遮罩。
 * opts:
 *   store — 数据模块对象 或 全局名字符串
 *   get   — store 上读取单条方法名
 *   text  — function(record) -> 文案；record 为 null（读取失败兜底）时返回兜底文案
 * 返回：function(id)
 */
function makeOpenConfirm(opts) {
  return function (id) {
    deletingId = id;
    var store = crudResolveStore(opts.store);
    store[opts.get](id).then(function (r) {
      $('confirmText').textContent = opts.text(r);
    }).catch(function () {
      $('confirmText').textContent = opts.text(null);
    });
    $('confirmMask').classList.add('show');
  };
}
