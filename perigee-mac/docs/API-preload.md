# `window.perigee` API 契约

> 渲染进程唯一能力入口。实现：`apps/desktop/src/preload/index.ts` → 打包为 `index.cjs`。  
> 前端类型镜像：`apps/desktop/src/renderer/src/lib/perigee-api.ts`  
> **事件 schema 版本：3**（`packages/event-schema`）· 错误码：`docs/errors.md` · 后端路线图：`docs/BACKEND-ROADMAP.md`

## 总览

```ts
window.perigee.getAppInfo()
window.perigee.settings.*
window.perigee.workspace.*
window.perigee.fs.*
window.perigee.system.*   // T027
window.perigee.md.*
window.perigee.session.*
window.perigee.stats.*
window.perigee.uiState.*
window.perigee.diff.*
window.perigee.approval.*
window.perigee.terminal.*
window.perigee.integrations.*
window.perigee.routines.*   // T018
window.perigee.clipboard.*
window.perigee.menu.on(name, cb)
window.perigee.securityProbe
```

所有 `on*` 返回 **取消订阅函数** `() => void`。

---

## getAppInfo()

```ts
Promise<{
  name: string
  version: string
  phase: string
  engineId: string
  engineName: string
  grokAvailable: boolean
  platform: string
  security: { contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean }
}>
```

## settings

| 方法 | 说明 |
|------|------|
| `get()` | `AppSettings` |
| `update(partial)` | 合并保存并返回完整 settings；可能热切换引擎 |
| `onChanged(cb)` | 设置变更推送 |

`AppSettings` 字段见 `packages/host-core/src/settings-store.ts`。

| 字段 | 默认 | 说明 |
|------|------|------|
| `engineMode` | `acp` | 主路径 ACP；`headless` 降级；`stub` 调试 |
| `permissionPolicy` | `ask` | Desktop 四态：`ask` · `accept_edits` · `plan` · `yolo`（见 MEGA §12.2） |
| `alwaysApproveTools` | `false` | 兼容字段；仅与 `yolo` 同步为 true |
| `terminalShellEnabled` | `false` | 终端 `write` 真执行 shell -c（非完整交互 PTY） |
| `terminalMode` | `echo` | `echo` · `shell-c` · `pty`（pty 需 node-pty；不可用降级） |
| `crossSessionSendEnabled` | `false` | 跨会话 `session.sendCross` 闸 |
| `layout.mainPane` | `chat` | `chat` · `split` · `diff` · `file`（主区布局） |
| `layout.filePaneWidth` | `420` | 独立文件列宽 |
| `layout.terminalHeight` | `220` | 底栏终端高 |
| `layout.panes` | `{file,terminal,inspector}` | 分区显隐（默认 file/terminal 关） |
| `mcp.servers` | … | 启用项注入 ACP `session/new.mcpServers` |

权限仅变更时 Host **热更新** ACP 策略 + best-effort `session/set_mode`、不重建子进程。详见 `docs/design/CCD-ALIGNMENT.md`、`docs/playbooks/permission-ask.md`。

## workspace

| 方法 | 说明 |
|------|------|
| `getState()` | `{ recentWorkspaces, lastWorkspacePath, currentWorkspace }` |
| `openDialog()` | 系统选目录 → `{ ok, path?, reason? }` |
| `openPath(path)` | 打开已知路径 |
| `close()` | 关闭当前工作区 |
| `reveal(path)` | Finder 中显示 |
| `onChanged(cb)` | `{ currentWorkspace, state }` |

## fs

路径可以是 **工作区相对路径**，也可以是 **任意绝对路径**（**T027 行为变更**，见下）。

| 方法 | 说明 |
|------|------|
| `list(rel, depth?)` | `DirEntry[]`：`name/path/relativePath/isDirectory/size?`。**仍限工作区内**（导航语义不变） |
| `read(rel\|abs)` | `{ path, content, truncated }`。**T027：不再限制工作区**，任意绝对路径可读 |
| `write(rel\|abs, content)` | `{ path }`。**T027：不再限制工作区**，父目录自动创建 |
| **`pathForFile(file: File): string`** | **T006**：同步。preload 内 `webUtils.getPathForFile`（Electron ≥32 无 `File.path`）。失败返回 `''`。**不走 IPC** |

