# Perigee 🛰️

**Mission control for your Grok agents.** A native macOS orchestrator for Grok Build CLI — multi-session orchestration, computer use built in, live markdown rendering.

> Private repo (pre-launch). Windows port in progress.

## Structure

| Dir | What |
|---|---|
| `perigee-mac/` | macOS app (Electron + pnpm workspace) — the main product |
| `perigee-win/` | Windows port (testing stage) |

## Quick start (mac)

```bash
cd perigee-mac
pnpm install
pnpm dev
```

Requires Node ≥20 and the official Grok Build CLI installed locally. Sync the reference CLI source with `scripts/` helpers if needed (vendor/ is not tracked).

## For collaborators

- 开发主战场:`perigee-mac/`;技术文档见 `perigee-mac/docs/`(代码地图 / API-preload / design)
- Win 测试:`perigee-win/`,问题直接开 Issue
- 提交前跑 `pnpm typecheck && pnpm test`

## License

Apache-2.0 — see [LICENSE](LICENSE).

---
Perigee is an independent project, not affiliated with or endorsed by xAI.
