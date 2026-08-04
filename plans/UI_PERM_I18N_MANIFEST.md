# PWA 全页面 UI 元素 × 权限 × 六语言 配置台账（UI_PERM_I18N_MANIFEST）

> **性质**：本文件是一份**独立的配置文件 / 核对台账**，覆盖**整个 PWA 的所有页面模块**（不局限于某一执行清单的批次范围）。
> **用途**：登记每个页面模块展示的全部 UI 元素（文案 / 按钮 / 菜单 / 弹框 / 图例 / 状态名 / 提示），并对应其 **权限 key（`data-perm`）** 与 **i18n key（六语言）**。最后统一核对以此为准——漏权限 / 漏语言，扫本表即知。
> **与执行清单关系**：执行清单 `EXEC_PLAN_219.md` 的「二十九」章仅作入口引用，不重复列全表；本文件为唯一权威来源。
> **维护规则**：每新增 / 修改一个 UI 元素，必须在此对应页面补一行，并同步在 `permissions.js` 补 `data-perm`、在 `i18n.js` + 6 语言文件补 key。

## 图例

**六语言** = `zh-CN`（基准，默认已有）+ `zh-TW` / `en` / `ja` / `ko` / `ar`，共 6 种。

| 状态 | 含义 |
|------|------|
| ✅ | 权限已注册 + 六语言 6/6 已覆盖 |
| ⛔ | 缺权限（`data-perm` 未登记 / 未校验） |
| ⚠️语 | 权限 OK，但六语言有缺（看「六语言」列） |
| 🔲 | 待登记（新功能/未实现元素，实现时补） |
| 🔍 | 待全量核对（已部署页面需逐元素复查权限 + 六语言） |

**六语言列**：`6/6` = 全齐；`缺:en,ja,ko,ar` = 仅基准 zh-CN 有；`—` = 无文案（纯视觉/无语言）。

**权限 key 命名约定**：`perm.<module>.<action>`（如 `perm.user.view` / `perm.apply.create`）；页面级 `onShow` 校验，无权限默认拒绝。
**i18n key 命名约定**：`<module>.<element>`（如 `user.title` / `apply.leave.reason`）；无硬编码中文。

## 页面清单（全量，38 个 html）

| 页面文件 | 模块 | 章节 |
|----------|------|------|
| login/classic.html | 登录 | 一 |
| __auth/device/index.html | 设备授权登录 | 一 |
| __auth/oauth/index.html | OAuth 授权 | 一 |
| status.html | 离线/状态页 | 一 |
| index.html / index-nosw.html | 首页 + 日历 TAB | 二 |
| profile.html | 个人信息 | 三 |
| profile-detail.html | 个人信息详情 | 三 |
| profile-edit.html | 个人信息编辑 | 三 |
| devices.html | 登录设备 | 三 |
| security.html | 账号安全 | 三 |
| user.html | 用户管理 | 四 |
| company.html | 公司管理 | 四 |
| department.html | 部门管理 | 四 |
| position.html | 职位管理 | 四 |
| project.html | 项目管理 | 四 |
| project-version.html | 项目版本 | 四 |
| permission.html | 权限管理 | 五 |
| role.html | 角色管理 | 五 |
| dictionary.html | 数据字典 | 六 |
| basic-data.html | 基础数据（行政区域/工时） | 七 |
| process.html | 流程设计 | 八 |
| workflow.html | 工作流 | 八 |
| process-instances.html | 流程实例 | 八 |
| settings.html | 设置 | 九 |
| report.html | 报表总览 | 十 |
| report-task.html | 需求任务报表 | 十 |
| report-todo.html | 待办报表 | 十 |
| report-bug.html | 缺陷报表 | 十 |
| report-meeting.html | 会议报表 | 十 |
| report-stats.html | 统计报表 | 十 |
| icon-manager.html | 图标管理 | 十一 |
| changelog.html | 更新日志 | 十一 |
| about.html | 关于 | 十一 |
| storage-backup.html | 存储备份 | 十一 |

---

