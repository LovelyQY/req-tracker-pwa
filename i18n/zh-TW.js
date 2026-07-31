/*
 * i18n 字典 · 繁體中文（中國臺灣）
 * 批次185-B：基於 zh-CN 基準逐條轉換，按臺灣用詞習慣校譯。
 * 繁簡轉換 + 術語差別（如「資料」vs「數據」、「行事曆」vs「日曆」）。
 * 靜態打包資源，不走雲端。
 */
(function (root) {
  'use strict';
  root.RT_I18N = root.RT_I18N || {};
  root.RT_I18N['zh-TW'] = {
    // —— 應用 ——
    'app.title': '需求任務追蹤',

    // —— 底部標籤欄 / 首頁快捷入口 ——
    'tab.home': '首頁',
    'tab.task': '任務',
    'tab.todo': '待辦',
    'tab.calendar': '行事曆',
    'tab.feedback': '意見回饋',
    'home.newTask': '新增任務',

    // —— 側邊欄 / 導航 ——
    'nav.profile': '個人檔案',
    'nav.security': '安全',
    'nav.basicData': '基礎資料',
    'nav.statsReport': '統計報表',
    'nav.stats': '統計',
    'nav.storage': '儲存與備份',
    'nav.settings': '設定',
    'nav.about': '關於',

    // —— 懸浮按鈕 / 彈窗 ——
    'fab.newTask': '新增任務',
    'modal.newTask': '新增任務',
    'feedback.new': '我要回饋',

    // —— 常用按鈕 / 操作 ——
    'common.save': '儲存',
    'common.cancel': '取消',
    'common.confirm': '確認',
    'common.delete': '刪除',
    'common.edit': '編輯',
    'common.close': '關閉',
    'common.search': '搜尋',
    'common.reset': '重設',
    'common.back': '返回',
    'common.today': '今天',
    'common.loading': '載入中…',
    'common.empty': '暫無資料',
    'common.yes': '是',
    'common.no': '否',
    'common.submit': '送出',

    // —— 提示（toast / 確認框）——
    'common.saved': '已儲存',
    'common.updated': '已更新',
    'common.deleted': '已刪除',
    'common.added': '已新增',
    'common.pending': '籌備中'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_I18N['zh-TW'];
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
