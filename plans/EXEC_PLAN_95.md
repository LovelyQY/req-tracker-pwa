# 批次 95 — U+FFFD 字符还原核对清单

> 修复完成时间: 2026-07-24
> 影响文件: 4 个，共修复 146 处 U+FFFD

---

## 还原策略

- 方案 B：按上下文推断原字符
- login/classic.html + about.html：从 git 干净基版恢复 + 重新应用 RBAC 改动
- role.js + app.js：逐字节上下文推断替换

---

## 文件修复详情

### 1. login/classic.html（49 处 → 0）

| 上下文 | 还原为 | 说明 |
|--------|--------|------|
| 需求任务追? | 需求任务追踪 | 标题 |
| 免登时限? | 免登时限： | 全角冒号 |
| 7 ? | 7 天 | |
| 30 ? | 30 天 | |
| ? ?（按钮） | 登 录 | 登录按钮 |
| v? | v… | 版本占位 |
| 旧数据读? | 旧数据读取 | |
| 本? IndexedDB | 本地 IndexedDB | |
| 管理? | 管理员 | |
| 请输入账?/工号 ? 密码 | 请输入账号/工号 和 密码 | |
| https ? localhost 下使? | https 或 localhost 下使用 | |
| 仅? IndexedDB | 仅查 IndexedDB | |
| 按账? / 按工号 | 按账号 / 按工号 | |
| 按所选时? + ...会? | 按所选时长 + ...会话 | |
| ...否? sessionStorage...清除? | ...否则 sessionStorage...清除 | |
| auth.js ? logout()...清除? | auth.js 的 logout()...清除 | |
| 旧链路「返回? | 旧链路「返回」 | |
| null 表示未命? | null 表示未命中 | |
| 如? byEmp.account | 如果 byEmp.account | |
| 错误提? | 错误提示 | |
| version.json...更新? | version.json...更新 | |
| ?_t= 时间? + no-store：绕? SW ? version.json ? stale-...缓存? | ?_t= 时间戳 + no-store：绕过 SW 对 version.json 的 stale-...缓存 | |
| HTML ? network-first...不同步? | HTML 走 network-first...不同步 | |
| 作用域 /，覆盖登?/注册/主页）? | 作用域 /，覆盖登录/注册/主页） | |
| 注册? SW...都? SW ? no-store 拉取? | 注册后 SW...都走 SW 的 no-store 拉取 | |
| 无需逐个页面刷新? | 无需逐个页面刷新 | |

**额外修复**：`seedPermissionBasics().catch()` 从 `if (typeof RT_USERS` 块内移到块外（之前被错误嵌套）。

### 2. about.html（45 处 → 0）

从 git commit `d2427a8` 干净基版恢复，重新应用 RBAC 权限说明卡片。

| 上下文 | 还原为 | 
|--------|--------|
| 检查更? | 检查更新 |
| 安装到主? | 安装到主屏 |
| 强制更新 | 强制更新（确认未损坏） |
| 一行显? | 一行显示 |
| 缓存可用? | 缓存可用 |
| vX.Y.Z? | vX.Y.Z |
| 同步升级? | 同步升级到 |
| 更新检? / 强制刷新 | 更新检测 / 强制刷新 |
| 不支持更新检? | 不支持更新检查 |
| 检查更新? | 检查更新… |
| 已是最新版? ? | 已是最新版本 ✓ |
| 发现新版? v...正在应用? | 发现新版本 v...正在应用… |
| 强制更新? | 强制更新」 |
| 继续跳? | 继续跳转 |
| 安装到主? | 安装到主屏 |
| 刷新页面再试? | 刷新页面再试。 |
| iOS Safari...分享」图? ? 选择...添加」? | iOS Safari...分享」图标 → 选择...添加」。 |
| Android Chrome...右上? ? 菜单...主屏幕」? | Android Chrome...右上角 ⋮ 菜单...主屏幕」。 |
| 浏览器菜单（? ? ⋯）→「安装应? / ...Screen」? | 浏览器菜单（⋮ 或 ⋯）→「安装应用 / ...Screen」。 |
| 尝试安装? | 尝试安装。 |
| 初始? | 初始化 |
| v' + (APP_VERSION \|\| '?') | v' + (APP_VERSION \|\| '—') |
| info-row ? onclick | info-row 的 onclick |
| 跳转? changelog.html | 跳转到 changelog.html |
| 版本号避? 24h 节流 | 版本号避免 24h 节流 |
| 发现新版? v...强制更新? | 发现新版本 v...强制更新」 |

### 3. role.js（49 处 → 0）

| 类别 | 数量 | 示例 |
|------|------|------|
| 残缺汉字（角色、删除、保存、创建、命名等） | ~35 | 角?→角色、删?→删除、保?→保存 |
| 标点符号（——、）、「」、：、…） | ~10 | —?→——、?→） |
| 空态文案 | 2 | «+ 新增»→「+ 新增」 |
| 注释头部 | ~2 | 权限?→权限树、暴露?→暴露给 |

### 4. app.js（3 处 → 0）

| 上下文 | 还原为 |
|--------|--------|
| 写入生命流程记录???创建操作） | 写入生命流程记录（创建操作） |

---

## 验证方法

```bash
# 零 U+FFFD 验证
python3 -c "
for f in ['role.js','about.html','login/classic.html','app.js']:
    c = open(f,'rb').read()
    n = c.count(b'\xef\xbf\xbd')
    print(f'{f}: {n} U+FFFD')
"
# 预期: 全部 0
```

---

## 注意事项

1. 本次修复仅针对 **U+FFFD 字符污染**，不涉及功能逻辑变更
2. login/classic.html 额外修复了 `seedPermissionBasics().catch()` 的嵌套位置
3. role.js 空的 `<span class="tcaret">►</span>` 使用了 Unicode `▶` (U+25B6) 作为折叠指示符
4. 所有文件已确认为纯 UTF-8 编码，无 BOM
