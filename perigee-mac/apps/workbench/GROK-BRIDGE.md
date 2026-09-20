# 第 2 批接法：新壳怎么接到旧 Grok 引擎

只接「真开口」。不要改旧桌面，不要抄它整份 IPC。本文件给第 2 批用。

## 调哪个包

| 用这个 | 干什么 |
|---|---|
| `@perigee/engine-grok-acp` 的 `GrokAcpEngine` | 本机 Grok 的 ACP（`grok --no-auto-update agent stdio`） |
| `@perigee/engine-protocol` 的 `resolveGrokBinary`、`AgentEngine` | 找二进制；`send` / `startSession` / `onEvent` 契约 |
| `@perigee/event-schema` 的 `SessionEvent` | 事件类型 |
| `@perigee/host-core` 的 `loadGrokConfigSnapshot`、`cliPermissionToDesktop` | 钥匙页读 `~/.grok`；权限跟 CLI，不跟桌面 settings.json |

不要用 `@perigee/engine-grok-build`（无头那条）。不要用 `StubEngine` 冒充会回。

旧桌面工厂在 `apps/desktop/src/main/create-engine.ts`：只对照「怎么 new」，不要搬审批队列、定时任务 yolo、无头回退、用量账本。

## 会话怎么建

用户点发送时，main 里做这四步（preload 继续只暴露现在的 `submit` + 整页 state）：

1. `const bin = resolveGrokBinary()`。`GrokAcpEngine.isAvailable(bin)` 为假 → 走下面「没有 grok」，不要 `new`。
2. `new GrokAcpEngine({ binary: bin, clientVersion: PERIGEE_ACP_CLIENT_ID, permissionPolicy, mcpServers })`。`permissionPolicy` 从 `loadGrokConfigSnapshot` → `cliPermissionToDesktop` 来。MCP：第 2 批曾传空数组；第 4 批对照旧桌面 `create-engine.ts` 的 `agent.mcpServers` / `toAcpMcpServers`，把 snapshot 里启用的项传进去（至少 Flyby `grok-computer-use`）。不要抄审批队列。
3. `engine.onEvent(把事件写进现有会话气泡)`，然后 `await engine.startSession({ sessionId, workspacePath })`。`sessionId` 用壳里已经有的那条会话 id（没有就先建一条，和现在假引擎一样）。`workspacePath` 用已打开的文件夹（没选过不要默默用家目录）。
4. 先把用户那句写进气泡，再 `await engine.send(sessionId, { text })`。不要等引擎回 `user.message`（ACP 正常发送不会再推一条，再听会双气泡）。

`startSession` 里会握手：`initialize` → 必要时 `authenticate` → `session/new`。这才算「能开口」。探测命令只做到 `initialize`，不建会话、不发句子。

工作区、多会话、取消、后台跑：第 3 批。文档排版：第 4 批另一半。

定时任务（第 5 批）：`RoutineStore` + `RoutineScheduler`（`@perigee/host-core`），落盘 `DATA_DIR/routines.json`。到点 / `runNow` 用现有 `talk` 新开一轮，不要抄 `window.perigee`。补跑只认 scheduler：有 lastFire 且错过才补一次；从未跑过不补。CLI：`workbench routine add|list|run`。

Flyby 没在跑（先探 `127.0.0.1:19527`：bridge 不通或扩展没连）时，读页请求诚实失败，不要假成功。只读工具可自动放行，点按仍走批准。

## `send` 事件怎么映到现有气泡

现在气泡只有 `user` / `assistant` 两行字（`ChatMessage.text`）。第 2 批不要先搬旧桌面的块模型。

| 引擎事件 | 落到现有气泡 |
|---|---|
| （本地先写的用户句） | `role: user` |
| `assistant.delta` | 追加到**本轮**那条 `assistant`；没有就新建 |
| `assistant.message` | **整段替换**本轮 `assistant`，不要再叠一条 |
| `tool.call` | 再加一条 `assistant`，正文写成 `工具 · ${name}`（验收要工具行上屏；先用现有散文，不改气泡组件也行） |
| `tool.result` | 改那条工具行：完成 / 失败 + 短结果 |
| `error` | 一条 `assistant`，诚实写失败原因 |
| `session.status` = `streaming` / `idle` / `error` | 状态行从「假引擎」改成「正在回 / 已回复 / 失败」 |
| `thought.*`、`usage`、`turn.end`、`lifecycle` | 第 2 批丢掉 |
| `approval.requested` | 气泡写「要你批准才能继续」；不要默默放行，也不要抄旧桌面审批窗 |

`send()` 会等到这一轮结束才 resolve。流式靠 `onEvent` 往 state 里推，现有 `wb:state` 广播就够。

## 没有 grok 怎么失败

判定：`isAvailable(bin)` 为假，或 `startSession` / `send` 抛错 / 收到 `error`。

- **不要**学旧桌面「缺二进制就 StubEngine 回声」——那是假成功。
- 对话：用户句照常上屏，助手句写清「本机没有 Grok CLI」或引擎短错。`send "你好"` 不得再出现假引擎那句。
- 钥匙页：分清「没有 CLI」还是「有 CLI 但 ACP 握手失败」。不打印密钥、不打印 `~/.grok` 正文。
- 进门（计划已写）：没有 CLI / 没有用户目录里的 Grok 配置 → 只留钥匙页。探测可以做，不要为探测发真句子。

本机已有 `workbench doctor`（或直接跑 `out/cli/doctor.js`）：只报有没有 `grok`、能不能 ACP `initialize`。第 2 批钥匙页可以复用同一套判定，不要再抄一份找二进制的逻辑——产品路径必须 `import { resolveGrokBinary } from '@perigee/engine-protocol'`。

## 不要抄旧桌面整份 IPC

壳已经有 `wb:submit` → store → `wb:state`。继续这条。

不要加：`session:event`、`session:updated`、`approval:updated`、transcript 回放、用量账本、delta 批合广播、worktree、无头回退。

vite：main 要把 workspace 包 alias 进源码（对照旧桌面 `electron.vite.config.ts` 的 `workspaceSrc` + `externalizeDepsPlugin({ exclude })`），否则打包找不到 `.ts` 入口。preload 保持现在这几个方法，不要铺 `window.perigee`。

## 第 2 批最小改这些文件

- `apps/workbench/package.json`：加上面四个 workspace 依赖
- `apps/workbench/electron.vite.config.ts`：workspace alias
- `apps/workbench/src/main/` **新建**一个引擎文件（装 `GrokAcpEngine`、映事件）
- `apps/workbench/src/main/store.ts`：`submit` 的对话路径去掉 `fakeReply`；缺 grok 走失败句
- `apps/workbench/src/main/index.ts`：启动时探测一次，结果放进 state 给钥匙页（仍走现有 IPC）
- `apps/workbench/src/shared/types.ts`：state 加「有没有 CLI / ACP 行不行」；气泡类型先不动也够
- `apps/workbench/src/main/fake-engine.ts`：只留 `titleFrom`，假回复退场
- 钥匙页要说清缺什么时，才动 `Settings.tsx`（只换文案数据，不重做界面）

本轮已落：本备忘 + `src/cli/doctor.ts`（不改 renderer，不接真对话）。
