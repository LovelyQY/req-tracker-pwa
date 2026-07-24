# 权限功能（RBAC 角色/权限 + 数据权限）总体方案与执行清单

> 范围：在现有需求跟踪 PWA 上新增**角色管理、权限管理、人员-角色分配、数据权限（部门隔离）**，
> 并落地一套**健壮性 / 完整性**可验证的权限体系。
> 当前版本 v1.3.48，最新批次为 80，本方案自 **批次 81** 起。
> 本文为「分析与执行清单」，按本仓库 RULES 入 `plans/`，由你分批次执行；每条批次产出后按对应 checklist 核验。

---

## 0. 目标与范围

| 能力 | 说明 |
|---|---|
| 角色管理 | 角色名称 + 勾选权限（仅可勾选**已配置**的权限），启停角色 |
| 权限管理 | 树形展示「页面 + 操作按钮」权限；可新增/编辑/启停；标注 **已配置（代码真正守卫）** vs **新增未真正配置** |
| 人员管理增强 | 给人员分配一个或多个角色，对应其页面与按钮权限 |
| 数据权限 | 人员只能看到**本部门及下级部门**的数据 |
| 系统管理员 | `admin` 账号默认拥有「系统管理员」角色，拥有全部权限；首次运行幂等播种 |

**不在本期**（如需另立批次）：权限的「数据范围」细粒度（如按项目/按人）、接口级鉴权（本 PWA 无后端，数据权限为前端只读过滤，见 §1.5）、操作审计日志页。

---

## 1. 关键设计决策（健壮性 / 完整性分析）—— 用户重点要求

### 1.1 四张表与字段（遵循 RULES）

所有表统一：
- **主键 `id`**：`RT_DB.genId()` 生成的 **32 位十六进制串**（RULES 硬性要求，禁止 Date.now/UUID/自增）。
- **审计字段**：`createdBy / createdAt / updatedBy / updatedAt`（写入用 `getCurrentUserAccount()`，种子数据用 `'system'`）。
- **长度上限**：ID 类字段单独定义 `*_ID_MAX: 64`，**严禁复用 `EMPLOYEE_NO_MAX`/`ACCOUNT_MAX`**（RULES 已踩坑）。
- **索引**：按查询路径建索引，外键字段一律建索引。

> ⚠️ 关于「菜单编号 / 父级编号」：用户列的是业务列名，但 RULES 要求每张表有 32 位 `id` 主键、外键存 32 位 ID。
> 因此**额外引入 `id` 主键**（对用户不可见），并把：
> - `菜单编号` → 字段 `menuCode`（业务编码，用于与代码注册表匹配、且是**权限判定键**与菜单树关联键）；
> - `父级编号` → 字段 `parentCode`（指向父节点 `menuCode`，邻接表树）。
> **已确认 D1：用 `menuCode` 作树关联键**——`menuCode` 是稳定业务标识（即权限身份），比随机 32 位 `id` 更适合做父子关联；此为主动偏离 RULES「外键存 32 位 ID」约定，**仅限菜单树内部自引用**，其余表外键（roleId/userId/menuId 等）仍严格存 32 位 ID。

### 1.2 权限注册表 `PERMISSION_REGISTRY`（解决「已配置 / 未真正配置」）

这是本方案的**核心**：代码侧单一事实来源，枚举所有「页面 + 操作按钮」及其稳定 `code`。

#### 命名规则（已确认：冒号 → 下划线）

> **问：命名规则，冒号改为下划线是否可以？**
> **答：可以，且推荐。** 全部权限 `code` 采用 **snake_case（下划线）**，不用冒号。理由：
> - `code` 会作为 `data-perm="op_company_delete"` 出现在 HTML 属性值里；冒号虽合法，但一旦用于 CSS 选择器 / URL query / `querySelector('[data-perm="..."]')` 需转义，下划线无此问题；
> - 下划线在属性、JS 变量、日志中均无需转义，可读性一致。
> 故统一：`mod_basic` / `page_company` / `op_company_delete` / `op_task_dev_submit` / `op_todo_complete` …（全小写，词间单下划线）。

#### 「集合中的按钮」如何只勾选某一个（粒度说明）

> **问：如果操作按钮是集合，怎么只勾选某一个按钮？**
> **答：注册表的叶子层级 = 单个按钮。** 一个页面下若有一「组」操作按钮（如一行操作图标、或生命周期操作下拉），在注册表里就是**多个并列的叶子节点**，每个按钮一个 `code`。角色勾选时逐个叶子独立勾选——勾 A 不勾 B，则用户只有 A 权限、B 按钮被隐藏。无需「整组授权」概念，粒度天然到按钮。

