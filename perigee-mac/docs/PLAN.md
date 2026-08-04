# Perigee — 完整方案（一次到位）

> 版本：v1.0 · 2026-07-31  
> 依据：[`research/2026-07-31-desktop-gui-调研报告.md`](research/2026-07-31-desktop-gui-调研报告.md)  
> 约束：原生桌面窗 GUI · 非 web 标签 · 非 TUI 重做 · **需求满配**（步骤按验收关账，不按日历砍产品）  
> 状态：**§12 已拍板 · 阶段 0–8 能力已落地（v0.1 完整版 · 2026-07-31）**

---

## 1. 产品定义

### 1.1 一句话

**Perigee** = 跑在 macOS 上的 **Agent 编排台桌面应用**：人在 orchestrator 席，多会话并行驱动 Grok Build CLI；内置文件树、**Markdown 真阅读**、diff 审批、工具轨迹与终端视图。

### 1.2 成功标准（产品级）

| # | 标准 | 可验证方式 |
|---|------|------------|
| S1 | 纯桌面窗启动，Dock 有图标，**不依赖用户打开浏览器** | 双击/命令启动见独立窗口 |
| S2 | 打开本机工作区后，能跑完「读文件→改文件→展示 diff→人审应用」闭环 | 真机剧本 |
| S3 | md 长文在应用内可读（目录/高亮/宽排版），体感优于当前 mdreader 外挂路径 | 对照同一文件 |
| S4 | ≥2 会话并行，状态侧栏可辨（跑/等审/完成/错） | 双会话剧本 |
| S5 | 密钥不进仓库；危险写/外发默认人审 | 代码审查 + 配置默认值 |
| S6 | 与 Grok 引擎可替换边界清晰（换 adapter 不推翻 UI） | 架构单测/契约测试 |

### 1.3 非目标（写进宪法，防 drift）

- 不做浏览器主界面 / PWA 主路径  
- 不做 VS Code/Cursor 全量替代（不 fork 编辑器）  
- 不在 v1 重写完整自研 agent runtime（先适配现有 Grok Build/API）  
- 不做无人值守对外发言（守审批闸）  
- 不把 Flyby 浏览器自动化重写进 Desktop  

### 1.4 用户与场景

| 角色 | 场景 |
|------|------|
| 维护者（首发唯一用户 / 私器） | 日常用 Grok 干活：读 md 报告、改代码、并行调研与施工会话 |
| 未来可选 | 多引擎（Claude Code / 本地模型）同一壳——仅架构预留 |

---

## 2. 总体架构

```
                    ┌─────────────────────────────┐
                    │   OS（窗口·钥匙串·通知·文件）  │
                    └──────────────▲──────────────┘
                                   │
┌──────────────────────────────────┴──────────────────────────────────┐
│                     Desktop Shell（Electron 主进程）                   │
│  窗口生命周期 · 菜单 · 全局快捷键 · 通知 · 深链 · 自动更新(后期)       │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ IPC（严格白名单）
┌──────────────────────────────────┴──────────────────────────────────┐
│                     Renderer：Workbench UI（React）                   │
│  SessionRail · ChatStream · ToolCards · FileTree · MdReader · Diff   │
│  TerminalPane · ApprovalModal · Settings · LayoutEngine              │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ 仅经 preload 暴露的 Host API
┌──────────────────────────────────┴──────────────────────────────────┐
│                     Host Core（主进程 / 或 utility 进程）               │
│  SessionManager · EngineRouter · ApprovalGate · WorkspaceIndex       │
│  SecretStore · EventBus · TranscriptStore · McpHub                   │
└───────────┬──────────────────┬───────────────────┬──────────────────┘
            │                  │                   │
            ▼                  ▼                   ▼
     Engine Adapter      Tool Adapters        Integrations
     · GrokBuildAdapter  · FS / Git           · MCP servers
     · GrokApiAdapter    · Shell/PTY          · Flyby Bridge
     · (未来其它)        · PreviewProviders   · md-reader 协议
```

### 2.1 进程与信任边界

| 进程 | 权限 | 原则 |
|------|------|------|
| Renderer | 无 Node 直连 FS/网络随意权 | `contextIsolation: true`，仅 preload API |
| Main / Host | FS、子进程、钥匙串 | 所有危险操作过 ApprovalGate |
| Engine 子进程 | Grok CLI / agent | 工作目录限制在已信任 workspace（可扩展） |
| MCP / Flyby | 按配置 | 独立生命周期，UI 只显示状态与调用结果 |

### 2.2 事件模型（对齐 OpenHands 思想）

统一内部事件（JSON schema，版本化）：

