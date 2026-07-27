# 需求跟踪 PWA · 执行清单（批次 135）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa ｜ 起点版本 v1.3.56`
> 范围：135 · console 日志清理
> 本文档为**执行清单**，按修改方案逐条执行并打勾；随实现一并提交至 `plans/`。
> 发版版本：随下次 `./release.sh` 升版统一处理（本清单仅规划，不单独升版）。
> 验收基线：涉及脚本改动须 `node --check` 通过；新增/改动静态资源须带 `?v=` 并在 `release.sh` 注册（RULES.md）。

## 0. 总览
清理生产代码中的调试 `console.log/warn/error` 遗留，约 49 处。

## 1. 现象
- 生产环境残留大量调试日志，控制台噪声大，部分暴露内部状态。

## 2. 根因定位（实测）
- 共 **49 处**：`user.html`×12 / `app.js`×10 / `storage-backup.js`×5 / `department.html`×3 / `company.html`×2 / `index.html`×2 / `position.html`×2 / `project-version.html`×2 / `project.html`×2 / `todo-lifecycles.js`×2 等（另有 `tests/` 下测试日志）。

## 3. 修改方案
- 删除生产代码（HTML 内联脚本、`app.js`、`storage-backup.js`、`todo-lifecycles.js` 及各管理页）中的调试 `console.*` 调用。
- 保留必要的错误上报（如真实异常 `console.error` 可改为上报通道，或保留但精简）。
- **`tests/` 目录下的测试日志不删**（属测试代码，非生产路径）。

## 4. 验收
- [ ] 生产代码（非 tests/）中 `console.log/warn/error` 调用清理完毕。
- [ ] 关键路径功能无回归（删除日志不应改变任何控制流）。
- [ ] `tests/` 下日志保留不受影响。
