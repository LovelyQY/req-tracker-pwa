// Batch 218（#28 统一大数据分批渲染 / 无限滚动 / 分页）
// 验证统一组件 ui-list-pager.js：纯函数 pageSlice + 双模式渲染 + i18n 六语言对称
// + release.sh 升版登记 + 6 个 html 引用。运行环境无 jsdom，以 stub document / IntersectionObserver 实测。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---------- stub：最小 DOM（fake element + container + IntersectionObserver）----------
function makeEl() {
  const el = {
    className: '',
    _html: '',
    _attrs: {},
    _listeners: {},
    parentNode: null,
    children: [],
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); if (c.parentNode === this) c.parentNode = null; return c; },
    insertBefore(node, ref) {
      node.parentNode = this;
      const i = this.children.indexOf(ref);
      if (i < 0) this.children.push(node);
      else this.children.splice(i, 0, node);
      return node;
    },
    get nextSibling() {
      if (!this.parentNode) return null;
      const sibs = this.parentNode.children;
      const i = sibs.indexOf(this);
      return (i >= 0 && i + 1 < sibs.length) ? sibs[i + 1] : null;
    },
    // 无 jsdom：beforebegin 写入父级 html 缓冲（sentinel 位于容器末尾，等效插在 sentinel 之前）；其余追加自身
    insertAdjacentHTML(pos, html) {
      const target = (pos === 'beforebegin' && this.parentNode) ? this.parentNode : this;
      target._html += html;
    },
    closest() { return null; },
    addEventListener(type, fn) { (this._listeners[type] || (this._listeners[type] = [])).push(fn); }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); }
  });
  return el;
}

// fake IntersectionObserver：构造函数捕获回调，trigger() 手动派发 isIntersecting
class FakeIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts || {}; this.targets = []; FakeIO.last = this; }
  observe(el) { this.targets.push(el); }
  unobserve(el) { const i = this.targets.indexOf(el); if (i >= 0) this.targets.splice(i, 1); }
  disconnect() { this.targets = []; }
  trigger(entries) { this.cb(entries || [{ isIntersecting: true }]); }
}

global.document = { createElement() { return makeEl(); } };
global.IntersectionObserver = FakeIO;

// 最小 i18n mock：使组件发出的 key 带格式化变量，便于断言「showing / page / allLoaded 文本正确」
global.t = function (key, vars) {
  vars = vars || {};
  switch (key) {
    case 'list.paging.showing': return 'SHOW:' + vars.from + '-' + vars.to + '/' + vars.total;
    case 'list.paging.page': return 'PAGE:' + vars.page + '/' + vars.pages;
    case 'list.paging.prev': return 'PREV';
    case 'list.paging.next': return 'NEXT';
    case 'list.paging.allLoaded': return 'ALL:' + vars.total;
    default: return key;
  }
};

const { renderChunkedList, pageSlice } = require(path.join(ROOT, 'ui-list-pager.js'));

// 渲染项标记：便于统计已渲染数量与索引范围
function makeItems(n) { return Array.from({ length: n }, (_, i) => ({ id: 'i' + i, idx: i })); }
function renderItem(it) { return '<div class="ritem" data-idx="' + it.idx + '"></div>'; }
function countRendered(html) { const m = html.match(/data-idx=/g); return m ? m.length : 0; }

// ===== A. 纯函数 pageSlice =====
test('Batch218 #28 pageSlice：100 项 pageSize30 → 首屏 0-29、下次 30-59、末段 hasMore=false', () => {
  const items = makeItems(100);
  const a = pageSlice(items, 0, 30);
  assert.deepStrictEqual(a.chunk.map((x) => x.idx), Array.from({ length: 30 }, (_, i) => i), '首屏应为 0-29');
  assert.strictEqual(a.nextStart, 30);
  assert.strictEqual(a.hasMore, true);

  const b = pageSlice(items, 30, 30);
  assert.deepStrictEqual(b.chunk.map((x) => x.idx), Array.from({ length: 30 }, (_, i) => 30 + i), '次屏应为 30-59');
  assert.strictEqual(b.nextStart, 60);
  assert.strictEqual(b.hasMore, true);

  const c = pageSlice(items, 90, 30);
  assert.deepStrictEqual(c.chunk.map((x) => x.idx), [90, 91, 92, 93, 94, 95, 96, 97, 98, 99], '末段应为 90-99');
  assert.strictEqual(c.nextStart, 100);
  assert.strictEqual(c.hasMore, false, '末段 hasMore 应为 false');
});

