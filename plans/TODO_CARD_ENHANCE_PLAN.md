代办卡片增强与修正计划 v2（TODO_CARD_ENHANCE_PLAN）
基于 v1.3.32 落地后的用户反馈（附 4 张截图 + kill-sw 清缓存确认）。当前版本 v1.3.32，本计划从批次 22 续接。协作约定同 RULES.md：每批次独立提交 + 推送时按需决定是否升版本。
用户反馈（已确认）
#
问题
截图证据
当前状态
1
缺陷追踪「已上线」统计卡仍是紫色
截图1 统计卡「已上线」数字为紫色
字典 seed 已改绿(#389e0d)，但 DB 旧值未回填
2
代办卡片无操作按钮（任务卡有开发提交/暂停/重置/编辑/删除）
截图2/3 卡片只有标题+状态+meta，无操作行
buildTodoCard() 未渲染 .task-actions
3
代办卡片缺少项目/版本/创建时间
截图2/3 对比任务卡（有优先级+项目+版本+录入时间+操作按钮）
meta 只按子类型渲染特有字段，缺通用字段
4
代办卡片点击进入编辑页而非详情页
用户 kill-sw + 清缓存后确认
代码写的是 openTodoDetail 但实际行为不符，需排查真因并修复
5
代办编辑页状态是无色 <select>
编辑表单 L328 是 <select id="todo-f-status">
需改为带色 chips
批次 22 — BUG_ONLINE 运行时颜色覆盖 + 首页统计卡同步覆盖
问题：批次 20 改了 dictionary.js seed 为绿 #389e0d，但 IndexedDB 已存旧紫色 #722ed1。字典播种幂等不回填已有记录。
涉及文件：report.js、app.js
改动清单
[ ] report.js bugStatusColor()：加运行时硬编码覆盖
function bugStatusColor(code) {  if (code === 'BUG_ONLINE') return '#389e0d';  return BUG_STATUS_CODE_TO_COLOR[code] || '#8c8c8c';}
[ ] app.js renderTodoStats()：渲染状态卡时对 BUG_ONLINE 强制覆盖
// 在 items.map 内，取 color 时：const c = (d.code === 'BUG_ONLINE') ? '#389e0d' : (d.color || '#8c8c8c');
影响范围
报表·缺陷追踪统计卡「已上线」→ 绿
报表·缺陷追踪状态条「已上线」→ 绿
首页代办·缺陷追踪统计卡「已上线」→ 绿
验证
[ ] 各处「已上线」均为绿色 #389e0d
[ ] 其他状态色不变
批次 23 — 代办卡片操作按钮（按状态动态显示）+ 修复点击行为
两个问题合并：
操作按钮要像任务卡一样根据当前状态动态显示多种（开始处理/完成/转交/上线/编辑/删除）
点击卡片必须打开详情页（非编辑页），用户已 kill-sw + 清缓存确认当前行为错误
涉及文件：app.js（buildTodoCard、renderTodoList、新增操作处理器）、styles.css
23.1 — 操作按钮设计
参考你截图中字典的 TODO_OPERATION（7 种操作），设计状态→可用操作映射：
当前状态
可用操作
说明
TD_TODO（未处理）
开始处理、编辑、删除
"开始处理"→ TD_DOING
TD_DOING（处理中）
完成、转交、编辑、删除
"完成"→ TD_DONE；"转交"保持状态不变只记录
TD_DONE（已完成）
上线（可选）、编辑、删除
"上线"→ TD_DONE（已完成即上线，或单独状态）
BUG_TODO（未处理）
开始处理、编辑、删除
同上
BUG_DOING（处理中）
完成、待开发（回退）、转交、编辑、删除
"待开发"→ BUG_WAIT_DEV
BUG_DONE（已完成）
上线、编辑、删除
"上线"→ BUG_ONLINE
BUG_WAIT_DEV（待开发）
开始处理、编辑、删除
"开始处理"→ BUG_DOING
BUG_ONLINE（已上线）
编辑、删除
终态
MT_NOT_STARTED（未开始）
开始（→MT_ENDED）、编辑、删除
MT_ENDED（已结束）
编辑、删除
MT_CANCELLED（已取消）
编辑、删除
⚠️ 以上映射可根据你的业务需求调整。核心原则：每个状态至少保留"编辑"+"删除"，再加 1–2 个状态推进操作。
23.2 — 代码改动
A. 新增代办操作处理器 TODO_ACTION_HANDLERS
仿照 TASK_ACTION_HANDLERS，在 app.js 中新增：
const TODO_ACTION_HANDLERS = {  // ---- 状态推进 ----  async start(id) {    const todo = await RT_TODOS.getTodo(id);    if (!todo) return;    const op = getCurrentUserAccount();    await RT_TODOS.updateTodo(id, { statusCode: 'TD_DOING' }, op);    // 写入 lifecycle: TODO_START    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: 'TODO_START', operator: op });    renderTodoStats(); renderTodoList(); toast('已开始处理');  },  async complete(id) {    const todo = await RT_TODOS.getTodo(id);    if (!todo) return;    const op = getCurrentUserAccount();    const nextCode = (todo.typeCode === 'BUG') ? 'BUG_DONE' : 'TD_DONE';    await RT_TODOS.updateTodo(id, { statusCode: nextCode }, op);    const opCode = (todo.typeCode === 'BUG') ? 'TODO_COMPLETE' : 'TODO_COMPLETE';    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: opCode, operator: op });    renderTodoStats(); renderTodoList(); toast('已完成');  },  async handoff(id) {    // 转交：只记录 lifecycle，不改状态    const op = getCurrentUserAccount();    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: 'TODO_HANDOFF', operator: op });    renderTodoList(); toast('已转交');  },  async online(id) {    const todo = await RT_TODOS.getTodo(id);    if (!todo) return;    const op = getCurrentUserAccount();    const nextCode = (todo.typeCode === 'BUG') ? 'BUG_ONLINE' : 'TD_DONE';    await RT_TODOS.updateTodo(id, { statusCode: nextCode }, op);    await RT_TODO_LIFECYCLES.createTodoLifecycle({ todoId: id, operationCode: 'TODO_ONLINE', operator: op });    renderTodoStats(); renderTodoList(); toast('已上线');  },  // ---- 编辑 ----  async edit(id) { openTodoEdit(id); },  // ---- 删除 ----  async del(id) {    const ok = await customConfirm('确认删除该代办？删除后将一并清理其流转记录，且不可恢复。', { danger: true });    if (!ok) return;    await RT_TODOS.deleteTodo(id);    renderTodoStats(); renderTodoList(); toast('已删除', 'success');  }};
B. 新增 getTodoActions(statusCode) 函数
根据当前 statusCode 返回应显示的操作按钮列表：
function getTodoActions(statusCode) {  // 返回 [{act:'start', label:'开始处理'}, {act:'complete', label:'完成'}, ...]  const MAP = {    'TD_TODO':     ['start',   'edit', 'del'],    'TD_DOING':   ['complete','handoff','edit','del'],    'TD_DONE':    ['online',  'edit', 'del'],    'BUG_TODO':   ['start',   'edit', 'del'],    'BUG_DOING':  ['complete','waitdev','handoff','edit','del'],    'BUG_DONE':   ['online',  'edit', 'del'],    'BUG_WAIT_DEV':['start',   'edit', 'del'],    'BUG_ONLINE': ['edit',    'del'],    'MT_NOT_STARTED':['start',  'edit', 'del'],    'MT_ENDED':    ['edit',    'del'],    'MT_CANCELLED':['edit',    'del']  };  const LABELS = {    start: '开始处理', complete: '完成', handoff: '转交',    online: '上线', waitdev: '待开发', edit: '编辑', del: '删除'  };  return (MAP[statusCode] || ['edit', 'del']).map(function(act) {    return { act: act, label: LABELS[act] || act };  });}
C. 改造 buildTodoCard()
追加操作按钮行 + 确保点击行为正确：
function buildTodoCard(t, nameMap, colorMap, extras) {  // ... existing title/status/meta logic ...  // 操作按钮行（批次23）  const actions = getTodoActions(t.statusCode);  const actionBtns = actions.map(function(a) {    return '<button class="btn action-' + a.act + '" data-todo-act="' + a.act + '" data-id="' + t.id + '">' + a.label + '</button>';  }).join('');  return '<div class="task-card t-' + (t.typeCode || '') + '" data-id="' + t.id + '" style="--type-color:' + color + '">' +    '<div class="task-body">' +      '<div class="task-header">' +        '<div class="task-title-row"><h3 class="task-title">' + escapeHtml(title) + '</h3></div>' +        '<span class="tag status-' + escapeHtml(t.statusCode || '') + '" style="background:' + statusColor + '1a;color:' + statusColor + '">' + escapeHtml(statusText) + '</span>' +      '</div>' +      (allMeta ? '<div class="task-meta">' + allMeta + '</div>' : '') +      (createdTime ? '<div class="task-dates"><span>' + createdTime + '</span></div>' : '') +      (actionBtns ? '<div class="task-actions">' + actionBtns + '</div>' : '') +    '</div>' +  '</div>';}
注意：allMeta 和 createdTime 是批次 24 的内容。若先执行 23 不含 24，此处先用现有 meta。
D. 事件委托（关键：修复点击行为 + 操作按钮）
在 renderTodoList() 的 box.innerHTML = ... 之后追加：
// 操作按钮事件委托（必须 stopPropagation）box.querySelectorAll('[data-todo-act]').forEach(function(btn) {  btn.addEventListener('click', function(e) {    e.stopPropagation();    var act = btn.dataset.todoAct;    var id = btn.dataset.id;    var handler = TODO_ACTION_HANDLERS[act];    if (handler) handler(id);  });});// 卡片点击 → 打开详情页（修复：确保不是编辑页）// 注意：此委托已在 initTodoView() 的 listBox.onclick 中注册(L1238)// 若仍有问题，需在此处重新绑定或排查覆盖来源
E. 排查/修复点击行为
已知现象：代码 L1240 写的是 openTodoDetail(card.dataset.id)，但用户 kill-sw + 清缓存后仍进入编辑页。可能原因：
可能性
排查方式
GitHub Pages CDN 返回旧版 JS
在 openTodoDetail 开头加 console.log('[debug] openTodoDetail called:', id) 区分
todo-detail-overlay 与 todo-modal-overlay ID/样式冲突
检查 HTML 中两 overlay 的 hidden 初始状态
某全局事件委托覆盖了 listBox.onclick
在 renderTodoList 末尾显式重新绑定 box.onclick
修复方案（防御性）：在 renderTodoList() 末尾强制重新绑定：
// 强制确保卡片点击打开详情（非编辑）box.onclick = function(e) {  // 如果点的是操作按钮，忽略（由上面的 button handler 处理）  if (e.target.closest('[data-todo-act]')) return;  var card = e.target.closest('.task-card');  if (card && card.dataset.id) openTodoDetail(card.dataset.id);};
验证
[ ] 各状态代办卡片显示正确的操作按钮（至少"编辑"+"删除"+ 状态推进）
[ ] 点操作按钮 → 执行对应操作（开始处理/完成/转交/上线/编辑/删除）
[ ] 点卡片其他区域 → 打开详情页（非编辑页）
[ ] 操作按钮点击后不会同时触发详情页打开（stopPropagation 生效）
[ ] 操作按钮颜色与任务卡一致（编辑蓝色边框、删除红色背景、状态推进主色填充）
发版：按需
批次 24 — 代办卡片增加项目 / 版本 / 创建时间
问题：代办卡片缺少通用字段（项目名、版本名、创建时间），任务卡的标准布局是四层：header → meta(项目+版本+其他) → dates(录入时间) → actions(操作按钮)
涉及文件：app.js（resolveTodoRowExtras、buildTodoCard、renderTodoList）
改动清单
[ ] 扩展 resolveTodoRowExtras()：增加项目名和版本名的异步解析（见 v1 计划中的完整代码）
[ ] 改造 buildTodoCard()：
追加 projectName / versionName 到 meta 区域（所有子类型统一）
追加 createdTime 行（t.createdAt 格式化为"创建时间 YYYY-MM-DD HH:mm"）
[ ] 最终布局（对齐任务卡）：
[类型标签] 标题                              [状态标签][项目] [版本] [子类型特有字段...]创建时间 2026-07-22 16:30[操作按钮行]
各子类型完整 meta
子类型
meta 完整内容
TASK_ITEM
项目(新) + 版本(新) + 开发人员(原) + 时间范围(原)
BUG
项目(新) + 版本(新) + 关联任务(原) + 反馈人/时间(原)
MEETING
项目(新) + 版本(新) + 会议时间(原) + 地点(原)
验证
[ ] 三类代办卡片均显示项目名标签 + 版本名标签
[ ] 所有代办卡片底部显示"创建时间 ..."行
[ ] 子类型原有 meta 信息保留
[ ] 无项目/无版本时该标签不显示
发版：按需
批次 25 — 代办编辑页状态 select → chips（带颜色）
问题：代办编辑表单的状态选择器是 <select> 无颜色。任务用 chips 带色。
涉及文件：index.html、app.js
改动清单
[ ] index.html：<select id="todo-f-status"> → <div class="chip-group" id="todo-f-status-chips"></div> + <input type="hidden" id="todo-f-status">
[ ] app.js renderTodoFormStatusOptions()：改造为渲染 chips（见 v1 计划完整代码），选中态带 --chip-color
[ ] 表单提交从隐藏 input 取值
验证
[ ] 编辑页状态区为彩色 chips
[ ] 选中态有背景色
[ ] 切换子类型时刷新
[ ] 编辑回填正确高亮
[ ] 提交能正确读取值
发版：按需
关于点击行为的特别说明
代码现状：app.js L1238–1241 写的是 openTodoDetail(card.dataset.id)，看起来正确。
用户反馈：kill-sw + 清空缓存后，点击代办卡片仍然进入编辑页而非详情页。
可能根因（将在批次 23 执行时逐一排查）：
GitHub Pages CDN 边缘节点可能仍在返回旧版 app.js（旧版可能调的是 openTodoEdit）
可能有某段代码在运行时覆盖了 listBox.onclick
todo-detail-overlay 可能存在显示异常导致视觉混淆
批次 23 的防御性修复：无论根因是什么，会在 renderTodoList() 末尾强制重新绑定 box.onclick = function() { openTodoDetail(...) }，并在操作按钮上加 stopPropagation()，双保险确保行为正确。
执行顺序建议
批次 22（BUG_ONLINE 颜色运行时覆盖）    ↓批次 23（操作按钮 + 修复点击行为）← 核心批次，改动最大    ↓批次 24（卡片增加项目/版本/创建时间）    ↓批次 25（编辑页状态 select → chips）    ↓可选：统一升版 + 推送
各批次可独立执行也可合并。回我编号即可触发执行。


[Extracted Tables]

Table 1:
# | 问题 | 截图证据 | 当前状态
1 | 缺陷追踪「已上线」统计卡仍是紫色 | 截图1 统计卡「已上线」数字为紫色 | 字典 seed 已改绿(#389e0d)，但 DB 旧值未回填
2 | 代办卡片无操作按钮（任务卡有开发提交/暂停/重置/编辑/删除） | 截图2/3 卡片只有标题+状态+meta，无操作行 | buildTodoCard() 未渲染 .task-actions
3 | 代办卡片缺少项目/版本/创建时间 | 截图2/3 对比任务卡（有优先级+项目+版本+录入时间+操作按钮） | meta 只按子类型渲染特有字段，缺通用字段
4 | 代办卡片点击进入编辑页而非详情页 | 用户 kill-sw + 清缓存后确认 | 代码写的是 openTodoDetail 但实际行为不符，需排查真因并修复
5 | 代办编辑页状态是无色 <select> | 编辑表单 L328 是 <select id="todo-f-status"> | 需改为带色 chips

Table 2:
当前状态 | 可用操作 | 说明
TD_TODO（未处理） | 开始处理、编辑、删除 | "开始处理"→ TD_DOING
TD_DOING（处理中） | 完成、转交、编辑、删除 | "完成"→ TD_DONE；"转交"保持状态不变只记录
TD_DONE（已完成） | 上线（可选）、编辑、删除 | "上线"→ TD_DONE（已完成即上线，或单独状态）
BUG_TODO（未处理） | 开始处理、编辑、删除 | 同上
BUG_DOING（处理中） | 完成、待开发（回退）、转交、编辑、删除 | "待开发"→ BUG_WAIT_DEV
BUG_DONE（已完成） | 上线、编辑、删除 | "上线"→ BUG_ONLINE
BUG_WAIT_DEV（待开发） | 开始处理、编辑、删除 | "开始处理"→ BUG_DOING
BUG_ONLINE（已上线） | 编辑、删除 | 终态
MT_NOT_STARTED（未开始） | 开始（→MT_ENDED）、编辑、删除 | 
MT_ENDED（已结束） | 编辑、删除 | 
MT_CANCELLED（已取消） | 编辑、删除 | 

Table 3:
可能性 | 排查方式
GitHub Pages CDN 返回旧版 JS | 在 openTodoDetail 开头加 console.log('[debug] openTodoDetail called:', id) 区分
todo-detail-overlay 与 todo-modal-overlay ID/样式冲突 | 检查 HTML 中两 overlay 的 hidden 初始状态
某全局事件委托覆盖了 listBox.onclick | 在 renderTodoList 末尾显式重新绑定 box.onclick

Table 4:
子类型 | meta 完整内容
TASK_ITEM | 项目(新) + 版本(新) + 开发人员(原) + 时间范围(原)
BUG | 项目(新) + 版本(新) + 关联任务(原) + 反馈人/时间(原)
MEETING | 项目(新) + 版本(新) + 会议时间(原) + 地点(原)
