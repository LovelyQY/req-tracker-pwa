# EXEC_PLAN_218 — 大数据展示统一方案（#28，v1.4.23）

## 目标
解决全站「全量 getAll + 全量 innerHTML」在大数据量下的卡顿/卡死问题：提供单一可复用的分批渲染组件 `renderChunkedList`，支持**无限滚动（IntersectionObserver 触底追加）**与**分页**双模式，覆盖高频大表。

## 设计决策（与用户确认）
- **覆盖范围**：高频大表优先 —— 首页任务列表、首页代办列表、流程审批中心列表、4 个报表清单 overlay（任务/代办/Bug/会议）；小表不动。
- **主交互**：无限滚动（IntersectionObserver）为默认 UX；分页模式按列表可配置。
- **组件形态**：统一组件双模式可切换（`mode: 'infinite' | 'paged'`，每列表各自配置）。
- **安全降级**：无 `IntersectionObserver` 的环境（旧浏览器/测试）一次性全量渲染，**不丢数据**。

## 改动清单
### 新建统一组件
- `ui-list-pager.js`：IIFE 挂载 `window.renderChunkedList`/`window.pageSlice` + `module.exports`。
  - 纯函数 `pageSlice(items, start, size)` → `{chunk, nextStart, hasMore}`，便于单测。
  - `renderChunkedList(opts)`：`opts={container, items, renderItem(item,index)->string, pageSize(默认50), mode, root(默认null=视口), emptyHtml, onChunkRendered}`；
    返回 `{reset(newItems?), destroy(), get renderedCount, get itemCount, get mode}`。
  - infinite：维护 `rendered` 计数，连续 `pageSlice` 分批；sentinel（`.list-sentinel`）+ `IntersectionObserver`（`rootMargin:'300px'`）触底追加；末段渲染「已加载全部 N 条」。
  - paged：渲染分页条（上一页/下一页/`list.paging.showing`/`list.paging.page`）。
- `ui-list-pager.css`：`.list-sentinel` / `.list-paging-info` / `.list-pager` / `.list-pager-btn` / `.list-paging-page`，使用 `--text-muted`/`--border`/`--surface`/`--text` 变量（均带 fallback）。

### 业务接入（双模式 infinite）
- `app.js`：
  - `renderTaskList()` 首建/复用 `taskListPager`（pageSize 50，infinite）。
  - `renderTodoList()` 首建/复用 `todoListPager`；删除原逐按钮绑定，收敛为容器级委托 `onTodoListClick`（防重复绑定标志 `todoListDelegationBound`），由 `initTodoView()` 末尾 `bindTodoListDelegation()` 绑定一次。
- `process-instances.html`：`renderList()` 接入 `instancePager`（pageSize 20，infinite，`root:null`）；`instanceCard` 内联 `onclick` 天然有效。
- `report-task.js` / `report-todo.js` / `report-bug.js` / `report-meeting.js`：各 overlay 清单接入 `taskListPagerOver` / `todoListPagerOver`（pageSize 50，infinite，`root: document.getElementById('tl-overlay')`）。

### 引用登记
- 6 个 html：`index.html` / `process-instances.html` / `report-task.html` / `report-todo.html` / `report-bug.html` / `report-meeting.html` 均引入 `ui-list-pager.js` 与 `ui-list-pager.css`（带 `?v=`）。
- `release.sh`：INDEX_APP / PROCESS_INSTANCES / REPORT_SPLIT 三处块补 `ui-list-pager.js`/`.css` 的 `?v=` bump；`check_ver` 覆盖 6 页面 ×（js+css）= 12 条最终一致性校验。

### i18n
- 6 语言对称新增 5 个 key（zh-CN 为源，缺失回退 zh-CN；占位符用 `{from}/{to}/{total}/{page}/{pages}` 风格）：
  `list.paging.showing` / `list.paging.allLoaded` / `list.paging.prev` / `list.paging.next` / `list.paging.page`。

### 保留项（不回归）
- 报表 PDF 导出（`buildDetailTable`）不动；小表不动；首页 tab 切换靠 `reset()` 重新 observe 自动续载。

## 测试
- 全量 `node --test tests/`：408 项，7 个为**预存/环境**失败（Batch192 天气需联网、Batch200/86/87/93 与本次无关），与 Batch 218 改动无关。
- 新增 `tests/test-batch218-list-pager.js`（10 项全过）：
  - `pageSlice` 纯函数（首屏/次屏/末段 `hasMore`、空数组/负起点/缺 size 边界）。
  - infinite：首屏 30 → 触底 60/90 → 末段 `allLoaded`；`reset()` 回首屏且计数归零；`onChunkRendered` 调用次数 = chunk 数；空数据走 `emptyHtml`。
  - paged：第 1 页仅含 1–30 且 `showing`/`page` 文本正确；点击「下一页」仅含 31–60。
  - i18n 六语言含 5 个 key 且 key 集合与 zh-CN 一致。
  - release.sh 含升版登记 + 12 条 `check_ver`；6 个 html 均含 js/css 引用。
- 测试中发现并修复的真实组件缺陷：`ensurePagerBar()` 已定义但从未调用，导致 paged 模式不生成分页条 → 已在 `renderPage` 内补 `ensurePagerBar()` 调用。

## 发布
- `version.json` / `index.html`(APP_VERSION/SW_VERSION/APP_RELEASE_TIME) / `sw.js`(CACHE) → v1.4.23，`?v=` 全站随发版升版，CHANGELOG.md 置顶。
- 已部署 CloudBase，线上 `version.json` = v1.4.23。

## 演示路径
首页任务/代办列表向下滚动 → 触底自动追加下一批（末段提示「已加载全部 N 条」）；流程审批中心同样无限滚动；报表 overlay 在浮层内滚动加载；需要分页的列表可切 paged 模式显示分页条。