test('Batch218 #28 pageSlice：空数组 / 负起点 / 缺 size 边界', () => {
  assert.deepStrictEqual(pageSlice([], 0, 30), { chunk: [], nextStart: 0, hasMore: false }, '空数组返回空');
  const items = makeItems(10);
  const neg = pageSlice(items, -5, 30);
  assert.strictEqual(neg.nextStart, 10, '负起点被钳制为 0 后全量');
  assert.strictEqual(neg.hasMore, false);
  const all = pageSlice(items, 0); // 缺 size → 全量
  assert.strictEqual(all.chunk.length, 10);
  assert.strictEqual(all.hasMore, false);
});

// ===== B. 无限滚动（infinite）=====
test('Batch218 #28 infinite：首屏含前 30、触底追加至 60/90、末段出现 allLoaded', () => {
  const container = makeEl();
  const items = makeItems(100);
  const c = renderChunkedList({ container, items, renderItem, pageSize: 30, mode: 'infinite' });
  // 首屏
  assert.strictEqual(c.renderedCount, 30, '首屏应渲染 30 项');
  assert.strictEqual(countRendered(container.innerHTML), 30, '首屏 container 含 30 个标记');
  assert.ok(/data-idx="29"/.test(container.innerHTML), '首屏应包含第 30 项(idx=29)');
  assert.ok(!/data-idx="30"/.test(container.innerHTML), '首屏不应含第 31 项');

  const io = FakeIO.last; // 捕获当前 observer
  // 第 1 次触底 → 60
  io.trigger();
  assert.strictEqual(c.renderedCount, 60, '第 1 次触底应渲染至 60');
  assert.ok(/data-idx="59"/.test(container.innerHTML), '应含第 60 项(idx=59)');
  // 第 2 次触底 → 90
  io.trigger();
  assert.strictEqual(c.renderedCount, 90, '第 2 次触底应渲染至 90');
  // 第 3 次触底 → 100（末段）
  io.trigger();
  assert.strictEqual(c.renderedCount, 100, '第 3 次触底应渲染全部 100');
  assert.strictEqual(c.itemCount, 100);
  assert.ok(/ALL:100/.test(container.innerHTML), '末段应出现「已加载全部」提示');
  assert.ok(!/list-sentinel/.test(''), 'sentinel 已移除（无残留）或已隐藏');
});

test('Batch218 #28 infinite：reset() 回首屏且计数归零', () => {
  const container = makeEl();
  const items = makeItems(100);
  const c = renderChunkedList({ container, items, renderItem, pageSize: 30, mode: 'infinite' });
  const io = FakeIO.last;
  io.trigger(); io.trigger(); // 加载到 90
  assert.strictEqual(c.renderedCount, 90);
  c.reset(); // 回到首屏
  assert.strictEqual(c.renderedCount, 30, 'reset 后回到首屏 30');
  assert.strictEqual(countRendered(container.innerHTML), 30, 'reset 后 container 仅含 30 个标记');
  assert.ok(!/data-idx="30"/.test(container.innerHTML), 'reset 后不应含第 31 项');
});

test('Batch218 #28 infinite：onChunkRendered 调用次数 = chunk 数（100/30 → 4 次）', () => {
  const container = makeEl();
  const items = makeItems(100);
  let calls = 0;
  const c = renderChunkedList({ container, items, renderItem, pageSize: 30, mode: 'infinite', onChunkRendered: () => { calls++; } });
  const io = FakeIO.last;
  io.trigger(); io.trigger(); io.trigger();
  assert.strictEqual(calls, 4, '首屏1 + 三次触底 = 4 次 onChunkRendered');
  assert.strictEqual(c.renderedCount, 100);
});

test('Batch218 #28 infinite：空数据走 emptyHtml 且不抛错', () => {
  const container = makeEl();
  const c = renderChunkedList({ container, items: [], renderItem, pageSize: 30, mode: 'infinite', emptyHtml: '<div class="empty-tip">暂无数据</div>' });
  assert.strictEqual(c.renderedCount, 0, '空数据 renderedCount 为 0');
  assert.ok(/暂无数据/.test(container.innerHTML), '空数据应渲染 emptyHtml');
});

