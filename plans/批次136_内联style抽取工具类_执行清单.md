# 需求跟踪 PWA · 执行清单（批次 136）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa ｜ 起点版本 v1.3.56`
> 范围：136 · 内联 style 抽取工具类
> 本文档为**执行清单**，按修改方案逐条执行并打勾；随实现一并提交至 `plans/`。
> 发版版本：随下次 `./release.sh` 升版统一处理（本清单仅规划，不单独升版）。
> 验收基线：涉及脚本改动须 `node --check` 通过；新增/改动静态资源须带 `?v=` 并在 `release.sh` 注册（RULES.md）。

## 0. 总览
将散落的内联 `style="..."` 中可复用的样式抽取为工具类，约 60 处。

## 1. 现象
- 多处内联样式重复书写相同的 flex/gap/align 等，难以统一调整。

## 2. 根因定位（实测）
- 共 **60 处**内联 `style=`：`index.html`×14 / `profile.html`×6 / `about.html`×5 / `profile-edit.html`×5 / `department.html`×4 / `role.html`×4 / `company.html`×3 / `permission.html`×3 等（20 个文件）。

## 3. 修改方案
- 统计高频内联样式片段（如 `display:flex;align-items:center`、`gap:8px`、`justify-content:space-between` 等），抽为工具类（如 `.flex-row`/`.flex-center`/`.gap-sm`/`.between`）。
- HTML 中对应元素改用 class 替代内联 `style`（无法抽象的业务特定样式可保留）。
- 新增工具类放入 `utilities.css`（或承接批次 134 拆分）。

## 4. 验收
- [ ] 内联 `style=` 处数较 60 显著下降（高频可复用片段已抽离）。
- [ ] 替换后元素布局与替换前完全一致（抽查 index/profile/about）。