- 形态（新增 `permissions-registry.js`，随发版版本化缓存）：

  ```js
  // 树形：module > page > op（每个叶子 op = 一个可守卫的按钮）
  // 命名全 snake_case；基础操作统一 op_ 前缀，生命周期操作直接取字典 code 派生
  RT_PERM_REGISTRY = [
    // ===== 基础数据 =====
    { code:'mod_basic', name:'基础数据', children:[
      { code:'page_company', name:'公司管理', ops:['op_view','op_create','op_edit','op_delete'] },
      { code:'page_dept',    name:'部门管理', ops:['op_view','op_create','op_edit','op_delete'] },
      { code:'page_position',name:'职位管理', ops:['op_view','op_create','op_edit','op_delete'] },
      { code:'page_user',    name:'人员管理', ops:['op_view','op_create','op_edit','op_delete','op_assign_role'] },
      { code:'page_role',    name:'角色管理', ops:['op_view','op_create','op_edit','op_delete'] },
      { code:'page_perm',    name:'权限管理', ops:['op_view','op_create','op_edit','op_delete','op_enable'] },
      { code:'page_project', name:'项目管理', ops:['op_view','op_create','op_edit','op_delete'] },
      { code:'page_project_ver', name:'项目版本管理', ops:['op_view','op_create','op_edit','op_delete'] },
      { code:'page_dict',    name:'字典管理', ops:['op_view'] }
    ]},
    // ===== 需求看板：任务 vs 代办 区分 =====
    { code:'mod_board', name:'需求看板', children:[
      // 任务（需求任务）区：基础操作 + 任务生命周期（对照字典 TASK_OPERATION）
      { code:'page_board_task', name:'需求任务', ops:[
        'op_view','op_create','op_edit','op_export',
        'op_task_dev_submit','op_task_test_start','op_task_pause','op_task_resume',
        'op_task_test_done','op_task_online','op_task_reset','op_task_delete'
      ]},
      // 代办区：按 TODO_TYPE 拆三个页面，**三者权限按钮不同**（来源 app.js getTodoActions，行 2632）
      // 操作 act → 字典 TODO_OPERATION：start=TODO_START / complete=TODO_COMPLETE / handoff=TODO_HANDOFF /
      //   online=TODO_ONLINE / cancel=TODO_CANCEL / end=TODO_END / edit=TODO_EDIT / del=TODO_DELETE / reset=TODO_RESET
      { code:'page_board_todo_task_item', name:'代办-任务事项', ops:[
        'op_view','op_create','op_edit',
        'op_todo_start','op_todo_complete','op_todo_delete','op_todo_reset'
      ]},
      { code:'page_board_todo_bug', name:'代办-缺陷追踪', ops:[
        'op_view','op_create','op_edit',
        'op_todo_start','op_todo_complete','op_todo_handoff','op_todo_online','op_todo_delete','op_todo_reset'
      ]},
      { code:'page_board_todo_meeting', name:'代办-会议', ops:[
        'op_view','op_create','op_edit',
        'op_todo_start','op_todo_cancel','op_todo_end','op_todo_delete','op_todo_reset'
      ]},
    ]},
    // ===== 统计报表：每个子页独立权限 =====
    { code:'mod_report', name:'统计报表', children:[
      { code:'page_report_task',   name:'任务统计', ops:['op_view','op_export'] },
      { code:'page_report_bug',    name:'缺陷统计', ops:['op_view','op_export'] },
      { code:'page_report_todo',   name:'待办统计', ops:['op_view','op_export'] },
      { code:'page_report_meeting',name:'会议统计', ops:['op_view','op_export'] }
    ]},
    // ===== 个人中心 =====
    { code:'mod_me', name:'个人中心', children:[
      { code:'page_profile', name:'个人信息', ops:['op_view','op_edit'] },
      { code:'page_security',name:'账号与安全', ops:['op_view','op_edit'] }
    ]},
    // ===== 系统 =====
    { code:'mod_sys', name:'系统', children:[
      { code:'page_storage', name:'存储与备份', ops:['op_view'] },
      { code:'page_about',   name:'关于',       ops:['op_view'] }
    ]}
  ];
  ```

  > **代办类型 / 生命周期操作与字典表对应（完整性基线）**：
  > - `TODO_TYPE`（代办类型）：`TASK_ITEM` 任务事项 / `BUG` 缺陷追踪 / `MEETING` 会议 → 对应上面三个 `page_board_todo_*` 页面。
  > - `TASK_OPERATION`（任务生命周期，8）：`DEV_SUBMIT` 开发提交 / `TEST_START` 测试开始 / `PAUSE` 暂停 / `RESUME` 暂停恢复 / `TEST_DONE` 测试完成 / `ONLINE` 上线 / `RESET` 重置 / `DELETE` 删除 → 映射 `op_task_*`。
  > - `TODO_OPERATION`（代办生命周期，10）：`TODO_CREATE` 创建 / `TODO_EDIT` 编辑 / `TODO_START` 开始处理 / `TODO_COMPLETE` 完成 / `TODO_HANDOFF` 转交 / `TODO_ONLINE` 上线 / `TODO_DELETE` 删除 / `TODO_CANCEL` 取消 / `TODO_END` 结束 / `TODO_RESET` 重置。
  >   **但三种代办类型按钮不完全相同**（以 `app.js` `getTodoActions(statusCode, typeCode)` 行 2632 为准，注册表须 1:1 对齐）：
  >   - 任务事项（TD_*）：`start / complete / edit / del / reset` → `op_todo_start / op_todo_complete / op_edit / op_todo_delete / op_todo_reset`（无 handoff/online/cancel/end）
  >   - 缺陷追踪（BUG_*）：`start / complete / handoff / online / edit / del / reset` → 上 + `op_todo_handoff / op_todo_online`（无 cancel/end）
  >   - 会议（MT_*）：`start / cancel / end / edit / del / reset` → `op_todo_start / op_todo_cancel / op_todo_end / op_edit / op_todo_delete / op_todo_reset`（无 complete/handoff/online）
  >   - `op_create`（新建）为三类型共用的页面级按钮；`op_view` 为查看。
  > - 注册表落地时须**逐项对照字典表与 `getTodoActions` 补全**，确保 `app.js` / `task-lifecycles.js` / `todo-lifecycles.js` 里出现的每个真实按钮都有对应叶子（见批次 82 核对清单）。

