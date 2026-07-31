/*
 * i18n 字典 · 日本語（全量，批次185-C）
 * 60 key 全集，基于 zh-CN 基准翻译。静态打包资源，不走云端。
 */
(function (root) {
  'use strict';
  root.RT_I18N = root.RT_I18N || {};
  root.RT_I18N['ja'] = {
    // —— アプリ ——
    'app.title': '要件トラッカー',

    // —— 下部タブ / ホームショートカット ——
    'tab.home': 'ホーム',
    'tab.task': 'タスク',
    'tab.todo': 'ToDo',
    'tab.calendar': 'カレンダー',
    'tab.feedback': 'フィードバック',
    'home.newTask': '新規タスク',

    // —— サイドバー / ナビゲーション ——
    'nav.profile': 'プロフィール',
    'nav.security': 'セキュリティ',
    'nav.basicData': '基本データ',
    'nav.statsReport': '統計レポート',
    'nav.stats': '統計',
    'nav.storage': 'ストレージとバックアップ',
    'nav.settings': '設定',
    'nav.about': 'について',

    // —— フローティングボタン / モーダル ——
    'fab.newTask': '新規タスク',
    'modal.newTask': '新規タスク',
    'feedback.new': 'フィードバックを送信',

    // —— 共通ボタン / 操作 ——
    'common.save': '保存',
    'common.cancel': 'キャンセル',
    'common.confirm': '確認',
    'common.delete': '削除',
    'common.edit': '編集',
    'common.close': '閉じる',
    'common.search': '検索',
    'common.reset': 'リセット',
    'common.back': '戻る',
    'common.today': '今日',
    'common.loading': '読み込み中…',
    'common.empty': 'データなし',
    'common.yes': 'はい',
    'common.no': 'いいえ',
    'common.submit': '送信',

    // —— 通知 (toast / 確認ダイアログ) ——
    'common.saved': '保存しました',
    'common.updated': '更新しました',
    'common.deleted': '削除しました',
    'common.added': '追加しました',
    'common.pending': '準備中'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_I18N['ja'];
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
