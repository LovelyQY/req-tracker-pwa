# 批次 216 执行清单：消息通知 + 首页待审批数（#26）

> 目标版本：**v1.4.21** ｜ 类型：新建（中）｜ 依赖：批次 213(#23) + 214(#24) + 215(#25) 已完成
> 上游：批次 215（首页「流程」TAB：待我审批 / 我已处理 / 已完结）
> 下游强依赖：**216 → 217 任务/待办挂流程**（顺序不可乱）
> 规划来源：EXEC_PLAN_201.md #26「审批流流转通知 + 首页待审批数」

## 一、已确认决策（开工前提）

| 决策 | 结论 |
|---|---|
| 运行架构 | **本地优先（决策 A）**：通知为应用内通知，仅本地存储（IndexedDB `notifications` store）+ 首页角标/红点，**不接入云端跨设备同步**（RT_SYNC / cloud-adapter 无需改动） |
| 通知写入点 | **审批引擎**（process-instances.js 的 approve/reject/transfer/addsign）：动作完成后向「目标审批人」写一条本地通知 |
| 通知读取点 | **通知中心**：首页头部铃铛（🔔）打开 `#view-notify` 视图，列表展示 + 未读红点 + 全部已读 |
| 待审批数展示 | **首页角标**：①「流程」TAB 红点/数字（= 当前用户为审批人且 RUNNING 的实例数）；② 首页快捷入口「待我审批(N)」 |
| master 总开关 | 复用设置页「通知」开关（`localStorage['rt_ui_prefs'].notify.master`）；关闭时不写入任何通知（notifications.js 内部 gate） |
| 通知内容存储 | **键 + 参数**而非写死文本：`{ titleKey, bodyKey, params }`，渲染时 `t(key, params)`，跟随语言切换不白屏 |

## 二、需求拆解（#26 原文 → 落地项）

1. **通知数据层（新建 notifications.js）** — 注册 `notifications` store（keyPath id，索引 toAccount/read/createdAt）；导出 `addNotification / getUnreadCount / listByAccount / markRead / markAllRead / getById`；`addNotification` 内部判断 `notify.master === false` 时跳过（返回 null）
2. **审批引擎写入（process-instances.js）** — approve/reject/transfer/addsign 完成后调用 `RT_NOTIFICATIONS.addNotification(...)`：
   - approve 推进中 → 目标 = 下一节点 approver（titleKey=notify.title.approvePending）
   - approve 终态(APPROVED) → 目标 = 发起人（notify.title.approved）
   - reject(REJECTED) → 目标 = 发起人（notify.title.rejected）
   - transfer → 目标 = `to`（notify.title.transfer）
   - addsign → 目标 = `to`（notify.title.addsign）
   - 跳过：目标为空 或 目标 === 操作者自身
3. **首页铃铛 + 通知中心视图** — index.html 头部加 `#btnNotifyBell`（带 `data-badge="notify"` 红点）；`#view-notify` 容器；`app.js` 实现 `renderNotifyTab()`（列表/空态/全部已读/点击跳转流程实例并标记已读）+ `switchView('notify')` 分支
4. **首页待审批角标** — 「流程」TAB（index.html `nav.tabs`）加 `data-badge="process"` 红点/数字；`renderHome()` 调 `renderNotifyBadges()` 计算待审批数（listByPending(me).length）与未读通知数
5. **首页快捷入口** — 现有「统计」旁加「待我审批(N)」入口（`data-go="process" data-sub="pending"`），点击跳流程 TAB 并定位「待我审批」子 TAB
6. **i18n** — 6 语言补齐 tab.notify / notify.* / home.pendingApproval 等约 20 key
7. **发版工具** — index.html + process-instances.html 引入 notifications.js，release.sh 登记其 `?v=` 升版（否则漂移自检拦截）

## 三、数据 / API

```js
// notifications.js（新建，本地优先）
RT_NOTIFICATIONS = {
  STORE: 'notifications',
  addNotification({ toAccount, type, titleKey, bodyKey, params, refType, refId }),
  // → 返回创建的通知记录；master 关闭时返回 null
  listByAccount(account),          // 按 createdAt 倒序
  getUnreadCount(account),         // 未读条数
  markRead(id),
  markAllRead(account),
  getById(id)
}
// 通知记录结构：
// { id, toAccount, type, titleKey, bodyKey, params, refType, refId, read:false, createdAt }
```

```js
// process-instances.js 现状（Batch214/215 已落地）
RT_PROCESS_INSTANCES = {
  STATUS: { RUNNING, APPROVED, REJECTED, WITHDRAWN },
  listByPending(approver),   // 待我审批（当前节点 approver === me 且 RUNNING）
  approve / reject / transfer / addsign / withdraw / startInstance ...
}
```

## 四、文件清单

| 文件 | 改动 |
|---|---|
| `plans/EXEC_PLAN_216.md` | 本清单（新建） |
| `notifications.js` | 新建：通知数据层 + API（RT_NOTIFICATIONS） |
| `process-instances.js` | approve/reject/transfer/addsign 注入通知写入 |
| `index.html` | 头部铃铛按钮 + `view-notify` 容器 + 流程 TAB 角标 + 快捷入口「待我审批」+ 引入 notifications.js |
| `process-instances.html` | 引入 notifications.js（审批动作发生在该页，须能写通知） |
| `app.js` | `switchView('notify')` 分支 + `renderNotifyTab()` + `renderNotifyBadges()` + 首页待审批角标 + 快捷入口处理 |
| `pages.css` | `.tab-badge`（角标/红点）+ `.notify-*` 通知中心样式 |
| `permissions-registry.js` | `mod_board` 下加 `page_notification`（view） |
| `i18n/{zh-CN,zh-HK,zh-TW,en,ko,ja}.js` | 补齐 Batch216 新增 key |
| `release.sh` | 为 index.html / process-instances.html 登记 `notifications.js` 升版 |
| `tests/test-batch216-notifications.js` | 新建测试（数据层 + 引擎写入 + 首页待审批计数 + i18n 对称 + 发版登记 + 权限注册） |

## 五、实现顺序

1. `notifications.js` 数据层 + API（含 master gate）
2. `process-instances.js` 审批引擎注入通知写入（尊重 master，跳过自身/空目标）
3. `index.html`：铃铛 + view-notify + 流程 TAB 角标 + 快捷入口 + notifications.js；`process-instances.html`：notifications.js
4. `app.js`：`switchView` 分支 + `renderNotifyTab()` + `renderNotifyBadges()` + 首页角标 + 快捷入口
5. `pages.css` 样式、`permissions-registry.js` 注册
6. `i18n` 6 语言补全 key
7. `release.sh` 登记 notifications.js 升版
8. `tests/test-batch216-*.js` + 全量 `node --test`（基线 v1.4.20：350/343/7，无新回归）
9. `release.sh 1.4.21` → 漂移自检 → 自动提交 → `git push` → `deploy-cloudbase.sh` → 验证线上 version.json=1.4.21

## 六、验收标准

- [ ] 审批动作（同意推进/驳回/转办/加签）后，目标审批人本地收到通知；master 关闭时不写入
- [ ] 首页「流程」TAB 显示待审批红点/数字（= 我是审批人且 RUNNING 的实例数）
- [ ] 首页头部铃铛显示未读红点；点击打开通知中心，列表含标题/正文/时间/未读点
- [ ] 通知中心「全部已读」可清未读；点击通知标记已读并跳转对应流程实例
- [ ] 首页快捷入口「待我审批(N)」点击跳流程 TAB 并定位「待我审批」子 TAB
- [ ] 6 语言 i18n 无悬空 key、key 集合与 zh-CN 一致（静态扫描通过）
- [ ] 全量测试无新回归；发版漂移自检通过；线上 v1.4.21 验证
