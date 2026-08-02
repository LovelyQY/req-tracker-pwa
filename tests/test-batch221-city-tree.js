// Batch 221 #3：城市选择省市区三级映射补全 + 校验
// 从 app.js 静态提取 RT_CITY_TREE / RT_CITY_DISTRICTS / RT_HOT_CITIES 并校验一致性。
// 锁定：① 热门城市可下钻选到；② 区数据无孤儿市；③ 每省至少 1 市且无重复；
//      ④ 直辖市均有区；⑤ 各省会城市均在对应省份市列表中（补全缺失的市）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function extract(name) {
  const isObj = name.endsWith('TREE') || name.endsWith('DISTRICTS');
  const re = new RegExp('const ' + name + '\\s*=\\s*(' + (isObj ? '\\{[\\s\\S]*?\\n\\}' : '\\[[\\s\\S]*?\\]') + ');');
  const m = js.match(re);
  if (!m) throw new Error('未在 app.js 中找到 ' + name);
  // eslint-disable-next-line no-eval
  return eval('(' + m[1] + ')');
}

const TREE = extract('RT_CITY_TREE');
const DISTRICTS = extract('RT_CITY_DISTRICTS');
const HOT = extract('RT_HOT_CITIES');

const allCities = [];
Object.keys(TREE).forEach(function (p) { TREE[p].forEach(function (c) { allCities.push(c); }); });

const CAPITALS = {
  '北京': '北京', '上海': '上海', '天津': '天津', '重庆': '重庆',
  '河北': '石家庄', '山西': '太原', '辽宁': '沈阳', '吉林': '长春', '黑龙江': '哈尔滨',
  '江苏': '南京', '浙江': '杭州', '安徽': '合肥', '福建': '福州', '江西': '南昌', '山东': '济南',
  '河南': '郑州', '湖北': '武汉', '湖南': '长沙', '广东': '广州', '海南': '海口', '四川': '成都',
  '贵州': '贵阳', '云南': '昆明', '陕西': '西安', '甘肃': '兰州', '青海': '西宁', '台湾': '台北',
  '内蒙古': '呼和浩特', '广西': '南宁', '西藏': '拉萨', '宁夏': '银川', '新疆': '乌鲁木齐'
};

test('Batch221 #3：热门城市全部可在省市区树中选到', () => {
  HOT.forEach(function (c) {
    assert.ok(allCities.indexOf(c) >= 0, '热门城市「' + c + '」应在 RT_CITY_TREE 中');
  });
});

test('Batch221 #3：区数据无孤儿（每个有区的市都在省市区树中）', () => {
  Object.keys(DISTRICTS).forEach(function (c) {
    assert.ok(allCities.indexOf(c) >= 0, '区数据中的市「' + c + '」应在 RT_CITY_TREE 中');
  });
});

test('Batch221 #3：省份覆盖全国（≥30）且每省至少 1 市、无重复省', () => {
  const provs = Object.keys(TREE);
  assert.ok(provs.length >= 30, '省份数量应覆盖全国（≥30），实际 ' + provs.length);
  provs.forEach(function (p) { assert.ok(TREE[p].length >= 1, p + ' 应至少含 1 个市'); });
  assert.equal(new Set(provs).size, provs.length, '省份不应重复');
});

test('Batch221 #3：市集合无重复', () => {
  assert.equal(new Set(allCities).size, allCities.length, '市不应重复（实际 ' + allCities.length + '）');
});

test('Batch221 #3：直辖市的城市均含区数据', () => {
  ['北京', '上海', '天津', '重庆'].forEach(function (c) {
    assert.ok(DISTRICTS[c] && DISTRICTS[c].length >= 1, '直辖市「' + c + '」应有区数据');
  });
});

test('Batch221 #3：各省会城市均在对应省份的市列表中', () => {
  Object.keys(CAPITALS).forEach(function (p) {
    assert.ok(TREE[p], '应含省份 ' + p);
    assert.ok(TREE[p].indexOf(CAPITALS[p]) >= 0, p + ' 应含省会 ' + CAPITALS[p]);
  });
});