### T027 · 解除工作区越界限制（行为变更）

**变更前**：`fs:read` / `fs:write` 经 `resolveInWorkspace` 校验，越界抛「路径越界工作区」——真机上
读 `~/Desktop/Text.md` 直接失败。**变更后**（维护者拍板：本机桌面应用，用户即机主，引擎本就在任意
路径干活，查看器不该只认工作区）：

- `read` / `write` 走 `resolveAnyPath`：绝对路径原样解析，**相对路径仍以工作区根为基准**（既有调用不受影响）；
- **无工作区时**也能按绝对路径读写（主进程回退到以用户主目录为基准的 FsService 实例）；
- `list` **保持** `resolveInWorkspace`：右栏文件树仍以工作区为根，越界仍拒；
- `session.send(..., { mediaPaths })` 的媒体装载同步放开（附件本就可能在 `userData/attachments` 等工作区外路径）。

**错误语义**（放开后不再有「越界」，各错各报，`Error.code` 稳定可分支）：

| 场景 | `code` | 文案示例 |
|---|---|---|
| 文件不存在 | `fs.not_found` | `文件不存在: /Users/…/nope.md` |
| 无读/写权限 | `fs.permission_denied` | `没有读取权限: /Users/…/secret.txt` |
| 目录当文件读/写 | `fs.is_directory` | `不能把目录当文件读: /Users/…/adir` |
| 非普通文件 | `fs.not_file` | `不是普通文件: …` |
| 符号链接成环 | `fs.symlink_loop` | `符号链接成环: …` |
| 其它 IO 失败 | `fs.io_error` | `读取失败: …（原始错误）` |

## system（T027）

应用内读不了的文件的兜底出口。

| 方法 | 说明 |
|------|------|
| `openPath(path)` | `{ ok, reason? }`：Electron `shell.openPath`（系统默认应用）。路径不存在直接 `{ ok:false, reason }` |
| `revealInFinder(path)` | `{ ok, reason? }`：Finder 中显示。**与 `workspace.reveal` 同一实现**（main 侧共用 `revealInFinder()`，没有第二套） |

## md

| 方法 | 说明 |
|------|------|
| `render(source)` | 主进程：`{ html, toc: { id, level, text }[] }`（`@perigee/md-core`，手写 sanitize + TOC） |

### 双管线定界（架构债收敛 · 不硬合并）

| 场景 | 路径 | 消毒 |
|------|------|------|
| **聊天气泡 / 文件预览** | renderer `lib/markdown.ts`（DOMPurify + 代码高亮） | 浏览器端完整消毒 |
| **`md.render` IPC** | main → `md-core` | Node 侧轻量 sanitize；带 TOC |

- 当前 **renderer 未调用** `window.perigee.md.render`（Chat/FilesView 走本地 markdown）。
- 保留 IPC 以免契约/外部脚本 silent break；**勿**把 `md.render` 当聊天渲染路径。
- Node 无 DOM，不强行统一 DOMPurify；产品若废弃主进程 TOC，另开单删 API。

## session