- **「已配置」判定**（权限管理页徽标来源）：
  - `已配置（代码正确配置）`：`menu.menuCode` 存在于 `PERMISSION_REGISTRY` 展开后的全部 code 集合，且该 code 的守卫已在对应页面接线（`data-perm` 或 `RT_PERM.can`）。
  - `新增未真正配置`：`menu.menuCode` **不在** 注册表（用户自行新增的节点，代码尚未接线，不生效）。
  - 注册表即「真相」：DB 的 `menu` 表是注册表的**镜像 + 用户扩展**；首次运行从注册表播种（幂等，按 `menuCode` 去重），用户可在此之上增删/启停。

- **启停语义（「停用优先」）**：`menu.enabled`（默认 true）。`enabled=false` 时，无论角色是否勾选，该权限**全局不生效**（`can()` 返回 false）。即「停用」是比「角色分配」**更高优先级**的全局开关——典型用途：紧急情况下全站下线某操作（如暂时禁用所有 `op_company_delete` 按钮），无需逐个角色取消勾选。**优先级：停用 > 角色拥有**（已确认 D5）。

### 1.3 历史表 SCD-2（保留历史、只新增）+ 运行时去范式化

用户要求「保留历史数据，只新增最新关系」。采用**追加写（append-only）+ 去范式化当前态**双轨：

- **`role_permission`（角色-权限关系）**：追加写，每行 `roleId + menuCode(+menuId) + snapshotId + 审计`。
  - `snapshotId`（32 位）把一次保存的所有行归为一组，便于审计回溯某一历史快照。
  - **历史永远不 UPDATE / 不 DELETE**（符合「保留历史、只新增」）。
- **`roles` 记录**增加去范式化字段 `menuCodes: string[]`：保存时**整体覆盖**为「当前生效权限集」，供运行时 O(1) 解析（不回查历史表）。
- **`user_role`（人员-角色关系）**：同结构追加写（`userId + roleId + snapshotId + 审计`）。
- **`users` 记录**增加 `roleIds: string[]`：当前生效角色集（去范式化）。

> 设计权衡：历史表只作**审计日志**，运行时强制只看 `roles.menuCodes` / `users.roleIds`。
> 这样既有「可回溯的完整历史」，又有「无 JOIN、随会话缓存的快速判定」，避免每次渲染都扫历史表（完整性 + 性能兼得）。

### 1.4 运行时解析 `RT_PERM` 与 `data-perm` 守卫

新增 `permissions.js`（全局，所有页 `<script src="permissions.js?v=X">` 引入），提供：

```js
RT_PERM.can(account, code)        // 单权限判定（含 admin 短路、menu.enabled 检查）
RT_PERM.canAny(account, [codes])  // 任一
RT_PERM.canAll(account, [codes])  // 全部
RT_PERM.getMenuCodes(account)     // 返回有效 code 集合（users.roleIds→roles.menuCodes 去重展开）
RT_PERM.isAdmin(account)          // account==='admin' 或拥有系统管理员角色
RT_PERM.getDataScope(account)     // { deptId, includeSub:true } 供数据权限过滤
RT_PERM.guard(root)               // 扫描 DOM，按 data-perm 隐藏无权限元素（批次 89 起接线）
```

- **接线方式（最小侵入）**：各页按钮/入口加 `data-perm="op_company_delete"`（snake_case，见 §1.2 命名规则），页面渲染后调用 `RT_PERM.guard()` 统一隐藏无权限元素；条件逻辑（如空态「无权限」）用 `RT_PERM.can()` 显式判断。
- **会话缓存**：登录成功后缓存当前用户 `menuCodes` 到 sessionStorage（角色/权限变更时失效重算），避免每次判权读库。

### 1.5 数据权限（部门隔离）口径与诚实边界

- **口径**：以当前用户 `departmentId` 为根，取其**部门子树（自身 + 所有下级部门，按 `departments.parentId` 邻接表递归）**为可见范围。`includeSub:true` 默认开启（已确认 D2「含下级部门」）。
- **管理员豁免（已确认 D6）**：`admin` 账号 / 系统管理员角色（`isSystemAdmin`）**跳过部门过滤，可见全部数据**（最高权限）。数据权限过滤仅在非管理员时生效。
- **过滤落点（完整性关键）**：必须在**数据层 read 函数**内过滤（companies? / departments / projects / users / requirementTasks），而不仅隐藏 UI——否则可直接读 IndexedDB 绕过。
- **跨公司安全**：部门子树天然收敛在同一公司内（部门必须归属公司、上级必须同公司），按部门子树过滤不会越公司泄漏。
- **诚实边界**：本 PWA 无后端，数据权限是**前端只读过滤（软隔离）**，不能替代服务端鉴权；对「直接读 IndexedDB」的恶意用户无效。计划中标注为已知限制，不伪装成硬安全。

**影响面（最高风险批次，建议放最后、可加 featureFlag 灰度）**：项目/任务/人员/部门/报表列表均需接入 `getDataScope` 过滤；漏一处即破坏完整性，需全量回归。

### 1.6 系统管理员默认角色与幂等播种

