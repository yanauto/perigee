<div align="center">

# Perigee 🛰️

**你的 Grok agent 任务控制台。**

面向 Grok Build CLI 的 macOS 原生编排器 —— 多会话编排 · 内置 Chrome 浏览器控制(MCP) · 实时 Markdown 渲染。

[English](README.md) · [简体中文](#) · [官网](https://perigee.yan-auto.me) · [X @yanautome](https://x.com/yanautome)

</div>

---

### 状态

| 平台 | 进度 |
|---|---|
| **macOS** | ✅ **已就绪** —— 团队日常自用中 |
| **Windows** | 🚧 移植测试中,再等等 |

### 能做什么

- **多会话编排** —— 一个驾驶舱同时运行、调度多个 agent 会话,不用再开一堆窗口
- **内置 Chrome 控制** —— agent 通过 GCC(Grok Chrome Control,MCP 工具)驱动浏览器:打开页面、读取内容、操作网页,全程可监督、有权限确认
- **实时 Markdown** —— agent 写的报告/方案/笔记,落笔即渲染,随写随看

### 快速开始(macOS)

```bash
git clone https://github.com/yanauto/perigee.git
cd perigee/perigee-mac
pnpm install
pnpm dev
```

**环境要求**:Node ≥ 20 · pnpm · 本机已安装官方 Grok Build CLI(没有也可用 Stub 模式先看 UI)。

打包好的 .dmg 安装包将随正式发布提供,关注 [Releases](https://github.com/yanauto/perigee/releases) 页面。

### 目录结构

| 目录 | 内容 |
|---|---|
| `perigee-mac/` | macOS 应用(Electron + pnpm workspace) |
| `perigee-win/` | Windows 移植(进行中) |

### 参与贡献

欢迎 Issue 和 PR。提交前请跑 `pnpm typecheck && pnpm test`。代码地图与 API 契约见 `perigee-mac/docs/`。

### 许可证

[Apache-2.0](LICENSE)

---

Perigee 为独立项目,与 xAI 无隶属或背书关系;提及 "Grok" 仅为说明与 xAI Grok Build CLI 的兼容性。
