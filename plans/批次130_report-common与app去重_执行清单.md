# 需求跟踪 PWA · 执行清单（批次 130）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa ｜ 起点版本 v1.3.56`
> 范围：130 · report-common.js 与 app.js 去重
> 本文档为**执行清单**，按修改方案逐条执行并打勾；随实现一并提交至 `plans/`。
> 发版版本：随下次 `./release.sh` 升版统一处理（本清单仅规划，不单独升版）。
> 验收基线：涉及脚本改动须 `node --check` 通过；新增/改动静态资源须带 `?v=` 并在 `release.sh` 注册（RULES.md）。

## 0. 总览
消除 `report-common.js`（25 函数）与 `app.js` 之间的重复逻辑，约 200 行。

## 1. 现象
- 报告页与任务页各自维护一套相同的任务展示辅助函数，修改一端易漏另一端。

## 2. 根因定位（实测）
- 与 `app.js` 重复的函数：`priorityName`/`projectNameById`/`versionNameById`/`normalizeTask`/`fmtDate`/`fmtDateTime`（共 6 个）；`typeName`/`typeColor`/`buildTodoCardHtml` 仅 `report-common.js` 侧定义。

## 3. 修改方案
- 将两侧共用函数（`priorityName`/`projectNameById`/`versionNameById`/`normalizeTask`/`fmtDate`/`fmtDateTime`/`typeName`/`typeColor`/`buildTodoCardHtml`）集中到共享模块（如 `report-shared.js` 或并入 `app.js` 已加载的工具）。
- `report-common.js` 与 `app.js` 删除本地副本，改为引用共享模块；保持调用签名不变。
- 在 `release.sh` 注册新建的共享模块（须先于 report-* 页与 app.js 加载顺序合理）。

## 4. 验收
- [ ] `report-common.js` 与 `app.js` 不再各自定义同一函数。
- [ ] 报告页（日报/待办/缺陷/会议）与任务页渲染结果与重构前一致。
- [ ] `node --check` 相关文件通过。
