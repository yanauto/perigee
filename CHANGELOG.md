# Changelog

All notable changes to Perigee are documented here.  
产品对外更新记在本文件；UI 工单细账仍见 `perigee-mac/docs/design/CHANGELOG-ui.md`。

## [Unreleased]

English is now the default UI language. First-run is honest when Grok CLI is missing, daily session chrome is a bit clearer, and three registered tech-debt items are closed (tool-row meters, cron routines, one missed-run on startup).

No new installer yet — still [v0.3.0](https://github.com/yanauto/perigee/releases/tag/v0.3.0). Existing Chinese language preference is unchanged.

### Interface language

- New installs default to **English** (`lang.pref`); a saved `zh` preference still wins
- Stub echo, sidebar previews, slash hints, and cross-session errors localize instead of leaking Chinese source strings

### First run / Stub

- Persistent banner when the engine is local echo (Grok CLI not connected)
- Home shows a two-step setup (workspace, then CLI) instead of an empty usage card
- Stub copy states that messages are echoed and will not reach Grok

### Daily use

- Sidebar preview: `Waiting for approval · …` / `You: …`; overflow menu stays visible on busy/needs-input rows
- ⌘N goes home; a session is created only when you type and send
- Live tool tracks expand as they run; tool rows show diff `+/-` or line count, plus duration (derived in the UI, no schema bump)

### Routines

- Cron triggers (5-field, Sunday = 0 or 7) in the editor
- If the app was closed through a due time, startup fires **at most one** catch-up; a routine that has never run does not fire on first enable

### Docs

- `TECH-DEBT.md` open list is empty (T015-meter, T018-cron, T018-missed)
- `docs/API-preload.md` matches cron + catch-up behavior

---

## [0.3.0] — 2026-08-13

Grok 1.0.3 ACP handshake (`initialize` → `authenticate` → `session/new`), live multi-session sidebar (unread, preview, drafts, background stop), and the first public macOS installer.

**正式包（macOS Apple Silicon，未签名）**

- Release：https://github.com/yanauto/perigee/releases/tag/v0.3.0
- 安装盘：`Perigee-0.3.0-arm64.dmg`（拖到 Applications）
- 压缩包：`Perigee-0.3.0-arm64-mac.zip`
- 若 Gatekeeper 拦截：`xattr -cr /Applications/Perigee.app`
- 发消息需要本机已登录的 **Grok CLI 1.0.3+**（`grok --version`）；没有 CLI 仍可用 Stub 看 UI

本次把 Perigee 从「能开窗聊天」推进到「跟官方 grok 1.0 同一套 ACP 握手，并且多会话在侧栏是活的」。下面按主题写清做了什么、为什么做。

### 引擎：对齐 grok 1.0.3 ACP 握手

旧路径只做 `initialize` → `session/new`，客户端身份塞在 `clientInfo` / `GROK_CLIENT_VERSION`。官方 grok 1.0 与 vendor 测试支持的嵌入路径是：

**`initialize` → `authenticate` → `session/new`**

落地（`packages/engine-grok-acp`）：

- 新模块 `handshake.ts`：协议版本 1；fs 读写能力；**不声明 ACP `terminal`**（Perigee 用 node-pty，不走 `terminal/*`）
- `_meta.clientType` / `clientSource` / `clientVersion`（`perigee/0.3.0`），以及 `startupHints.nonInteractive`
- 能力元数据：`x.ai/incrementalBashOutput`、`x.ai/bashOutputNoColor`
- 鉴权挑选顺序：`defaultAuthMethodId` → `cached_token` → 环境里有 key 时的 `xai.api_key` → 列表第一项；`authenticate` 带 `_meta.headless=true`
- `session/new` 始终带 `mcpServers`，可选 `_meta.modelId`
- 权限摘要信任 grok 1.0.1 起上报的工具只读标记（`isReadOnly`）
- `scripts/doctor.sh` 打印本机 `grok --version`

真机探针（本机已登录 CLI）：initialize / authenticate / session/new 成功；prompt「Reply with exactly: pong」回 **pong**。

### 多会话状态同步（这次的主轴）

以前后台会话在跑时，侧栏经常像死的：`lastActivityAt` 改了但不广播、没点进去就没有预览、看着的会话会被标成未读。

| 问题 | 做法 |
|------|------|
| 后台 streaming / 工具 / 回合结束，侧栏 status、未读、排序不更新 | Host `session-list-sync`：脏事件合并 32ms 刷一次 `session:updated`，并持久化 `lastActivityAt` |
| 流式 delta 太密 | **不**为 `assistant.delta` 刷列表（靠 `session.status=streaming` 已经覆盖「在跑」） |
| 冷启动只有当前焦点有 transcript | 按 `lastActivityAt` 降序 seed 最多 12 条，侧栏预览不再空白 |
| 关工作区再开，seed 缓存把预览弄丢 | `closeWorkspace` 清 blocks / seed / 墓碑 |
| 正在看的会话，流式一更新就变未读 | 焦点会话 `lastReadAt` 跟随活动；回首页 `blur` 后，后台跑完才标未读 |
| 点「已读」把旧会话顶到列表头 | `list()` 按 `lastActivityAt` 排，不因 markRead 抢顶 |
| 切会话输入框草稿跟着跑 | 草稿按会话隔离（进程内，不落盘） |
| 想停后台生成必须先点进去 | 行尾 ⋮ 增加「停止生成」（streaming / tool_running） |
| grok 1.0 `_x.ai/sessions/changed`、`queue/changed` 被丢掉 | 映射为 lifecycle，刷新 CLI 名册与侧栏 |
| `_x.ai/models/update`、MCP 就绪 | 刷新模型 chip / 侧栏 MCP 计数 |
| 上述通知刷进聊天「引擎事件：…」 | reducer 静默这些同步事件，失败类 lifecycle 仍进流 |
| 两张审批卡同时 pending | `approval.resolved` 按 `requestId` 撤，不误删另一张 |
| 同 cwd 并行警告还在说「等 worktree 波次 B」 | 已有 worktree 的会话不再误报 |

侧栏预览：最近工具名 / 助手首行 / 「你：…」。当前行 ⋮ 半显、命中区 28px，方便点到菜单。

### 其它产品修补

- **界面语言**：HMR / 重挂时 localStorage 压过陈旧 `uiState`，不会被打回中文
- **Models 图**：7d 锁死 7 根日柱、30d = 30、All = 26 根周柱（纯函数 `modelChartBuckets`，防测量自激环仍在）
- **Routines 双焦点**（此前 CU）：Routines 打开时侧栏会话行不再看起来像「当前选中」
- **搜索占位**：窄栏用短文案「搜索…」，完整能力写在 tip（命令 / 会话 / 文件 · ⌘K）

### 文档与发布

- 根 README（中/英）和 `perigee-mac/README.md`：安装入口改为 Release，不再写「dmg 后续提供」
- `docs/playbooks/install-macos.md`：用户从 Release 装；维护者仍可 `rebuild:native` → `dist` 自己打
- ACP 握手实录：`perigee-mac/docs/fixtures/acp-handshake.md`
- 应用版本 `@perigee/app` **0.3.0**；引擎包 `@perigee/engine-grok-acp` **0.3.0**

`.dmg` / `.zip` **不进 git**（`release/` 已 ignore），只挂在 GitHub Releases。

### 已知限制

- 安装包仅 **arm64**，未签名；Windows 仍无正式包
- 不接 ACP 原生 `terminal/*`（继续 node-pty）
- 草稿按会话隔离只在本进程有效，重启后未发送的字不会从磁盘恢复（有意：草稿可能含未完成指令）

---

## 更早的 UI 波次

2026-08 上旬的前端重构细账（v2.19–v2.24 等）见 [`perigee-mac/docs/design/CHANGELOG-ui.md`](perigee-mac/docs/design/CHANGELOG-ui.md)。