## 一、登录与授权

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 登录 classic | 标题「微枢」/ 登录 | 标题 | — | `app.title`/`auth.login` | 6/6 | ✅ |
| 登录 classic | 用户名 / 密码输入 | 输入 | — | `auth.username`/`auth.password` | 缺:5 种 | 🔍 |
| 登录 classic | 登录按钮 | 按钮 | — | `auth.submit` | 缺:5 种 | 🔍 |
| 登录 classic | 登录失败提示 | 提示 | — | `auth.loginFailed` | 缺:5 种 | 🔍 |
| 设备授权 | 设备确认/授权按钮 | 按钮 | `perm.auth.device` | `auth.deviceAllow` | 缺:5 种 | 🔍 |
| OAuth | 授权确认/取消 | 按钮 | `perm.auth.oauth` | `auth.oauthAllow`/`auth.oauthCancel` | 缺:5 种 | 🔍 |
| 状态页 | 离线提示 / 重试 | 文案 | — | `status.offline`/`status.retry` | 缺:5 种 | 🔍 |

## 二、首页 + 日历 TAB（index.html）

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 首页 | 应用名「微枢」 | 标题 | — | `app.title` | 6/6 | ✅ |
| 首页 | 问候语（早/中/晚好） | 文案 | — | `home.greeting.*` | 6/6 | ✅ |
| 首页 | 今日短语轮播 | 文案 | — | `home.phrase.*` | 6/6 | ✅ |
| 首页 | 城市按钮（城市·区县） | 按钮 | — | `home.city` | 6/6 | ✅ |
| 首页 | 通知铃铛 | 按钮 | `perm.notify` | `home.notify` | 6/6 | ⚠️语 |
| 首页 | 今日考勤（周末/假期） | 状态 | — | `home.todayStatus.weekend/holiday` | 6/6 | ⚠️语 |
| 首页 | 打卡状态（迟到/早退） | 状态 | — | `home.clock.amLate/pmEarly` | 6/6 | ⚠️语 |
| 日历 TAB | 8 状态名（未打卡/已打卡/迟到/早退/加班/请假/外出/出差） | 状态 | `perm.calendar.view` | `calendar.status.*` | 缺:5 种 | ⚠️语 |
| 日历 TAB | 图例（含点合并规则独立备注） | 图例 | `perm.calendar.view` | `calendar.legend.*` | 缺:5 种 | 🔲 |
| 日历 TAB | 周末/假期底色 | 视觉 | — | — | — | ✅ |
| 日历 TAB | 顶部模块（请假/外出/出差工时/实际工时） | 文案 | `perm.calendar.view` | `calendar.top.*` | 缺:5 种 | 🔲 |
| 日历 TAB | 「+ 申请」统一入口 | 按钮 | `perm.apply.create` | `calendar.apply.entry` | 缺:5 种 | 🔲 |
| 申请弹框 | 申请类型选择（请假/外出/出差/加班/调休） | 弹框 | `perm.apply.create` | `calendar.apply.type.*` | 缺:5 种 | 🔲 |
| 申请表单 | 请假（事/病/年/其他）+ 范围 | 表单 | `perm.apply.leave` | `apply.leave.*` | 缺:5 种 | 🔲 |
| 申请表单 | 外出（市内/市外）+ 地点 | 表单 | `perm.apply.outing` | `apply.outing.*` | 缺:5 种 | 🔲 |
| 申请表单 | 出差（市内/市外/省外/出国）+ 地点 | 表单 | `perm.apply.trip` | `apply.trip.*` | 缺:5 种 | 🔲 |
| 申请表单 | 加班（工作日/周末/节假日）+ 原因 | 表单 | `perm.apply.overtime` | `apply.overtime.*` | 缺:5 种 | 🔲 |
| 申请表单 | 调休（单日/区间） | 表单 | `perm.apply.adjust` | `apply.adjust.*` | 缺:5 种 | 🔲 |
| 地图选点 | 弹出地图/搜索/选点提示 | 弹框 | `perm.apply.create` | `calendar.apply.map.*` | 缺:5 种 | 🔲 |
| 地图选点 | 选点地址（只读）+ 补充地址框 | 输入 | `perm.apply.create` | `calendar.apply.address/addressExtra` | 缺:5 种 | 🔲 |
| 审批链 | 部门经理审批 / 人力资源HR审批 / 审批中 / 已通过 / 已驳回 | 状态 | `perm.approval.*` | `approval.*` | 缺:5 种 | 🔲 |

