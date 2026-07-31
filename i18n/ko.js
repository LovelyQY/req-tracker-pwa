/*
 * i18n 字典 · 한국어（全量，批次185-C）
 * 60 key 全集，基于 zh-CN 基准翻译。静态打包资源，不走云端。
 */
(function (root) {
  'use strict';
  root.RT_I18N = root.RT_I18N || {};
  root.RT_I18N['ko'] = {
    // —— 앱 ——
    'app.title': '요구사항 추적기',

    // —— 하단 탭 / 홈 바로가기 ——
    'tab.home': '홈',
    'tab.task': '작업',
    'tab.todo': '할 일',
    'tab.calendar': '캘린더',
    'tab.feedback': '피드백',
    'home.newTask': '새 작업',

    // —— 사이드바 / 내비게이션 ——
    'nav.profile': '프로필',
    'nav.security': '보안',
    'nav.basicData': '기본 데이터',
    'nav.statsReport': '통계 보고서',
    'nav.stats': '통계',
    'nav.storage': '저장 및 백업',
    'nav.settings': '설정',
    'nav.about': '정보',

    // —— 플로팅 버튼 / 모달 ——
    'fab.newTask': '새 작업',
    'modal.newTask': '새 작업',
    'feedback.new': '피드백 보내기',

    // —— 공통 버튼 / 동작 ——
    'common.save': '저장',
    'common.cancel': '취소',
    'common.confirm': '확인',
    'common.delete': '삭제',
    'common.edit': '편집',
    'common.close': '닫기',
    'common.search': '검색',
    'common.reset': '초기화',
    'common.back': '뒤로',
    'common.today': '오늘',
    'common.loading': '로딩 중…',
    'common.empty': '데이터 없음',
    'common.yes': '예',
    'common.no': '아니요',
    'common.submit': '제출',

    // —— 알림 (toast / 확인창) ——
    'common.saved': '저장됨',
    'common.updated': '업데이트됨',
    'common.deleted': '삭제됨',
    'common.added': '추가됨',
    'common.pending': '준비 중'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RT_I18N['ko'];
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
