# CloudBase 同步架构方案

> 创建时间：2026-07-30 00:23
> 前置版本：v1.3.71
> 关联文档：`批次174-178_设置中心设计与执行清单.md`
> 目标：将现有"纯静态 + IndexedDB（无后端）"改为"本地离线缓存 + CloudBase 云端真实源"的同步架构，使设置中心的壳功能（云同步/登录设备/账号资料/偏好漫游）变为真实可用，并明确仍受浏览器限制的项（系统权限/下载目录/真实推送）。

---

## 一、总体架构（三层）

```
┌────────────────────┐   写穿 / 读穿透   ┌──────────────────┐   增量同步    ┌────────────────────┐
│  本地 IndexedDB     │ ◀──────────────▶ │  同步引擎 sync.js │ ◀──────────▶ │  CloudBase         │
│  (离线缓存 / 低延迟) │   (队列 + 合并)   │  push / pull     │   watch 实时 │  云数据库 / 云函数  │
└────────────────────┘                  │  / 冲突 / 软删    │              │  / 云存储 / 静态托管 │
                                        └──────────────────┘              └────────────────────┘
```

**核心原则**：保留 IndexedDB 作为离线缓存与快读层，**CloudBase 作为唯一真实源（source of truth）**。理由——PWA 的本质是离线可用，纯云端会在断网时整体瘫痪；本地缓存保证离线读写，联网时由同步引擎与云端对账。

---

## 二、集合 Schema 草案（对齐现有 IDB store）

每个文档统一附加元数据字段，用于同步与权限：

| 字段 | 含义 |
|------|------|
| `_owner` | 用户标识（CloudBase `auth.uid`），对应原 `RT_USERS` 主键 |
| `_createdAt` / `_updatedAt` | 时间戳（毫秒），同步增量与冲突判定依据 |
| `_updatedBy` | 最后修改者 uid |
| `_deleted` | 软删除标记（布尔），避免硬删无法同步 |

| CloudBase 集合 | 对应现有本地 | 说明 |
|---------------|-------------|------|
| `users` | `RT_USERS` | 账号/资料/安全字段（密码建议移交 CloudBase auth） |
| `depts` | `RT_DEPTS` | 部门（含 company 推断来源），组织内共享只读 |
| `positions` | 职位表 | 职位外键解析 |
| `requirements` | 需求主数据 | 业务核心数据，按 `_owner` 隔离 |
| `attachments` | `RT_IMGSTORE` 元数据 | 文件元数据存库，**文件本体走云存储** |
| `login_logs` | 无（新增） | 登录设备历史（见第三节） |
| `user_settings` | 无（新增） | 个人偏好：主题色 / 深色 / 语言 / 通知开关 |
| `sync_logs` | 无（新增） | 同步记录：时间 / 范围 / 网络 / 结果（云同步页数据源） |
| `user_push_subs` | 无（新增） | Web Push 订阅体（通知推送用） |
| `feedback` | 无（新增） | 用户反馈/意见：`_owner`/content/type(bug\|suggest\|other)/status(pending\|processing\|done)/reply/contact |
| `help_docs` | 无（新增） | 帮助文档：分类/标题/正文（供帮助查看器检索，内容后续补充） |

**安全规则示例**（用户隔离）：

```json
{
  "read": "auth.uid == doc._owner",
  "write": "auth.uid == doc._owner"
}
```

`depts`/`positions` 等组织共享数据用 `read: true`（登录即可读）、`write: false`（仅云函数可写）。

---

## 三、认证桥接（最关键的坑）

现有"用户"全在浏览器 IndexedDB，**服务端无用户表**。因此同步第一步不是写同步，而是：

### 3.1 数据播种（seed）
首次同步时，把本地 IDB 的 `RT_USERS`/`RT_DEPTS` 等上传为 CloudBase 集合（每个账户做一次"初始化同步"）。可做成"设置 → 云同步 → 首次同步"按钮触发。

### 3.2 自定义登录（custom login）
登录校验仍走现有逻辑，但成功后调云函数 `getLoginTicket` 签发票据：

```js
// 客户端：本地校验通过 → 换取云端身份
const ticket = await callFunction('getLoginTicket', { account, pwdHash });
await tcb.auth.signInWithTicket(ticket);   // 拿到 auth.uid
```

> 这样最小改动现有登录流程，又让每条数据带上 `uid`，云数据库安全规则才能生效。

### 3.3 登录设备历史（login_logs）
云函数 `getLoginTicket` 在签发票据**同时**写入登录日志，使"登录设备"从受限变为完全可行：

```js
db.collection('login_logs').add({
  _owner: uid,
  ua: event.userAgent,
  device: parseUA(event.userAgent),   // 建议补 User-Agent Client Hints
  ip: event.clientIP,
  loginAt: new Date(),
  sessionId: issuedSession,
  isCurrent: true
})
```

设置页据此列出**完整历史设备**，并支持"登出其他设备"（云函数按 `sessionId` 失效）。

---

## 四、同步引擎 sync.js 设计

| 机制 | 做法 |
|------|------|
| **Pull（拉增量）** | 每集合按 `_updatedAt > lastSyncTs && _owner == uid` 查询，合并进 IDB |
| **Push（推增量）** | 本地写先落 IDB，再入队；联网 flush 到云函数/直写（带安全规则） |
| **软删除** | 用 `_deleted:true` 代替硬删，否则删除无法同步 |
| **冲突解决** | 起步用 `_updatedAt` **后写覆盖（LWW）**；单用户单文档足够；需再上字段级合并 |
| **实时（可选）** | `db.collection().where({_owner:uid}).watch()` 跨标签页/设备秒级同步 |
| **同步记录** | 写入 `sync_logs` + 本地 meta，存"最近同步时间/范围/网络/结果" |