- 扩展 `users.js` 的 `ensureDefaultAdmin` 体系，新增 `ensureDefaultAdminRole()`（幂等）：
  1. 确保 `admin` 账号存在（`ensureDefaultAdmin`，已有）；
  2. 确保「系统管理员」角色存在（`roleName='系统管理员'`，`isSystemAdmin=true`）；
  3. 将该角色 `menuCodes` 置为**注册表全部 code**（拥有所有权限）；
  4. 将 `admin` 的 `roleIds` 加入该角色；
  5. 以上均已存在则跳过（多设备各自 seed、幂等）。
- **触发点**：登录成功 / 应用启动入口（与现有 `migrateAccounts()` 同位置调用），保证任意设备首次打开即具备管理员可登录。

### 1.7 已确认决策点（D1–D6，批次 81 前拍板）

| # | 决策点 | 结论 | 影响批次 |
|---|---|---|---|
| D1 | `父级编号` 链接键 | **`menuCode`**（稳定业务标识，比 32 位 id 更适合树关联；主动偏离 RULES FK 约定，仅限菜单树内部自引用） | 82 |
| D2 | 「本部门」是否含下级部门 | **含**（部门子树，`includeSub:true`） | 92 |
| D3 | 老用户（无 `roleIds`）处理 | **不考虑**——当前仅有 `admin`，无需老用户迁移 / 兜底逻辑 | 84 |
| D4 | 角色删除策略 | **仅当无任何人员引用时可删**（当前 `users.roleIds` 与 `user_role` 历史均无本角色引用）；系统管理员角色不可删；角色页展示「引用的人」 | 86 |
| D5 | 权限节点停用 vs 角色拥有，谁优先 | **停用优先**（全局开关，高于角色分配；见 §1.2） | 82/83 |
| D6 | 数据权限覆盖范围 / 管理员 | **管理员最高权限，可见全部数据**（跳过部门过滤）；其余人严格按部门子树 | 92/93 |

### 1.8 强规则：新增页面 / 按钮必须登记权限（过程约束，长期生效）

> **强规则（权限功能上线后，所有批次 / 所有功能均须遵守）**：自本功能上线起，**任何新增的 HTML 页面或操作按钮，必须在 `PERMISSION_REGISTRY` 登记对应权限码、写入 `menus` 表（种子自动或权限管理页手动），并在页面用 `data-perm` / `RT_PERM.can` 接线**——否则该页面/按钮处于「未配置」状态：无法被任何角色精确授权，或在兜底下意外暴露，破坏权限完整性。此规则与 RULES.md 既有「发版必须 bump 版本」「新增页须 `?v=` 注册」同级，是强制约定。

- **新增页面**：在 `PERMISSION_REGISTRY` 增加 `page_*`（必要时带 `mod_*` 模块），至少登记 `op_view`；入口（抽屉 / `basic-data.html` 等）用 `data-perm="page_xxx_view"` 守卫可见性；`seedMenusFromRegistry` 幂等播种该节点。
- **新增操作按钮**：在对应 `page_*` 下增加 `op_*`（命名见 §1.2）；按钮加 `data-perm="op_xxx"`；同步补进 `menus`（种子或权限管理页手动新增）。
- **兜底与自检（防漏登记）**：
  - `seedMenusFromRegistry` 每次启动对齐注册表，注册表新增即自动播种，**不会漏**。
  - 发版自检（参考 `release.sh` 全站 `?v=` 漂移自检）新增一项：**扫描各 HTML 的 `data-perm="..."` 取值，凡不在 `PERMISSION_REGISTRY` 展开集合中的，报错并中断发版**——杜绝「页面接了权限码却忘了登记注册表」导致该按钮永远无法授权 / 误判未配置。
  - 反向弱检：注册表中 `op_*` 若在页面无任何 `data-perm` 接线，提示「已登记但未接线」（警告，不阻断）。
- **长期化**：本规则在批次 94 写入仓库 `RULES.md`，成为后续所有开发的强制约定。

---

## 2. 表结构详细定义（4 表）

> 字段表沿用 `DB_SCHEMA.md` 风格；落地时同步增补 `DB_SCHEMA.md`（批次 94）。

### 2.1 `roles`（角色表）— permissions.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（角色ID，唯一，隐藏不展示） |
| `roleName` | string | 角色名称，1–30 位（必填，唯一） |
| `menuCodes` | string[] | **去范式化**：当前生效权限 code 集合（`['op_company_view', ...]`，snake_case） |
| `isSystemAdmin` | boolean | 是否系统管理员角色（拥有全部权限）；默认 false |
| `enabled` | boolean | 角色启停；false 时其所有权限不生效；默认 true |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`roleName`、`enabled`、`updatedAt`
- **约束**：`roleName` 唯一；系统管理员角色（`isSystemAdmin=true`）不可停用 / 不可删除；**仅当无任何人员引用时可删除**——即不存在 `users.roleIds` 含本角色、且 `user_role` 历史无本角色引用（D4）；角色页需展示「引用的人」清单并在删除前校验；`menuCodes` 仅允许含**已配置** code（角色管理勾选时屏蔽未配置项，见需求）。
- **引用的人（D4 增强）**：角色列表/详情展示「引用的人」——按 `users.roleIds` 反查当前引用本角色的人员，**展示工号 / 姓名（隐藏 32 位 id）**；点击可查看引用该角色的人员清单（弹窗 / 抽屉列出人员，或跳 `user.html` 带角色筛选），便于管理员审计「谁拥有此角色」。

