# 后端适配怎么做（读 vendor/grok-build 后的结论）

> 日期：2026-07-31 · 源码：`vendor/grok-build` @ `dd04f39`  
> 分工：**Kimi = renderer UI**；**本仓后端 = main + preload + packages + 引擎进程**

---

## 0. 一句话

**要写后端，而且还没写完。**  
现在是「能 spawn 一轮 `grok -p` + 粗解析 NDJSON」的原型；Grok 源码里真正给 Desktop/IDE 用的是 **`grok agent stdio`（ACP over pipes）**。后端下一步的主线应是 **ACP 客户端适配**，不是继续堆 UI。

---

## 1. Grok 源码里有什么（和我们相关的）

### 1.1 五条入口（不是三种）

| 模式 | 触发 | 用途 |
|------|------|------|
| 交互 TUI | 裸 `grok` | 人用终端，**不适合**做我们的壳 |
| **`grok -p` 单轮** | `-p` + `--output-format` | 脚本/CI；**我们现在用的** |
| **`grok agent stdio`** | ACP JSON-RPC over stdin/stdout | **给 Desktop/IDE 的正式嵌入路径**（源码注释写明 spawn 方含 perigee） |
| `grok agent headless` | grok.com WebSocket relay | 持久会话，要账号；**不是** `-p` |
| `grok agent leader` | Unix socket 守护进程 | 多客户端复用同一 agent 进程 |

### 1.2 统一内部协议 = ACP

无论 TUI 还是 `-p`，UI/驱动与 runtime 之间都是 **ACP 消息**。  
`-p` 是进程内 channel；`agent stdio` 是同一套消息序列化到管道。  
设计意图：**runtime 是可远程化服务，UI 只是客户端**——这正是 Perigee 该做的事。

### 1.3 `streaming-json` 线格式（`-p` 输出）

由 `headless/reducer/acp.rs` 定义，**一行一个 JSON**，`type` 字段：

| type | 含义 | 我们是否处理 |
|------|------|----------------|
| `text` | 助手文本增量 | ✅ → `assistant.delta` |
| `thought` | 思考增量 | ❌ 丢弃 |
| `tool_call` | 工具开始 | ✅ 粗处理 |
| `tool_call_update` | 工具进度/完成 | ✅ 粗处理 |
| `plan` | 计划条目 | ❌ |
| `available_commands` | 工具/命令列表 | ❌（噪音） |
| `usage` | token 用量 | ❌ |
| `end` | 回合结束 + sessionId | ✅ 部分（记 sessionId） |
| `error` / `max_turns_reached` | 错误/上限 | ⚠ 弱 |
| `auto_compact_*` 等 | 压缩生命周期 | ❌ |

### 1.4 权限

`-p` 路径里权限在 headless 进程内用 yolo/`--always-approve` 消化；  
**真·可交互审批**需要 ACP 的 `session/request_permission`（client 回选）。  
当前我们 **always-approve + 事后 Diff 还原**，是权宜，不是产品终态。

---

## 2. 我们现在有什么 / 缺什么

### 已有（可继续当地基）

| 模块 | 状态 |
|------|------|
| Electron main IPC 白名单 | 有 |
| preload CJS 桥 | 有（勿改回 ESM） |
| SessionManager / EventBus / Transcript | 有 |
| FS 工作区守卫 / Diff 快照 | 有（需打磨） |
| Settings / Workspace 最近列表 | 有 |
| **GrokBuildEngine：spawn `grok -p … streaming-json`** | **原型可用** |

### 硬伤（相对源码意图）

1. **每发一条用户消息 = 新进程**  
   - 冷启动、鉴权、catalog、MCP 全套重来  
   - 多会话并行 = 多进程，内存/登录态压力大  
2. **不是 ACP 会话**  
   - 无法干净地：中途插话、权限问答、cancel 子 agent、load session、模型切换协议  
3. **事件覆盖不全**  
   - thought/plan/usage/compact/permission 未进 schema 或 UI 事件  
4. **Diff 捕获粗糙**  
   - 只对「根目录一级文件」回合前 capture；嵌套路径/新文件/删文件易漏  
5. **取消 = kill 进程**  
   - 可能留下半截写盘；没有优雅 cancel turn  
6. **无 leader 复用**  
   - 多窗/多会话无法共享一个 warm agent  
7. **认证/错误面**  
   - 未登录、限流、folder trust 等错误未结构化给前端  

---

## 3. 推荐架构（后端终态）

```text
┌─────────────────────────────┐
│ Renderer (Kimi)             │  只吃 window.perigee 事件
└──────────────┬──────────────┘
               │ IPC
┌──────────────▼──────────────┐
│ Main Host                   │  Session 投影、Diff、审批、设置
│  · SessionManager           │
│  · DiffService / Approval   │
└──────────────┬──────────────┘
               │ AgentEngine 接口
┌──────────────▼──────────────┐
│ GrokAcpEngine（目标）        │  长活子进程
│  spawn: grok agent stdio    │  env: GROK_CLIENT_VERSION=...
│  JSON-RPC ACP:              │
│   initialize / session/new  │
│   session/prompt            │
│   session/cancel            │
│   request_permission ↔ UI   │
└──────────────┬──────────────┘
               │
         Grok Build runtime
```

