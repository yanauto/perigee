# Grok CLI 配置探针（ADR 0011 · Phase 0）

> 日期：2026-08-01 · 本机 `~/.grok/bin/grok`

## `grok mcp` 子命令（可脚本化写回）

```
grok mcp list | add | remove | enable | disable | doctor
```

- **写 MCP 启停：优先 `grok mcp enable <name>` / `grok mcp disable <name>`**，避免手改 toml。  
- `list` 输出样例：`grok-computer-use: /path/to/gcu-bridge`

## 配置路径

| 文件 | 用途 |
|------|------|
| `~/.grok/config.toml` | 用户权威（mcp_servers、ui.permission_mode…） |
| 项目 `.grok/config.toml` | 文档：主要 mcp；合并策略随 CLI |

## session/new 与 MCP

Desktop 仍向 ACP 传 `mcpServers` 列表（从 toml 解析启用项）。  
CLI agent 亦可能自读 config 合并；**Desktop 注入列表应与 toml 启用集一致**，避免漏项，勿注入 Desktop 假默认。

## 权限

`[ui] permission_mode` 文档值：`ask` / `auto` / `always-approve` 等。  
Desktop 写回仅 `ask` ↔ `always-approve`（yolo）；`auto` 只读不覆盖。
