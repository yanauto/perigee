#!/usr/bin/env bash
# 探针：跑一轮 grok -p streaming-json，把 type 统计与样例落到 docs/fixtures/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GROK="${GROK_BINARY:-$HOME/.grok/bin/grok}"
OUT_DIR="$ROOT/docs/fixtures"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
RAW="$OUT_DIR/probe-$STAMP.ndjson"
SUMMARY="$OUT_DIR/probe-$STAMP.types.txt"

if [[ ! -x "$GROK" ]]; then
  echo "FAIL: grok not executable: $GROK"
  exit 1
fi

PROMPT='Reply with exactly: pong. Do not use tools.'
echo "running: $GROK -p … --output-format streaming-json"
"$GROK" -p "$PROMPT" \
  --cwd "$ROOT" \
  --output-format streaming-json \
  --max-turns 1 \
  --always-approve \
  --no-memory \
  --no-plan \
  >"$RAW" 2>"$OUT_DIR/probe-$STAMP.err" || true

python3 - <<PY
import json, collections
from pathlib import Path
raw = Path("$RAW")
types = collections.Counter()
for line in raw.read_text(errors="replace").splitlines():
    line=line.strip()
    if not line: continue
    try:
        o=json.loads(line)
        types[o.get("type","?")] += 1
    except Exception:
        types["<<invalid_json>>"] += 1
text = "\\n".join(f"{k}: {v}" for k,v in sorted(types.items()))
Path("$SUMMARY").write_text(text + "\\n", encoding="utf-8")
print(text)
print("raw:", raw)
print("summary: $SUMMARY")
PY
