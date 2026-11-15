---
kind: upgrade-guide
description: Fieldwork 学习索引使用第 2 版，旧 Fieldwork 运行环境无法读取。
---

# Fieldwork 学习索引

[English](guide.md) | 中文

## 变更

Fieldwork 私有学习索引由第 1 版变为第 2 版，以保留调查、本地任务和历史产量分析。旧 Fieldwork 运行环境拒绝第 2 版。原有监测、巡田、试验及文件路径继续可用。[方法指南](../../../../fieldwork/methods/README.zh.md)定义当前存储契约。

## 迁移

1. 停止使用同一 Fieldwork 工作空间的其他 Host，并保留整个目录的副本。源码配置将其放在 `$DSH_HOME/fieldwork-workspace/learning`。
2. 启动当前 Fieldwork 运行环境。打开第 1 版 `index.json` 时，创建逐字节一致的 `index.json.v1.backup`，读取原记录。若已有不同备份则阻止打开；保留两个文件并确认其身份后重试。
3. 打开 **Field learning** 并验证原记录。下次成功的学习写入保存第 2 版；恢复中断检查可在启动时执行该写入。确认 `index.json` 含有 `"version": 2`，且 `index.json.v1.backup` 仍包含原始字节。此工作空间使用当前运行环境；如需用旧环境检查，应恢复独立的完整目录副本。
