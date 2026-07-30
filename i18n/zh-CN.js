/*
 * i18n 字典 · 简体中文（基准 / single source of truth）
 * 批次185-A：首批词条覆盖「首页 chrome 试点」+ 常用 UI 术语。
 * 其余全站词条在 185-D 全站 rewire 时补全；新增词条须同步 6 份字典（key 对齐）。
 * 静态打包资源，不走云端。
 */
(function (root) {
  'use strict';
  root.RT_I18N = root.RT_I18N || {};
  root.RT_I18N['zh-CN'] = {
    // —— 应用 ——
    'app.title': '需求任务追踪',

    // —— 底部标签栏 / 首页快捷入口 ——
    'tab.home': '首页',
    'tab.task': '任务',
    'tab.todo': '代办',
    'tab.calendar': '日历',
    'tab.feedback': '反馈',
    'home.newTask': '新建任务',

    // —— 侧边栏 / 导航 ——
    'nav.profile': '个人资料',
    'nav.security': '安全',
    'nav.basicData': '基础数据',
    'nav.statsReport': '统计报表',
    'nav.stats': '统计',
    'nav.storage': '存储与备份',
    'nav.settings': '设置',
    'nav.about': '关于',

    // —— 悬浮按钮 / 弹窗 ——
    'fab.newTask': '新增任务',
    'modal.newTask': '新增任务',
    'feedback.new': '我要反馈',

    // —— 常用按钮 / 操作 ——
    'common.save': '保存',
    'common.cancel': '取消',
    'common.confirm': '确认',
    'common.delete': '删除',
    'common.edit': '编辑',
    'common.close': '关闭',
    'common.search': '搜索',
    'common.reset': '重置',
    'common.back': '返回',
    'common.today': '今天',
    'common.loading': '加载中…',
    'common.empty': '暂无数据',
    'common.yes': '是',
    'common.no': '否',
    'common.submit': '提交',

    // —— 提示（toast / 确认框）——
    'common.saved': '已保存',
    'common.updated': '已更新',
    'common.deleted': '已删除',
    'common.added': '已添加',
    'common.pending': '筹备中'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_I18N['zh-CN'];
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
