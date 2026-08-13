# 技术债登记（唯一真相源）

> 更新：2026-08-13 · **T015-meter / T018-cron / T018-missed 清偿后**  
> 非债边界见 ADR 0012（本地）。进度不进 git。

## 开放项

（无）

## 已清（v2.24 + 2026-08-13）

| ID | 项 | 处理 |
|----|-----|------|
| D-1…D-7 | 文档漂移 | ALIGNMENT/MEGA/API-gaps/CHANGELOG/会话/UI 文案 |
| T-1…T-4 | 类型/契约 | schema v3 测、diff 全量钉死、panes 类型 |
| R-1 | 聊天虚拟滚动 | ChatStream + `@tanstack/react-virtual` |
| R-2…R-4 | 集成/手册/pty | playbook + 工程手册 |
| P-1 | 浅色主题 | 可用 dark/light 切换 |
| P-2 | MD 代码高亮 | 已有 lightHighlight；文档确认 |
| P-3 | 侧栏过滤 | 状态筛选 UI |
| T015-meter | 工作轨道 per-tool 行增删/耗时 | renderer 从 unified diff 与 call/result 时间戳派生，不升 schema；`formatToolMeter` i18n |
| T018-cron | Routines cron 表达式 | 5 字段（分 时 日 月 周）；周 0 与 7 = 周日；编辑页可填 `expr` |
| T018-missed | 错过触发补跑 | 启动最多补跑一次；无 `lastFire` 不补跑（避免首次启用立刻开火） |

## 环境依赖（非开放债）

| 项 | 关闭方式 |
|----|----------|
| 真机 subagent 面板 | 用户手点 spawn；单测已覆盖映射 |
| `GROK_INTEGRATION=1` 集成测 | 见 `docs/playbooks/integration.md`（需本机登录 CLI） |
