# Codex 订阅测试桥接

[English](README.md) | 中文

这个私有 Cordis 提供商通过使用 ChatGPT 登录的官方本地 Codex CLI 暴露准确的 `gpt-6.1-sol` 模型。Fieldwork 源码叠加配置包含此插件，只有在原生模型选择器中选中后才使用。

## 运行

1. 安装官方 Codex CLI，运行 `codex login` 并使用 ChatGPT 登录。
2. 验证 `codex login status` 报告 ChatGPT 认证。
3. 按照[团队设置](../SETUP.md)操作，选择 Fieldwork 预设，再选择 **GPT-6.1 Sol · Codex subscription**。
4. 询问：“读取农场背景。比较 12 公顷、每公顷 1.5 袋、每袋 CAD 120 与 CAD 108。不保存任何内容。”采购成本差额为 CAD 216。

桥接对每次请求检查本地登录，将凭据保留在 Codex 自己的存储中。拒绝 API 密钥认证，并从子进程移除 API 密钥环境变量。不替换模型，也不自动重试提供商请求。订阅用量及账户限制仍然适用。

## 执行边界

每个 Harness 推理步骤都在临时只读工作区调用 `codex exec`，禁用用户配置及 shell、应用、插件、浏览器、代码模式和 MCP 服务器。Codex 仅根据提供的 Fieldwork 工具目录返回结构化决定。桥接先验证所有请求的工具名称，再发出普通 Harness 工具调用块。原生 Harness 工具执行操作，修改仍需要既有审批。

Codex 收到 Harness 系统提示、对话、选定的工具结构及工具结果，包括工具返回的农场背景。它也有自身的 Codex 指令。这是本地测试适配器，并非原始模型 API 适配器：每次响应缓冲后返回，每一步重发对话上下文，仅支持文本，不保留独立 Codex 会话。请求默认限制为 120 秒（`timeoutMs`），取消会终止拥有的 CLI 进程。可通过 `binary` 配置 CLI 可执行文件。

## 证据及检查

真实模型测试在实际 Harness 智能体循环中读取虚构农场并调用确定性的种子计算器，检查准确模型、真实工具调用事件、最终 CAD 216 结果、成功完成及记录未变。这证明该工作流，而非广泛的模型或农艺资格。

```sh
pnpm --filter @fieldwork/codex typecheck
pnpm --filter @fieldwork/codex test
FIELDWORK_SUBSCRIPTION_TEST=1 node --test fieldwork/plugins/model.test.mjs
```

前两项检查无需密钥。可选检查消耗本地登录的订阅，并将转录写入 Git 忽略的 `.artifacts/model-test/result.json`。测试使用隔离的临时 Harness 状态目录，不将凭据复制到 Fieldwork。

官方参考：[Codex 认证](https://learn.chatgpt.com/docs/auth#openai-authentication)及 [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)。