**过渡期**：保留现有 `GrokBuildEngine`（`-p`）作 Stub 级回退；新实现 `GrokAcpEngine` 为默认。

---

## 4. 后端施工顺序（步骤 + 验收，非日历）

### B0 · 契约加固（先做，Kimi 也受益）

- [ ] 扩展 `event-schema`：`thought.delta`、`plan`、`usage`、`permission.requested`、完整 `end` meta  
- [ ] 文档化 NDJSON 全表 → 已写入本文件；同步 `docs/API-preload.md`  
- [ ] 前端事件字段类型与后端一致  

**验收**：类型单测 + 一份「事件样例」jsonl fixture。

### B1 · 协议探测器（只读，不改产品行为）

- [ ] `scripts/probe-streaming-json.sh`：固定 prompt 打出全 type 样例入库 `docs/fixtures/`  
- [ ] 可选：对 `grok agent stdio` 做 initialize 握手探针（需读 ACP schema）  

**验收**：fixture 覆盖 text/tool_call/tool_call_update/end/usage。

### B2 · 加固现有 `-p` 适配（短期可用）

- [ ] 解析 thought / plan / usage / error / max_turns  
- [ ] Diff：在 **每个 tool_call 的 locations/rawInput 路径** 上 `captureBefore`，不仅顶层  
- [ ] 回合结束强制 `git status` 或 walk 变更集（可选增强）  
- [ ] cancel：SIGTERM → 宽限 → SIGKILL；标记 session error  
- [ ] 未登录/非零退出：结构化 error 事件  

**验收**：真机「读文件 + 改嵌套路径文件」Diff 不空；取消后状态 idle。

### B3 · **主路径：`GrokAcpEngine`（`grok agent stdio`）**

- [ ] 子进程：`grok agent stdio`，stdio 管道，父死子死（源码已 PR_SET_PDEATHSIG）  
- [ ] 实现最小 ACP client：  
  - `initialize`  
  - `session/new`（cwd=workspace）  
  - `session/prompt`  
  - 订阅 session updates → 映射到 `SessionEvent`  
  - `session/cancel`  
- [ ] 一会话一子进程 **或** 一 workspace 一进程多 session（先做一会话一进程更简单）  
- [ ] `GROK_CLIENT_VERSION=perigee/0.x`（源码会打日志）  

**验收**：同会话连发 3 条消息 **不** 重启进程；工具流与文本流完整。

### B4 · 权限闭环

- [ ] 处理 `request_permission` → Host `ApprovalGate` → UI 弹窗 → 回写 Selected/Cancelled  
- [ ] 设置：`always-approve` / `ask` / `acceptEdits` 与 Grok permission_mode 对齐  
- [ ] Diff 与权限：ask 模式下写前拦；always 模式下写后审  

**验收**：关 always-approve 时危险命令会弹审批且可拒绝。

### B5 · 会话与产物

- [ ] Transcript 落盘与导出已有 → 对齐 ACP session id  
- [ ] `session/load` / resume 与 Grok 会话目录一致  
- [ ] 可选：接 `leader` 做多会话共享（后置）  

### B6 · 稳定性与观测

- [ ] 子进程崩溃自动重连策略  
- [ ] 限流错误可读文案（源码有 RATE_LIMITED）  
- [ ] 主进程日志级别 / 可选 debug 面板数据源（给前端）  

---

## 5. 明确「后端不做 / 少做」

| 不做 | 原因 |
|------|------|
| 重写 Grok runtime / 自研 agent loop | 源码已是完整 harness |
| 在 Desktop 里复刻 TUI | 产品是 GUI 客户端 |
| 改 `vendor/grok-build` | 只读同步 |
| 替 Kimi 画 UI | 边界已立 |
| 第一天就 leader 多租户完美 | B3 先单进程会话 |

---

## 6. 和 Kimi 的接口纪律

- Kimi **只**依赖 `window.perigee` + `SessionEvent`  
- 后端加事件类型时：**先扩 schema + API-preload 文档**，再实现，避免前端空等  
- 缺 API：Kimi 写 `docs/design/API-gaps.md`；后端按 gaps 补 IPC，不反向改 UI  

---

## 7. 建议默认排期（逻辑序，非日历）

1. **B0 + B2**（不换架构也能让产品可演示）  
2. **B3 ACP**（质变：像真 Desktop）  
3. **B4 权限**  
4. **B5–B6** 打磨  

---

## 8. 关键源码锚点（vendor）

| 主题 | 路径 |
|------|------|
| `-p` 入口 | `crates/codegen/xai-grok-pager/src/headless.rs` `run_single_turn` |
| streaming-json 行型 | `.../headless/reducer/acp.rs` |
| ACP map | `.../headless/reducer/mod.rs` `map_session_update` |
| stdio agent | `crates/codegen/xai-grok-shell/src/agent/app.rs` `run_stdio_agent` |
| turn 循环 | `.../session/acp_session_impl/turn.rs` |
| 总览笔记 | 个人库 `learning/grok-build-study/notes/00-overview.md` |