## 三、个人中心

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 个人信息 profile | 标题/基本信息/组织信息 | 标题 | `perm.profile` | `profile.title`/`profile.basic`/`profile.org` | 缺:5 种 | 🔍 |
| 个人信息 detail | 详情字段列表 | 列表 | `perm.profile` | `profile.detail.*` | 缺:5 种 | 🔍 |
| 个人信息 edit | 编辑表单/保存/取消 | 表单 | `perm.profile.edit` | `profile.edit.*`/`common.save`/`common.cancel` | 缺:5 种 | 🔍 |
| 登录设备 devices | 设备列表/时间/IP/当前设备标记 | 列表 | `perm.device` | `device.title`/`device.list.*`/`device.current` | 缺:5 种 | 🔍 |
| 账号安全 security | 密码修改/绑定/解绑 | 表单 | `perm.security` | `security.title`/`security.*` | 缺:5 种 | 🔍 |

## 四、组织管理

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 用户 user | 列表/新增/编辑/删除/搜索/分页 | 列表/按钮 | `perm.user.view`/`perm.user.edit` | `user.title`/`user.list.*`/`common.add`/`common.edit`/`common.delete`/`common.search` | 缺:5 种 | 🔍 |
| 用户 user | 表单字段（姓名/账号/部门/职位/状态） | 表单 | `perm.user.edit` | `user.field.*` | 缺:5 种 | 🔍 |
| 公司 company | 列表/新增/编辑/删除 | 列表/按钮 | `perm.company.view`/`perm.company.edit` | `company.*` | 缺:5 种 | 🔍 |
| 部门 department | 列表/新增/编辑/删除/树 | 列表/按钮 | `perm.department.*` | `department.*` | 缺:5 种 | 🔍 |
| 职位 position | 列表/新增/编辑/删除 | 列表/按钮 | `perm.position.*` | `position.*` | 缺:5 种 | 🔍 |
| 项目 project | 列表/新增/编辑/删除 | 列表/按钮 | `perm.project.*` | `project.*` | 缺:5 种 | 🔍 |
| 项目版本 project-version | 列表/新增/编辑/删除 | 列表/按钮 | `perm.projectVersion.*` | `projectVersion.*` | 缺:5 种 | 🔍 |
| 通用 | 空状态/加载中/确认删除/成功/失败提示 | 提示 | — | `common.empty`/`common.loading`/`common.confirmDelete`/`common.success`/`common.failed` | 缺:5 种 | 🔍 |

## 五、权限与角色

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 权限 permission | 权限注册表/分配 | 配置 | `perm.permission` | `perm.title`/`perm.*` | 缺:5 种 | 🔍 |
| 角色 role | 角色列表/新增/编辑/权限勾选 | 列表/按钮 | `perm.role`/`perm.role.edit` | `role.title`/`role.*` | 缺:5 种 | 🔍 |

## 六、数据字典（dictionary.html）

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 字典 | 字典列表/分类/新增/编辑/删除 | 列表/按钮 | `perm.dict`/`perm.dict.edit` | `dict.title`/`dict.*` | 缺:5 种 | 🔍 |
| 字典 | 字典项表单/保存 | 表单 | `perm.dict.edit` | `dict.item.*`/`common.save` | 缺:5 种 | 🔍 |

## 七、基础数据（basic-data.html）

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 行政区域 | 子页标题/列表/CRUD | 子页/按钮 | `perm.basicdata.region` | `regions.title`/`regions.*` | 缺:5 种 | 🔲 |
| 行政区域 | 高德同步拉取按钮 | 按钮 | `perm.basicdata.region` | `regions.sync` | 缺:5 种 | 🔲 |
| 工时管理 | 三时令切换/标准工时/弹性 | 表单 | `perm.basicdata.worktime` | `worktime.*` | 缺:5 种 | 🔲 |
| 日历上班/放假 | 放假日维护表单 | 表单 | `perm.basicdata.holiday` | `worktime.holiday.*` | 缺:5 种 | 🔲 |

