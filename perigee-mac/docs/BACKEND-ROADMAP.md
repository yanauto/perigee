# Perigee · 后端完整施工方案（产品经理视角）

> 版本：1.1 · 2026-07-31  
> 产品：长期使用的 Agent 编排台桌面 App  
> 约束：Kimi 负责 renderer UI；本方案只覆盖 **Host / 引擎 / 契约 / 数据 / 质量 / 迭代机制**  
> 技术依据：`vendor/grok-build` @ dd04f39 · 现有 `docs/BACKEND-ADAPTATION.md` · 宪法 C1–C8  
> 结构单位：**能力波次 + 验收**（不写日历工期）  
> **实施状态：波次 0–5 已落地（2026-07-31）** · Leader 完整实现见 ADR 0005 延后

---

## 1. 产品定位（后端要服务什么）

### 1.1 一句话

**Perigee 后端** = 把「本机 Grok Build runtime」变成 **可编排、可审计、可恢复、可迭代** 的桌面 Host——不是脚本包一层，也不是重写 agent。

### 1.2 用户故事（后端可验证）

| ID | 故事 | 后端责任 |
|----|------|----------|
| U1 | 打开工作区，多开会话并行干活 | 会话/进程生命周期、状态机 |
| U2 | 看清 Grok 在读/写/跑什么 | 完整工具与流式事件投影 |
| U3 | 危险操作能拦、写盘能审 | 权限闸 + Diff 真相源 |
| U4 | 杀进程/崩溃后能续 | 会话持久化、resume、崩溃恢复 |
| U5 | 前端换皮不影响能力 | 稳定 IPC + 版本化事件契约 |
| U6 | 上游 Grok CLI 升级不炸 | 引擎适配隔离、协议探针、回退路径 |
| U7 | 自己天天用得住 | 可观测、可诊断、配置与密钥安全 |

### 1.3 成功标准（产品级，后端视角）

| 代号 | 标准 | 可验证 |
|------|------|--------|
| P-S1 | 同会话连续对话 **不** 每条消息冷启完整 agent | 进程 PID/启动日志 |
| P-S2 | 工具轨迹完整可回放 | transcript jsonl 含 tool 全链路 |
| P-S3 | 嵌套路径改文件 Diff 可接受/拒绝还原 | 真机剧本 |
| P-S4 | 非 always 模式下权限可人审 | 关 auto 后拦一次 |
| P-S5 | 取消 turn 后状态一致、无僵尸进程 | cancel 剧本 |
| P-S6 | 未登录/限流/路径越界有结构化错误 | 错误码表 |
| P-S7 | `event-schema` 有版本；前后端契约单测 | CI/本地 vitest |
| P-S8 | 上游 CLI 小版本升级：探针 + 适配层可只改一处 | 同步脚本 + fixture |

### 1.4 非目标（防止范围爆炸）

- 不重写 Grok agent loop / 不 fork vendor 业务逻辑  
- 不做云端多租户、协作账号体系（私器优先）  
- 不替代 Cursor/VS Code 全量编辑器  
- 不把 GCU 浏览器自动化重做进 Desktop（MCP 接入即可）  
- 不负责 UI 观感（Kimi）  
- 第一波不做 Windows/Linux 完美（架构预留即可）

---

## 2. 现状诚实评估

| 层 | 现状 | 产品判断 |
|----|------|----------|
| Electron Host + IPC + preload CJS | 可用 | **保留**，加固契约与错误面 |
| Session/EventBus/Transcript/Settings | 骨架有 | **加深**，对齐长期会话模型 |
| FS 守卫 + Diff | 能用但糙 | **必须打磨**（可信写盘审） |
| 引擎 `grok -p` + streaming-json | 原型 | **过渡层**，非终态 |
| 引擎 `grok agent stdio` ACP | 无 | **产品终态主路径** |
| 权限 ACP 闭环 | 无（always-approve 权宜） | **必须上** |
| 观测/诊断 | 弱 | 长期使用刚需 |
| 记忆框架/文档 | 已装 | 继续用 proj + ADR 迭代 |

**产品经理判断**：当前是 **MVP 原型**，距离「长期使用」差在 **进程模型、协议、可信写盘、恢复与可维护性**，不差在再堆几个 IPC。

---

## 3. 产品原则（后端设计宪法）

