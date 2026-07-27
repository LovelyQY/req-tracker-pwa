# 需求跟踪 PWA · 执行清单（批次 124）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa ｜ 起点版本 v1.3.56`
> 范围：124 · 共享 IndexedDB 媒体存储层抽取
> 本文档为**执行清单**，按修改方案逐条执行并打勾；随实现一并提交至 `plans/`。
> 发版版本：随下次 `./release.sh` 升版统一处理（本清单仅规划，不单独升版）。
> 验收基线：涉及脚本改动须 `node --check` 通过；新增/改动静态资源须带 `?v=` 并在 `release.sh` 注册（RULES.md）。

## 0. 总览
将 `app.js` 与 `storage-backup.js` 各自独立实现的图片/附件 IndexedDB 存储层抽取为单一共享模块，消除约 120 行重复。

## 1. 现象
- `app.js` 与 `storage-backup.js` 各自定义了一套相同的图片/附件存储函数，维护时须同步两处，极易漂移。

## 2. 根因定位（实测）
- `storage-backup.js` 共 28 个函数；与 `app.js` 重复定义以下 7 个：`openImageDB` / `dbPutImage` / `dbGetImages` / `dbPutAttachment` / `dbGetAttachments` / `genImageId` / `genAttachId`（注释已标注“共享逻辑”但未抽取）。

## 3. 修改方案
- 新建 `media-store.js`，集中实现上述 7 个函数 + DB 配置常量（DB 名/版本/stores）。
- `app.js` 与 `storage-backup.js` 删除本地副本，改为引用全局（vanilla 环境：在二者之前以 `<script src="media-store.js?v=...">` 引入，函数即全局可用）。
- 保持对外调用签名（参数、返回值）完全不变，确保引用点零改动。
- 按 RULES.md 在 `release.sh` 注册 `media-store.js` 及其 `?v=`。

## 4. 验收
- [ ] `app.js` 与 `storage-backup.js` 中不再各自定义上述 7 个函数（仅 `media-store.js` 定义）。
- [ ] PWA 内图片上传/预览、附件上传/下载功能正常（手动验证各一处）。
- [ ] `node --check media-store.js` 及两个引用文件通过。