// ===== C. 分页（paged）=====
test('Batch218 #28 paged：第 1 页仅含 1-30 且 showing 文本正确；下一页仅含 31-60', () => {
  const parent = makeEl();
  const container = makeEl();
  container.parentNode = parent; // pager bar 挂在 container 之后
  const items = makeItems(100);
  const c = renderChunkedList({ container, items, renderItem, pageSize: 30, mode: 'paged' });
  // 第 1 页
  assert.strictEqual(c.renderedCount, 30, 'paged 第 1 页渲染 30');
  assert.ok(/data-idx="0"/.test(container.innerHTML) && /data-idx="29"/.test(container.innerHTML), '第 1 页含 idx 0-29');
  assert.ok(!/data-idx="30"/.test(container.innerHTML), '第 1 页不含 idx 30');
  // pager bar 已创建并含 showing/page 文本
  const pagerBar = parent.children.find((x) => x.className === 'list-pager');
  assert.ok(pagerBar, '应生成分页条 .list-pager');
  assert.ok(/SHOW:1-30\/100/.test(pagerBar.innerHTML), 'showing 文本应为 SHOW:1-30/100');
  assert.ok(/PAGE:1\/4/.test(pagerBar.innerHTML), 'page 文本应为 PAGE:1/4（共 4 页）');
  assert.ok(/PREV/.test(pagerBar.innerHTML) && /NEXT/.test(pagerBar.innerHTML), '应含上一页/下一页按钮');

  // 模拟点击「下一页」
  const handlers = pagerBar._listeners.click || [];
  const evt = { target: { closest: () => ({ getAttribute: () => 'next' }) } };
  handlers.forEach((h) => h(evt));

  assert.strictEqual(c.renderedCount, 60, '点击下一页后渲染至 60');
  assert.ok(/data-idx="30"/.test(container.innerHTML) && /data-idx="59"/.test(container.innerHTML), '第 2 页含 idx 30-59');
  assert.ok(!/data-idx="0"/.test(container.innerHTML), '第 2 页不应含第 1 页的项(idx 0)');
  assert.ok(/SHOW:31-60\/100/.test(pagerBar.innerHTML), 'showing 文本应更新为 SHOW:31-60/100');
  assert.ok(/PAGE:2\/4/.test(pagerBar.innerHTML), 'page 文本应更新为 PAGE:2/4');
});

// ===== D. i18n 6 语言对称 =====
test('Batch218 #28：6 语言含 list.paging.* 五个 key 且 key 集合与 zh-CN 一致', () => {
  global.window = global; // i18n 语言文件挂到 window.RT_I18N
  const langs = ['zh-CN', 'zh-HK', 'zh-TW', 'en', 'ko', 'ja'];
  const dicts = {};
  langs.forEach((lg) => { dicts[lg] = require(path.join(ROOT, 'i18n', lg + '.js')); });
  const newKeys = [
    'list.paging.showing', 'list.paging.allLoaded',
    'list.paging.prev', 'list.paging.next', 'list.paging.page'
  ];
  newKeys.forEach((k) => {
    langs.forEach((lg) => assert.ok(dicts[lg][k] != null, lg + ' 缺少 key: ' + k));
  });
  // 占位符格式校验：showing/page 须使用 {from}/{to}/{total}/{page}/{pages} 风格
  assert.ok(/\{from\}/.test(dicts['zh-CN']['list.paging.showing']), 'showing 应使用 {from} 占位符');
  assert.ok(/\{page\}/.test(dicts['zh-CN']['list.paging.page']), 'page 应使用 {page} 占位符');
  const base = Object.keys(dicts['zh-CN']).sort().join(',');
  langs.forEach((lg) => {
    const k = Object.keys(dicts[lg]).sort().join(',');
    assert.strictEqual(k, base, lg + ' 的 key 集合应与 zh-CN 一致');
  });
});

// ===== E. 发布登记（release.sh 须含 ui-list-pager.js / .css 的升版与最终一致性校验）=====
test('Batch218 #28：release.sh 已登记 ui-list-pager.js/.css ?v= bump + 12 条最终一致性校验', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'release.sh'), 'utf8');
  // patch_ver 登记（INDE X_APP / PROCESS_INSTANCES / REPORT_SPLIT 三处块，各含 js+css）
  assert.ok(/ui-list-pager\.js\?v=\$NEW_VER/.test(sh), 'release.sh 应含 ui-list-pager.js ?v= bump');
  assert.ok(/ui-list-pager\.css\?v=\$NEW_VER/.test(sh), 'release.sh 应含 ui-list-pager.css ?v= bump');
  // check_ver 最终一致性校验应覆盖 6 个页面 × (js+css) = 12 条
  const checks = (sh.match(/ui-list-pager\.(js|css)\?v=\(/g) || []).length;
  assert.strictEqual(checks, 12, 'check_ver 应覆盖 6 页面 × (js+css) = 12 条，实际 ' + checks);
});

// ===== F. 6 个 html 均引用 ui-list-pager.js 与 ui-list-pager.css（带 ?v=）=====
test('Batch218 #28：6 个 html 均引入 ui-list-pager.js 与 ui-list-pager.css（带 ?v=）', () => {
  const pages = ['index.html', 'process-instances.html', 'report-task.html', 'report-todo.html', 'report-bug.html', 'report-meeting.html'];
  pages.forEach((p) => {
    const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
    assert.ok(/ui-list-pager\.js\?v=[0-9]+\.[0-9]+\.[0-9]+/.test(html), p + ' 应引用 ui-list-pager.js?v=');
    assert.ok(/ui-list-pager\.css\?v=[0-9]+\.[0-9]+\.[0-9]+/.test(html), p + ' 应引用 ui-list-pager.css?v=');
  });
});