引擎对外接口草图：

```js
RT_SYNC.pull();                       // 拉全量增量
RT_SYNC.push(op);                     // 入队一个写操作
RT_SYNC.onConflict(cb);               // 冲突回调（UI 提示）
RT_SYNC.watch();                      // 开启实时监听
```

---

## 五、各设置功能改造映射

| 设置项 | CloudBase 下能力 | 实现方式 |
|--------|-----------------|---------|
| 云同步 | ✅ 完全真实 | 第四节同步引擎 + `sync_logs` |
| 登录设备 | ✅ 完全真实 | `login_logs` 集合（第三节） |
| 账号资料 | ✅ 真实 | `users` 集合，`updateProfile` 走云函数/安全规则 |
| 账号安全 | ✅（密码建议用 CloudBase auth） | 手机/邮箱存 `users`；密码移交云端认证 |
| 深色 / 主题色 / 语言 | ✅ 可跨设备漫游 | 偏好存 `user_settings`，换设备生效 |
| 系统权限 | ⚠️ 半真 | 相机/存储仍是浏览器 Web API（getUserMedia 等），CloudBase 改不了；但"已授予状态"可存云端保持跨设备一致 |
| 下载地址 | ⚠️ 半真 | 浏览器不能设 OS 下载目录；只能存"默认文件名/位置标签"云端漫游 |
| 通知 | ❓ 最重 | 开关/声音/震动可真（存 `user_settings`）；真实推送需自建 Web Push（见第六节） |

---

## 六、语言与主题色专项

### 6.1 语言（6 种）
设置"语言"选项需覆盖：

| code | UI 显示标签 | 备注 |
|------|------------|------|
| `zh-CN` | 简体中文 | 默认 |
| `zh-HK` | 繁體中文（香港） | 中国香港用词 |
| `zh-TW` | 繁體中文（台灣） | 中国台湾用词 |
| `en` | English | |
| `ko` | 한국어 | |
| `ja` | 日本語 | |

> 现有 `RT_CONFIG.setLang` 仅 i18n 骨架（无词条字典）。**6 语言意味着真实翻译工程**：需建立 `i18n/` 字典（每语言一份 JSON，覆盖全站文案），语言切换即换字典。语言偏好存 `user_settings` 可跨设备漫游。
> 注：香港、台湾分别为中国香港、中国台湾，UI 标签按本地习惯显示，文案以规范表述为准。

### 6.2 主题色（统一修改）
现状：主题色为**蓝色**（固定 `--primary` 及派生 `--primary-dark` 等）。需求：选择器选色 → **全站统一修改主题色**。

- 选择器输出一个主色（hex），写入 `:root` 上的 CSS 变量覆盖：
  ```css
  :root{
    --primary: <选色>;
    --primary-dark: <自动加深>;
    --primary-hover: <自动变亮>;
    --link: <选色>;
  }
  ```
- 所有蓝色用法必须引用 `var(--primary)` 系列（需审计 `base.css`/`theme.css`，把散落的硬编码蓝改为变量）。
- 持久化：本地 `localStorage` + 云端 `user_settings`（漫游）。
- 当前默认蓝作为"预设 1"，另提供若干预设色板 + 自定义取色器。

---

## 七、通知推送专项（Web Push）

CloudBase **无原生 Web Push**，需自建链路：

```
SW 注册 Push(applicationServerKey = VAPID 公钥)
  → 用户订阅 → 订阅体存 CloudBase(user_push_subs)
  → 云函数用 web-push 库 + VAPID 私钥推送
  → 浏览器 SW 收到 push → 弹通知
```

- 需 HTTPS 域名（CloudBase 静态托管满足）+ VAPID 密钥管理。
- 建议分期：先把通知开关/声音/震动做成真（配置存 `user_settings`），真实推送作后续独立大工程。

---

## 八、阶段划分与里程碑

| 阶段 | 内容 | 产物 |
|------|------|------|
| **阶段0（前置）** | CloudBase 环境 + 集合 schema + 认证桥接 + 数据播种 + sync 引擎雏形 + 安全规则 | 后端就绪，可首次同步 |
| 阶段1 | sync.js 完整（pull/push/冲突/实时） | 数据双向同步 |
| 阶段2 | 设置中心 174–178 的壳功能逐个接真（云同步/登录设备/资料/偏好漫游/6语言/主题色） | 设置中心真实可用 |
| 阶段3（可选） | Web Push + 实时 watch 深化 | 真实推送 |

---

## 九、风险与注意

- **别拆 IndexedDB**：离线优先，CloudBase 仅作真实源与同步层。
- **认证桥接先行**：没有 `uid` 就没有安全规则，同步无从谈起——阶段0 优先级最高。
- **软删除必做**：硬删无法同步，历史会"复活"。
- **冲突起步用 LWW**：字段级合并是后续优化，不必一开始上。
- **主题色变量化**：散落硬编码蓝必须收敛到 `var(--primary)`，否则换色不彻底。
- **6 语言是翻译工程**：开关 UI 易，全站词条字典是持续投入。
- **推送最重**：Web Push 链路独立成工程，避免阻塞设置中心主流程。
