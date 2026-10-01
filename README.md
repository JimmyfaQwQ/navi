<p align="center">
  <img src="./media/navi.png" alt="Navi" width="96" />
</p>

<h1 align="center">Navi</h1>

<p align="center">
  AI 编程导师 - Tutor, Not an Agent.
</p>

<p align="center">
  <a href="https://github.com/JimmyfaQwQ/navi/actions/workflows/pr-tests.yml">
    <img src="https://github.com/JimmyfaQwQ/navi/actions/workflows/pr-tests.yml/badge.svg" alt="PR Tests" />
  </a>
</p>

Navi 是一个基于 [GitHub Copilot SDK](https://www.npmjs.com/package/@github/copilot-sdk) 的 VS Code 扩展，支持 GitHub Copilot 订阅和任意 OpenAI 兼容 API。

## 功能

- **任务拆解**：把一个改动拆成几个小任务，显示在聊天输入框上方。
- **Focus 区域**：在编辑器里高亮每一步要改的代码行，可以逐个跳转。
- **讲解与检查**：选中区域后点 **Help** 获取讲解，点 **Review** 检查改动，通过后自动勾掉对应任务。
- **多会话、MCP 工具扩展、图形化设置页**。

## 界面

Navi 位于右侧的辅助侧边栏：

- **Navi**：聊天、任务列表、子 Agent 运行记录
- **Focus**：高亮区域列表，支持跳转、勾选、Help / Review

| 命令 | 作用 |
| --- | --- |
| `Navi: New Chat` | 新建会话 |
| `Navi: Open Settings` | 打开设置页 |
| `Navi: Switch Focus Region` | 选择要跳转的区域 |
| `Navi: Focus Previous Region` / `Navi: Focus Next Region` | 跳到上一个 / 下一个区域 |

## 安装与运行

需要 VS Code 1.110+。开发时需要 Node.js 22.12+。

```bash
npm install
npm run compile
```

然后用 VS Code 打开项目，按 <kbd>F5</kbd> 启动扩展开发宿主，在右侧边栏打开 Navi。

Copilot 运行时随 `@github/copilot-sdk` 的平台包一起安装（Windows x64 上是 `@github/copilot-sdk-win32-x64`，约 130 MB）。如果网络慢导致这个可选依赖被跳过，Navi 会提示找不到运行时。这时用更长的超时重新安装即可：

```bash
npm install --fetch-timeout=600000
```

## 认证与模型

### GitHub Copilot（默认）

需要有可用的 Copilot 订阅。Navi 会先尝试使用 VS Code 里已登录的 GitHub 账号，不行再退回 Copilot CLI 的登录状态。

### 自带 API Key

把 `navi.authMode` 设为 `byok`，再填写 `navi.apiKey` 和 `navi.apiBaseUrl`，就能连接任意 OpenAI 兼容的服务。API Key 也可以通过环境变量 `NAVI_API_KEY` 提供。

### 设置项

| 设置 | 说明 | 默认值 |
| --- | --- | --- |
| `navi.authMode` | `copilot` 或 `byok` | `copilot` |
| `navi.apiKey` | BYOK 模式的 API Key | `""` |
| `navi.apiBaseUrl` | BYOK 模式的接口地址 | `https://api.openai.com/v1` |
| `navi.model` | 使用的模型 | `gpt-6-luna` |
| `navi.streaming` | 回复是否流式输出 | `true` |
| `navi.mcpEnabled` | 是否加载 MCP 服务器提供的工具 | `false` |
| `navi.mcpServersJson` | MCP 服务器配置（JSON） | `""` |
| `navi.copilotCliPath` | 指定 Copilot CLI 可执行文件；留空则使用 SDK 自带的运行时 | `""` |
| `navi.debugCopilotCliArgs` | 在 "Navi Copilot CLI" 输出通道记录 CLI 启动参数 | `false` |
| `navi.debugAgentReplyFlow` | 在 "Navi Agent Flow" 输出通道记录完整的回复流程 | `false` |
| `navi.debugAgentReplyFlowReveal` | 有新日志时自动打开 "Navi Agent Flow" 输出通道 | `false` |

## MCP

在设置页的 **MCP servers** 里可以添加、启停和删除服务器，也可以直接编辑 `navi.mcpServersJson`：

```json
{
  "math": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-math"],
    "tools": ["*"]
  },
  "docs": {
    "type": "http",
    "url": "https://example.com/mcp",
    "enabled": false
  }
}
```

- `enabled: false` 的服务器不会加载。
- stdio 服务器可以用 `workingDirectory` 指定工作目录。旧配置里的 `cwd` 字段仍然有效。
- 还需要打开总开关 `navi.mcpEnabled`。

## 开发

| 命令 | 作用 |
| --- | --- |
| `npm run compile` | 用 webpack 构建扩展和三个 webview |
| `npm run watch` | 监听源码并重新构建 |
| `npm run compile-tests` | 把测试编译到 `out/` |
| `npm run lint` | 运行 ESLint |
| `npm test` | 编译、构建、lint，然后在 VS Code 里运行测试 |
| `npm run package` | 生产模式打包 |

`npm test` 默认会下载最新版 VS Code 来运行测试。如果下载失败，可以指定一个已缓存的版本：`npx vscode-test --code-version <版本号>`。

### 代码结构

```text
src/
  extension.ts        激活入口，负责组装各模块
  prompts/            系统 prompt 和 Focus 按钮发出的消息
  agent/              Copilot SDK 客户端、会话、事件映射
    agents/           子 Agent 的委托策略和禁用列表
    tools/            Navi 自己的工具：任务、Focus 区域、诊断、进度
  chat/               聊天视图的宿主侧：会话存储、生成流程、子 Agent 运行记录
  focus/              Focus 区域的状态、编辑器高亮、状态栏、Focus 视图
  settings/           配置读取、模型列表、设置页
  mcp/                MCP 配置的解析与转换
  webview/            三个 webview 的前端代码（chat / focus / settings）
  test/               测试
media/                webview 样式和图标
```

## 许可证

[MIT](./LICENSE)
