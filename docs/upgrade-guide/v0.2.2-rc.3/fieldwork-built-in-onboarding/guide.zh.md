---
kind: upgrade-guide
description: Fieldwork 源码启动现已包含入门插件，因此必须移除额外的入门开发叠加配置。
---

# Fieldwork 内置入门

[English](guide.md) | 中文

## 变更

仓库的 Fieldwork 源码组合现已包含农户入门及持久化首次启动进度。向 `fieldwork:start` 传入独立的 `fieldwork/onboarding/dev.patch.yml` 叠加配置会重复加载插件。内置组合明确使用演示数据；独立开发叠加配置保留自己的设置。上游 `dsh web` 不变。

## 迁移

1. 使用 `pnpm run fieldwork:build` 构建。
2. 将 `pnpm run fieldwork:start --patch fieldwork/onboarding/dev.patch.yml --no-open` 替换为 `pnpm run fieldwork:start --no-open`。保持同一 `DSH_HOME`，以保留原生 Session 及农场记录。
3. 首次启动时，按需选择已连接的模型。确认 **Farm setup** 打开，且智能体询问如何开始。使用 **Setup** 暂停或结束，使用侧栏继续。
4. 阅读[入门指南](../../../../fieldwork/onboarding/README.zh.md)，了解进度存储及独立开发用法。不要将演示田地历史作为真实农场证据。