```text
SessionEvent =
  | { type: "user.message", ... }
  | { type: "assistant.delta" | "assistant.message", ... }
  | { type: "tool.call" | "tool.result", ... }
  | { type: "approval.requested" | "approval.resolved", ... }
  | { type: "file.changed", path, kind }
  | { type: "session.status", status }
  | { type: "error", ... }
```

- UI **只订阅** EventBus 投影到视图模型  
- Transcript 落盘为 append-only jsonl + 可选导出 md  
- 便于回放、测试、换引擎

### 2.3 Engine Adapter 接口（稳定契约）

```text
interface AgentEngine {
  id: string
  startSession(opts: SessionStart): Promise<SessionHandle>
  send(sessionId, message: UserMessage): Promise<void>
  cancel(sessionId): Promise<void>
  // 引擎推事件 → Host EventBus
}
```

**v1 实现优先级**：

1. **GrokBuildAdapter** — spawn/管理本机 Grok Build（或官方等价 CLI），解析 stdout/协议流（以实际 Grok 可观测接口为准，落地前做探针工单）  
2. **GrokApiAdapter** — 若 CLI 协议不稳，用 xAI API + 本机 tool runtime（Host 侧执行工具）兜底  

两者可并存：设置里选引擎后端。

---

## 3. 技术栈锁定（建议拍板）

| 层 | 选择 | 理由 |
|----|------|------|
| 桌面壳 | **Electron**（近期 LTS 线） | 与 Claude Desktop / AiderDesk 同构；PTY/子进程/生态成熟 |
| 构建 | **electron-vite** + electron-builder | AiderDesk 同款路径，打包 macOS dmg/zip |
| 语言 | **TypeScript** 全栈 | 一人 + AI 交付效率；与既有 Flyby/插件 TS/JS 亲和 |
| UI | **React 19** + Vite | 复杂工作台组件生态 |
| 样式 | CSS Modules 或 Tailwind + **设计 token** | 暗色优先、高密度 |
| 组件基座 | Radix UI（无样式原语）+ 自研组件 | 漂亮可控，避免后台模板脸 |
| 布局 | 可拖拽 dock 方案（如 dockview 或同类） | 对标 Claude 多面板 |
| 编辑/Diff | **Monaco Editor** | diff + 代码编辑工业级 |
| Markdown | 自研面板：markdown-it 或 unified 管线 + highlight；可复用 md-reader 资源 | 痛点根治 |
| 终端 | node-pty + xterm.js | 集成终端 |
| 状态 | Zustand 或等价轻量 store + 事件投影 | 避免 Redux 过重 |
| 测试 | vitest（主进程/纯逻辑）+ Playwright/electron 冒烟 | 契约与关键路径 |
| 密钥 | keytar / electron safeStorage | 不进明文配置进 git |
| 日志 | 本地轮转日志目录，可开关 debug | 排障 |

**备选壳（不否决，作迁移出口）**：Tauri 2 — 若后续包体/内存成硬约束，Host 契约稳定后可换壳；**不双轨开工**。

**明确否决**：纯浏览器主 UX、VS Code fork、Flutter（与现有 TS agent 生态摩擦）、第一天全量 SwiftUI Workbench。

---

## 4. 信息架构与界面

### 4.1 默认布局（可拖拽持久化）

```
┌────────┬─────────────────────────────┬──────────────────┐
│Session │     Chat + Tool timeline     │  Context panel   │
│ Rail   │                             │  (tabs)          │
│        │                             │  Files | MD |     │
│ WS     │                             │  Diff | Terminal │
│ list   │                             │                  │
│        │─────────────────────────────│                  │
│        │     Composer（输入/模式）     │                  │
└────────┴─────────────────────────────┴──────────────────┘
```

### 4.2 核心界面模块

| 模块 | 职责 | 完整能力点 |
|------|------|------------|
| **SessionRail** | 会话与状态 | 新建/归档/重命名、状态点、未读审批角标、并行数 |
| **ChatStream** | 对话 | 流式、代码块、引用 chip、重试、分支（后期） |
| **ToolCards** | 工具 | 参数/结果折叠、耗时、跳转文件、失败重试展示 |
| **FileTree** | 工作区 | 搜索、忽略规则、打开、Reveal in Finder |
| **MdReaderPane** | md 阅读 | GFM、目录、锚点、字号、宽/窄、复制、在系统应用打开 |
| **DiffDesk** | 审改 | 文件列表、split/unified、Accept/Reject/Accept All 策略 |
| **TerminalPane** | 终端/输出 | 会话绑定 PTY、清理、复制 |
| **ApprovalModal** | 人审 | 危险命令/写盘/外网；记忆策略（本会话允许/总是询问） |
| **Settings** | 配置 | 引擎、模型、密钥、代理、信任目录、MCP、主题 |
| **CommandPalette** | 效率 | ⌘K 跳文件/命令/会话 |

