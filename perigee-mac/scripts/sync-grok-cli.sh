#!/usr/bin/env bash
# 将最新 xai-org/grok-build（Grok CLI 源码）同步到 vendor/grok-build
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/grok-build"
REPO="${GROK_BUILD_REPO:-https://github.com/xai-org/grok-build.git}"
BRANCH="${GROK_BUILD_BRANCH:-main}"

mkdir -p "$ROOT/vendor"

if [[ -d "$DEST/.git" ]]; then
  echo "== pull $DEST ($BRANCH) =="
  git -C "$DEST" fetch origin
  git -C "$DEST" checkout "$BRANCH"
  git -C "$DEST" pull --ff-only origin "$BRANCH"
else
  echo "== clone $REPO → $DEST =="
  # 完整历史便于 blame；若只要最新树可改成 --depth 1
  git clone --branch "$BRANCH" "$REPO" "$DEST"
fi

echo "== HEAD =="
git -C "$DEST" log -1 --oneline
git -C "$DEST" rev-parse HEAD
if [[ -f "$DEST/SOURCE_REV" ]]; then
  echo "SOURCE_REV=$(cat "$DEST/SOURCE_REV")"
fi
echo "OK vendor/grok-build ready (read-only reference)"
echo "path: $DEST"
