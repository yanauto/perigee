# Renderer（前端主战场）

本目录 = **允许整页推倒重做的 UI**。当前为 **v3「Grok CLI 应用层」**（T004，2026-08-01）：

- v1：原型 → Linear/Claude 方向整页重做（`docs/design/CHANGELOG-ui.md`）
- v2：产品重定位 Agent 审查台（已作废，ADR-0013）
- **v3：应用层叙事（驾驶舱）**——规格 `docs/design/V3-设计纲领.md`，手测 `docs/playbooks/v3-smoke.md`

- API：`docs/API-preload.md` · 类型 `src/lib/perigee-api.ts`
- 入口：`src/main.tsx` → `App.tsx`

**不要**从这里去改 `../main` 或 `../preload`（后端改动走独立授权/工单）。

## 产品模型（v3）

**人每天和 Grok 结对干活的驾驶舱**：GUI 每一步必须比 CLI 更省事。

- 中栏 = 对话流（绝对主角）：轮次轻量分隔（细线）、工具默认单行摘要点击展开、思考流式自动展开
- 左栏 = 工作区 + 会话列表（搜索、状态分组；CLI 会话区 feature-detect「桥接中」）
- 右栏 = **单实例上下文面板**（文件树/编辑器/Diff 互斥 tab，同一时刻只有一个文件视图）
- 底部 = 终端抽屉（⌘`）；⌘K = 统一命令面板（命令/Slash/会话/文件一个模糊入口）

## 结构

```text
src/
  main.tsx · App.tsx          # 壳：三栏 + 终端抽屉 + 键盘流总线 + 主题
  state/
    useWorkbench.ts           # window.perigee 订阅与状态总线（v2 沿用，事件接线不动）
    keymap.ts                 # 全局键盘流（⌘K ⌘N ⌘1-9 ⌘M ⌘` Esc）
    features.ts               # T005 桥 feature-detect（未就绪置灰「桥接中」）
    prompt-history.ts         # ↑ 提示词历史（按会话 localStorage，含测试）
    palette-items.ts          # ⌘K 数据层：四类聚合 + 子序列模糊（含测试）
    session-order.ts          # 会话分组/排序（侧栏顺序 = ⌘1-9 顺序）
  lib/
    perigee-api.ts       # API 类型镜像（事件 v3，勿与契约冲突）
    session-reducer.ts        # SessionEvent → ChatBlock 归约器（T001 流式红线，含测试）
    markdown.ts · paths.ts · format.ts · types.ts · filetree.ts · file-buffer.ts
    diff-stats.ts · diff-comments.ts · mention.ts · attachments.ts · slash.ts
    tasks-from-events.ts · tasks-from-blocks.ts · review-prompt.ts · side-chat.ts
  components/
    ui/                       # Icon / IconButton（强制 tooltip）/ Button / EmptyState / StatusDot / Switch
    Sidebar/                  # 工作区卡 + 会话分组列表 + CLI 会话桥接区
    Chat/                     # ChatStream（虚拟滚动+粘底）/ Message / ToolRow / ThoughtBlock
                              # / PlanBlock / ApprovalCard / TurnSummary
    Composer/                 # 输入区：slash 菜单 / @mention / 附件 / ↑ 历史 / Shift+Tab 权限 / 模型 chip
    ContextPanel/             # 右栏单实例：FilesView / DiffView / ToolDetail / PreviewView
    TerminalDrawer/           # 底部终端抽屉（xterm PTY / shell-c / echo 三模）
    Palette/                  # ⌘K 统一命令面板
    Modals/                   # Settings / Shortcuts / Tasks / SideChat / ModelPicker
    editor/                   # CodeMirror FileEditor 封装
  styles/global.css           # v3 token 体系（暗/浅同构；accent 冷调蓝；三态与动效内置）
```

## 约定

- 能力只走 `window.perigee`；渲染进程禁止 `require('fs')` 等 Node API。
- 新增 UI 状态优先挂 `useWorkbench`，不要在组件里各自订阅 IPC。
- 消息流新块类型：先扩 `lib/types.ts` 的 `ChatBlock`，再在 `session-reducer.ts` 归约。
- 视觉纪律：单一 accent（`--accent`）贯穿主按钮/焦点环/选中态/链接；语义色只做状态点与小徽标；禁止大面积纯黑。
- 三态铁律：一切可交互元素 hover/active/focus-visible 齐全；图标钮必须 tooltip（用 `ui/IconButton`，tip 必填）。
- T005 桥未就绪能力：`state/features.ts` 探测，置灰标「桥接中」，不做假按钮。
- 测试：`pnpm --filter @perigee/app run test`。
