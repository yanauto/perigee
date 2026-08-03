# CLI 配置共用（ADR 0011）

## 原则

Agent 配置 **只认** `~/.grok`（与终端 `grok` 相同）。Desktop 不另起 MCP/权限权威库。

## 读

- MCP：`grok mcp list --json`
- 其它：`~/.grok/config.toml`（`[ui].permission_mode`、`fork_secondary_model`…）

## 写 MCP 启停

```bash
grok mcp enable grok-computer-use
grok mcp disable grok-computer-use
# 或在 Desktop 设置勾选（内部调上述命令）
```

写盘失败时 Desktop 可能 fallback 改 toml，并生成 `config.toml.bak.<ts>`。

## 写权限（持久）

| Desktop | CLI `[ui] permission_mode` |
|---------|----------------------------|
| 询问 ask | `ask` |
| 放行 yolo | `always-approve` |
| 计划 / 改文件 | **不写脏键**；仅会话 `set_mode` + Host 分类器 |

**勿**用 Desktop 覆盖 CLI 的 `auto`（只读展示）。

## 回滚

```bash
ls ~/.grok/config.toml.bak.*
cp ~/.grok/config.toml.bak.<ts> ~/.grok/config.toml
```

## 验收

1. Desktop 与 `grok mcp list` 列表一致  
2. 启停后终端再 `list` 同步  
3. `settings.json` 无平行 MCP 权威  