### 4.3 视觉方向（「漂亮」可验收）

- 暗色默认；强调色克制（1 个 accent）  
- 排版：可读 md（行宽 ~72–88ch 可调）、代码等宽  
- 密度：接近 Claude/Linear，避免巨型 padding 后台风  
- 动效：仅状态与面板，不花哨  
- 空状态：第一次打开有「打开文件夹 / 最近工作区」引导  

视觉验收：固定 5 张截图清单（启动、双会话、md 阅读、diff 审批、设置）进 `docs/assets/` 对照。

---

## 5. 模块与仓内目录（目标结构）

```text
perigee/
  README.md
  docs/
    CONSTITUTION.md
    PLAN.md
    research/
    decisions/
    architecture/          # 细化序列图、事件 schema
  apps/
    desktop/               # Electron 主应用
      src/
        main/              # Shell + Host Core
        preload/
        renderer/          # React Workbench
      electron.vite.config.ts
      package.json
  packages/
    event-schema/          # 共享事件类型与 zod/校验
    engine-protocol/       # AgentEngine 接口
    engine-grok-build/     # GrokBuildAdapter
    engine-grok-api/       # 可选 API 适配
    md-core/               # md 渲染管线（可被测试）
    host-core/             # 可单测的 Session/Approval 逻辑
  scripts/
    doctor.sh
    dev.sh
  resources/               # 图标、entitlements
```

Monorepo（pnpm workspace 推荐）方便契约包共享。

---

## 6. 与既有系统的接合

| 系统 | 接合方式 |
|------|----------|
| **Grok Build** | 主引擎适配；设置里配置 binary 路径与默认 flags |
| **grok-md-reader** | ① 应用内 MdReaderPane 取代「必须外挂才好看」；② 保留/兼容 `open` 协议与资源；③ 插件在无 Desktop 时仍可 fallback |
| **Flyby** | MCP 或 HTTP Bridge 状态面板；工具结果在 ToolCards 展示 |
| **Vitals / 慧** | 产品文档与灵感 #25 关联；运行时不强依赖 Vitals |
| **钥匙与代理** | 遵守本机代理习惯；密钥 ask 级，不进 git |

---

## 7. 安全与膜

| 主题 | 策略 |
|------|------|
| 密钥 | OS 安全存储；UI 只显示「已配置」 |
| Workspace 信任 | 首次打开目录确认；未信任则只读模式 |
| 写盘 | 默认 diff 后应用；可选 auto-apply 仅限受信目录且显式打开 |
| Shell | 高危模式列表（rm -rf、curl\|sh 等）强制审批 |
| 外发（X/邮件等） | 默认禁用；若接工具必须人审（审批闸） |
| 更新 | 后期；签名公证走 macOS 常规 |
| 遥测 | 默认关闭；无私自上传代码 |

---

## 8. 数据与持久化

| 数据 | 位置 | 说明 |
|------|------|------|
| 工作区列表/布局 | `~/Library/Application Support/Perigee/` | JSON |
| 会话 transcript | 每 session 目录 jsonl | 可导出 |
| 设置 | 同上 + 密钥在 keychain | |
| 缓存索引 | 可选 sqlite | 文件搜索加速 |
| 日志 | logs/ 轮转 | |

**不**把用户仓库内容默认复制进 App Support（除会话中 agent 产物引用路径）。

---

## 9. 施工阶段（步骤 + 验收 · 满配路径）

> 原则：每阶段交付 **可运行增量**，但 **架构与模块边界按完整产品一次铺好**；禁止「以后再拆 Host」式欠债。  
> 不出现「第 N 周」预算。

### 阶段 0 · 立项冻结 — ✅ 2026-07-31

**做**：拍板 §12；建 monorepo 脚手架；事件 schema 包；doctor 脚本。  
**验收**：`pnpm install && pnpm dev` 弹出空壳窗口；README 启动三步有效。  
**证据**：doctor 13 ok；unit 3 绿；`electron-vite build` 成功；冒烟含 Electron Renderer。

### 阶段 1 · Shell + Host 骨架 — ✅ 并入阶段 0（2026-07-31）

**做**：Electron 安全默认；preload API 白名单；SessionManager；EventBus；打开文件夹 → workspace 记录；Stub 会话。  
**验收**：打开/关闭工作区；最近列表持久化；Renderer 无 require（侧栏探针）。

### 阶段 2 · 引擎接通（垂直闭环） — ✅

**做**：GrokBuildAdapter（或 API 适配器）最小通路；用户消息 → 流式事件 → ChatStream；取消生成。  
**验收**：对真实工作区完成一次「问答 + 至少一次读文件工具」并在 UI 展示工具卡。