1. **Runtime 外置，Host 编排**  
   Grok Build 是引擎；我们是客户端 Host。不重复造 agent。

2. **契约先于实现**  
   `event-schema` / preload API / 错误码 **版本化**；Kimi 与后端靠契约并行。

3. **一种主路径，一条逃生舱**  
   - 主路径：`grok agent stdio`（ACP 长连接）  
   - 逃生：`grok -p` streaming-json（探针、降级、无 ACP 环境）

4. **人在回路是默认，不是插件**  
   写盘与危险工具：权限闸 + Diff 双保险；审批闸适用外发类能力。

5. **可恢复 > 炫技**  
   崩溃、杀 App、升级 CLI：会话与工作区状态可续。

6. **可观测默认打开（私器）**  
   本地日志 + 可选诊断导出；默认不上报遥测。

7. **小模块、深接口**  
   packages 边界清晰：protocol / engine / host / schema；换引擎不推翻 Host。

8. **迭代可回滚**  
   每波能力 feature flag 或 settings 开关；主路径挂了能切回 `-p`。

---

## 4. 目标架构（长期形态）

```text
┌──────────────────────────────────────────────────────────┐
│  Renderer (Kimi)  —— 只消费 window.perigee           │
└────────────────────────────┬─────────────────────────────┘
                             │ IPC（版本化、白名单）
┌────────────────────────────▼─────────────────────────────┐
│  Shell (Electron main)                                   │
│  窗口/菜单/通知/深链/全局快捷键/userData 路径             │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│  Host Core（可单测）                                       │
│  Workspace · SessionRegistry · EventBus · Transcript     │
│  DiffTruth · ApprovalGate · Settings · Diagnostics       │
│  ProcessSupervisor（子进程生命周期）                       │
└───────────┬───────────────────────────────┬──────────────┘
            │                               │
            ▼                               ▼
   EngineRouter                      Integrations
   · GrokAcpEngine (主)              · MCP 状态
   · GrokHeadlessEngine (-p 降级)    · GCU Bridge 探测
   · StubEngine (测)                 · 未来其它引擎
            │
            ▼
   grok agent stdio  |  grok -p streaming-json
   (vendor 只读对照)
```

### 4.1 模块职责（可维护边界）

| 包/模块 | 职责 | 禁止 |
|---------|------|------|
| `event-schema` | 事件/错误码/版本 | UI 逻辑 |
| `engine-protocol` | AgentEngine 接口 | 具体 spawn |
| `engine-grok-acp`（新建） | stdio ACP 客户端 | Host 业务 |
| `engine-grok-build`（现有） | `-p` 降级适配 | 扩张成上帝类 |
| `host-core` | 会话/Diff/审批/工作区 | 直接画 UI |
| `main` | 组装 + IPC 暴露 | 堆业务细节 |
| `preload` | CJS 桥 | 业务计算 |
| `md-core` | md 渲染纯函数 | I/O 随意 |

### 4.2 会话与进程模型（产品决策）

**默认策略（推荐拍板）：**

- **一 Desktop 会话（UI session）↔ 一 `grok agent stdio` 子进程**  
  - 简单、隔离好、易 cancel、易排障  
  - 并行 N 会话 = N 进程（可接受，后续再 leader 优化）

**后置优化：**

- Workspace 级 leader / 多 session 共享进程（省内存，复杂度高）

### 4.3 写盘信任模型（产品决策）

| 模式 | 行为 | 默认 |
|------|------|------|
| **Trust+Ask** | 工具执行走 ACP 权限；写后仍进 Diff 可拒还 | 推荐默认 |
| **Yolo+Review** | always-approve 执行；仅 Diff 事后审 | 现原型 |
| **Plan/Read-only** | 禁止写盘工具（若引擎支持） | 可选 |

长期产品默认：**Trust+Ask**；设置可切 Yolo。

---

## 5. 能力地图（后端 backlog，满配）

### 5.1 核心编排

- 工作区信任打开 / 最近列表 / 关闭  
- 会话 CRUD、状态机、并行  
- 发送 / 流式投影 / 取消 turn  
- 子 agent 可见性（若 ACP 暴露）  
- 计划模式开关投影  

### 5.2 真相与审批

- 路径级 captureBefore（按 tool locations）  
- Diff pending/accept/reject/all  
- 删除/新建文件语义正确  
- ApprovalGate 与 ACP permission 对齐  
- 外发类工具默认拒绝或强制人审（审批闸）  