| 方法 | 说明 |
|------|------|
| `list()` | `SessionRecord[]` |
| `listExternal(opts?)` | **T005**：枚举本机 CLI 会话 `~/.grok/sessions`（磁盘，不依赖 ACP 活进程）。`opts?: { cwd?: string; limit?: number }` → `ExternalCliSession[]` |
| `removeExternal(cliSessionId)` | **T030**：**物理删除**该 CLI 会话的 transcript 目录（`~/.grok/sessions/<cwd-key>/<id>/`），不可恢复。返回 `{ ok:true, removed }` 或 `{ ok:false, reason:'invalid_id'\|'not_found'\|'unsafe_path', detail? }`。安全闸见下 |
| `resumeExternal(cliSessionId)` | **T005**：ACP `session/load` 恢复 CLI 会话为 Desktop 会话；历史经 `session/update` 回放为 `SessionEvent`。需 `engineMode=acp`。返回 `{ ok, session?, external?, reason?, detail? }` |
| `command(sessionId, cmd)` | **T005**：Slash/命令路由。`cmd` 如 `model grok-4.5` · `effort low` · `compact` · `mcps list` · `review`（skill）。返回 `SessionCommandResult`；不支持则 `status: 'unsupported'` |
| `commandCapabilities()` | **T005**：feature-detect 列表 `CommandCapability[]`（name/support/detail/evidence） |
| `create(title?)` | 新建会话（需已打开工作区）。Git 仓且 `useWorktree` 时引擎 cwd 为 worktree |
| `createSide(parentSessionId)` | **侧问会话**（`kind=side`，独立 ACP，不进侧栏、不持久化） |
| `get(id)` | 含 side 会话查询 |
| `revealWorktree(sessionId)` | Finder 打开 worktree 路径 |
| `discardWorktree(sessionId)` | 丢弃 worktree + 删会话（对齐 remove：墓碑优先、dispose 后台；**不** merge 主仓，ADR 0009） |
| `worktreeStatus(sessionId)` | 分支 / dirty / shortstat / 相对主仓 commits |
| `promote(sessionId, opts?)` | push 分支 + 可选 `gh pr create`；未 commit 拒绝；**永不 merge 主仓** |
| `send(sessionId, text, opts?)` | 发送一轮。忙碌入队。`@mention` 文本展开。`opts.mediaPaths`：图/PDF → ACP 多模态 content blocks（D1-B）。**side 会话**展示原文、引擎加侧问约束包装 |
| `sendCross(fromId, toId, text)` | 跨会话投递（需 `crossSessionSendEnabled`；禁止投到 side） |
| `history(sessionId)` | 内存中的 `SessionEvent[]` |
| `cancel(sessionId)` | 取消进行中的回合（**不**杀 ACP 子进程；可续聊） |
| `export(sessionId)` | 系统保存对话框导出 Markdown |
| `restart(sessionId)` | 软重启会话引擎侧状态（尽力 cancel 后重新可发送） |
| `rename(sessionId, title)` | 重命名（持久化） |
| `remove(sessionId)` | 删除会话（T030 物理删 transcript + 可选 CLI 联删；引擎 dispose **后台**，UI 立即消失） |
| **`contextInfo(sessionId)`** | **T006**：上下文占比。见下表 |
| **`markRead(sessionId)`** | **T008**：标记已读；`lastReadAt=now` 持久化进 sessions-meta；返回 `{ ok }` |
| `onEvent(cb)` | 实时 `SessionEvent`（`assistant.delta` / `thought.delta` 在主进程约 16ms 批合后推送） |
| `onUpdated(cb)` | 会话列表变化 |

### T008 · SessionRecord 扩展（`list` / `get`）

每条会话 meta **额外**字段（host 计算，前端勿自拼）：

```ts
{
  attention: 'working' | 'needs_input' | 'unread' | 'read'
  lastActivityAt: number        // ms epoch，最后一条相关事件
  lastReadAt: number | null     // ms epoch；null=从未 markRead
  engineSessionId?: string      // CLI UUID（resume 去重）
}
```

| attention | 规则（优先级从上到下） |
|-----------|------------------------|
| `needs_input` | `status===waiting_approval` 或有 pending 审批（**压过 working**） |
| `working` | `streaming` / `tool_running` |
| `unread` | 空闲且 `lastActivityAt > lastReadAt`（或 `lastReadAt==null`） |
| `read` | 否则 |

### T008 · `stats.usage` / `uiState`

```ts
stats.usage(range?: 'all' | '30d' | '7d'): Promise<{
  sessions: number
  messages: number
  totalTokens: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  peakHour: number | null          // 0-23；样本不足 null
  favoriteModel: string | null
  daily: Array<{ date: string; tokens: number; messages: number }>  // YYYY-MM-DD 本地时区
  /** T012：模型总量 + in/out（账本 inputTokens/outputTokens 累加） */
  byModel: Array<{
    model: string
    tokens: number
    messages: number
    inputTokens: number
    outputTokens: number
  }>
  /** T012：日×模型矩阵（堆叠柱）；无数据日不补零；无 modelId → model:"unknown" */
  dailyByModel: Array<{ date: string; model: string; tokens: number }>
}>
// 一致性：sum(dailyByModel.tokens) === sum(byModel.tokens) === totalTokens（token 维）

uiState.get(key: string): Promise<unknown>
uiState.set(key: string, value: unknown): Promise<{ ok: true }>
```

