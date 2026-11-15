# 内置农场设置

[English](README.md) | 中文

农户入门是内置 Cordis 插件。默认 Fieldwork 启动器加载 Jon 的六个田地历史工具、对应技能及独立的进度协调器。原生 Harness 仍拥有对话、模型选择、提问及审批。

## 首次启动

1. 运行 `pnpm run fieldwork:build`，然后运行 `pnpm run fieldwork:start`。
2. Fieldwork 使用 Fieldwork 预设及已注册的农场工作空间，打开一个保存的设置对话。
3. 在原生模型选择器中选择已连接的模型。模型路由可用后，对话自动开始。部署若已提供配置好的模型，可跳过选择步骤。认证或提供商失败通过原生错误及重试控件显示。
4. 智能体加载入门技能，询问是探索虚构玉米演示，还是描述自己的农场。选择之前不会查询田地。
5. 在对话标题栏的 **Setup** 中选择 **Do this later** 或 **Finish setup for now**。侧栏的 **Farm setup** 会重新打开同一对话。结束由农户决定，并不表示记录已经过验证。

即使重新加载或打开多个浏览器标签，协调器也只启动一次问候。暂停会取消等待中的设置回合并保留对话。继续会重新打开历史，不会自动发送第二次问候；农户可在聊天中继续。已暂停或已结束的设置不会在以后启动时强制导航。

## 数据及执行

内置历史插件明确使用虚构演示值，不会将虚构堪萨斯州田地代替农户的真实农场。智能体可通过经过审批的 My farm 工具单独记录真实背景。更正及笔记现已经过原生审批。

设置状态保存在 `$DSH_HOME/fieldwork-native/onboarding.v1.json`。对话使用原生 Session 存储。田地历史更正仍使用插件独立的 `fieldwork/onboarding.json` 存储；与 My farm 关联是后续工作。无效进度文件会显示失败，不会重置。每个进度文件由一个 Host 进程拥有。

协调器使用原生选择器选中的模型。Codex 订阅访问仍是独立提供商插件。云部署可提供原生模型配置，但此处尚未实现云托管、农户账户及凭据配置。

## 开发

默认源码组合分别加载 `fieldwork-onboarding` 和 `fieldwork-onboarding-progress`，保留工具插件的独立实现。不要向 `fieldwork:start` 额外传入 `fieldwork/onboarding/dev.patch.yml`：该叠加配置用于独立启动上游 Harness。内置组合强制使用演示模式；真实数据开发运行保持独立，并保留[交接文档的限制](HANDOFF.md)。

```sh
pnpm --filter fieldwork-onboarding test
pnpm --filter @fieldwork/plugins test
node --test fieldwork/plugins/composition.test.mjs
FIELDWORK_BROWSER_CHANNEL=chrome node --test fieldwork/ui/onboarding.browser.test.mjs
```

无密钥检查覆盖持久化状态转换、防止重复启动、原生更正审批、模型设置、预配置模型、暂停及继续、结束和多标签。真实 `gpt-6.1-sol` 对话还验证了自动加载技能及首个原生问题；完整入门对话及农艺规则尚未完成资格验证。
