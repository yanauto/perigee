# Perigee Mac · Desktop CU 持续探查日志

> **用途**：explore → find → fix → verify 闭环的本地真相源。每轮含：操作、发现、改动/优化、回验、下一轮计划。  
> **范围**：仅 mac（`perigee-mac`）。  
> **开始**：2026-08-06（北京时间）  
> **操控**：Desktop Computer Use MCP（desktop-cu 1.2.0）  
> **双落点**：sessions 目录被 hub gitignore 忽略；可跟踪主副本见仓根 `perigee-mac/DESKTOP-CU-LOOP.md`（内容同步）。

---

## Bootstrap

| 项 | 结果 |
|---|---|
| 时间 | 2026-08-06 ~18:54 CST |
| `desktop_status` | version 1.2.0；screen_recording/accessibility/input_monitoring true；gate normal；single_instance false（空闲） |
| `desktop_doctor` | ok: true |
| 启动方式 | `pnpm dev` @ `perigee-mac`（开发版，便于修码 HMR 回验） |
| 备选 | `/Applications/Perigee.app` 已装，本会话优先 dev |
| 工作日志 | 本文件 |
| 证据目录 | goal scratch：`{SCRATCH}`（截图/测试输出） |

---

## Cycle 1

### 1.1 操作（explore）

1. Desktop CU `status`/`doctor` 绿；`pnpm dev` 起 Electron 窗标题 **Perigee**。
2. 前置窗体（一度误点红绿灯导致窗不在屏上，用 AX 移回并前置）。
3. 主页：Good evening、用量卡 Overview、侧栏会话列表、Composer（Bypass / grok-4.5 / Medium）、worktree chip。
4. 首页粘贴发送：`Reply with exactly: pong` → 乐观切页 → 助手回复 **pong**；侧栏新会话标题同文案。
5. `⌘,` 设置：General / 权限档 / worktree isolation 开 / MCP connectors（desktop-cu 与 grok-computer-use 均 Enabled）。
6. 侧栏 **Routines** 空态可用；**MCP** 深链设置。
7. **复现双焦点**：在已选会话时点进 Routines → 主栏是 Routines，侧栏会话行仍 `is-active` 高亮。

截图（artifacts）：`capture_20260806_185601_617.jpg`（主页）、`…190054_684.jpg`（pong 对话）、`…191127_706.jpg`（修后 Routines 无会话高亮）。

### 1.2 发现

| 级 | ID | 描述 |
|---|---|---|
| **P1** | C1-dual-focus | Routines 打开时主栏非对话，侧栏仍高亮当前会话 → 双导航焦点，误导「当前在哪」 |
| P2 | C1-menu-electron | dev 下菜单栏名显示 Electron（包名，可接受） |
| P2 | C1-worktree-default | 设置 worktree isolation 默认开；首页 chip 易与输入区误触（操作笔记） |
| 笔记 | C1-perm-slip | 探查时误点权限档 Ask；本轮末已用 Shift+Tab 恢复 Bypass |

### 1.3 改动 / 优化

| 文件 | 改动 |
|---|---|
| `apps/desktop/src/renderer/src/components/Sidebar/session-row-active.ts` | **新增**纯函数 `sessionRowLooksActive(sessionId, activeSessionId, routinesActive)` |
| `apps/desktop/src/renderer/src/components/Sidebar/session-row-active.test.ts` | 单测：非 Routines 高亮当前会话；Routines 打开一律 false |
| `apps/desktop/src/renderer/src/components/Sidebar/Sidebar.tsx` | `active={sessionRowLooksActive(...)}` 替代裸 `id === activeSessionId` |

**为何**：保留 `activeSessionId`（点会话仍可 `selectSession` 退出 Routines），只改视觉，避免双焦点。

### 1.4 回验

1. 单元测试：`vitest run …/session-row-active.test.ts` → **2 passed**（日志见 scratch `session-row-active-test.log`）。
2. HMR 后 Desktop CU：开 Routines → 会话行**无**选中底；点会话 → 回对话流且会话再高亮。  
   - 证据：`c1-routines-no-session-highlight.jpg`、`c1-session-back-highlighted.jpg`（scratch）。
3. `desktop_session_end`：见文末控制段收口。

### 1.5 下一轮计划

1. 修探查中误改的权限档（恢复 Bypass）。  
2. 探 ⌘K 面板 / 侧栏搜索文案是否与真实能力一致。  
3. 会话 ⋮ 菜单、首页 Models、空发送等。  
4. 有明确 UX/文案问题则立刻改并回验。

---

## Cycle 2

### 2.1 操作（explore）

1. 设置 General 尝试点 Bypass（坐标易偏）；Composer 内 **Shift+Tab** 三轮成功恢复 **Bypass**。
2. 会话行 ⋮ 点击坐标未稳定打开菜单（记为操作难点，非本轮修）。
3. **⌘K** 打开命令面板：标题 *Search commands, sessions, files…*；含 New session / Open workspace / Close workspace（cwd=`…/my/60-media`）/ Settings 等。
4. 对照侧栏搜索钮文案：**Search sessions…**（仅会话）与面板全量能力不一致。

