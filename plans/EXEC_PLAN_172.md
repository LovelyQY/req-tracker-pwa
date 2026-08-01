# 批次172：全局 Toast 样式统一 + 个人信息修改页无输入框修复

> 创建时间：2026-07-29 23:17
> 前置版本：v1.3.69
> 状态：待执行
> 触发来源：用户实测反馈 3 项问题（附 2 张截图）

---

## 关键事实（已排查确认）

### 问题1+2：Toast 提示样式异常——黑色大色块，应改为「已保存」式浅色卡片 ⚠️ 全局范围

**现象**（截图1印证）：icon-manager 页面恢复操作后，toast 显示为**巨大的深黑色方块**（几乎占半屏），文字「已恢复所有图标为默认」在里面但整体观感极差。
**期望**（截图2印证）：主页「已保存」提示为**白色圆角小卡片**（浅底、阴影、底部居中浮层）。

**根因（已确凿）：全站 12 个 HTML 文件各自定义了内联 `.toast` 深色 CSS，覆盖了 `overlays.css` 的标准浅色样式**

| 对比项 | overlays.css 标准（正确） | 12 个页面的内联覆盖（错误） |
|---|---|---|
| 位置 | `bottom:90px`（底部居中） | `top:24px`（顶部）或 `bottom:calc(safe-area+80px)` |
| 背景 | `var(--surface)` 浅色白 | `rgba(17,24,39,.92)` 或 `rgba(31,41,55,.92)` 深黑 |
| 文字色 | `#374151` 深灰 | `#fff` 白字 |
| 圆角 | `12px` | `10px` 或 `22px` |
| 字号/重 | `13px / 500` | `14px / normal` |
| 布局 | `display:flex;gap:8px` | 大多数无 flex |
| 阴影/边框 | `box-shadow + border` | 无 |
| z-index | `60` | `999` 或 `80` |

**涉及文件（12 个，均含内联 `.toast` 覆盖）**：

| 文件 | 内联 toast 特征 |
|---|---|
| icon-manager.html | top:24px 深色 + 有 flex（批次171补的） |
| profile.html | top:24px 深色 |
| user.html | top:24px 深色 |
| position.html | top:24px 深色 |
| project-version.html | top:24px 深色 |
| department.html | top:24px 深色 |
| dictionary.html | top:24px 深色 |
| company.html | top:24px 深色 |
| project.html | top:24px 深色 |
| security.html | top:24px 深色 |
| role.html | top:24px 深色 + white-space:pre-line |
| permission.html | bottom+safe-area 深色（圆角22px） |

**修复方案**：删除全部 12 个文件中的内联 `.toast` 和 `.toast.show` CSS 规则，统一使用 `overlays.css` 的标准浅色样式。这些页面均已引入 overlays.css（或应引入），删除内联覆盖后标准样式即生效。

### 问题3：个人信息修改页（profile-edit）无输入框

**现象**：进入个人信息编辑页后看不到输入框，无法修改任何信息。

**根因分析（多层）**：

1. **输入框默认隐藏**：profile-edit.html 中 3 个输入框均为 `style="display:none"`，依赖 JS `init()` 成功后才 `display:block` 显示。
2. **init() 可能在显示输入框前中止**：
   - 会话无效 → 直接跳转登录页
   - `RT_USERS.getUserByAccount(acc)` 抛错 → **无 try-catch 包裹**，init 直接 reject，输入框永远隐藏
   - 用户记录为空 → alert 后跳登录
3. **保存按钮可能被权限守卫隐藏**：保存按钮带 `data-perm="op_profile_edit"`，若当前角色无此权限且非管理员，`RT_PERM.guard()` 会将其设为 `display:none`
4. **设计层面**：该页仅支持编辑 nickname/tags/signature 三个字段；账号/密码/手机/邮箱已移至 security.html（账号与安全）

**需进一步定位**：用户说的"无输入框"是 init() 中断（技术 bug）还是字段不在本页（设计预期）。优先检查 init() 是否有未捕获异常导致中断。

---

## 问题总览

| # | 问题 | 严重度 | 涉及范围 |
|---|------|--------|---------|
| 1 | Toast 样式为深黑色大色块（应统一为浅色卡片） | **高** | 全站 12 个页面 |
| 2 | 个人信息修改页无输入框 | **高** | profile-edit.html |

---

## 批次172 修复清单

### 172-A 全局 Toast 样式统一（12 个文件）
对以下每个文件，**删除 `<style>` 标签内的 `.toast{...}` 和 `.toast.show{...}` 两行 CSS 规则**（保留其余 style 内容不变）：

1. icon-manager.html
2. profile.html
3. user.html
4. position.html
5. project-version.html
6. department.html
7. dictionary.html
8. company.html
9. project.html
10. security.html
11. role.html
12. permission.html

**注意**：role.html 的 `.toast` 可能还带 `white-space:pre-line`，一并删除。删除后 overlays.css 的标准样式自动生效（这些页面均已引入 overlays.css）。

### 172-B profile-edit 无输入框排查与修复
1. 读取 profile-edit.html 完整代码，定位 init() 流程中可能的断点
2. 在 `getUserByAccount` 等关键异步调用外补 try-catch，确保即使数据加载失败也降级显示输入框
3. 确认保存按钮权限 `op_profile_edit` 的默认分配是否合理
4. 若用户实际想改的是手机/姓名等核心信息，评估是否需要在 profile-edit 补充入口或引导到 security.html

---

## 版本与推送策略
- 建议走 `[no-version-bump]` 先提交 172-A（纯 CSS 删除，零功能风险），验证 toast 统一后再处理 172-B
- 收尾统一发版

## 风险与注意
- 172-A 是纯删除操作（删内联 CSS），不影响功能逻辑；overlays.css 的标准 toast 已在全站稳定使用（index.html 的「已保存」即为佐证）
- 删除后 toast 从"顶部深色条"变为"底部浅色卡片"，位置和视觉变化较大但更符合现代 UI 规范
