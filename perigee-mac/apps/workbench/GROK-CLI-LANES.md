# 完全嵌合 Grok CLI · 多 agent 分工

产品名仍是 Perigee。引擎继续走 ACP（`grok agent stdio`），不要嵌终端 TUI，不要走 `grok -p`。
官方表面 = 本地 `warehouse/04-research/2026-09-08-grok-build-cli-docs/_index.md`（24 页）。
旧 `apps/desktop` 不改。

## 铁律（违了就会互踩）

1. **同一时刻只有一路改热文件**：`src/main/store.ts`、`src/main/grok-engine.ts`、`src/preload/index.ts`、`src/shared/types.ts`。
2. 别人只许 **新建文件**，或只改自己领走的页面。要动热文件，先在回复里写「我要改哪几行、为什么」，等调度点头。
3. 管理类能力用 `grok <子命令>` 包一层，不要重写 CLI。
4. 不重做：主题、vim、状态栏、全屏 Dashboard、`grok wrap`、企业托管配置、Grok Bot。
5. 窗口默认隐藏。测用 `workbench` CLI；不 commit。

## 第 0 刀 · 必须先做（只派 1 人）

**打开文件夹。** 不选仓库，会话/技能/worktree 全对不上。

- 领：`store.ts`、`grok-engine.ts`（`workspacePath`）、首页选目录、preload 若需 `openWorkspace`
- 验收：`workbench workspace <路径>` 之后新会话绑这个目录；自拍首页能看见当前文件夹名
- 做完交还热文件，再开第 1 波
- 状态：已完成（2026-09-08）

## 第 1 波 · 三路并行（热文件已还）

| 路 | 用户能感到 | 只许动 | 不许动 |
|---|---|---|---|
| **A 发现面** | 钥匙页是 `grok inspect` 的真相：模型、技能、插件、Hooks、MCP、规则。已完成（2026-09-08） | 新建 `src/main/grok-inspect.ts`；`Settings.tsx`；`cli/doctor.ts` 可扩 | store / grok-engine / Chat |
| **B 会话账本** | 侧栏能续 CLI 存过的聊（`grok sessions list` / resume）。列表+resume 已完成 2026-09-08 | 新建 `src/main/grok-sessions.ts`；`Sidebar.tsx`；engine/store 接 `session/load` | 不要自己 `new GrokAcpEngine` |
| **C 命令包** | 能列出模型、MCP、插件（包官方命令）。已完成 2026-09-08 | 新建 `src/main/grok-cmd.ts`；CLI：`workbench grok models\|mcp\|plugin\|login` | 任何 renderer；store |

A 和 C 不抢。B 列表+resume 已完成 2026-09-08：engine 接 `loadSession`，store 不塞 CLI 正文。

## 第 2 波 · 三路并行（第 1 波齐）

| 路 | 用户能感到 | 只许动 | 对照官方 |
|---|---|---|---|
| **D 模式** | 问 / 自动 / 全放行、Plan 开和关。已完成（2026-09-08） | Composer 权限切换；engine 的 permissionPolicy | permissions.md、plan-mode.md |
| **E 上下文** | 导出 md、磁盘用量。CLI：`workbench grok export` / `du`。官方没有 compact/context CLI（人话回执）。不做页 | 扩 `grok-cmd` + 新建 `grok-extra`；CLI 只扩 `workbench grok` | sessions.md、cli/reference.md |
| **F 并行干活** | 隔离目录页：列表、新开（ACP `create_from_worktree_sync` = `grok -w`）、fork（`x.ai/session/fork`）。`workbench worktree` / `fork`。已完成（2026-09-08） | 新建 grok-worktree；store/engine 只加 cwd 与 fork | worktrees.md、subagents.md |

D 需要热文件时单独排，不要和 E/F 同时改 `grok-engine.ts`。

## 第 3 波 · 收口（可 2 人）

| 路 | 用户能感到 |
|---|---|
| **G 登录** | 没登录时钥匙页能 `grok login` / 退出；不造邮箱验证码 |
| **H 对齐定时** | 自动化页两组：Perigee 定时（routines.json / `workbench routine`）vs CLI `/loop`·workflow。官方没有 `grok loop`/`grok workflow` 子命令；`/loop` 这里看不到；`workbench grok workflow` 只列磁盘 `.rhai`。不合并两套存储。已完成（2026-09-08） |

## 每路回执必须带

- 动过哪些路径
- 复制即跑的测法
- 亲手 CLI 原样
- 有没有碰热文件（碰了写行号级说明）

## 调度怎么派

一次最多 **3 个** 后台 agent。先 0，再 A+C（B 若只做列表也可一起）。不要 6 路同时开工。
每路 prompt 开头贴：本文件路径 + 「你是哪一路」+ 铁律 1–5。
