# 后端验收剧本（波次 1–5）

> 2026-07-31 起有**自动化真机集成测试**（覆盖本剧本 headless/ACP 主链路）：
> `GROK_INTEGRATION=1 pnpm --filter @perigee/app exec vitest run src/main/turn-summary.integration.test.ts src/main/acp.integration.test.ts`
> 以下保留为手点补充验收。

## 环境

```bash
cd projects/perigee/perigee-mac
pnpm install
pnpm run doctor
pnpm test
pnpm --filter @perigee/app run typecheck
pnpm dev
```

## Headless

1. 设置 `engineMode=headless`（或 acp 失败自动 fallback）  
2. 打开工作区 → 新建会话 → 发「你好」  
3. 应有流式/完整回复  
4. 取消一次进行中的回合，无僵尸 `grok` 进程  

## ACP

1. 设置 `engineMode=acp`  
2. 新建会话（会起 `grok agent stdio`）  
3. 连发两条消息，活动监视器中 **同一子进程** 持续存活  
4. `getInfo` 显示 `engineModeActual: acp`  

## Diff / 权限

1. 让 agent 改嵌套路径文件 → Diff 出现 pending  
2. 拒绝 → 文件还原  
3. `permissionPolicy=ask` 时工具审批出现 pending（若触发 request_permission）  

## 恢复 / 诊断

1. 建会话后退出 App，再开 → 会话列表元数据仍在  
2. 命令面板/设置触发诊断导出 → 目录无 token/密钥  
