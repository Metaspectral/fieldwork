---
kind: upgrade-guide
description: Fieldwork 记录迁移到 v3 架构，新增轮作计划和 Rotation 面板。
---

# Fieldwork 轮作计划

[English](guide.md) | 中文

## 变更

Fieldwork 私有记录现使用架构版本 3，新增轮作计划。存储路径仍为 `$DSH_HOME/fieldwork-native/records.v1.json`。Rotation 是新的原生面板，Fieldwork 预设新增工具 `list_regional_rotations`、`read_rotation_plans`、`propose_rotation_plan` 和 `accept_rotation_plan`。参阅[轮作预算方法](../../../../fieldwork/docs/rotation-method.md)。

## 迁移

1. 停止使用同一数据目录的其他 Fieldwork 进程。每个记录文件只运行一个 Host。
2. 正常启动 Fieldwork。有效的 v2 记录文件在迁移前保存为 `records.v1.json.v2.backup`，v1 文件保存为 `records.v1.json.v1.backup`。v3 状态在下一次成功写入时提交。现有田块、来源、玉米计划、试验和摘要均保留，轮作计划列表初始为空。
3. 如果迁移报告数据损坏或备份冲突，请保留两个文件并在重启前解决冲突。应用会报错而不是重置记录。

旧版 Fieldwork 代码无法读取 v3 架构。回滚时停止 Host，保留 v3 文件，然后恢复 v2 备份。旧代码中没有轮作计划；请保留 v3 副本以便返回新版本。
