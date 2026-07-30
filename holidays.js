/*
 * holidays.js —— 节假日 / 调休推断层（批次 181 新建）
 *
 * 职责：
 *   1. 按需加载 holidays-YYYY.json（年度静态资源，每年手动更新一份），带内存缓存与失败降级。
 *   2. 给出任意日期的「日类型」推断：法定假日 / 调休补班 / 周末 / 工作日。
 *   3. 叠加用户手动调休（attendance 记录的 override 字段）得出最终「应上班 / 应休息」。
 *
 * 推断优先级（高 → 低）：
 *   手动 override（'work'|'rest'）  >  调休补班(workdays)  >  法定假日(holidays)  >  周末  >  工作日
 *   —— 手动最高，因为公司实际排班常与国家安排不一致（如大小周、值班）。
 *
 * 设计边界：
 *   - 本模块**只读**，不写任何存储；override 的读写归 attendance.js（字段已在批次 180 预留）。
 *   - 数据文件缺失（如跨年到 2027 但没放 holidays-2027.json）时**不报错**，
 *     自动降级为「仅按周末推断」，并在 console 提示，保证功能不中断。
 *   - 请假（leave）为独立事实表（批次 182），不在本模块内。
 *
 * 通过 window.RT_HOLIDAY 暴露。
 */
window.RT_HOLIDAY = (function () {
  // year -> Promise<{holidays:{}, workdays:{}} | null>
  var cache = {};

  // 资源版本号：与页面上的 ?v= 保持一致，发版即破缓存。
  // 从当前脚本自身的 src 上取，避免再维护一处版本号。
  function assetVer() {
    try {
      var s = document.querySelector('script[src*="holidays.js"]');
      var m = s && s.getAttribute('src').match(/[?&]v=([0-9.]+)/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  }

  // 加载某年数据；失败返回 null（降级为仅周末推断），不抛错。
  function load(year) {
    if (cache[year]) return cache[year];
    var ver = assetVer();
    var url = 'holidays-' + year + '.json' + (ver ? '?v=' + ver : '');
    cache[year] = fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        return { holidays: j.holidays || {}, workdays: j.workdays || {} };
      })
      .catch(function () {
        console.warn('[RT_HOLIDAY] 缺少 holidays-' + year + '.json，该年度降级为仅按周末推断');
        return null;
      });
    return cache[year];
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function isWeekend(dateStr) {
    var p = dateStr.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var dow = d.getDay();
    return dow === 0 || dow === 6;
  }

  /*
   * 单日推断（同步版，需先 load 过该年份）。
   * data: load() 的结果，可为 null。
   * override: 'work' | 'rest' | null（来自 attendance 记录）
   *
   * 返回 { type, label, isRest }
   *   type: 'override-work' | 'override-rest' | 'workday'(调休补班) |
   *         'holiday'(法定假) | 'weekend' | 'normal'
   */
  function typeOf(dateStr, data, override) {
    if (override === 'work') return { type: 'override-work', label: '调整上班', isRest: false };
    if (override === 'rest') return { type: 'override-rest', label: '调整休息', isRest: true };
    if (data) {
      if (data.workdays[dateStr]) return { type: 'workday', label: data.workdays[dateStr], isRest: false };
      if (data.holidays[dateStr]) return { type: 'holiday', label: data.holidays[dateStr], isRest: true };
    }
    if (isWeekend(dateStr)) return { type: 'weekend', label: '周末', isRest: true };
    return { type: 'normal', label: '工作日', isRest: false };
  }

  // 异步单日查询（自动 load 对应年份），供首页/详情等零散调用。
  function dayType(dateStr, override) {
    var year = parseInt(dateStr.slice(0, 4), 10);
    return load(year).then(function (data) { return typeOf(dateStr, data, override); });
  }

  /*
   * 批量取某月每天的类型，供日历网格一次性渲染。
   * overrideMap: { 'YYYY-MM-DD': 'work'|'rest' }
   * 返回 { 'YYYY-MM-DD': {type,label,isRest} }
   */
  function monthTypes(year, month, overrideMap) {
    overrideMap = overrideMap || {};
    return load(year).then(function (data) {
      var days = new Date(year, month + 1, 0).getDate();
      var out = {};
      for (var d = 1; d <= days; d++) {
        var key = year + '-' + pad(month + 1) + '-' + pad(d);
        out[key] = typeOf(key, data, overrideMap[key] || null);
      }
      return out;
    });
  }

  // 某月应出勤天数（不含手动 override 之外的休息日），供工时/出勤率统计（批次 184）
  function workdayCount(year, month, overrideMap) {
    return monthTypes(year, month, overrideMap).then(function (m) {
      var n = 0;
      Object.keys(m).forEach(function (k) { if (!m[k].isRest) n++; });
      return n;
    });
  }

  return {
    load: load,
    dayType: dayType,
    monthTypes: monthTypes,
    workdayCount: workdayCount,
    isWeekend: isWeekend
  };
})();
