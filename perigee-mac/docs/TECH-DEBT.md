# 技术债登记（唯一真相源）

> 更新：2026-08-01 · **v2.24 清偿后**  
> 非债边界见 ADR 0012 · 进度 `vitals proj now perigee`

## 开放项

| ID | 项 | 说明 |
|----|-----|------|
| T018-cron | Routines 不支持 cron 表达式 | T018 仅 daily/weekly/interval；产品以后要 cron 再开单 |
| T018-missed | 应用未开时错过的触发不补跑 | 启动只重算 nextRunAt；是否补跑需产品拍板 |
| T015-meter | 工作轨道 meter 缺 per-tool 行增删/耗时 | schema v3 tool 块无字段；需 schema 升版 + 引擎映射 + renderer，T021 明确不做，UI 批次后单独开单 |

## 已清（v2.24）

| ID | 项 | 处理 |
|----|-----|------|
| D-1…D-7 | 文档漂移 | ALIGNMENT/MEGA/API-gaps/CHANGELOG/会话/UI 文案 |
| T-1…T-4 | 类型/契约 | schema v3 测、diff 全量钉死、panes 类型 |
| R-1 | 聊天虚拟滚动 | ChatStream + `@tanstack/react-virtual` |
| R-2…R-4 | 集成/手册/pty | playbook + 工程手册 |
| P-1 | 浅色主题 | 可用 dark/light 切换 |
| P-2 | MD 代码高亮 | 已有 lightHighlight；文档确认 |
| P-3 | 侧栏过滤 | 状态筛选 UI |

## 环境依赖（非开放债）

| 项 | 关闭方式 |
|----|----------|
| 真机 subagent 面板 | 用户手点 spawn；单测已覆盖映射 |
| `GROK_INTEGRATION=1` 集成测 | 见 `docs/playbooks/integration.md`（需本机登录 CLI） |
