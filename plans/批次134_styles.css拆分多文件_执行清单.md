# 需求跟踪 PWA · 执行清单（批次 134）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa ｜ 起点版本 v1.3.56`
> 范围：134 · styles.css 拆分为多文件
> 本文档为**执行清单**，按修改方案逐条执行并打勾；随实现一并提交至 `plans/`。
> 发版版本：随下次 `./release.sh` 升版统一处理（本清单仅规划，不单独升版）。
> 验收基线：涉及脚本改动须 `node --check` 通过；新增/改动静态资源须带 `?v=` 并在 `release.sh` 注册（RULES.md）。

## 0. 总览
将 71KB / 551 规则块的单体 `styles.css` 拆分为多个职责文件。

## 1. 现象
- `styles.css` 单体巨大（71253 字节、551 规则块），变量/布局/组件/页面样式混杂，定位困难。

## 2. 根因定位
- 所有样式长期累积于单一文件，未按职责分区。

## 3. 修改方案（按《健康报告》五·拆分建议）
- 拆为：`base.css`（变量/reset/body）、`layout.css`（header/drawer/tabs/nav-bar/全屏详情）、`components.css`（filter/chip/dropdown/card/button/FAB/modal/toast/confirm-dialog）、`pages.css`（report/task-list/data-backup）、`utilities.css`（高频原子类 `.is-hidden`/`.flex-row` 等）、`print.css`（`@media print` 隔离）。
- `index.html` 用多个 `<link rel="stylesheet" href="x.css?v=...">` 引入（顺序：base→layout→components→pages→utilities，print 末位）。
- 每个新 CSS 在 `release.sh` 注册 `?v=`。
- 建议与批次 131/132 协同，在拆分同时完成重复合并与断点收敛。

## 4. 验收
- [ ] 样式拆分为上述文件，单文件体积显著下降。
- [ ] 全站视觉与拆分前一致（关键页面截图对比）。
- [ ] 无样式丢失（无 404 的 css 引用，所有 `?v=` 一致）。
