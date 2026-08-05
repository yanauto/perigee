# 真机集成测试

> 需本机已安装并登录 Grok CLI（`~/.grok/bin/grok`）。

```bash
cd ~/projects/perigee/perigee-mac

# ACP 握手 / 审批等
GROK_INTEGRATION=1 pnpm --filter @perigee/app exec vitest run src/main/acp.integration.test.ts

# turn.summary + 写文件
GROK_INTEGRATION=1 pnpm --filter @perigee/app exec vitest run src/main/turn-summary.integration.test.ts

# 权限 ask 影子 HOME 见 permission-ask.md
```

未设 `GROK_INTEGRATION=1` 时相关用例 **skip**（非失败）。

## 原生模块

```bash
pnpm --filter @perigee/app run rebuild:native
# 或
./scripts/rebuild-native.sh
```

**pack 前**务必 rebuild node-pty，否则 PTY 档诚实降级。

## Subagent 面板手点

1. `pnpm dev`  
2. 让 agent 启动 subagent（或 `task` 工具）  
3. 打开「任务 / Subagent」应见原生条目  