### 阶段 3 · 文件树 + Md 一等阅读 — ✅

**做**：FileTree；MdReaderPane（GFM/高亮/目录）；路径 chip 点击打开；拖入 md。  
**验收**：打开本仓 `PLAN.md` 阅读体验达标（对照清单）；从工具结果点击路径直达。

### 阶段 4 · Diff 审批写盘 — ✅

**做**：解析引擎文件变更 → DiffDesk；Accept/Reject；写盘经 ApprovalGate。  
**验收**：agent 改文件后，人审应用与拒绝均可；拒绝后磁盘与展示一致。

### 阶段 5 · 并行会话 + 布局持久化 — ✅

**做**：多 session；状态点；布局拖拽存盘；通知「等待审批」。  
**验收**：S4；杀进程重启布局与会话列表恢复（transcript 在）。

### 阶段 6 · 终端 + 命令面板 + 打磨 — ✅

**做**：PTY 面板；⌘K；快捷键；空状态；主题；错误边界。  
**验收**：截图清单 5 张；doctor 全绿。

### 阶段 7 · 集成扩展面 — ✅

**做**：MCP 配置 UI；Flyby 状态；与 md-reader 协议兼容；导出会话。  
**验收**：挂一个 MCP 或 Flyby ping 在设置页可见；导出 md 可打开。

### 阶段 8 · 打包分发（私器） — ✅

**做**：electron-builder macOS arm64；图标；dmg/zip；公证按需。  
**验收**：干净机器（或另一用户目录）安装后 S1–S5 剧本通过。

### 后续增强（完整蓝图内，不挡主线）

- 第二引擎 adapter  
- PDF/HTML PreviewProvider  
- 会话分支 / 时间旅行  
- 自动更新  
- Tauri 壳迁移评估  
- Linux/Windows  

---

## 10. 测试与质量

| 层 | 内容 |
|----|------|
| 契约 | event-schema / engine-protocol 单测 |
| Host | Session 状态机、Approval 策略表驱动测试 |
| md-core | 固件样例 md 渲染快照 |
| 冒烟 | 启动、开工作区、发消息 mock 引擎 |
| 真机剧本 | §1.2 S1–S5 清单（docs/playbooks/） |
| 回归 | 每次改 IPC 必跑安全配置检查（无 nodeIntegration 等） |

---

## 11. 风险登记与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Grok Build 无稳定机器协议 | 引擎难包 | 先做协议探针工单；API+Host tools 双路径 |
| Electron 内存 | 体验 | 单窗多会话共享；限制重 WebView 数；后期可评估 Tauri |
| md 渲染 XSS | 安全 | 消毒、禁用裸 HTML 或沙箱 |
| 与 TUI 双线维护 | 精力 | Desktop 为体验主路径；TUI 不强制功能对等 |
| 范围膨胀成 IDE | 失败 | 宪法非目标；Monaco 轻量，不接扩展市场 |

---

## 12. 待维护者拍板（开工闸门）

| # | 议题 | 建议 | 你的选择 |
|---|------|------|----------|
| P1 | 桌面壳 | **Electron** | |
| P2 | 首发引擎 | **优先 Grok Build 适配，API 兜底** | |
| P3 | 包名/显示名 | Perigee / `com.yanauto.perigee` | |
| P4 | 与 md-reader | **能力内化进 Desktop**，插件保留 fallback | |
| P5 | 开源与否 | 先私器（同 Flyby A 阶段），方案按可开源结构写 | |
| P6 | 是否现在闸门开工脚手架 | 拍板后阶段 0 | |

---

## 13. 下一步（拍板后立刻）

1. 你回复 §12 拍板（可「全部按建议」）  
2. 灵感 #25 → incubate/go（你点头后）  
3. 阶段 0：monorepo + 空壳窗口 + 事件包  
4. 并行：Grok Build 可观测协议探针（只读调研，出 `docs/decisions/`）  

---

## 14. 验收剧本（完整产品级 · 摘要）

**剧本 A · 阅读**  
打开含长 md 的仓库 → 会话中 agent 写出报告路径 → 点击 chip → MdReaderPane 阅读 → 满意。

**剧本 B · 施工**  
「给 README 加一节」→ 见工具与 diff → Reject 一次再 Accept → git status 符合预期。

**剧本 C · 编排**  
两会话分别跑不同任务 → 侧栏状态正确 → 其一等审批时通知 → 处理后继续。

**剧本 D · 安全**  
未配置密钥时明确提示；尝试高危命令弹出审批；取消则不执行。

---

*本方案与调研报告一并构成开工前基线；拍板后变更走 `docs/decisions/`。*
