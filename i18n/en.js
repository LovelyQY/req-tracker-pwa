/*
 * i18n 字典 · English（全量，批次185-C）
 * 60 key 全集，与 zh-CN 基准对齐（185-A 试点子集 → 185-C 补全）。
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
    'common.submit': 'Submit',

    // —— Toasts ——
    'common.saved': 'Saved',
    'common.updated': 'Updated',
    'common.deleted': 'Deleted',
    'common.added': 'Added',
    'common.pending': 'In progress'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_I18N['en'];
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
