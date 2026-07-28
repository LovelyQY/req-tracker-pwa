/* ui-utils.js — 共享 UI 工具层（批次127：从各 HTML 内联脚本抽取，零行为变更）
 * 仅定义一次，供 company / department / position / project / project-version /
 * user / dictionary / security / changelog / about 等页复用。
 *
 * 说明（与计划偏差，已记录于执行清单）：
 *  - setErr / clearErr 因各页「字段→输入框」映射不同，仍保留在各页内联脚本。
 *  - openConfirm 因各页确认文案与数据来源不同，仍保留在各页内联脚本。
 *  - profile-edit 的 showErr/clearErr/updateCounter 为基于 ed-err 的独立实现，不在此列。
 *  - closeSheet / closeConfirm 的 DOM 操作在各页一致，仅附带重置页面级变量
 *    （editingId / editingField / deletingId，均为全局 var），故在此统一处理。
 */
function $(id){ return document.getElementById(id); }

function applyGuard(){
  if (typeof RT_PERM !== 'undefined' && RT_PERM.guard) { RT_PERM.guard(document); }
}

function fmtTime(ts){
  if (!ts) return '—';
  var d = new Date(ts);
  function p(n){ return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* 列表空态：渲染到 #list 容器（沿用原内联实现） */
function showErr(msg){ $('list').innerHTML = '<div class="empty">' + escapeHtml(msg) + '</div>'; }

/* 打开/关闭 新增·编辑抽屉 */
function openSheet(){ $('sheetMask').classList.add('show'); $('sheet').classList.add('show'); }

/* 关闭抽屉：统一移除遮罩，并重置页面级编辑态（若存在） */
function closeSheet(){
  $('sheetMask').classList.remove('show');
  $('sheet').classList.remove('show');
  if (typeof editingId !== 'undefined') editingId = null;
  if (typeof editingField !== 'undefined') editingField = null;
}

/* 关闭删除确认框：统一移除遮罩，并重置页面级删除态（若存在） */
function closeConfirm(){
  $('confirmMask').classList.remove('show');
  if (typeof deletingId !== 'undefined') deletingId = null;
}

/* 输入框字数计数（inputId=输入框, maxId=计数显示元素, max=上限） */
function updateCounter(inputId, maxId, max){ $(maxId).textContent = $(inputId).value.length + '/' + max; }

/* 批次137：页面可见性监听统一封装（零行为变更）
 * 将原各页内联的 `window.addEventListener('pageshow', fn)` 与
 * `document.addEventListener('visibilitychange', function(){ if (visibilityState==='visible') fn(); })`
 * 收敛为共享函数，行为完全一致。 */
function onPageShow(fn){ window.addEventListener('pageshow', fn); }
function onVisible(fn){
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'visible') fn();
  });
}