### 5.3 持久化与恢复

- transcript jsonl（已有加强）  
- UI session ↔ Grok sessionId 映射  
- App 重启后：最近工作区 + 会话列表 + 可续聊  
- 导出 Markdown（已有）  

### 5.4 配置与安全

- 引擎模式、模型、maxTurns、permission 策略  
- grok 二进制路径探测与自检  
- 密钥不进仓（用本机 `~/.grok`）  
- path-guard 全路径强制  
- preload 保持 CJS  

### 5.5 集成

- MCP 配置只读展示 + 未来增删（与 Grok config 策略对齐）  
- GCU Bridge ping 状态  
- 可选：md-reader 协议兼容  

### 5.6 质量与迭代基建

- 协议 fixture / 探针脚本  
- host 单测 + 引擎契约测  
- doctor 扩展（引擎/登录/协议）  
- 诊断包导出（日志+会话摘要，无私钥）  
- ADR + proj log 纪律  
- feature flags（`engine.mode=acp|headless|stub`）  

---

## 6. 施工波次（交付切片）

> 每波 **可上线私用**；有验收关账。波次之间可并行 Kimi UI。

### 波次 0 · 契约与真相底座（Foundation） — ✅

**目标**：前后端并行的「法律文本」和可测事件面。

| 交付 | 验收 |
|------|------|
| `event-schema` v2：thought/plan/usage/permission/errorCode/end meta | 单测绿 |
| 错误码表文档 | `docs/errors.md` |
| API-preload 与 schema 对齐 | 文档 diff 一致 |
| Diff capture 按 tool 路径 | 嵌套文件剧本过 |
| fixtures：streaming-json 全 type 样例 | `docs/fixtures/` |
| doctor：preload CJS + grok 二进制 | 自检绿 |

**关账标准**：Kimi 可只靠契约做完整事件 UI，不猜字段。

---

### 波次 1 · 可依赖的 Headless 产品层（Reliable -p） — ✅

**目标**：在 ACP 完成前，`-p` 也要「天天能用、不丢人」。

| 交付 | 验收 |
|------|------|
| 全事件解析（含 thought/usage/error） | 日志/UI 事件齐全 |
| 回合后 Diff 完整 | 改 `a/b/c.ts` 出现 pending |
| cancel 无僵尸 | 活动监视器无残留 |
| 未登录/失败结构化 | 错误码非裸字符串 alone |
| settings 引擎参数生效 | 改 model/maxTurns 可见 |
| 进程超时保护 | 卡死可杀 |

**关账标准**：用 Desktop 完成真实小工单（读+改+审）闭环。

---

### 波次 2 · 主路径 ACP（Product Core） — ✅

**目标**：长期形态落地——**质变**。

| 交付 | 验收 |
|------|------|
| 新包 `engine-grok-acp`：`grok agent stdio` | 子进程长活 |
| ACP：initialize / session/new / prompt / updates / cancel | 契约测 + 真机 |
| 同会话多轮 **不** 重启进程 | PID 不变 |
| SessionEvent 统一从 ACP 映射 | 与 schema 一致 |
| settings 默认 `engine.mode=acp`，可回退 headless | 开关可用 |
| `GROK_CLIENT_VERSION=perigee/x.y` | 日志可见 |

**关账标准**：P-S1 过；体感接近「真 Desktop 客户端」。

---

### 波次 3 · 人在回路（Trust） — ✅

**目标**：敢长期给写权限。

| 交付 | 验收 |
|------|------|
| ACP `request_permission` ↔ ApprovalGate ↔ IPC | 弹审批可拒 |
| 策略：ask / session-allow / always | 设置生效 |
| Diff 与权限双轨语义写清 | 手册一页 |
| 危险 shell 规则表 | 测例 |

**关账标准**：P-S3 + P-S4 过。

---

### 波次 4 · 恢复、观测、多会话耐用（Hardening） — ✅

**目标**：私器用一个月不烦。

| 交付 | 验收 |
|------|------|
| 会话列表持久化 + 续聊 | 杀 App 再开可续 |
| 崩溃重启策略 | 子进程挂了 UI 可恢复 |
| 诊断导出 | 一键打包日志（无密钥） |
| 限流/配额错误文案 | 可读 |
| 并行会话压力基线（N=3/5） | 文档记录结果 |
| doctor 全绿清单 | playbook |

