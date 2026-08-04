<div align="center">

# Perigee 🛰️

**Mission control for your Grok agents.**

A native macOS orchestrator for Grok Build CLI — multi-session orchestration, Chrome control via MCP, live markdown rendering.

[English](#english) · [简体中文](README.zh-CN.md) · [Website](https://perigee.yan-auto.me) · [Follow @yanautome](https://x.com/yanautome)

</div>

---

## English

### Status

| Platform | State |
|---|---|
| **macOS** | ✅ **Ready** — daily-driven by the team |
| **Windows** | 🚧 In progress — porting & testing, hold tight |

### What it does

- **Orchestrate** — run and steer multiple agent sessions from one cockpit. No more window juggling.
- **Chrome control, built in** — your agents drive the browser through GCC (Grok Chrome Control, an MCP tool): open pages, read content, operate the web — supervised and permissioned.
- **Live markdown** — agents write documents constantly; Perigee renders them as they land. Reports, plans, notes — readable at a glance.

### Quick start (macOS)

```bash
git clone https://github.com/yanauto/perigee.git
cd perigee/perigee-mac
pnpm install
pnpm dev
```

**Requirements**: Node ≥ 20 · pnpm · the official Grok Build CLI installed locally (Stub mode lets you try the UI without it).

Packaged .dmg releases are coming with the public launch — watch the [Releases](https://github.com/yanauto/perigee/releases) page.

### Project layout

| Dir | What |
|---|---|
| `perigee-mac/` | The macOS app (Electron + pnpm workspace) |
| `perigee-win/` | Windows port (work in progress) |

### Contributing

Issues and PRs welcome. Run `pnpm typecheck && pnpm test` before submitting. See `perigee-mac/docs/` for the code map and API contracts.

### License

[Apache-2.0](LICENSE)

---

Perigee is an independent project, not affiliated with or endorsed by xAI. "Grok" is referenced only to describe compatibility with xAI's Grok Build CLI.
