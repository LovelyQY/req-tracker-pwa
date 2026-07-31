// Batch 192（#13 移除首页冗余快捷项、#14 问候名昵称/账号/工号兜底、#15 首页天气小组件）
// 运行环境无 jsdom，以「源码结构 / 静态契约」断言为主，与 test-batch186/188/190/191 风格一致。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// —— #13 首页去掉与顶部 TAB 重复的快捷项，仅保留无对应 TAB 的「统计」 ——
test('Batch192 #13：首页快捷项移除冗余入口（代办/日历/反馈/新建任务），保留统计', () => {
  const html = read('index.html');
  // 与顶部 TAB（task/todo/calendar/feedback）效果一致者已移除
  assert.ok(!html.includes('data-go="todo"'), '首页不应再有跳「代办」TAB 的冗余快捷项');
  assert.ok(!html.includes('data-go="calendar"'), '首页不应再有跳「日历」TAB 的冗余快捷项');
  assert.ok(!html.includes('data-go="feedback"'), '首页不应再有跳「反馈」TAB 的冗余快捷项');
  assert.ok(!html.includes('data-go="task"'), '首页不应再有跳「任务」TAB 的冗余快捷项（新建任务仅切 TAB，等价）');
  // 统计无对应 TAB，是唯一进入统计报表的入口，必须保留
  assert.ok(html.includes('data-go="stats"'), '首页应保留「统计」快捷项（其为统计报表唯一入口）');
  assert.ok(/class="home-quick"[^>]*>[\s\S]*data-go="stats"[\s\S]*<\/div>/.test(html), 'home-quick 容器内应含统计快捷项');
});

// —— #14 问候名按「昵称 → 账号 → 工号」兜底（不再回退真实姓名） ——
test('Batch192 #14：homeUserName 按 昵称→账号→工号 兜底', () => {
  const js = read('app.js');
  assert.ok(/async function homeUserName\(\)/.test(js), '应定义 homeUserName()');
  // 新链路：昵称 → 账号 → 工号（employeeNo）→ 会话账号兜底
  assert.ok(/return u\.nickname \|\| u\.account \|\| u\.employeeNo \|\| acct;/.test(js), 'homeUserName 应返回 昵称||账号||工号||会话账号');
  // 旧链路（回退真实姓名 u.name）应已移除
  assert.ok(!/return u\.nickname \|\| u\.name \|\| acct;/.test(js), 'homeUserName 不应再回退真实姓名');
});

// —— #15 首页问候右侧天气小组件（今明两天 + 可选城区，离线降级） ——
test('Batch192 #15：index.html 含天气小组件容器与城区/天数列表节点', () => {
  const html = read('index.html');
  assert.ok(/id="homeWeather"/.test(html) && /class="home-weather"/.test(html), '问候区应含 .home-weather 天气容器');
  assert.ok(/id="homeWeatherCityName"/.test(html), '天气容器应含城区名节点');
  assert.ok(/id="homeWeatherDays"/.test(html), '天气容器应含今明两天列表节点');
  assert.ok(/id="homeWeatherCity"/.test(html), '天气容器应含「设置城区」按钮');
  // 天气容器位于问候卡（home-greeting）内部、快捷打卡卡（home-clock-card）之前
  const gStart = html.indexOf('class="home-greeting"');
  const clockStart = html.indexOf('class="home-clock-card"');
  const greetBlock = html.slice(gStart, clockStart);
  assert.ok(greetBlock.includes('home-weather'), '天气小组件应位于问候卡内部（右侧空白区）');
});

test('Batch192 #15：app.js 实现天气渲染与降级（open-meteo 数据源 + 离线占位）', () => {
  const js = read('app.js');
  assert.ok(/async function renderHomeWeather\(\)/.test(js), '应定义 renderHomeWeather()');
  assert.ok(/function wmoToInfo\(code\)/.test(js), '应定义 WMO 天气代码→图标/文案 映射');
  assert.ok(/function getWeatherCity\(\)/.test(js), '应定义 getWeatherCity()（读取可选城区）');
  assert.ok(/function setWeatherCity\(c\)/.test(js), '应定义 setWeatherCity()（写入可选城区）');
  // 调用点：renderHome 末尾触发（非阻塞）
  assert.ok(/renderHomeWeather\(\)\.catch\(function \(\) \{\}\);/.test(js), 'renderHome 应触发 renderHomeWeather（失败静默）');
  // 数据源：open-meteo 地理编码 + 预报（无需 API Key）
  assert.ok(/geocoding-api\.open-meteo\.com\/v1\/search/.test(js), '应调用 open-meteo 地理编码接口解析城区');
  assert.ok(/api\.open-meteo\.com\/v1\/forecast\?latitude=/.test(js), '应调用 open-meteo 预报接口取今明两天');
  assert.ok(/forecast_days=2/.test(js), '预报应取 2 天（今天 + 明天）');
  assert.ok(/daily=weather_code,temperature_2m_max,temperature_2m_min/.test(js), '预报应取天气代码与最高/最低温');
  // 离线 / 失败降级为占位，不阻塞（批次 200 #27：占位文案改用 t() 走 i18n）
  assert.ok(/t\('weather\.offline'\)/.test(js), '离线应降级为 weather.offline 占位（i18n）');
  assert.ok(/t\('weather\.loadFailed'\)/.test(js), '请求失败应降级为 weather.loadFailed 占位（i18n）');
  // 城区可设置：点击城区按钮经 prompt 录入并写回 + 重新渲染
  assert.ok(/homeWeatherCity'\)[\s\S]*addEventListener\('click'/.test(js), '城区按钮应绑定点击事件');
  assert.ok(/setWeatherCity\(v\);[\s\S]*renderHomeWeather\(\);/.test(js), '设置城区后应写回并重新渲染天气');
});
