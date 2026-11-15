# 原生 Fieldwork 插件

[English](README.md) | 中文

Fieldwork 扩展真正的 DeepSeek Harness 应用，在 Fieldwork 智能体预设中注册独立的 My Farm、Community、Crop Experiments、Seed Costs、Risk Check、Evidence Guard 和 Trust Guide Cordis 插件，并由 Host 服务拥有私人记录和信任记录。[UI 插件](../ui/README.zh.md)添加原生 My farm、Community 和 Experiments 面板。经过认证的 JSON 传输共享同一记录所有者，Harness 保留现有外壳和导航。

## 运行

按照[团队设置](../SETUP.md)操作，然后从仓库根目录运行：

```sh
pnpm run fieldwork:build
pnpm run fieldwork:start --no-open
```

打开服务器打印的认证链接。**Fieldwork** 是新会话的默认预设。首次启动会打开内置[农场设置](../onboarding/README.zh.md)，在选择已连接的模型后开始。如需订阅测试，在本地 Codex CLI 中使用 ChatGPT 登录，然后在原生模型选择器中选择 **GPT-6.1 Sol · Codex subscription**。其他提供商仍可通过 Harness 设置配置。预设挂载独立的 Cordis 组件。本概念验证通过源码组合配置能力的启用和禁用，没有定制开关界面。无密钥测试使用真实 Loader 和原生执行器。可选的真实模型测试也验证 [Codex 订阅桥接](../codex/README.zh.md)。

## 尝试对话

1. “读取我的当前农场背景，帮助我记录为什么这样种植。”在原生审批对话框中审查更新。
2. “比较种子报价：12 公顷，每公顷 1.5 袋，每袋 CAD 120 与 CAD 108。”确定性结果为采购成本减少 CAD 216，不代表产量或利润改善。保存是单独批准的操作。
3. “浏览社区知识，私下改编覆盖作物方法。”审查草稿，编辑基线，再单独批准观察跟踪。
4. “记录较低条带仍然潮湿，保持该观察私密。”观察保存在已跟踪方法下。
5. “预览结果不确定的摘要，不包括原始观察。”发布需要有效预览及显示选定内容的原生审批。移除共享摘要会保留私人记录。

该预设没有 shell 或任意文件系统工具。只读操作不提示。模型请求的所有修改由 Harness 工具流水线审批，而非 `approved` 参数或模型承诺。缺少审批支持时拒绝执行。配置的模型会收到工具返回的上下文。

## 信任准则

Fieldwork 遵循[信任准则](TRUST.md)：先提供价值，再通过在农户能核实的事情上说对来赢得信任。Trust Guide 从不阻止任何工具。它根据农户自己选择查看和提问的内容，决定智能体主动提供多少：从只展示发生过什么，到建议一个小规模试验；农户拒绝建议后会退一步。Risk Check 针对一块田的一项改变，给出正常年份和干旱年份的 USD/acre 变化，并使用田块历史中的干旱年数。其作物表是示例数据，每个数字都会注明。每个结果都保存为估算，之后由 `check_estimate` 与农户的真实季节对比；准确记录会出现在之后的检查和 `agronomist_packet` 审阅文件中。Evidence Guard 标记缺少方法、范围或来源的数字（[格式](EVIDENCE.md)）。信任信号和估算保存在 `$DSH_HOME/fieldwork-native/trust.v2.json`，不会离开运行时。保存估算属于 Fieldwork 自己的记录，不会提示；核对估算、写入审阅文件、恢复自动节奏和删除信任数据都需要原生审批。

## 本地记录及限制

记录保存在 `$DSH_HOME/fieldwork-native/records.v1.json`，独立于已删除的原型数据。每个记录文件只运行一个进程。修改串行执行，通过原子替换提交。缺失文件启动明确虚构的演示农场；无效现存文件报错而非重置。跟踪不批准农艺处理，也不安排实体农场工作。

社区是访问同一所有者运行时的设备之间共享的本地动态。没有在线受众、实时天气、Sentinel-2 执行、托管运行或手机配对。预览文本不会自动匿名化。摘要不附加原始观察或农场记录对象，但包含选定标题、心得、基线、改变、作者和方法来源；复制的方法文本可能含有农场详情，需要审查。已审查预览不可变，在重启或达到内存预览数量上限时过期。

## 检查

```sh
pnpm --filter @fieldwork/plugins typecheck
pnpm --filter @fieldwork/plugins test
node --test fieldwork/plugins/composition.test.mjs fieldwork/plugins/trust.composition.test.mjs
```

组合测试启动真实 Harness 配置，挂载实际 Fieldwork 预设并执行原生工具。测试专用应答器先明确拒绝、再允许审批请求；测试检查拒绝不改变记录、计算确定、私人观察不进入摘要、撤回保留试验，以及作物规划保留农户基线。信任组合测试检查农户请求的试验从不被阻止、阶段随历史查看、提问和风险检查变化，以及已核对的估算进入审阅文件。两者都不模拟真实模型对话。
