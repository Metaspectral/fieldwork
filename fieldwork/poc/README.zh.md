# Fieldwork 插件概念验证

[English](README.md) | 中文

此可选源码插件在 DeepSeek Harness 网页配置中增加 `/fieldwork` 农户自主工作空间，包括农场信息、本地社区动态、作物面积规划、种子成本比较、示例天气和私人试验。这些工作流无需模型密钥。

## 运行

按照[团队设置](../SETUP.md)安装并构建仓库，然后从仓库根目录运行：

```sh
DSH_HOME="$PWD/.fieldwork/poc" DSH_TELEMETRY_DISABLED=1 pnpm dsh --profile web --patch fieldwork/poc/cordis.source.patch.yml --no-open
```

先打开服务器打印的认证启动链接，再访问同一来源的 `/fieldwork`。请保密启动凭证。智能体工作空间中可选择新的 Fieldwork 预设，使用已配置的模型启用只读 `read_farm_context` 工具。本概念验证尚未验证真实模型调用。

## 演示

1. 打开 My farm，编辑当前做法和农户的理由并保存。
2. 在 Plug-ins 中先试用示例，不激活插件。审查并激活 Seed cost check，比较两份报价。
3. 激活 Crop planner，分配一小块试验面积并保存私人草稿。农场当前做法保持不变。
4. 在 Community 中改编示例方法，编辑私人草稿，再单独批准观察跟踪。
5. 记录观察，预览摘要，确认分享到本地演示动态，然后删除摘要。私人试验保留。

最近的计算保留插件版本、输入和结果；工作空间保留最近二十条。方法草稿可在跟踪前编辑；已跟踪方法保持固定。背景、试验、观察和摘要保存在 `$DSH_HOME/fieldwork/workspace.json`。文件缺失时创建虚构示例农场；记录损坏时启动失败，而非静默重置。

## 范围

五种概念验证能力是一个源码 Host 插件内的固定目录，不是独立安装的软件包。操作会检查激活状态。天气和虚构农户均标记为示例。社区仅在访问同一认证所有者工作空间的设备之间共享；没有在线动态、身份服务、受众控制、卫星流水线或实体手机配对。自由文本不会自动匿名化。摘要排除原始观察和农场背景；用户输入的方法及摘要文本仍需审查。

概念验证使用框架所有者认证、有界 JSON 请求、同源修改检查、串行保存和原子文件替换。这是单所有者原型，不是多用户生产服务。每个工作空间文件只能由一个服务器进程使用。社区任意代码不会执行。

## 检查

```sh
pnpm --filter @fieldwork/poc test
pnpm --filter @fieldwork/poc typecheck
FIELDWORK_BROWSER_CHANNEL=chrome node --test fieldwork/poc/browser.test.mjs
```

指定该通道时，浏览器测试使用已安装的 Google Chrome。否则请安装仓库 Playwright 的 Chromium 无头浏览器并省略通道变量。测试以临时状态启动真实 Harness 进程，验证未认证访问，执行工作流，检查移动布局并停止进程。截图写入被忽略的 `.artifacts/fieldwork-poc/` 目录。
