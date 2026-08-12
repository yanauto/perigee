#!/usr/bin/env bash
# Perigee 环境自检（阶段 0）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ok=0
fail=0
check() {
  local name="$1"
  shift
  if "$@"; then
    echo "OK   $name"
    ok=$((ok + 1))
  else
    echo "FAIL $name"
    fail=$((fail + 1))
  fi
}

echo "== Perigee doctor =="
echo "root: $ROOT"

check "node >= 20" bash -c 'node -e "process.exit(Number(process.versions.node.split(\".\")[0])>=20?0:1)"'
check "pnpm available" bash -c 'command -v pnpm >/dev/null'
check "workspace package.json" test -f package.json
check "desktop app package" test -f apps/desktop/package.json
check "event-schema package" test -f packages/event-schema/package.json
check "host-core package" test -f packages/host-core/package.json
check "engine-grok-build package" test -f packages/engine-grok-build/package.json
check "engine-grok-acp package" test -f packages/engine-grok-acp/package.json
check "md-core package" test -f packages/md-core/package.json
check "electron.vite config" test -f apps/desktop/electron.vite.config.ts
check "main entry" test -f apps/desktop/src/main/index.ts
check "preload entry" test -f apps/desktop/src/preload/index.ts
check "renderer entry" test -f apps/desktop/src/renderer/src/main.tsx

if [[ -d node_modules ]]; then
  check "root node_modules" true
else
  echo "WARN root node_modules missing — run: pnpm install"
fi

if [[ -d apps/desktop/node_modules/electron ]] || [[ -d node_modules/.pnpm ]]; then
  check "deps look installed" true
else
  echo "WARN electron may be missing — run: pnpm install"
fi

echo "-- security defaults in main --"
if grep -q 'contextIsolation: true' apps/desktop/src/main/index.ts \
  && grep -q 'nodeIntegration: false' apps/desktop/src/main/index.ts \
  && grep -q 'sandbox: true' apps/desktop/src/main/index.ts; then
  echo "OK   electron security flags"
  ok=$((ok + 1))
else
  echo "FAIL electron security flags"
  fail=$((fail + 1))
fi

if grep -q "index.cjs" apps/desktop/src/main/index.ts \
  && grep -q "format: 'cjs'" apps/desktop/electron.vite.config.ts; then
  echo "OK   preload cjs for sandbox"
  ok=$((ok + 1))
else
  echo "FAIL preload must be CJS (sandbox rejects ESM .mjs)"
  fail=$((fail + 1))
fi

if grep -q 'EVENT_SCHEMA_VERSION = 3' packages/event-schema/src/index.ts; then
  echo "OK   event-schema v3"
  ok=$((ok + 1))
else
  echo "FAIL event-schema should be v3"
  fail=$((fail + 1))
fi

if [[ -f docs/errors.md ]] && [[ -f docs/BACKEND-ROADMAP.md ]]; then
  echo "OK   backend roadmap + errors docs"
  ok=$((ok + 1))
else
  echo "FAIL missing BACKEND-ROADMAP or errors.md"
  fail=$((fail + 1))
fi

if [[ -f docs/fixtures/streaming-json.sample.ndjson ]]; then
  echo "OK   streaming-json fixture sample"
  ok=$((ok + 1))
else
  echo "FAIL missing fixtures sample"
  fail=$((fail + 1))
fi

GROK_BIN="${GROK_BINARY:-$HOME/.grok/bin/grok}"
if [[ -x "$GROK_BIN" ]]; then
  grok_ver="$("$GROK_BIN" --version 2>/dev/null | head -n 1 || true)"
  echo "OK   grok binary executable ($GROK_BIN)${grok_ver:+ · $grok_ver}"
  ok=$((ok + 1))
else
  echo "WARN grok binary missing ($GROK_BIN) — engine headless 不可用"
fi

if [[ -d vendor/grok-build/.git ]]; then
  echo "OK   vendor/grok-build present"
  ok=$((ok + 1))
else
  echo "WARN vendor/grok-build missing — run ./scripts/sync-grok-cli.sh"
fi

echo "== result: $ok ok, $fail fail =="
exit "$fail"