| 数据源 | 取什么 | 不取什么 |
|--------|--------|----------|
| **Desktop 用量账本** `usage-ledger/YYYY-MM.jsonl`（**T011 主源**） | 永久累计 `totalTokens` / 按日·按模型；删会话**不**删账本 | 不估算回填历史 |
| Desktop `transcripts/*.jsonl` | `user.message` 计数；启动时 **一次性**把历史 `usage` 迁入账本 | 迁后 token 不再直接从 transcript 聚合（防双计） |
| CLI `~/.grok/sessions/**/summary.json` + `signals.json` | 会话数、`userMessageCount`/`num_chat_messages`、活跃日、`primaryModelId` | **不把** `contextTokensUsed` 当 lifetime tokens |
| 去重 | Desktop `engineSessionId` 与 CLI `info.id`；账本内按 `eventId`（usage 事件 id）幂等 | 禁止双计 |

账本行：`{ date, sessionId, model, inputTokens, outputTokens, totalTokens, ts, eventId, hour }`。  
`uiState` 落 `userData/ui-state.json`，schema 归前端。

### T006 · `session.contextInfo(sessionId)`

```ts
Promise<{
  ok: boolean
  usedTokens?: number      // 已用（优先 totalTokens）
  windowTokens?: number    // 模型窗口（ACP models._meta.totalContextTokens）
  usagePct?: number        // used/window*100，一位小数；缺一则无
  modelId?: string
  source: string           // 'acp+usage' | 'usage-history' | …
  detail?: string          // ok:false 或仅部分数据时的说明
}>
```

| 字段 | 来源（实证） |
|------|----------------|
| `windowTokens` | ACP `initialize`/`session/new`/`session/load` → `availableModels[]._meta.totalContextTokens`（本机 grok-4.5 = **500000**） |
| `usedTokens` | `session/prompt` result `_meta.totalTokens` 或 `turn_completed.usage` / `usage` 事件 |
| 编造 | **禁止**：无探针证据不填假窗口 |

`ok: false`：尚无 usage 且无窗口元数据（例如从未发消息的 stub/headless）。

### T005 类型（CLI 桥）

```ts
type ExternalCliSession = {
  id: string              // CLI UUID
  title: string
  cwd: string
  createdAt: string
  updatedAt: string
  modelId?: string
  reasoningEffort?: string
  numMessages?: number
  agentName?: string
  summaryPath: string
}

type CommandSupport = 'full' | 'partial' | 'unsupported'
type CommandCapability = {
  name: string            // model | effort | compact | rewind | mcps | skill
  support: CommandSupport
  detail: string
  evidence?: string
}

type SessionCommandResult = {
  ok: boolean
  status: 'ok' | 'unsupported' | 'error'
  command: string
  detail: string
  data?: unknown
}
```

| 命令 | 支持 | 实现 |
|------|------|------|
| `model <id>` | full | ACP `session/set_model` |
| `effort <low\|medium\|high>` | full | `session/set_model` + `_meta.reasoningEffort` |
| `compact [hint]` | full | `session/prompt` 发 `/compact`（AvailableCommand） |
| `rewind` | **unsupported** | 无 ACP 方法；文件级仍用 `diff.revertTurn` |
| `mcps list\|enable\|disable <name>` | partial | CLI config 桥 + ACP MCP 热更 |
| `<skill> [args]` / `/skill` | full | `session/prompt` 发 `/name` |

**resume 语义**：真 ACP `session/load`（`agentCapabilities.loadSession=true`），**不是**假恢复。headless 返回 `unsupported`。  
**事件**：load 回放含 `user.message` / `assistant.delta`·`message` / tool / thought；`lifecycle` `session.load.ok`。无 schema 版本 bump（复用既有事件）。

### SessionEvent（前端常用，schemaVersion=3）

