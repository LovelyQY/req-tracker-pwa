/* ui-list-pager.js — 统一分批渲染组件（Batch 218 / #28）
 * -------------------------------------------------------------
 * 为解决全站「全量 getAll + 全量 innerHTML」在大数据量下的卡顿/卡死问题，
 * 提供单一可复用组件 renderChunkedList，支持两种模式：
 *   - 'infinite'（默认）：IntersectionObserver 触底自动加载下一批（无限滚动）。
 *   - 'paged'：固定每页 + 上一页/下一页 + 「显示 X–Y / 共 N 条」分页条。
 *
 * 设计要点：
 *   1. 组件只负责「按批渲染 HTML 字符串」与「滚动/分页触发」，不绑定任何业务事件。
 *      业务侧在容器上做一次「容器级委托」，分批 append 后委托始终有效。
 *   2. 数据已是内存中「排序+筛选后」的全量数组（items），组件做连续切片，
 *      不做任何网络/DB 查询；filter 变化调用 controller.reset(newItems) 即可。
 *   3. 无 IntersectionObserver 的环境（如旧浏览器/测试）自动降级为一次性全量渲染，不丢数据。
 *   4. 纯函数 pageSlice 便于单测；整体以 IIFE 包裹，挂 window + module.exports。
 */
(function (root) {
  'use strict';

  // 翻译函数（i18n 引擎缺失时回退为 key 本身，避免白屏）
  function tt(key, vars) {
    if (typeof t === 'function') return t(key, vars);
    return key;
  }

  // HTML 转义（无 escapeHtml 时退化为基础转义）
  function esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // 纯函数：从全量数组按 [start, start+size) 切片
  function pageSlice(items, start, size) {
    var arr = Array.isArray(items) ? items : [];
    var s = start < 0 ? 0 : start;
    var sz = (typeof size === 'number' && size > 0) ? size : arr.length;
    var end = Math.min(s + sz, arr.length);
    return { chunk: arr.slice(s, end), nextStart: end, hasMore: end < arr.length };
  }

  function renderChunkedList(opts) {
    opts = opts || {};
    var container = opts.container || null;
    var items = Array.isArray(opts.items) ? opts.items : [];
    var renderItem = typeof opts.renderItem === 'function' ? opts.renderItem : function () { return ''; };
    var pageSize = (typeof opts.pageSize === 'number' && opts.pageSize > 0) ? opts.pageSize : 50;
    var mode = opts.mode === 'paged' ? 'paged' : 'infinite';
    var rootEl = (typeof opts.root !== 'undefined') ? opts.root : null; // null = 视口
    var emptyHtml = typeof opts.emptyHtml === 'string' ? opts.emptyHtml : '';
    var onChunkRendered = typeof opts.onChunkRendered === 'function' ? opts.onChunkRendered : null;

    var rendered = 0;
    var currentPage = 1;
    var loading = false;
    var destroyed = false;
    var observer = null;
    var sentinel = null;
    var pagerBar = null;
    var pagerBound = false;

    function hasMore() { return rendered < items.length; }

    function renderEmpty() {
      if (container) container.innerHTML = emptyHtml || '';
    }

    // ---------- 无限滚动 ----------
    function ensureSentinel() {
      if (sentinel || !container) return;
      sentinel = document.createElement('div');
      sentinel.className = 'list-sentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      container.appendChild(sentinel);
    }
    function removeSentinel() {
      if (sentinel && sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
      sentinel = null;
    }
    function teardownObserver() {
      if (observer) { try { observer.disconnect(); } catch (e) {} observer = null; }
    }
    function observeSentinel() {
      if (!sentinel || typeof IntersectionObserver === 'undefined') return;
      teardownObserver();
      observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { if (hasMore() && !loading) renderNext(); break; }
        }
      }, { root: rootEl, rootMargin: '300px' });
      observer.observe(sentinel);
    }
    function renderNext() {
      if (!container || loading || !hasMore()) return;
      loading = true;
      var next = pageSlice(items, rendered, pageSize);
      if (sentinel) sentinel.insertAdjacentHTML('beforebegin',
        next.chunk.map(function (it, i) { return renderItem(it, rendered + i); }).join(''));
      else container.insertAdjacentHTML('beforeend',
        next.chunk.map(function (it, i) { return renderItem(it, rendered + i); }).join(''));
      rendered = next.nextStart;
      loading = false;
      if (onChunkRendered) onChunkRendered(rendered);
      if (!hasMore()) {
        removeSentinel();
        if (container) container.insertAdjacentHTML('beforeend',
          '<div class="list-paging-info">' + esc(tt('list.paging.allLoaded', { total: items.length })) + '</div>');
      }
    }

    // ---------- 分页 ----------
    function ensurePagerBar() {
      if (pagerBar || !container || !container.parentNode) return;
      pagerBar = document.createElement('div');
      pagerBar.className = 'list-pager';
      container.parentNode.insertBefore(pagerBar, container.nextSibling);
      if (!pagerBound) {
        pagerBar.addEventListener('click', onPagerClick);
        pagerBound = true;
      }
    }
    function removePagerBar() {
      if (pagerBar && pagerBar.parentNode) pagerBar.parentNode.removeChild(pagerBar);
      pagerBar = null;
    }
    function onPagerClick(e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-pager]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-pager');
      var total = Math.max(1, Math.ceil(items.length / pageSize));
      if (act === 'prev' && currentPage > 1) renderPage(currentPage - 1);
      else if (act === 'next' && currentPage < total) renderPage(currentPage + 1);
    }
    function renderPagerBar(p) {
      if (!pagerBar) return;
      var total = Math.max(1, Math.ceil(items.length / pageSize));
      var start = (p - 1) * pageSize;
      var to = Math.min(start + pageSize, items.length);
      var from = items.length ? start + 1 : 0;
      pagerBar.innerHTML =
        '<button class="list-pager-btn" data-pager="prev"' + (p <= 1 ? ' disabled' : '') + '>' + esc(tt('list.paging.prev')) + '</button>' +
        '<span class="list-paging-info">' + esc(tt('list.paging.showing', { from: from, to: to, total: items.length })) + '</span>' +
        '<button class="list-pager-btn" data-pager="next"' + (p >= total ? ' disabled' : '') + '>' + esc(tt('list.paging.next')) + '</button>' +
        '<span class="list-paging-page">' + esc(tt('list.paging.page', { page: p, pages: total })) + '</span>';
    }
    function renderPage(p) {
      currentPage = p;
      var start = (p - 1) * pageSize;
      var ps = pageSlice(items, start, pageSize);
      if (container) container.innerHTML = ps.chunk.map(function (it, i) { return renderItem(it, start + i); }).join('');
      rendered = ps.nextStart;
      if (onChunkRendered) onChunkRendered(rendered);
      ensurePagerBar();
      renderPagerBar(p);
    }

    // ---------- 首屏 / 重置 ----------
    function renderFirst() {
      rendered = 0;
      currentPage = 1;
      if (!container) return;
      if (!items.length) { renderEmpty(); return; }
      if (mode === 'infinite') {
        // 降级：无 IntersectionObserver 支持 → 一次性全量渲染，不丢数据
        if (typeof IntersectionObserver === 'undefined') {
          container.innerHTML = items.map(function (it, i) { return renderItem(it, i); }).join('');
          rendered = items.length;
          if (onChunkRendered) onChunkRendered(rendered);
          return;
        }
        var first = pageSlice(items, 0, pageSize);
        container.innerHTML = first.chunk.map(function (it, i) { return renderItem(it, i); }).join('');
        rendered = first.nextStart;
        if (onChunkRendered) onChunkRendered(rendered);
        ensureSentinel();
        observeSentinel();
      } else {
        renderPage(1);
      }
    }

    function reset(newItems) {
      if (destroyed) return;
      if (Array.isArray(newItems)) items = newItems;
      teardownObserver();
      removeSentinel();
      removePagerBar();
      renderFirst();
    }

    function destroy() {
      destroyed = true;
      teardownObserver();
      removeSentinel();
      removePagerBar();
      if (container) container.innerHTML = '';
    }

    // 首次渲染
    renderFirst();

    return {
      reset: reset,
      destroy: destroy,
      get renderedCount() { return rendered; },
      get itemCount() { return items.length; },
      get mode() { return mode; }
    };
  }

  var api = { renderChunkedList: renderChunkedList, pageSlice: pageSlice };
  root.renderChunkedList = renderChunkedList;
  root.pageSlice = pageSlice;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
