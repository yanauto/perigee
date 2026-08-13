# Perigee for macOS

**Perigee — a native macOS console for Grok Build CLI** (Electron). Multiple sessions · built-in browser control (Flyby) · live markdown rendering.

[English](#) · [简体中文](README.zh-CN.md)

## Download

Release **0.3.0** (Apple Silicon, unsigned): [GitHub Releases · v0.3.0](https://github.com/yanauto/perigee/releases/tag/v0.3.0)

- `Perigee-0.3.0-arm64.dmg` — drag to Applications
- `Perigee-0.3.0-arm64-mac.zip` — unzip to get the `.app`

If Gatekeeper blocks it: `xattr -cr /Applications/Perigee.app`. Sending messages needs a local signed-in Grok CLI 1.0.3+.

What changed in 0.3.0: [Changelog](../CHANGELOG.md) (repo root). Chinese: [更新日志](../CHANGELOG.zh-CN.md).

## Quick start

```bash
cd perigee-mac
pnpm install
pnpm dev
```

Requires Node ≥ 20 and the official Grok Build CLI locally (the engine can run in Stub mode, so the UI still starts without CLI).

Build an installer yourself: `docs/playbooks/install-macos.md` (`rebuild:native` → `pnpm --filter @perigee/app run dist`).

## Layout

| Path | What |
|---|---|
| `apps/desktop/` | Electron app (main / preload / renderer) |
| `packages/` | Shared packages: engine protocol, Grok adapters, host-core, md-core, event-schema |
| `docs/` | Technical docs (start with `代码地图.md`, then `API-preload.md` = `window.perigee` contract) |
| `scripts/` | Build and utility scripts |

## Conventions

- UI lives in `apps/desktop/src/renderer/`
- Before a PR: `pnpm typecheck && pnpm test`
- Visual direction: `docs/design/BRIEF.md`
- Do not change the public contract of `packages/engine-protocol`; cross-package changes need an Issue first
