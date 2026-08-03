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

test('Batch221 后续修正：杭州补充富阳区/临安区/临平区/钱塘区（及桐庐/淳安/建德）', () => {
  const hz = DISTRICTS['杭州'] || [];
  ['富阳区', '临安区', '临平区', '钱塘区', '桐庐县', '淳安县', '建德市'].forEach(function (d) {
    assert.ok(hz.indexOf(d) >= 0, '杭州应含「' + d + '」（实际：' + hz.join('、') + '）');
  });
});

// 全量完整性守护：本次并非只补杭州，而是对所有 38 个城市的区县做了系统性补全。
// 下列断言锁定四大直辖市的完整市辖区（之前每市仅 4–8 个区，严重不全），并校验整体区县总量，
// 防止后续有人「只补单市」导致其他城市再次退化为空缺。
const FULL_MUNICIPALITIES = {
  '北京': ['东城区', '西城区', '朝阳区', '丰台区', '石景山区', '海淀区', '门头沟区', '房山区', '通州区', '顺义区', '昌平区', '大兴区', '怀柔区', '平谷区', '密云区', '延庆区'],
  '上海': ['黄浦区', '徐汇区', '长宁区', '静安区', '普陀区', '虹口区', '杨浦区', '闵行区', '宝山区', '嘉定区', '浦东新区', '金山区', '松江区', '青浦区', '奉贤区', '崇明区'],
  '天津': ['和平区', '河东区', '河西区', '南开区', '河北区', '红桥区', '东丽区', '西青区', '津南区', '北辰区', '武清区', '宝坻区', '滨海新区', '宁河区', '静海区', '蓟州区'],
  '重庆': ['渝中区', '大渡口区', '江北区', '沙坪坝区', '九龙坡区', '南岸区', '北碚区', '渝北区', '巴南区', '万州区', '涪陵区', '黔江区', '长寿区', '江津区', '合川区', '永川区', '南川区', '綦江区', '大足区', '璧山区', '铜梁区', '潼南区', '荣昌区', '开州区', '梁平区', '武隆区', '城口县', '丰都县', '垫江县', '忠县', '云阳县', '奉节县', '巫山县', '巫溪县', '石柱县', '秀山县', '酉阳县', '彭水县']
};

test('Batch221 后续修正：四大直辖市区县已补全为完整行政区划（非只补杭州）', () => {
  Object.keys(FULL_MUNICIPALITIES).forEach(function (city) {
    const actual = DISTRICTS[city] || [];
    const expected = FULL_MUNICIPALITIES[city];
    expected.forEach(function (d) {
      assert.ok(actual.indexOf(d) >= 0, city + ' 应含「' + d + '」（实际：' + actual.join('、') + '）');
    });
    assert.equal(actual.length, expected.length, city + ' 区县数应为 ' + expected.length + '，实际 ' + actual.length);
  });
});

test('Batch221 后续修正：整体区县总量已显著补全（≥400，防止退回单市补丁）', () => {
  let total = 0;
  Object.keys(DISTRICTS).forEach(function (c) { total += (DISTRICTS[c] || []).length; });
  assert.ok(total >= 400, '所有城市区县合计应 ≥ 400，实际 ' + total);
});