| type | 用途 |
|------|------|
| `user.message` | 用户消息 `{ text }` |
| `assistant.delta` | 流式片段 `{ text }` |
| `assistant.message` | 完整助手消息 `{ text }` |
| `thought.delta` / `thought.message` | 思考流（可折叠展示） |
| `tool.call` | `{ id, name, args, kind?, callId? }` |
| `tool.result` | `{ callId, ok, result, name? }` |
| `plan` | `{ entries }` |
| `usage` | `{ inputTokens?, outputTokens?, raw? }` |
| `turn.end` | `{ stopReason, engineSessionId? }` |
| **`turn.summary`** | **轮次验收摘要（v3 新增，host turn-tracker 收轮时聚合发布）**：`{ turnId, filesChanged[], toolsRun, testSignal: pass\|fail\|none, risk: normal\|elevated, riskReasons[], durationMs?, inputTokens?, outputTokens? }` |
| `file.changed` | `{ path, kind, before?, after? }` → 刷树/Diff。`before/after` 为引擎权威 diff 提示（grok write/search_replace 的 oldText/newText，v3 追加可选字段）：yolo 下 tool_call 与写盘有竞态，磁盘快照不可靠，有 hint 时 DiffService 以 hint 为准 |
| `session.status` | `{ status: idle\|streaming\|tool_running\|… }` |
| `approval.requested` / `resolved` | 人审；`requested` 带 `requestId`（host 审批 id，v3 新增，resolve 用它）与 `engineRequestId` |
| `error` | `{ message, code?, retriable? }` 见 `docs/errors.md` |
| `lifecycle` | `{ name, detail? }` 如 max_turns |
| **`subagent.spawned`** | ACP 扩展：子代理启动 `{ subagentId, childSessionId, subagentType, description, … }` |
| **`subagent.progress`** | 进度（高频；UI 不写满时间线）`{ durationMs, turnCount, toolCallCount, tokensUsed?, … }` |
| **`subagent.finished`** | `{ status, error?, toolCalls?, turns?, durationMs?, output? }` |
| **`task.backgrounded`** | 后台 bash/monitor `{ taskId, command?, monitorDescription?, … }` |
| **`task.completed`** | `{ taskId, snapshot?, willWake? }` |

完整定义：`packages/event-schema/src/index.ts`。样例：`docs/fixtures/streaming-json.sample.ndjson` · `docs/fixtures/acp-subagent.md`。

### SessionRecord

```ts
{
  id, title, workspacePath,
  status: 'idle' | 'streaming' | 'tool_running' | 'waiting_approval' | 'error' | 'done',
  createdAt, updatedAt, engineId
}
```

## diff

| 方法 | 说明 |
|------|------|
| `list(sessionId?)` | `FileDiff[]` |
| `unified(id)` | unified diff 字符串 |
| `accept` / `reject` | 单文件 |
| `acceptAll` / `rejectAll` | 按会话 |
| `revertTurn(sessionId, turnId)` | **打回一轮**：该轮（`turn.summary.turnId`）所有 pending diff 还原磁盘（v3 新增） |
| `onUpdated(cb)` | 列表变化：**每次推送该 Host 上的全量 `FileDiff[]`**（非增量 patch）。前端按 `sessionId` 本地过滤。 |

`FileDiff`：`id/sessionId/relativePath/absPath/before/after/status/createdAt/turnId?`  
`status`: `pending | accepted | rejected`  
**拒绝/打回**会把磁盘还原到 `before`。

## approval

| 方法 | 说明 |
|------|------|
| `list(sessionId?)` | 待审批（扩展点，当前 CLI always-approve 时较少用到） |
| `resolve(id, approved, policy?)` | `policy`: `always-ask` \| `session-allow` \| `always-allow` |
| `onUpdated(cb)` | |

## terminal

| 方法 | 说明 |
|------|------|
| `read(sessionId)` | 累计日志 |
| `clear(sessionId)` | 清屏 |
| `write(sessionId, line)` | echo / shell-c 一行命令；`terminalMode=pty` 时写 `line+\n` 进 PTY（失败降级 shell-c） |
| `writeRaw(sessionId, data)` | PTY 原始 stdin（xterm onData） |
| `resize(sessionId, cols, rows)` | PTY winsize |
| `attach(sessionId, size?)` | lazy spawn PTY（会话 cwd） |
| `availability()` | `{ pty, reason?, shell, fallback }` |
| `kill(sessionId)` | 杀 shell-c 子进程或 PTY |
| `status(sessionId)` | `{ cwd, shellEnabled, running, mode, ptyAlive? }` |
| `onData(cb)` | `{ sessionId, chunk }` |
| `onExit(cb)` | `{ sessionId, exitCode }`（PTY 退出） |

