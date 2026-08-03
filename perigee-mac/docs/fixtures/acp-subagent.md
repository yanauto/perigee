# ACP 扩展：subagent / task 通知样例（v2.23）

> 线协议摘自 vendor `xai-grok-shell` SessionUpdate；Desktop 映射见 `packages/engine-grok-acp/src/subagent-map.ts`。

## method 入口

- `session/update` · `params: { sessionId, update }`
- `x.ai/session_notification` · 同上
- `_x.ai/session_notification` · 偶见双包 `{ method, params: { sessionId, update } }`
- `x.ai/task_backgrounded` / `x.ai/task_completed` · 字段可在顶层

## subagent_spawned

```json
{
  "sessionUpdate": "subagent_spawned",
  "subagent_id": "sub-1",
  "parent_session_id": "parent-eng",
  "child_session_id": "child-1",
  "subagent_type": "explore",
  "description": "扫依赖图"
}
```
→ `SessionEvent` `subagent.spawned`

## subagent_progress

```json
{
  "sessionUpdate": "subagent_progress",
  "subagent_id": "sub-1",
  "child_session_id": "child-1",
  "duration_ms": 5000,
  "turn_count": 2,
  "tool_call_count": 8,
  "tokens_used": 12000,
  "context_window_tokens": 256000,
  "context_usage_pct": 5,
  "tools_used": ["bash", "grep"],
  "error_count": 0
}
```
→ `subagent.progress`（Tasks 面板覆盖进度，时间线不刷）

## subagent_finished

```json
{
  "sessionUpdate": "subagent_finished",
  "subagent_id": "sub-1",
  "child_session_id": "child-1",
  "status": "completed",
  "tool_calls": 8,
  "turns": 2,
  "duration_ms": 12000,
  "tokens_used": 15000
}
```
→ `subagent.finished`

## task_backgrounded / task_completed

```json
{ "sessionUpdate": "task_backgrounded", "task_id": "t-1", "command": "npm test", "tool_call_id": "tc1" }
```
```json
{ "sessionUpdate": "task_completed", "task_snapshot": { "task_id": "t-1" }, "will_wake": false }
```
