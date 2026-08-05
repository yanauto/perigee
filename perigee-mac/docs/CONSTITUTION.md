# Perigee 宪法

> 版本：1.2 · 2026-07-31  
> 变更：1.2 增 C9 全链路对齐北极星（CCD）；C8 补充「产品目标下可动后端」。  
> 1.1 增 C8 前后端分工（UI 可整页重做；Host/preload 默认冻结）。  
> 改产品定位/壳技术/非目标必须改本文件并记 `decisions/`。

## C1 · 定位

- **是**：**Perigee — Grok Build CLI 的原生 macOS 编排台**（Workbench）。  
- **不是**：浏览器应用、终端 TUI 替代品、VS Code/Cursor 全量叉、Flyby 重写。

## C2 · 体验优先级

1. 可读（md/工具/长输出）  
2. 可审（diff/审批）  
3. 可编排（多会话状态）  
4. 可扩展（MCP/引擎适配）  
5. 包体与内存（重要但次于 1–4）

## C3 · 架构铁律

- UI 不直碰密钥与任意 FS；一律经 Host。  
- Engine 可替换；事件 schema 版本化。  
- 危险写与外发默认人审；对外发送人审适用于一切「以维护者名义开口」。  
- 需求满配设计；施工按步骤验收，禁止用「MVP」裁掉 md/diff/多会话等脊梁能力。

## C4 · 平台

- 首发：**macOS Apple Silicon**。  
- 跨平台：架构不挡，但不为 Win/Linux 完美拖死首发。

## C5 · 与兄弟项目

| 项目 | 关系 |
|------|------|
| grok-md-reader | md 能力内化；插件作无 Desktop fallback |
| Flyby（仓 `grok-computer-use`） | 工具/MCP 接入，不吞并 |
| Grok Build TUI | 引擎与无 GUI 环境；体验主路径归 Desktop |
| **perigee 轻根** | `~/projects/perigee/`：跨平台共享区（第一版仅 README/指针，不放源码 monorepo） |
| **perigee-mac** | 本仓路径（原 `grok-desktop` 目录迁入）；vitals id 仍为 `grok-desktop`；独立 git |
| **perigee-win** | Windows 平台工区（`../perigee-win`，vitals id=`perigee-win`，独立 git）；共享能力以本仓为源；**禁止无 ADR 整仓分叉** |

## C6 · 阶段纪律

- 默认 **自用打磨**（第一用户=维护者本人），不以 star 为成功标准。  
- 公开/开源另开决定，不默认。

## C7 · 成功一句话

> 打开 Perigee，像用 Claude Code Desktop 一样编排 Grok——md 好看、diff 敢点、多会话不丢。

## C8 · 前后端分工（2026-07-31 · 1.2 修订）

| 层 | 默认权限 | 路径 |
|----|----------|------|
| **UI** | 可整页推倒重做 | `apps/desktop/src/renderer/**` |
| **Preload** | 冻结；必须 CJS | `apps/desktop/src/preload/**` |
| **Main / packages** | UI-only 工单默认冻结；**产品北极星/全链路目标下可改** | `main/**` · `packages/**` |

前端唯一能力入口：`window.perigee`（契约 `docs/API-preload.md`）。  
交接工单：`docs/HANDOFF-前端.md` · Agent 入口：`AGENTS.md`。

## C9 · Claude Code Desktop 全链路对齐（2026-07-31）

- **标准**：Anthropic Claude Code Desktop（Code 标签），不是「又一个后台管理系统」。  
- **范围**：前端 + 后端 Host/引擎 + 响应速度 + 审批/会话/diff 等体验脊梁，**不只换皮**。  
- **校准源**：持续查阅 Claude Code 官方文档、Grok 官方文档、Grok 代码（含本仓引擎适配与只读 `vendor/grok-build`）。  
- **活文档**：差距表与波次见 `docs/design/CCD-ALIGNMENT.md`。  
- **速度**：ACP 热进程为主路径；仅改权限策略不得无故杀 ACP 子进程。