## integrations

```ts
status(): Promise<{
  gcu: { ok: boolean; detail: string }
  mcp: { name: string; command: string; enabled: boolean }[]
  grokBinary: string
  grokAvailable: boolean
  skills?: { name: string; path: string; description: string; source: 'user' | 'bundled' }[]
  multimodal?: { supported: boolean; detail: string }
  modelHotSwitch?: { policy: 'rebuild' | 'hot'; detail: string }
  terminalShell?: { enabled: boolean; detail: string }
  crossSession?: { enabled: boolean; detail: string }
  gh?: GhRepoStatus
}>
listSkills(): Promise<SkillEntry[]>
listModels(): Promise<{ id: string; label?: string }[]>  // CLI `grok models` 等
setMcpEnabled(name: string, enabled: boolean): Promise<McpServer[]>
ghStatus(): Promise<GhRepoStatus>  // 当前工作区 git/gh 摘要（含 isGit，与 WorktreeService 同判据）
gcuStatus(): Promise<GcuProbe>     // ADR 0010：bridge + 扩展 + MCP 路径
gcuAlignMcpCommand(): Promise<{ ok; command; resolved; source; servers }>  // 写回解析后的 gcu-bridge 路径
rebuildEngine(): Promise<{ ok; engineId?; engineModeActual? }>  // 显式重建（热切失败降级）
```

- `listSkills` 扫描 `~/.grok/skills` 与 `~/.grok/bundled/skills`（与 Composer `/` 同源）。  
- **ADR 0011**：MCP / 权限基线以 **Grok CLI `~/.grok`** 为准（`grok mcp list|enable|disable`）；`settings.json` 仅壳字段权威。  
- MCP：从 CLI 列表注入 `session/new.mcpServers`（含 env/headers）；启停写 **CLI** 并热更已活会话。  
- 仅改 `model`：ACP 下 `session/set_model`（不杀进程）；持久默认模型不另起权威库。  
- GCU：`status.gcu` 为 `GcuProbe`（`ok` 需 bridge↑ 且 extension_connected）。  
- 权限：ask/yolo 写 `[ui] permission_mode`（ask / always-approve）；plan/accept_edits 会话级。  
- **`setMcpEnabled`**：写 CLI（`grok mcp enable|disable` 或 toml）并 **`applyMcpServers` 热更**已活 ACP 会话；**不是**只改 Desktop settings（旧文档已废，见 ADR 0011）。  
- 有会话级 MCP 白名单（如 Routine）时，热更只刷新白名单交集，不全量灌入。
## routines（T018）

定时任务能力层。数据落 `userData/routines.json`（不进 git）。UI 归 T019。

```ts
routines: {
  list(): Promise<RoutineView[]>
  create(input: RoutineCreateInput): Promise<RoutineView>
  update(id: string, patch: RoutinePatch): Promise<RoutineView>
  remove(id: string): Promise<void>
  toggle(id: string, enabled: boolean): Promise<RoutineView>
  runNow(id: string): Promise<{ runId: string; sessionId: string }>
  onChanged(cb: (routines: RoutineView[]) => void): () => void  // 全量推送
}

type RoutineTrigger = {
  kind: 'daily' | 'weekly' | 'interval'
  time?: string            // 'HH:mm'，daily/weekly
  weekday?: number         // 0–6，weekly
  everyMinutes?: number    // interval
}

type RoutineRun = {
  id: string
  sessionId: string        // 产生的会话，可跳转
  startedAt: number
  durationMs: number
  status: 'ok' | 'fail'
  summary?: string
}

type Routine = {
  id: string
  name: string
  instruction: string      // 派活指令（首条 prompt）
  enabled: boolean
  workspace: string        // 工作区绝对路径
  model: string
  effort?: string
  triggers: RoutineTrigger[]
  mcpServers: string[]     // 允许的 MCP 连接器名
  notify: boolean
  createdAt: number
  runs: RoutineRun[]       // 新在前，最多 50
}

type RoutineView = Routine & { nextRunAt?: number }  // 派生；仅 enabled 时有值
type RoutineCreateInput = Omit<Routine, 'id' | 'createdAt' | 'runs'>
type RoutinePatch = Partial<Omit<Routine, 'id' | 'createdAt' | 'runs'>>
```