**关账标准**：P-S5/S6/S8 过。

---

### 波次 5 · 扩展与效能（Scale，按需） — ✅（leader 完整实现延后 ADR0005）

**目标**：用得更顺，不阻塞主路径。

| 交付 | 说明 |
|------|------|
| leader 复用评估与可选实现 | 降内存 |
| 会话导入/分支 | 进阶 |
| MCP 配置写回策略 | 与 `~/.grok` 关系要 ADR |
| 多引擎（未来 Claude/本地） | 仅协议预留已够则可延后 |
| 自动更新引擎探测 | 提示用户升级 CLI |

**关账**：单项 ADR + 验收，不强绑主线。

---

## 7. 与前端（Kimi）协作协议

| 规则 | 说明 |
|------|------|
| UI 可推倒 | `renderer/**` |
| Host 默认冻结路径 | 仅按本方案波次改 main/preload/packages |
| 契约单向扩展 | 新事件先 schema+文档，再实现，再通知前端 |
| Gaps | Kimi 写 `docs/design/API-gaps.md`；后端波次内消化 |
| 不互相堵 | 波次 0 完成后前端不因后端 ACP 未完而停工（有 -p 事件） |

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| ACP 文档不全/版本漂移 | B2 延期 | fixture 探针 + vendor 同步；-p 逃生舱 |
| always-approve 习惯难改 | 安全债 | 默认改 Ask，Yolo 显式开关 |
| 多进程吃内存 | 体验 | 先限并发会话提示；后 leader |
| Diff 与真实磁盘不一致 | 信任崩 | 路径级快照 + 回合结束 reconcile |
| preload 再改成 ESM | 黑屏 | doctor 死锁检查 + 宪法 |
| 范围膨胀成 IDE | 失败 | 非目标清单 + ADR 否决 |

---

## 9. 度量（私器也要）

不搞虚荣指标，只盯「能不能长期用」：

| 指标 | 怎么看 |
|------|--------|
| 主路径引擎 | settings 默认 acp 且稳定 |
| 会话续航 | 重启后续聊成功率（手测剧本） |
| Diff 漏捕 | 真机改嵌套文件漏检次数 → 0 |
| 崩溃/僵尸 | 一周使用残留进程 → 0 |
| 契约破坏 | typecheck + fixture 回归 |
| 上游跟进 | `sync-grok-cli` 后探针仍绿 |

---

## 10. 文档与记忆（可维护机制）

| 动作 | 落点 |
|------|------|
| 本方案定稿 | 入仓 `docs/BACKEND-ROADMAP.md`（施工时从 plan 同步） |
| 重大取舍 | `docs/decisions/` ADR |
| 每波关账 | `vitals proj log` + `docs/sessions/日文件` |
| 操作 | `docs/工程手册.md` / `playbooks/` |
| 实况 | `vitals proj now perigee` |

---

## 11. 建议拍板项（请确认）

| # | 议题 | 方案建议 |
|---|------|----------|
| D1 | 主引擎路径 | **ACP stdio 为主，-p 为降级** |
| D2 | 进程模型 | **一 UI 会话一子进程**（先简单） |
| D3 | 默认权限 | **Trust+Ask**（非 always-approve） |
| D4 | 波次顺序 | **0→1→2→3→4**，5 按需 |
| D5 | 与 Kimi | 契约并行；不等人做完 UI 再动后端 |

---

## 12. 拍板后立即开工的第一步

1. 将本方案同步进仓 `docs/BACKEND-ROADMAP.md`  
2. ADR：主路径 ACP + 进程模型 + 权限默认  
3. 启动 **波次 0**（契约 + Diff 路径级 capture + fixtures）  
4. `vitals proj now` 更新为波次 0 进行中  

---

## 13. 一页摘要

| 维度 | 内容 |
|------|------|
| 产品 | 长期用的 Grok Build CLI 桌面 Host（Perigee） |
| 后端使命 | 编排、可信、可恢复、可迭代 |
| 现状 | -p 原型，非终态 |
| 终态引擎 | `grok agent stdio` ACP |
| 逃生舱 | `grok -p` streaming-json |
| 交付 | 5 波能力 + 验收，非日历 |
| 协作 | Kimi UI / 我方 Host+Engine |
| 原则 | 契约、双路径、人在回路、可观测、可回滚 |