### 2.2 `menus`（权限/菜单表）— permissions.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（菜单/权限节点ID，唯一，隐藏不展示） |
| `menuCode` | string | **菜单编号**：业务编码，权限判定键；稳定唯一（snake_case，如 `op_company_delete`） |
| `menuName` | string | 菜单名称（展示，如「公司管理-删除」） |
| `parentCode` | string | **父级编号**：指向父节点 `menuCode`（D1 确认用 `menuCode` 作链接键）；顶级为空（邻接表树） |
| `nodeType` | string | `module` / `page` / `op`（树层级类型） |
| `enabled` | boolean | 权限启停；false 时全局不生效（停用优先，见 §1.2）；默认 true |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段 |

- **索引**：`menuCode`、`parentCode`、`enabled`、`updatedAt`
- **约束**：`menuCode` 唯一（按 code 播种/去重）；`parentCode` 必须指向存在的父 `menuCode` 且不得成环（复用 `departments.js` 防环思路，按 code 比对）；`nodeType` 必填。
- **「已配置」派生**：`已配置 ⇔ menuCode ∈ PERMISSION_REGISTRY 全量 code 集合`；否则徽标「未真正配置」。

### 2.3 `role_permission`（角色-权限关系表，历史）— permissions.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（关系行ID） |
| `roleId` | string | 32 位 FK → `roles.id` |
| `menuCode` | string | **权限 code（关系主键 / 判定键）**；指向 `menus.menuCode`（D1：菜单树以 `menuCode` 为链接键） |
| `menuId` | string | 32 位 FK → `menus.id`（镜像，便于展示 / 引用完整性） |
| `snapshotId` | string | 32 位，一次保存的分组标识（同批保存共享） |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段（追加写时 = created*） |

- **索引**：`roleId`、`menuCode`、`snapshotId`、`updatedAt`
- **写入规则**：**仅追加（append-only）**，保存角色权限时：生成新 `snapshotId` → 批量插入新行；**不 UPDATE、不 DELETE 旧行**（历史保留）。`roles.menuCodes` 同步覆盖为当前集。
- **查历史**：按 `roleId + snapshotId` 回溯任意历史快照（审计用，不影响运行时）。

### 2.4 `user_role`（人员-角色关系表，历史）— permissions.js

| 字段 | 类型 | 说明 / 约束 |
|---|---|---|
| `id` | string | 32 位自动 ID（关系行ID） |
| `userId` | string | 32 位 FK → `users.id` |
| `roleId` | string | 32 位 FK → `roles.id` |
| `snapshotId` | string | 32 位，一次分配的分组标识 |
| `createdBy` / `createdAt` | string / number | 审计字段 |
| `updatedBy` / `updatedAt` | string / number | 审计字段（追加写时 = created*） |

- **索引**：`userId`、`roleId`、`snapshotId`、`updatedAt`
- **写入规则**：同 §2.3 追加写；`users.roleIds` 同步覆盖为当前集（去范式化）。
- **`users` 表新增字段**：`roleIds: string[]`（当前生效角色集），`users.js` 校验/迁移兼容（旧记录缺省为空数组，按 D3 处理）。

---

## 3. 分阶段执行清单（批次 81 起）

> 每个批次交付后：`node --check` 相关文件 → 跑 `node --test tests/test-batch*.js`（含本批次新增单测）→ 浏览器核验项 → 提交（计划/文档用 `[no-version-bump]`，功能落地按 RULES bump 版本）→ 勾选 checklist。

### 阶段 0：基础设施与数据层

#### 批次 81 — 权限数据层（permissions.js 四表 registerStore + CRUD + 历史逻辑）
- [ ] 新增 `permissions.js`：注册 `roles / menus / role_permission / user_role` 四个 store（keyPath `id`，索引见 §2）。
- [ ] 实现 `validateRole / validateMenu`（字段 + `roleName`/`menuCode` 唯一 + 防环 + `menuCode` 长度 `MENU_CODE_MAX:64`、`ROLE_NAME_MAX:30` 用专用上限，不复用 `EMPLOYEE_NO_MAX`）。
- [ ] 实现 CRUD：`createRole/updateRole/deleteRole(getRole/getAllRoles)`、`createMenu/updateMenu/deleteMenu(getMenu/getAllMenus)`。
- [ ] 实现**追加写**关系保存：`saveRolePermissions(roleId, menuCodes[], operator)`（生成 snapshotId、批量插 `role_permission`、覆盖 `roles.menuCodes`）；`saveUserRoles(userId, roleIds[], operator)`（同理写 `user_role` + 覆盖 `users.roleIds`）。
- [ ] 历史表查询辅助：`getRolePermissionHistory(roleId)`、`getUserRoleHistory(userId)`（按 snapshotId 分组）。
- [ ] `LIMITS` 专用上限：`ROLE_NAME_MAX:30`、`MENU_CODE_MAX:64`、`ROLE_ID_MAX:64`、`MENU_ID_MAX:64`、`USER_ID_MAX:64`（遵循 RULES *ID_MAX 规则）。
- [ ] 单测 `tests/test-batch81-perm-dal.js`：四表 CRUD；唯一/防环/长度校验；追加写后历史行数递增且 `roles.menuCodes`/`users.roleIds` 为最新集；旧行 `snapshotId` 不变（append-only 验证）。

