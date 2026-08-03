# ACP 握手实录（2026-07-31 · grok agent stdio）

## 成功路径

1. `initialize`  
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
  "protocolVersion":1,
  "clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true}},
  "clientInfo":{"name":"perigee","version":"0.2.0"}
}}
```

2. `session/new` **必须** 含 `mcpServers`（可 `[]`）  
```json
{"jsonrpc":"2.0","id":2,"method":"session/new","params":{
  "cwd":"/path/to/workspace",
  "mcpServers":[]
}}
```
→ `result.sessionId`

3. `session/prompt`  
```json
{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{
  "sessionId":"<id>",
  "prompt":[{"type":"text","text":"Reply with exactly: pong"}]
}}
```

## 通知

- `session/update` · `sessionUpdate`: `agent_message_chunk` | `agent_thought_chunk` | `tool_call` | …  
- `_x.ai/session/prompt_complete`  
- env: `GROK_CLIENT_VERSION=perigee/0.2.0`

## 权限

Client 可能收到 `session/request_permission`（或含 request_permission 的 method）→ 需 `result.outcome`。

## 热路径（v2.13 · vendor 证据）

| 方法 | 用途 | 参数要点 |
|------|------|----------|
| `session/set_mode` | 权限/计划 mode | `{ sessionId, modeId }` · modeId: plan \| ask \| default |
| `session/set_model` | 会话内换模型 | `{ sessionId, modelId }` |
| `x.ai/session/update_mcp_servers` | 已活会话换 MCP | `{ sessionId, mcpServers }`（ext；见 shell `session_admin.rs`） |

模型亦可在 `session/new` 的 `_meta.modelId` 注入（test-support）；Desktop 主路径用 set_model 热切。
