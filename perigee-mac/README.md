# Perigee

**Perigee — Grok Build CLI 的原生 macOS 编排台**（Electron App）。  
对标体验：Claude Code Desktop。

| | |
|--|--|
| 包名 | `com.yanauto.perigee` |
| 引擎 | 本机 Grok Build CLI（可切 Stub） |
| 现状 | **Host/引擎可用 · UI 待重做**（见下方交接） |

---

## 给 Kimi / 前端施工（先读）

1. **`AGENTS.md`** — 改什么 / 别改什么  
2. **`docs/HANDOFF-前端.md`** — 工单与验收  
3. **`docs/API-preload.md`** — `window.perigee` 契约  
4. **`docs/代码地图.md`** — 目录结构  
5. **`docs/design/BRIEF.md`** — 视觉方向  

主战场目录：

```text
apps/desktop/src/renderer/
```

---

## 启动

```bash
cd ~/workspace/myself/projects/perigee/perigee-mac
pnpm install
pnpm dev
```

同步最新 **Grok CLI 源码**（只读参考，在 `vendor/grok-build`）：

```bash
./scripts/sync-grok-cli.sh
```

记忆框架：`CLAUDE.md` + `vitals proj now perigee --pretty` · hooks 在 `.claude/`

自检：

```bash
pnpm run doctor
pnpm test
pnpm --filter @perigee/app run typecheck
pnpm --filter @perigee/app run build
```

打包 App：

```bash
pnpm --filter @perigee/app run pack
# → apps/desktop/release/mac-arm64/Perigee.app
```

---

## 架构（极简）

```text
renderer (React UI)
    ↓ window.perigee
preload (CJS，sandbox 铁律)
    ↓ IPC
main Host + packages/* (session / fs / diff / grok-build)
```

**铁律**：preload 必须打成 **CJS**（`index.cjs`）。改成 ESM 会全黑屏。

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [`docs/CONSTITUTION.md`](docs/CONSTITUTION.md) | 产品宪法 |
| [`docs/PLAN.md`](docs/PLAN.md) | 完整方案（历史） |
| [`docs/BACKEND-ROADMAP.md`](docs/BACKEND-ROADMAP.md) | **后端完整施工方案** |
| [`docs/BACKEND-ADAPTATION.md`](docs/BACKEND-ADAPTATION.md) | 源码适配技术笔记 |
| [`docs/HANDOFF-前端.md`](docs/HANDOFF-前端.md) | 前端工单（Kimi） |
| [`docs/API-preload.md`](docs/API-preload.md) | API / 事件契约 |
| [`docs/errors.md`](docs/errors.md) | 错误码 |
| [`docs/research/`](docs/research/) | 选型调研 |
| [`docs/playbooks/full-smoke.md`](docs/playbooks/full-smoke.md) | 验收剧本 |

---

## 仓库结构

```text
apps/desktop/          Electron 应用
packages/              引擎与 Host 库（前端默认勿动）
docs/                  宪法 / 交接 / API / 设计
scripts/doctor.sh
```