| 行为 | 说明 |
|------|------|
| 到点触发 | 应用运行中调度；创建新会话 `Routine · <name>`，发 `instruction`，跑到轮次结束 |
| 权限 | **强制 yolo**（会话级 meta + Host 兜底）；定时无人在场，不弹审批卡 |
| 未读 | 新会话 `lastReadAt=null`；跑完后侧栏 attention=`unread` |
| 错过 | 应用未开时**不补跑**，只重算 `nextRunAt` |
| 触发器 | `daily` / `weekly` / `interval`；**无 cron**（TECH-DEBT） |
| `runNow` | 立即执行（不要求 enabled） |
| `toggle(false)` | 清 timer，不再触发 |

### T030 · 删除物理化（行为变更）

维护者拍板：**确认删除 = 物理删除**，推翻 T029「transcript 是用户数据不碰」的保守语义。

- `session.remove(id)`（既有）现在**联动物理删除**：本会话的 `userData/transcripts/<id>.jsonl` +（若该记录有 `engineSessionId`）关联的 `~/.grok/sessions/<cwd-key>/<engineSessionId>/` 整目录。返回值加 `removedCli?: string`。
- `session.removeExternal(cliSessionId)`（新增）：直接物理删除某个外部 CLI 会话的 transcript 目录。

**删除安全闸**（破坏性操作，路径包含检查是**该有的**防线，与 T027 放开 fs 读写不冲突——读写是能力、删除是破坏）：

| # | 闸门 | 拒绝时 `reason` |
|---|---|---|
| ① | id 必须是**单段安全目录名**（`[A-Za-z0-9._-]{1,128}`，不含 `/`、`..`、空白） | `invalid_id` |
| ② | 目标必须存在且是目录 | `not_found` |
| ③ | **realpath 后**仍须严格位于 `~/.grok/sessions/` 之下（挡符号链接逃逸） | `unsafe_path` |
| ④ | 目录名 === 该 id，且深度恰为 `<root>/<cwd-key>/<id>`（挡删到分片层或整个 sessions） | `unsafe_path` |

## preview / diagnostics

| 方法 | 说明 |
|------|------|
| `preview.open(url)` | 系统浏览器打开 URL（仅 http/https 校验，见 main `validatePreviewUrl`） |
| `diagnostics.export()` | 导出诊断包到用户选择目录（或桌面 `perigee-diagnostics`） |

## clipboard / menu / securityProbe

- `clipboard.write(text)`
- **`clipboard.saveImage(): Promise<string \| null>`**（**T006**）：读系统剪贴板图片（nativeImage），落盘 `userData/attachments/paste-<ts>-*.png`，返回**绝对路径**；无图/`isEmpty` → `null`。前端路径接入既有 `session.send(..., { mediaPaths })`。
- `menu.on('open-workspace' | 'command-palette' | 'new-session' | 'export-session' | 'settings', cb)`（`settings` 绑定 ⌘,）- `securityProbe.hasRequire`：渲染进程应无 `require`（安全探针）

---

## 错误与空状态

- 未打开工作区时 `session.create` / `fs.list` 会 throw → UI 捕获并展示；**`fs.read` / `fs.write` 自 T027 起无工作区也可按绝对路径工作**  
- `fs.read` / `fs.write` 的错误带 `code`（见 T027 表），UI 可据此分支（如读失败 → 提示用系统应用打开）  
- 无 `window.perigee`：preload 失败（黑屏事故）；需提示用户并检查 preload CJS  

## 扩展 API 流程

前端不要改 preload。写 `docs/design/API-gaps.md`，由后端会话补 IPC。
