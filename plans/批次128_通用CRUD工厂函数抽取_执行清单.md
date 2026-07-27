# 需求跟踪 PWA · 执行清单（批次 128）

> 来源：`https://github.com/LovelyQY/req-tracker-pwa ｜ 起点版本 v1.3.56`
> 范围：128 · 通用 CRUD 工厂函数抽取
> 本文档为**执行清单**，按修改方案逐条执行并打勾；随实现一并提交至 `plans/`。
> 发版版本：随下次 `./release.sh` 升版统一处理（本清单仅规划，不单独升版）。
> 验收基线：涉及脚本改动须 `node --check` 通过；新增/改动静态资源须带 `?v=` 并在 `release.sh` 注册（RULES.md）。

## 0. 总览
将 7 个实体管理页中几乎一致的 `save()`/`openEdit()`/`doDelete()` 流程抽取为通用 CRUD 工厂，各页改为配置驱动。

## 1. 现象
- 7 个实体管理页（company/department/position/user/project/project-version/dictionary）的增删改查核心流程高度雷同，仅实体名/字段不同，每页约 60–80 行重复。

## 2. 根因定位（实测）
- 各页内联脚本均含结构相同的 `save`/`openEdit`/`doDelete` + 列表渲染，差异仅在实体表名、字段列表、表单字段。

## 3. 修改方案
- 新建 `crud-factory.js`，导出 `makeCrud({ entity, storeName, fields, listRender })`，内部实现统一的保存/编辑/删除/列表刷新。
- 7 个页面改为调用 `makeCrud(...)` 传入实体配置，删除本地重复的 `save/openEdit/doDelete` 实现。
- 保留各页特有逻辑（如字典枚举的特殊渲染）作为 `listRender` 回调或配置项。
- 在 `release.sh` 注册 `crud-factory.js`（须先于各管理页脚本加载）。

## 4. 验收
- [ ] 7 个管理页不再各自定义重复的 `save/openEdit/doDelete` 主体。
- [ ] 7 页的列表/新增/编辑/删除行为与重构前一致（逐页手测）。
- [ ] `node --check crud-factory.js` 及各引用页通过。