#### 批次 82 — 权限注册表 + 菜单种子 + 已配置判定
- [x] 新增 `permissions-registry.js`：`RT_PERM_REGISTRY`（§1.2 结构；**全部 snake_case 命名**；看板拆 `page_board_task` + 三个 `page_board_todo_*`；报表拆四个 `page_report_*`）。
- [x] **对照字典表补全操作按钮（完整性基线，用户重点要求）**：逐一核对 `app.js` / `task-lifecycles.js` / `todo-lifecycles.js` 中出现的真实按钮，确保注册表叶子齐全：
  - [x] `TASK_OPERATION`（8）：`DEV_SUBMIT / TEST_START / PAUSE / RESUME / TEST_DONE / ONLINE / RESET / DELETE` → 任务区 8 个生命周期叶子（`op_board_task_dev_submit` 等；`delete` 在任务页即 `TASK_OPERATION.DELETE`，标记 special）。
  - [x] `TODO_OPERATION`：三种代办类型按钮各异，已按 `app.js` `getTodoActions`（行 2632）对齐：任务事项=`start/complete/edit/del/reset`、缺陷=`start/complete/handoff/online/edit/del/reset`、会议=`start/cancel/end/edit/del/reset`；三者 `op_board_todo_*` 集合各异（非各一套相同）。
  - [x] `TODO_TYPE`（3）：`TASK_ITEM / BUG / MEETING` → 三个 `page_board_todo_*` 页面。
  - [x] 基础操作 `op_view/create/edit/delete/export/assign_role/enable` 落在对应页面。
  - [x] 任何 `app.js` 里实际渲染的按钮（任务卡 advance/pause/resume/reset/edit/del；代办 start/complete/handoff/online/cancel/end）均能在注册表找到对应叶子（advance 按状态映射到 dev_submit/test_start/test_done/online，批次 89 接线）。
- [x] `flattenRegistryCodes()` 展开全部有效 code 集合；`isCodeConfigured(code)` 判定「已配置」。
- [x] `seedMenusFromRegistry()`（落地于 `permissions.js`）：按注册表幂等播种 `menus`（module/page/op 三级节点，`parentCode` 链式指向父 `menuCode`、`menuCode` 去重、缺则补、已有跳过）。
- [x] `menus` 树构建 `buildMenuTree()`（批次 81 已实现；按 `parentCode` 关联，已通过本批次种子树形校验）。
- [x] 单测 `tests/test-batch82-registry.js`：注册表展开 code 集合正确（5 模块 / 21 页面 / 85 操作 = 111；任务区 8 生命周期 + 代办三类型各异 + 报表 4×2）；种子幂等（跑多次行数不变）；`isCodeConfigured` 对注册表内外 code 判定正确；树形 `parentCode` 正确；代办三类型页独立。
- [x] **注册表为权限码单一真相（§1.8 强规则）**：本批次起，`PERMISSION_REGISTRY`（`RT_PERM_REGISTRY`）是新增页面/按钮权限的唯一登记处；后续所有批次新增页面或操作按钮，均须登记注册表并接线 `data-perm`（见 §1.8）。

#### 批次 83 — 运行时解析 RT_PERM
- [x] `permissions.js` 暴露 `RT_PERM`（§1.4 API）：`can/canAny/canAll/getMenuCodes/isAdmin/getDataScope`（另含 `cachePermissions`/`clearPermissionCache`/`getCachedCodes`/`isAdminCached`）。
- [x] `can` 逻辑：`isAdmin` 短路 true（绕过 `menu.enabled`，最高权限）→ 否则取 `getMenuCodes(account)` 且对应 `menu.enabled !== false` → 命中返回 true（落实 §1.2 停用优先、§1.5 admin 全部）。
- [x] 会话缓存：`cachePermissions(account)`（预热有效 code 集 + 各 `menu.enabled` 映射，并写入 sessionStorage）/`clearPermissionCache()`（登录成功与角色变更时调用，使缓存失效重算）。
- [x] 单测 `tests/test-batch83-rtperm.js`（16 例）：admin 全 true（且绕过禁用菜单）；普通用户按 `users.roleIds→roles.menuCodes` 命中；停用菜单 `can` 返回 false；`canAny/canAll` 集合语义；`getMenuCodes` 去重并集；`getDataScope` 返回 `{deptId, includeSub:true}`（admin `deptId:null` 表示可见全部）；缓存失效后角色变更即时反映。

#### 批次 84 — 系统管理员默认角色播种 + 启动串联
- [x] `users.js` 新增 `ensureDefaultAdminRole()`（§1.6，幂等）：建「系统管理员」角色（`isSystemAdmin=true`、`menuCodes`=全部注册表 code）、绑定 `admin.roleIds`。
- [x] 在登录成功 / 应用启动入口串联：`ensureDefaultAdmin()` → `ensureDefaultAdminRole()` → `seedMenusFromRegistry()`（与现有 `migrateAccounts()` 同位置）。
- [x] D3 已确认不考虑老用户：当前仅有 `admin`，seed 保证其获系统管理员角色；`users.roleIds` 缺省空数组即可，无需兜底逻辑。
- [x] 单测 `tests/test-batch84-seed.js`：幂等（多次调用角色/菜单/绑定不重复）；`admin` 经 `RT_PERM.isAdmin` 与 `can(任意code)` 为 true。

### 阶段 1：管理页面（基础数据下钻）

