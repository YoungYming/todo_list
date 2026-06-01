# Changelog

本文件记录 Todo Server（Focus）的版本迭代。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]

## [0.5.0] - 2026-05-30

### Added
- June.so 风格 UI 重设计：暖色渐变背景、Fraunces + Inter 字体、毛玻璃侧栏
- 今日待办页统计卡片（可用时长 / 任务数 / 预估总计）
- Epic 详情页环形进度指示器
- 历史记录页日历样式与侧栏导航入口
- 品牌更名为 **Focus**

### Changed
- 按钮改为胶囊形渐变样式，卡片圆角与阴影层次优化
- Kanban 列与 Epic 卡片悬停动效

## [0.4.0] - 2026-03-05

### Added
- Epic 看板列内多选批量操作（全选 / 清空 / 删除）
- 父 Epic 卡片拖入今日白板
- 历史任务日历视图（`/app/history`）
- 批量删除 Epic、Enter 确认交互

### Changed
- 主内容区加宽，Epic 看板与白板并排布局
- 列内批量工具悬停显示

### Fixed
- 列内批量工具与拖拽行为冲突
- 同列拖拽侧意图与跨列放置逻辑

## [0.3.0] - 2026-03-04

### Added
- 子 Epic 卡片拖拽，白板按父 Epic 分组
- 今日列表同步白板任务，拆分 Provider 标签展示

### Fixed
- 今日任务与看板状态同步
- 已完成 Epic 可恢复为进行中
- Docker 容器 host 网络模式以访问本地 LLM（OpenClaw / OpenCode）

## [0.2.0] - 2026-03-03

### Added
- LLM 拆分 Provider（OpenClaw / OpenCode Token 回退）
- Epic Kanban 看板：进行中 / 已完成 / 已过期
- 今日需完成白板，拖拽侧意图（左加白板 / 右删除）
- Epic 操作确认弹窗（改期 / 改描述 / 完成说明）

### Fixed
- 模态框 hidden 状态与 bfcache 恢复
- 完成反馈表单 task id 解析与多选任务类型
- 同列右侧拖拽误删逻辑

## [0.1.0] - 2026-02-25

### Added
- 项目初始版本：FastAPI + SQLite + Docker Compose
- Epic / Task / DailyPlan / Completion 数据模型
- 本地规则任务拆分
- 每日 Todo 调度器
- 完成反馈与学习（EMA 估时更新）
- Web UI：今日待办、Epic 列表与详情
- 对外 REST API（Bearer Token）
- OpenClaw / OpenCode 集成文档

[Unreleased]: https://github.com/YoungYming/todo_list/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/YoungYming/todo_list/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/YoungYming/todo_list/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/YoungYming/todo_list/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/YoungYming/todo_list/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/YoungYming/todo_list/releases/tag/v0.1.0
