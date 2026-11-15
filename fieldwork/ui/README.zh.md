# 原生 Fieldwork 页面

[English](README.md) | 中文

这个私有 Cordis 插件在 Harness 主面板和侧栏插槽中注册 My farm、Community、Experiments、Source library 和 Corn planning，复用原生主题变量、按钮、对话框、本地化服务及现有应用外壳。

## 使用

在仓库根目录运行 `pnpm run fieldwork:build`，然后运行 `pnpm run fieldwork:start`。打开经过认证的服务器链接，在侧栏选择 Fieldwork 页面。页面操作不需要模型。

- My farm 记录当前做法及理由，比较种子报价，并保存已审查的计算。
- Community 展示本地示例知识。改编会创建私人草稿；撤回摘要会保留私人试验。
- 来源库导入原件或采集公开 HTTPS 来源，提供准确的单元格、页码和文本块引用。
- 玉米规划将共享田块与证据连接到经过审核的种子预算版本及带日期的观察。参阅[方法](../docs/corn-method.md)。
- Experiments 保留基线、跟踪小规模改变、记录观察，并在本地分享前预览选定摘要。

每次页面修改都打开明确的审查对话框。模型工具修改仍使用原生 Harness 审批流水线。两条路径共享 Host 拥有的记录；成功提交通过经过认证的 SSE 通知连接的页面。JSON 端点需要所有者会话；写入还需要同源 JSON 请求及明确的确认字段。

## 检查及限制

```sh
pnpm --filter @fieldwork/ui typecheck
node --test fieldwork/ui/browser.test.mjs fieldwork/ui/research.browser.test.mjs
```

设置 `FIELDWORK_BROWSER_CHANNEL=chrome` 可使用已安装的 Chrome，替代 Playwright 浏览器。浏览器测试在分配的回环端口启动隔离的 Harness，检查保存前审查、私人改编、观察、发布预览、撤回、持久化及移动端溢出，并将截图保存到 Git 忽略的 `.artifacts/native-pages`。

社区没有在线受众。尚未实现实时预报、农艺推荐引擎、卫星执行、手机配对或云网关。摘要预览不包含原始观察，但复制的方法文本仍需审查。参见[本地记录限制](../plugins/README.zh.md)。
