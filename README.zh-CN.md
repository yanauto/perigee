<div align="center">

<img src="perigee-mac/design/brand/favicon.svg" width="120" alt="Perigee 图标">

# Perigee

跑 Grok agents 的 macOS 桌面端 —— 多会话一个窗口 · 内置浏览器控制 · 实时 Markdown 渲染。

[English](README.md) · [简体中文](#) · [官网](https://perigee.yan-auto.me) · [X @yanautome](https://x.com/yanautome)

<img src="assets/screenshots/overview.png" alt="Perigee 同时运行五个 agent 会话,主面板展开一份架构评审报告" width="920">

<a href="https://youtu.be/Y_iETgHcjTA"><img src="https://img.youtube.com/vi/Y_iETgHcjTA/maxresdefault.jpg" width="920" alt="Perigee 演示视频——点击到 YouTube 观看"></a>

🎬 **[2 分钟演示视频（YouTube）](https://youtu.be/Y_iETgHcjTA)**

</div>

---

### 状态

| 平台 | 进度 |
|---|---|
| **macOS** | ✅ **已就绪** —— 团队日常自用中 |
| **Windows** | 🚧 移植测试中 |

### 能做什么

- **多会话** —— 几个 agent 会话并排跑,侧栏能看到每个在干什么,随时切过去。
- **内置浏览器控制** —— agent 通过 Flyby(MCP 工具)驱动 Chrome:打开页面、读取内容、操作网页,每一步都看得到,且有权限确认。
- **实时 Markdown** —— agent 写的文档一边生成一边渲染;写完的文档在内置阅读面板里直接看。

<div align="center">

<img src="assets/screenshots/flyby-browser.png" alt="agent 通过 Flyby 读取 Product Hunt 首页实况并写出排名摘要表" width="860">

*agent 用 Flyby 读了 Product Hunt 首页实况,然后写出这份摘要。*

<img src="assets/screenshots/live-markdown.png" alt="移植状态报告在 agent 书写过程中实时渲染" width="860">

*一份状态报告,agent 边写边渲染。*

<img src="assets/screenshots/reader-panel.png" alt="写完的报告在内置阅读面板中打开,与对话并排显示" width="860">

*写完的文档在内置阅读面板里打开,和对话并排看。*

</div>

### 快速开始(macOS)

```bash
git clone https://github.com/yanauto/perigee.git
cd perigee/perigee-mac
pnpm install
pnpm dev
```

**环境要求**:Node ≥ 20 · pnpm · 本机已安装官方 Grok Build CLI(没有也可用 Stub 模式先看 UI)。

打包好的 .dmg 安装包后续提供,关注 [Releases](https://github.com/yanauto/perigee/releases) 页面。

### 目录结构

| 目录 | 内容 |
|---|---|
| `perigee-mac/` | macOS 应用(Electron + pnpm workspace) |
| `perigee-win/` | Windows 移植(进行中) |

### 参与贡献

欢迎 Issue 和 PR。提交前请跑 `pnpm typecheck && pnpm test`。

### 许可证

[Apache-2.0](LICENSE)

---

Perigee 为独立项目,与 xAI 无隶属或背书关系;提及 "Grok" 仅为说明与 xAI Grok Build CLI 的兼容性。
