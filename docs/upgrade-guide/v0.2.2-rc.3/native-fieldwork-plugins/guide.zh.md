---
kind: upgrade-guide
description: Fieldwork 的独立 HTML 概念验证改为原生 Harness 插件，使用新的源码覆盖配置和私人记录位置。
---

# 原生 Fieldwork 插件

[English](guide.md) | 中文

## 变更

Fieldwork 移除独立 `/fieldwork` 应用、`fieldwork/poc` 源码覆盖配置和 HTML 原型。现在使用原生 Harness 聊天、工具结果、审批和 Fieldwork 智能体预设。此变更影响早期 Fieldwork 概念验证用户，不影响标准 Harness 配置。

私人记录使用 `DSH_HOME` 下的新文件 `fieldwork-native/records.v1.json`。旧概念验证文件保持不变，不自动导入。社区仍为本地演示动态。

## 迁移

1. 停止使用旧 `fieldwork/poc/cordis.source.patch.yml` 覆盖配置的进程。如有需要，保留旧本地数据。
2. 从仓库根目录运行 `pnpm install --frozen-lockfile` 和 `pnpm run build`。
3. 使用 `--patch fieldwork/plugins/cordis.source.patch.yml` 启动网页配置，替换已删除的覆盖配置，命令见[原生插件指南](../../../../fieldwork/plugins/README.zh.md)。
4. 打开正常的认证 Harness 链接，选择 Fieldwork 预设。不要使用已移除的独立页面。
5. 确认提供 `read_my_farm`、`browse_farm_knowledge`、`plan_crop_trial` 和 `compare_seed_quotes` 工具。保存修改前审查原生审批提示。不要把初始虚构农场当作真实记录。