### 2.2 发现

| 级 | ID | 描述 |
|---|---|---|
| **P1** | C2-search-label | 侧栏 `搜索会话…` / Search sessions… 实际 `setPaletteOpen(true)` → 全量命令面板；注释已写「统一入口」但文案仍写会话-only，误导发现能力 |

### 2.3 改动 / 优化

| 文件 | 改动 |
|---|---|
| `apps/desktop/src/renderer/src/components/Sidebar/Sidebar.tsx` | 搜索占位改为 `t('搜索命令、会话、文件…')`（与 `Palette.tsx` placeholder 同一 i18n 键） |

`en.ts` 已有该键 → `"Search commands, sessions, files…"`，无需新译文。旧键 `搜索会话…` 仍留表内（无引用，非本轮清理范围）。

### 2.4 回验

1. HMR：`hmr update Sidebar.tsx`。  
2. Desktop CU 截屏：侧栏显示 **Search commands, sessions…**（截断属窄栏正常）。  
   - artifacts：`capture_20260806_191734_723.jpg`；scratch 复制 `c2-search-label.jpg`。
3. 原路径：⌘K 面板文案与侧栏占位语义一致。

### 2.5 下一轮计划

1. 会话 ⋮ 菜单（重命名/归档/删除本轮测试会话「Reply with exactly: pong」）路径走通。  
2. 首页 Models 页签与用量 7d/30d 切换。  
3. 文件树打开 md、MD 阅读体验。  
4. 空 Composer 发送 / 流式中 Enter 是否仍被 canSubmit 挡住（人感确认）。  
5. 有缺陷继续改；无则记优化点入日志继续扫。

---

## Cycle 3

### 3.1 操作（explore）

1. `⌘I` 打开上下文面板；点开 `drafts/…-rewiring…md` → **MD 预览**正常（标题/引用块/正文）。
2. `⌘N` 回首页；空草稿点发送 → **不建会话**（仍 18 条列表），`canSubmit` 挡空发 OK。
3. 用量卡 **模型** tab + 范围段控；图表有 grok-4.5 / other 分解。
4. 观察 C2 全文案「Search commands, sessions…」在窄侧栏**严重截断**。

### 3.2 发现

| 级 | ID | 描述 |
|---|---|---|
| **P2→修** | C3-search-truncate | 侧栏宽放不下「搜索命令、会话、文件…」整句，英文更糟；能力说明应进 tip，行内用短占位 |
| 笔记 | C3-md-ok | 文件树打开 md 预览链路正常 |
| 笔记 | C3-empty-send-ok | 首页空发送被 disabled/`canSubmit` 挡住 |
| 笔记 | C3-lang-hmr | HMR/重挂后界面一度回到中文默认（「晚上好」「搜索…」「放行」）；疑语言持久化与热更边界，**未本轮改**（需复现） |

### 3.3 改动 / 优化

| 文件 | 改动 |
|---|---|
| `Sidebar.tsx` | 搜索钮：行内 `t('搜索…')`；`data-tip` + `aria-label` = 完整「搜索命令、会话、文件… · ⌘K」 |
| `i18n/en.ts` | 增 `"搜索…": "Search…"` |

### 3.4 回验

1. `vitest`：`en.test.ts` + `session-row-active.test.ts` → **5 passed**（`c3-tests.log`）。
2. Desktop CU：侧栏显示 **搜索…**（中文态）/ 短占位，不再撑破；artifacts `capture_20260806_192643_916.jpg`；scratch `c3-search-short.jpg`。

### 3.5 下一轮计划

1. 复现 **语言是否在 HMR/重挂后丢失**（读 uiState / localStorage 键）。  
2. 会话 ⋮ 菜单稳定打开（归档/删除测试会话 pong）。  
3. Models **7d** 柱数是否真为 7（本轮点击坐标可疑，需再验）。  
4. 首页 worktree 默认开时的可发现性/误触（可选 chip 间距）。

---

## 控制段纪律

| 段 | status/doctor | session_end |
|---|---|---|
| Bootstrap | 绿 | 未占租约至 capture |
| Cycle1–3 控桌 | 持租约期间有 capture/click | **文末调用** `desktop_session_end` |

---

## 代码变更清单（截至 Cycle 3）

```
apps/desktop/src/renderer/src/components/Sidebar/session-row-active.ts          (new)
apps/desktop/src/renderer/src/components/Sidebar/session-row-active.test.ts     (new)
apps/desktop/src/renderer/src/components/Sidebar/Sidebar.tsx                    (active + search short+tip)
apps/desktop/src/renderer/src/i18n/en.ts                                        (搜索…)
docs/sessions/2026-08-06-desktop-cu-continuous.md                              (本日志)
```

**未动**：`perigee-win`、hub 产品源码、`vendor/grok-build`、未 commit/push。
