# Perigee for macOS

**Perigee — Grok Build CLI 的原生 macOS 编排台**(Electron)。多会话编排 · 内置浏览器控制(Flyby) · 实时 markdown 渲染。

## 快速启动

```bash
cd perigee-mac
pnpm install
pnpm dev
```

前置:Node ≥20 · 本机已安装官方 Grok Build CLI(引擎可切 Stub 模式,无 CLI 也能起 UI)。

## 结构一览

| 目录 | 内容 |
|---|---|
| `apps/desktop/` | Electron 应用(main / preload / renderer) |
| `packages/` | 共享包:引擎协议、Grok 引擎适配、host-core、md-core、event-schema |
| `docs/` | 技术文档(先读 `代码地图.md`,再看 `API-preload.md` = `window.perigee` 契约) |
| `scripts/` | 构建与工具脚本 |

## 开发约定

- UI 主战场:`apps/desktop/src/renderer/`
- 提交前必过:`pnpm typecheck && pnpm test`
- 视觉方向:`docs/design/BRIEF.md`
- 不改 `packages/engine-protocol` 的对外契约;跨包改动先开 Issue 对齐
