# Fieldwork

[English](README.md) | 中文

通过原生 DeepSeek Harness 插件构建的农户自主工作空间。从农户当前做法及其理由出发，比较可控的改变，并保留学到的经验。

玉米是首个作物工作流。底层农场背景、证据、计划及试验应支持其他农场类型。长期范围包括在明确职责和权限下向人工助手分配工作；尚未实现助手任务委派。

## 原生插件

应用就是 Harness 本身，使用其聊天、工具卡片、审批、会话和预设设置。[UI 插件](ui/README.zh.md)在现有聊天和导航旁注册原生 My farm、Community、Experiments、Source library、Corn planning、Rotation 和 Field learning 主面板。

- **Farm setup：**选择模型后自动开始的内置入门流程，可暂停、继续及明确结束。参见[入门指南](onboarding/README.zh.md)。
- **My Farm：**读取和更新当前做法及农场背景。
- **Community：**浏览本地演示知识、私下改编方法，并在分享前预览选定摘要。
- **Crop Experiments：**创建小规模试验草稿、调整基线、批准跟踪并记录观察。
- **Field learning：**发现文件化方法，每周检查 Sentinel-2 数据可用性，调查观察并保留已审核的玉米比较。参阅[方法指南](methods/README.zh.md)。
- **Source library：**保留原始表格、PDF、网页、公开 HTTPS 快照和农户笔记，并提供准确引用。
- **Corn planning：**保留原做法，比较部分田块播种试验，审核带版本的预算并记录观察。参阅[方法及证据边界](docs/corn-method.md)。
- **Rotation：**查看每块田已种和计划的作物，用农户自己的数值将现行轮作与带引用的地区轮作比较，并审核带版本的计划。参阅[方法及局限](docs/rotation-method.md)。
- **Seed Costs：**比较采购报价，并可选择保存计算。

每项能力都是 Fieldwork 智能体预设中的独立 Cordis 插件。一个 Host 插件拥有共享的私人记录。模型请求的所有修改均经过原生审批；工具参数不能自行授予批准。页面操作在所有者保存前显示审查对话框。

Field learning 还支持历史产量调查，保留真实未知项、原始文件视图、描述性点检查及本地任务。可尝试经过审核的 [Beltsville 公开数据示例](examples/beltsville/README.zh.md)。

## 从这里开始

- [截图](screenshots/README.zh.md)及[初始品牌](brand/README.zh.md)
- [原生插件运行指南](plugins/README.zh.md)
- [团队设置](SETUP.md)
- [架构](docs/architecture.md)
- [第一个里程碑](docs/first-milestone.md)
- [上游基线](UPSTREAM.md)
- [参与贡献](CONTRIBUTING.md)

## 范围

社区是本地演示动态，不是在线社交服务。明确启用田块后可运行 Sentinel-2 实时检查；尚无实时天气、托管运行或手机配对。浏览器测试覆盖原生页面。真实 Harness 对话也通过本地 [Codex 订阅桥接](codex/README.zh.md)使用 `gpt-6.1-sol` 完成测试。这验证读取比较和带引用的玉米预算场景，并不证明整体农艺质量。云模型会收到发送给它的上下文。

已移除弃用的原型和独立 `/fieldwork` 应用。原始交接文档作为历史背景保留在 Git 中；其界面建议不约束原生插件实现。定制框架时保留上游许可和第三方声明。

## AI 辅助

本目录中的部分代码、测试和文档由 AI 编程助手生成，并由项目团队指导。其中包括轮作库与预算、NASA 检查、农场地图和田块状况表，以及相应的虚构示例记录。添加这些内容的提交带有 `Co-Authored-By` 尾注，其拉取请求也在描述中说明。轮作作物顺序、美国农业部的田块轮廓和作物类型来自所引用的来源，不是 AI 生成的。
