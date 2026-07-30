/*
 * i18n 字典 · English（试点子集，批次185-A）
 * 仅覆盖首页 chrome 试点 + 常用 UI 术语，用于端到端验证「切语言闭环」。
 * 全量英译在 185-C 完成；key 集合须与 zh-CN 对齐。
 * 静态打包资源，不走云端。
 */
(function (root) {
  'use strict';
  root.RT_I18N = root.RT_I18N || {};
  root.RT_I18N['en'] = {
    // —— App ——
    'app.title': 'Requirement Tracker',

    // —— Bottom tabs / Home quick actions ——
    'tab.home': 'Home',
    'tab.task': 'Tasks',
    'tab.todo': 'To-dos',
    'tab.calendar': 'Calendar',
    'tab.feedback': 'Feedback',
    'home.newTask': 'New Task',

    // —— Drawer / Nav ——
    'nav.profile': 'Profile',
    'nav.security': 'Security',
    'nav.basicData': 'Basic Data',
    'nav.statsReport': 'Reports',
    'nav.stats': 'Stats',
    'nav.storage': 'Storage & Backup',
    'nav.settings': 'Settings',
    'nav.about': 'About',

    // —— FAB / Modal ——
    'fab.newTask': 'New Task',
    'modal.newTask': 'New Task',
    'feedback.new': 'Send Feedback',

    // —— Common buttons / actions ——
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.close': 'Close',
    'common.search': 'Search',
    'common.reset': 'Reset',
    'common.back': 'Back',
    'common.today': 'Today',
    'common.loading': 'Loading…',
    'common.empty': 'No data',
    'common.yes': 'Yes',
    'common.no': 'No',

    // —— Toasts ——
    'common.saved': 'Saved',
    'common.updated': 'Updated',
    'common.deleted': 'Deleted',
    'common.added': 'Added',
    'common.pending': 'In progress'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_I18N['en'];
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