#### 批次 85 — 基础数据页入口
- [x] `basic-data.html` 的 `MODULES` 在「项目版本管理」「字典管理」后追加 `角色管理(role.html)`、`权限管理(permission.html)`（按现有 MODULE 结构 + icon）。
- [x] 两页 `<script src="...">` 均带 `?v=` 并在 `release.sh` 注册（RULES 缓存破坏 + 自检）。

#### 批次 86 — 角色管理页（role.html + role.js）
- [x] 列表：角色名称、启停状态、权限数；新增/编辑/启停（遵循 `departments` 页模式 + 返回栈 `goBack`/`navTo`）。
- [x] 分配权限：树形勾选（来自 `buildMenuTree`，仅允许勾选**已配置**节点；未配置项禁用勾选，呼应需求「只可勾选已配置的权限」）。
- [x] 保存：`saveRolePermissions`（追加写历史）+ 覆盖 `roles.menuCodes`；系统管理员角色禁停用/禁删。
- [x] 角色列表/详情**展示「引用的人」清单**（按 `users.roleIds` 反查当前引用本角色的人员，隐藏 32 位 id，显示工号/姓名）；**点击可查看引用该角色的人员**（弹窗 / 抽屉列出人员，或跳 `user.html?roleId=...` 带角色筛选），便于审计谁拥有此角色（D4 增强）。
- [x] **删除前校验「无人员引用」方可删**（D4）：仍有引用时禁用删除并提示引用人数；系统管理员角色始终禁删。
- [x] 表单遵循 RULES：不展示 32 位 id；`-webkit-tap-highlight-color` reset；返回用 `goBack()`。
- [x] 单测：`tests/test-batch86-role.js`（computeLeaves / buildTreeHtml / toggleNode，7 项全绿；全量回归 124/124）。

#### 批次 87 — 权限管理页（permission.html + permission.js）
- [x] 树形展示页面权限按钮（module/page/op 三级，`buildMenuTree`）。
- [x] 新增/编辑/启停权限节点（`createMenu/updateMenu`，`menuCode` 唯一校验、防环）；启停写 `enabled`。
- [x] **徽标**：每节点显示「已配置（绿）」/「新增未真正配置（灰/警示）」，来源 `isCodeConfigured(menuCode)`。
- [x] 仅管理员可见（入口受 `RT_PERM.can('page_perm_view')` 守卫，批次 89 接线；本批次先完成页面）。
- [x] 单测：`tests/test-batch87-permission.js`（parentOptionsFor / matchQuery / filterTree / buildTreeHtml 接线 / badge-cfg vs badge-uncfg，5 项全绿；全量回归 129/129）。

#### 批次 88 — 人员管理增强（user.html + users.js）
- [x] 人员表单新增「分配角色」多选（来自 `roles` 列表，仅启用角色可选）。
- [x] 保存：`saveUserRoles`（追加写 `user_role` 历史）+ 覆盖 `users.roleIds`；`validatePerson` 兼容 `roleIds` 选填（默认忽略，无需改动）。
- [x] 列表展示人员已分配角色名称（按 `roleIds` 解析 `roleMap`，隐藏 32 位 id，紫色徽标）。
- [x] 单测：`tests/test-batch88-user-roles.js`（saveUserRoles 覆盖 roleIds + 追加历史 / validatePerson 兼容 roleIds / 仅启用角色可分配，3 项全绿；全量回归 132/132）。

### 阶段 2：运行时强制执行（按钮级）

#### 批次 89 — 守卫机制 + 首页/看板接线
- [x] `RT_PERM.guard(root)`：扫描 `[data-perm]`，无权限则 `style.display='none` + `.perm-hidden`；admin 全部可见（绕过 menu.enabled，最高权限）。
- [x] `index.html` 引入 `permissions.js` + `permissions-registry.js`（release.sh 3.7.x 块注册 `index.html` 版本化 URL）。
- [x] `app.js` 首页/看板：FAB 加 `data-perm="op_board_task_create"`、任务/待办模态保存按钮加 `data-perm`（如 `op_board_task_create,op_board_task_edit` / `op_board_todo_task_item_create,op_board_todo_task_item_complete`，按 §1.2 注册表 op 码）；`init()` 渲染后 `RT_PERM.guard()`。
- [x] 登录态 `init()` 内 `RT_PERM.cachePermissions(account)` 预热权限缓存（角色/权限变更后调用 `clearPermissionCache` 失效重算）。
- [x] 单测：`tests/test-batch89-guard.js`（guard 隐藏无权限元素 / 列表任一命中即可见 / admin 全可见，2 项全绿；全量回归 134/134）。

#### 批次 90 — 基础数据各页接线
- [x] 公司/部门/职位/项目/版本/字典页：增删改按钮 + 入口加 `data-perm`；渲染后 `guard()`。
- [x] 角色/权限/人员管理页自身入口受对应 `page:*:view` 守卫（仅管理员可见）。
- [x] 单测：`tests/test-batch90-basic-data-guard.js`（按钮级守卫隐藏 / admin 全可见 / 管理员入口守卫 / 逗号分隔命中，5 项全绿；全量回归 139/139）。

