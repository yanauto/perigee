# 权限四档剧本（Ask / Accept edits / Plan / Yolo）

> 对齐 CCD-MEGA §12.2 / §12.2b · Desktop `permissionPolicy`  
> 真·人在回路请用 **ACP** 引擎（`engineMode=acp`）。

## 策略矩阵

| permissionPolicy | client FS 写 | request_permission（Host 兜底） | CCD 对照 |
|------------------|--------------|----------------------------------|----------|
| **`ask`**（默认） | 升格人审 | 一律 pending → UI | Manual |
| **`accept_edits`** | 静默写 | 源码写/常见 FS auto；危险 shell **pending**；只读 allow | Accept edits |
| **`plan`** | **硬拒** | 写 deny；危险 deny；只读 allow；其它 shell pending | Plan |
| **`yolo`** | 静默写 | 全 allow（optionId 用引擎 options） | Bypass |

危险 shell 启发式示例：`rm -rf`、`git push --force`、`curl | sh`。  
常见 FS：`mkdir` / `touch` / `mv` / `cp`（不含 `npm install`）。

## 设置入口

1. **发送区旁** 四态分段（询问 / 改文件 / 计划 / 放行）  
2. **设置面板** → 权限模式  
3. API：`settings.permissionPolicy`；`alwaysApproveTools` 仅与 yolo 同步  
4. 热切：ACP 下 `session/set_mode`（plan/ask/default）；失败顶栏 banner

## 可复跑：触发 ask 审批（影子 HOME）

本机 CLI 若 `permission_mode = "always-approve"`，引擎侧可能不发 permission。不改真配置：

```bash
T=$(mktemp -d /tmp/grok-home-XXXX); mkdir "$T/.grok"
for f in ~/.grok/*; do ln -s "$f" "$T/.grok/"; done
rm -f "$T/.grok/config.toml"
sed 's/permission_mode = "always-approve"/permission_mode = "ask"/' ~/.grok/config.toml > "$T/.grok/config.toml"
cd apps/desktop && HOME=$T GROK_INTEGRATION=1 ./node_modules/.bin/vitest run src/main/acp.integration.test.ts -t "审批"
```

## 手点清单（四档）

| 档 | 步骤 | 期望 |
|----|------|------|
| ask | 让 agent 写文件 | 审批卡出现；拒绝则不落盘 |
| accept_edits | 写普通源码 | 无卡或自动过；`rm -rf` 类仍应 pending（risk=high） |
| plan | 要求改源码 | client 写拒；时间线出现「权限拒绝」system 条 |
| yolo | 任意工具 | 无人审（事后 Diff 审） |

## 额外闸门（v2.22）

| 项 | 期望 |
|----|------|
| path-guard | agent 写 `../` 或绝对路径出工作区 → 失败 + host_deny |
| UI 人手 ⌘S | plan 下仍可保存（只闸 agent client 写） |
| 危险 shell | ask/accept_edits 下审批卡 risk 为高 |

## 坑（已修，勿回退）

- 审批回写 **必须** 用对方 `optionId`（`pickAllowOptionId`），禁硬编码 `'allow'`。  
- 仅改权限不得重建 ACP 子进程（热会话）。  
- `accept_edits` **不是** 全工具 auto（§12.2b 分类器）。
