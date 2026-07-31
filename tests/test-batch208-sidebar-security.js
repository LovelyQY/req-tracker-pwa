// test-batch208-sidebar-security.js
// Batch 208（#15 去掉侧边栏「安全」项）：抽屉导航不再包含独立「账号与安全」入口
// （安全已在设置页内，故移除冗余侧边栏项），其余顺序保持。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 取出抽屉导航区块
const navMatch = html.match(/<nav class="drawer-nav">([\s\S]*?)<\/nav>/);
const drawerNav = navMatch ? navMatch[1] : '';

test('Batch208 #15：抽屉导航不再包含独立「安全」入口（security.html）', () => {
  assert.ok(drawerNav.length > 0, '应能解析抽屉导航区块');
  assert.ok(drawerNav.indexOf('security.html') < 0, '抽屉导航不应再出现 security.html 入口');
});

test('Batch208 #15：其余入口顺序保持（个人信息 → 基础数据 → 统计报表 → 存储与备份 → 设置 → 关于）', () => {
  const order = ['profile.html', 'basic-data.html', 'report.html', 'storage-backup.html', 'settings.html', 'about.html'];
  const positions = order.map(h => drawerNav.indexOf('href="' + h + '"'));
  // 全部存在
  positions.forEach((p, i) => assert.ok(p >= 0, '抽屉应包含 ' + order[i]));
  // 顺序严格递增
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1], order[i] + ' 应在 ' + order[i - 1] + ' 之后');
  }
});
