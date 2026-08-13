# Changelog

All notable changes to Perigee are documented here.  
[English](#) · [简体中文](CHANGELOG.zh-CN.md)

UI ticket-level notes remain in [`perigee-mac/docs/design/CHANGELOG-ui.md`](perigee-mac/docs/design/CHANGELOG-ui.md).

## [Unreleased]

English is now the default UI language. First-run is honest when Grok CLI is missing, daily session chrome is a bit clearer, and three registered tech-debt items are closed (tool-row meters, cron routines, one missed-run on startup).

No new installer yet — still [v0.3.0](https://github.com/yanauto/perigee/releases/tag/v0.3.0). Existing Chinese language preference is unchanged.

### Interface language

- New installs default to **English** (`lang.pref`); a saved `zh` preference still wins
- Stub echo, sidebar previews, slash hints, and cross-session errors localize instead of leaking Chinese source strings

### First run / Stub

- Persistent banner when the engine is local echo (Grok CLI not connected)
- Home shows a two-step setup (workspace, then CLI) instead of an empty usage card
- Stub copy states that messages are echoed and will not reach Grok

### Daily use

- Sidebar preview: `Waiting for approval · …` / `You: …`; overflow menu stays visible on busy/needs-input rows
- ⌘N goes home; a session is created only when you type and send
- Live tool tracks expand as they run; tool rows show diff `+/-` or line count, plus duration (derived in the UI, no schema bump)

### Routines

- Cron triggers (5-field, Sunday = 0 or 7) in the editor
- If the app was closed through a due time, startup fires **at most one** catch-up; a routine that has never run does not fire on first enable

### Docs

- `TECH-DEBT.md` open list is empty (T015-meter, T018-cron, T018-missed)
- `docs/API-preload.md` matches cron + catch-up behavior

---

## [0.3.0] — 2026-08-13

Grok 1.0.3 ACP handshake (`initialize` → `authenticate` → `session/new`), live multi-session sidebar (unread, preview, drafts, background stop), and the first public macOS installer.

**macOS installer (Apple Silicon, unsigned)**

- Release: https://github.com/yanauto/perigee/releases/tag/v0.3.0
- Disk image: `Perigee-0.3.0-arm64.dmg` (drag to Applications)
- Zip: `Perigee-0.3.0-arm64-mac.zip`
- If Gatekeeper blocks it: `xattr -cr /Applications/Perigee.app`
- Sending messages needs a local signed-in **Grok CLI 1.0.3+** (`grok --version`); without CLI you can still use Stub to look at the UI

This release takes Perigee from “a window that can chat” to “the same ACP handshake as official grok 1.0, with a live multi-session sidebar.”

### Engine: grok 1.0.3 ACP handshake

The old path only did `initialize` → `session/new`, stuffing client identity into `clientInfo` / `GROK_CLIENT_VERSION`. Official grok 1.0 and the vendor tests use:

**`initialize` → `authenticate` → `session/new`**

Shipped in `packages/engine-grok-acp`:

- New `handshake.ts`: protocol version 1; fs read/write; **does not advertise ACP `terminal`** (Perigee uses node-pty, not `terminal/*`)
- `_meta.clientType` / `clientSource` / `clientVersion` (`perigee/0.3.0`), plus `startupHints.nonInteractive`
- Capability metadata: `x.ai/incrementalBashOutput`, `x.ai/bashOutputNoColor`
- Auth pick order: `defaultAuthMethodId` → `cached_token` → `xai.api_key` when a key is in the environment → first list item; `authenticate` sends `_meta.headless=true`
- `session/new` always includes `mcpServers`, optional `_meta.modelId`
- Permission summaries trust the read-only tool flag (`isReadOnly`) reported since grok 1.0.1
- `scripts/doctor.sh` prints local `grok --version`

Live probe (CLI already signed in): initialize / authenticate / session/new succeeded; prompt “Reply with exactly: pong” returned **pong**.

### Multi-session sync (the main thread)

Background sessions used to look dead in the sidebar: `lastActivityAt` changed but nothing broadcast, no preview until you clicked in, and the session you were watching could be marked unread.

| Problem | What we did |
|------|------|
| Background streaming / tools / turn end did not update sidebar status, unread, or sort | Host `session-list-sync`: dirty events coalesce for 32ms, then one `session:updated`, and persist `lastActivityAt` |
| Streaming deltas were too chatty | **Do not** refresh the list on `assistant.delta` (`session.status=streaming` already covers “running”) |
| Cold start only had transcript for the focused session | Seed up to 12 sessions by `lastActivityAt` desc so sidebar previews are not blank |
| Closing then reopening a workspace dropped seeded previews | `closeWorkspace` clears blocks / seed / tombstones |
| The session you are watching flipped unread on every stream update | Focused session `lastReadAt` follows activity; after going home (`blur`), unread only when background work finishes |
| Marking read bumped old sessions to the top | `list()` sorts by `lastActivityAt`; markRead does not steal the top slot |
| Composer draft leaked across sessions | Drafts are per-session (in-process, not on disk) |
| Stopping background generation required clicking into the session | Row ⋮ menu adds “Stop generating” (streaming / tool_running) |
| grok 1.0 `_x.ai/sessions/changed` and `queue/changed` were dropped | Mapped to lifecycle; refresh CLI roster and sidebar |
| `_x.ai/models/update`, MCP ready | Refresh model chip / sidebar MCP count |
| Those notices showed up in chat as “Engine event: …” | Reducer silences these sync events; failure-class lifecycle still enters the stream |
| Two approval cards pending at once | `approval.resolved` dismisses by `requestId`, does not delete the other card |
| Same-cwd parallel-write warning still said “wait for worktree wave B” | Sessions that already have a worktree are not false-alarmed |

Sidebar preview: latest tool name / first assistant line / “You: …”. Current-row ⋮ is semi-visible with a 28px hit target so the menu is easy to click.

### Other product fixes

- **UI language**: on HMR / remount, localStorage wins over a stale `uiState`, so the UI is not forced back to Chinese
- **Models chart**: 7d is locked to 7 daily bars, 30d = 30, All = 26 weekly bars (pure function `modelChartBuckets`; the anti-measurement-loop still holds)
- **Routines double-focus** (earlier CU): with Routines open, sidebar session rows no longer look “currently selected”
- **Search placeholder**: collapsed sidebar uses the short “Search…”; full capability is in the tip (commands / sessions / files · ⌘K)

### Docs and release

- Root README and `perigee-mac/README.md` (each with a Chinese copy): install entry is the Release; no more “dmg coming later”
- `docs/playbooks/install-macos.md`: users install from the Release; maintainers can still `rebuild:native` → `dist`
- ACP handshake log: `perigee-mac/docs/fixtures/acp-handshake.md`
- App version `@perigee/app` **0.3.0**; engine package `@perigee/engine-grok-acp` **0.3.0**

`.dmg` / `.zip` **are not in git** (`release/` is ignored); they live on GitHub Releases only.

### Known limits

- Installer is **arm64** only, unsigned; Windows still has no official package
- Does not speak ACP native `terminal/*` (still node-pty)
- Per-session drafts are in-process only; unsent text is not restored from disk after restart (intentional: drafts may contain unfinished instructions)

---

## Earlier UI waves

Ticket-level frontend notes from early August 2026 (v2.19–v2.24 and so on) are in [`perigee-mac/docs/design/CHANGELOG-ui.md`](perigee-mac/docs/design/CHANGELOG-ui.md).
