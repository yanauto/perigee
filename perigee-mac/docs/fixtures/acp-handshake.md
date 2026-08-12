# ACP 握手实录（grok agent stdio · 1.0.x）

> 2026-08-13 对照官方 Headless 示例 + vendor `xai-grok-test-support` / pager。  
> 旧路径（initialize → session/new、无 authenticate）仅作历史；**现行必须 authenticate**。

## 成功路径

1. spawn：`grok --no-auto-update agent stdio`  
   env：`GROK_CLIENT_VERSION=perigee/0.3.0` · `NO_COLOR=1`

2. `initialize`

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
  "protocolVersion":1,
  "clientCapabilities":{
    "fs":{"readTextFile":true,"writeTextFile":true},
    "terminal":false,
    "_meta":{
      "x.ai/incrementalBashOutput":true,
      "x.ai/bashOutputNoColor":true
    }
  },
  "clientInfo":{"name":"perigee","version":"0.3.0"},
  "_meta":{
    "clientType":"perigee",
    "clientSource":"perigee",
    "clientVersion":"0.3.0",
    "startupHints":{"nonInteractive":true}
  }
}}
```

`terminal: false`：Perigee 终端是 node-pty，未实现 ACP `terminal/*`。  
agent 遥测读 `_meta.clientType` / `clientVersion`，不是 `clientInfo`。

3. `authenticate`（`authMethods` 非空时必做）

选法（pager）：`_meta.defaultAuthMethodId`（若在列表中）→ `cached_token` → 若有 `XAI_API_KEY` 则 `xai.api_key` → 第一项。

```json
{"jsonrpc":"2.0","id":2,"method":"authenticate","params":{
  "methodId":"cached_token",
  "_meta":{"headless":true}
}}
```

4. `session/new` **必须** 含 `mcpServers`（可 `[]`）；模型可走 `_meta.modelId`

```json
{"jsonrpc":"2.0","id":3,"method":"session/new","params":{
  "cwd":"/path/to/workspace",
  "mcpServers":[],
  "_meta":{"modelId":"grok-4"}
}}
```
→ `result.sessionId`

5. `session/prompt`

```json
{"jsonrpc":"2.0","id":4,"method":"session/prompt","params":{
  "sessionId":"<id>",
  "prompt":[{"type":"text","text":"Reply with exactly: pong"}]
}}
```

## 通知

- `session/update` · `sessionUpdate`: `agent_message_chunk` | `agent_thought_chunk` | `tool_call` | `tool_call_update` | …
- `_x.ai/session/prompt_complete`
- 扩展：`subagent_*` / `task_backgrounded` / `task_completed`（见 `subagent-map.ts`）

## 权限

Client 可能收到 `session/request_permission` → 需 `result.outcome`。  
grok 1.0.1+ 工具可自报只读（`toolCall.kind` 为 read/search/fetch，或 `_meta.isReadOnly`）；Host 分类器优先信这个，而不是工具名启发式。

## 热路径

| 方法 | 用途 | 参数要点 |
|------|------|----------|
| `session/set_mode` | 权限/计划 mode | `{ sessionId, modeId }` · modeId: plan \| ask \| default |
| `session/set_model` | 会话内换模型 | `{ sessionId, modelId }` |
| `x.ai/session/update_mcp_servers` | 已活会话换 MCP | `{ sessionId, mcpServers }` |

实现：`packages/engine-grok-acp/src/handshake.ts` + `index.ts` `boot()`。