#### 批次 91 — 报表/个人/系统页接线 + 抽屉收起
- [x] 统计报表明细页（report-task / report-bug / report-todo / report-meeting）各受自身 `page_report_*` 守卫；导出按钮 `op_export` 单独守卫（四个子页各自独立权限）。
- [x] 个人信息/账号安全/存储备份/关于：按钮级 `data-perm` + `guard()`。
- [x] `index.html` 抽屉：无 `view` 权限的入口隐藏（如非管理员看不到「角色管理」「权限管理」；无 `page_report_*` 则隐藏对应统计入口）。
- [x] 单测：`tests/test-batch91-report-profile-guard.js`（报表导出/个人编辑/安全编辑/抽屉守卫/多码逗号分隔/admin全可见，6 项全绿；全量回归 145/145）。

### 阶段 3：数据权限（部门隔离，最高风险）

#### 批次 92 — 数据权限核心
- [x] `getDataScope(account)` 计算部门子树（自身 + 下级，递归 `departments.parentId`）。
- [x] 数据层 read 过滤钩子：在 `getAllUsers/getAllDepartments/getAllProjects/requirementTasks` 等列表函数内，非管理员按 `deptId ∈ 子树` 过滤（管理员跳过，D6）。
- [x] 公司/部门页：按可见部门过滤其下属数据。
- [x] featureFlag（可选灰度）：`RT_CONFIG.featureFlags.dataPermission` 默认开；便于回滚。
- [x] 单测：`tests/test-batch92-data-scope.js`（getVisibleDeptIds 管理员/多级/叶子 / 按部门过滤 getAllDepartments/getAllUsers/getAllProjects / 向后兼容 / featureFlag，8 项全绿；全量回归 153/153）。

#### 批次 93 — 报表/统计过滤 + 一致性核验
- [x] 报表（report-common.js / report-*.js）按 `getDataScope` 过滤统计范围。
- [x] 跨页一致性核验：同账号在各页看到的数据范围一致；管理员可见全部。
- [x] 单测：`tests/test-batch93-report-scope.js`（tasks/todos 部门过滤 / admin 全量 / 跨页一致性，4 项全绿；全量回归 157/157）。

### 阶段 4：收尾

#### 批次 94 — 文档 + 全量单测 + 发版
- [x] `DB_SCHEMA.md` 增补 RBAC 四张表（roles/menus/role_permission/user_role）。
- [x] `RULES.md` 增补权限规则（§1.1–§1.8 + §3–§5：角色/权限/数据权限概念、admin 默认角色、强规则 §1.8、历史表约束、审计字段）。
- [x] `release.sh` 发版自检新增「扫描 `data-perm` 取值，未登记注册表则阻断发版」（§1.8 强规则落地）。
- [x] 关于页补充权限说明。
- [x] 全量 `node --test`：**157/157 全绿**；`node --check`：全部改动 `.js` 语法通过。
- [ ] `./release.sh <版本> "权限功能：角色/权限/人员角色/数据权限"` 发版 + 更新 CHANGELOG。

---

## 4. 完整性与健壮性检查项（发版前核对）

- [ ] 所有新表主键 `id` 均为 `genId()` 32 位；外键（roleId/userId/menuId 等）存 32 位 ID（无 Date.now/UUID/自增）；仅 `menus` 树自引用 `parentCode` 指向 `menuCode`（D1 已确认偏离）。
- [ ] 所有 ID/编码长度用专用 `*_ID_MAX`/`MENU_CODE_MAX`，未复用 `EMPLOYEE_NO_MAX`/`ACCOUNT_MAX`。
- [ ] 历史表（`role_permission`/`user_role`）纯追加写，旧行 snapshotId 不变；当前态仅在 `roles.menuCodes`/`users.roleIds` 覆盖。
- [ ] 「已配置」判定以 `PERMISSION_REGISTRY` 为唯一真相；未配置节点在角色管理不可勾选、在权限管理标徽标。
- [ ] 强规则落地（§1.8）：`PERMISSION_REGISTRY` 为权限码唯一来源；各页 `data-perm` 取值均能在注册表命中；新增页面/按钮已登记；发版自检含「`data-perm` 未登记即阻断」。
- [ ] `menu.enabled=false` 全局盖过角色拥有（停用优先）。
- [ ] 数据权限在**数据层 read** 过滤（非仅 UI 隐藏）；管理员豁免；部门子树不跨公司。
- [ ] 新增 HTML/JS 全部在 `release.sh` 注册 + `?v=` 缓存破坏；`node --check` + 单测全绿。
- [ ] 新页面遵循 RULES：不展示 32 位 id、`tap-highlight` reset、返回用 `goBack()`、下钻用 `navTo()`。
- [ ] 审计字段 `createdBy/updatedBy` 用 `getCurrentUserAccount()`，种子用 `'system'`。
- [ ] `admin` 首次运行幂等获得「系统管理员」角色并拥有全部权限。

## 5. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 数据权限漏接某列表 → 越权可见 | 批次 92/93 集中过滤 + 跨页一致性核验；管理员豁免便于自测 |
| 历史表误 UPDATE/DELETE 破坏审计 | 关系保存仅 `put` 新行 + 覆盖去范式化字段；旧行只读 |
| 注册表与菜单表不一致 → 「已配置」误判 | 首次/每次启动 `seedMenusFromRegistry` 幂等对齐 |
| 老用户无权限不可用 | D3 已确认不考虑（当前仅有 `admin`，无需老用户兜底） |
| 发版缓存旧版 | 新资源 `?v=` + release.sh 全站漂移自检 |
| 数据权限为软隔离 | 计划中明示边界（无后端，非硬安全），不伪装 |
