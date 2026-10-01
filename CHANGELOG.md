# 更新日志

## [0.1.2] - 2026-10-02

- 上架 VS Code 插件市场，名称为 Navi Mentor，扩展 ID 为 `Jimmyfa.navi-mentor`。

## [0.1.1] - 2026-10-02

- publisher 改为 `Jimmyfa`。这个版本没有上架插件市场。

## [0.1.0] - 2026-10-01

第一个公开版本。

- 聊天：Navi 读取项目代码，把改动拆成小任务，逐步引导你完成，你改完后再帮你检查。
- Focus 区域：在编辑器里高亮每一步要改的代码行，可以逐个跳转，或勾选区域后点 Help / Review。
- 主 Agent 没有写文件的工具，代码始终由你自己写。必要时会委托内置的 `explore`、`code-review`、`security-review` 子 Agent。
- 多会话，每个会话有独立的任务列表和 Focus 区域。
- 设置页：认证方式（GitHub Copilot 或 OpenAI 兼容 API）、模型选择、MCP 服务器管理。
- 默认模型为 `gpt-6-luna`，基于 Copilot SDK 1.0.16（运行时 1.0.90）。
- 提供 8 个平台的安装包：Windows、macOS、Linux、Alpine，各有 x64 和 arm64。