## 八、流程 / 工作流

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 流程 process | 流程设计列表/新增/编辑/节点 | 列表/按钮 | `perm.process.edit` | `process.title`/`process.*` | 缺:5 种 | 🔲 |
| 工作流 workflow | 工作流列表/新增/编辑/职位审批节点 | 列表/按钮 | `perm.workflow.edit` | `workflow.title`/`workflow.node.*` | 缺:5 种 | 🔲 |
| 工作流 | 初始化示例（5 工作流）按钮 | 按钮 | `perm.workflow.init` | `workflow.init.*` | 缺:5 种 | 🔲 |
| 表单模板 | 字段类型/单选框/占位提示 | 表单 | `perm.form.edit` | `form.*` | 缺:5 种 | 🔲 |
| 流程实例 | 实例列表/审批/日历事件映射 | 列表 | `perm.process.view` | `process.instance.*` | 缺:5 种 | 🔲 |

## 九、设置（settings.html）

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 设置 | 子菜单入口（通知/界面与展示/系统权限/下载/云同步/说明/反馈） | 菜单 | `perm.settings.*` | `settings.menu.*` | 6/6(部分) | ⚠️语 |
| 界面与展示 | 字体选择（默认/无版权/系统） | 表单 | `perm.settings.ui` | `settings.font.*` | 6/6 | ✅ |
| 界面与展示 | 宽屏适配开关 | 开关 | `perm.settings.ui` | `settings.wideScreen.*` | 6/6 | ✅ |
| 界面与展示 | 初始化示例入口 | 按钮 | `perm.settings.init` | `settings.initExamples` | 6/6 | ✅ |
| 账号与安全 | 接收邮箱配置 | 输入 | `perm.settings.account` | `settings.email.*` | 缺:5 种 | 🔲 |
| 导出 | 导出弹框（本地/邮箱/腾讯文档） | 弹框 | `perm.export` | `export.toLocal/toEmail/toTencentDocs/emailNotConfigured` | 6/6(部分) | ⚠️语 |
| 意见反馈 | 提交成功/失败提示 | 提示 | `perm.feedback` | `feedback.submitSuccess/Failed` | 6/6 | ✅ |

## 十、报表（report*.html，5 页）

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 报表总览 report | 标题/各报表入口 | 标题/菜单 | `perm.report` | `report.title`/`report.menu.*` | 缺:5 种 | 🔍 |
| 各报表 | 筛选条件/查询按钮/导出 | 表单/按钮 | `perm.report.<x>` | `report.<x>.filter*`/`report.<x>.export` | 缺:5 种 | 🔍 |
| 各报表 | 表格列头/分页/空数据 | 列表 | `perm.report.<x>` | `report.<x>.col.*`/`common.empty` | 缺:5 种 | 🔍 |
| 各报表 | 统计卡片/图表标题 | 文案 | `perm.report.<x>` | `report.<x>.card.*` | 缺:5 种 | 🔍 |

> `<x>` = task / todo / bug / meeting / stats。

## 十一、系统 / 工具

| 区块 | UI 元素 | 类型 | 权限 key | i18n key | 六语言 | 状态 |
|------|---------|------|----------|----------|--------|------|
| 图标管理 icon-manager | 图标列表/上传/覆盖层 | 列表/按钮 | `perm.icon` | `icon.title`/`icon.*` | 缺:5 种 | 🔍 |
| 更新日志 changelog | 版本列表/条目 | 列表 | `perm.changelog` | `changelog.title`/`changelog.*` | 缺:5 种 | 🔍 |
| 关于 about | 应用介绍/版本/版权 | 文案 | — | `about.title`/`about.*` | 缺:5 种 | 🔍 |
| 存储备份 storage-backup | 备份/恢复/导出/导入 | 按钮 | `perm.backup` | `backup.title`/`backup.*` | 缺:5 种 | 🔍 |

---

## 统一核对验收口径（最后扫一遍）

1. **权限**：每个页面/子页/弹框在 `permissions.js` 有 `data-perm` 注册，且 `onShow` 校验；无权限默认拒绝。
2. **语言**：每个文案在 `i18n.js` 定义 key，6 语言文件（zh-CN/zh-TW/en/ja/ko/ar）均有翻译；全站无硬编码中文残留。
3. **漏登扫描**：全量 `node --test` 时附带 grep 硬编码中文 + 未注册 `data-perm`，与本表交叉验证。
4. **逐页回填**：每完成一个页面/模块，回填对应行状态为 ✅，并在「页面清单」统计计数。
5. **本文件为唯一权威**：执行清单不得另存全表副本，仅在「二十九」章引用本文件。
