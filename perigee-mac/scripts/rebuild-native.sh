#!/usr/bin/env bash
# 为当前 Electron 版本重建 node-pty（macOS arm64 开发机）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/desktop"
echo "[rebuild-native] electron-rebuild -f -w node-pty"
pnpm exec electron-rebuild -f -w node-pty
echo "[rebuild-native] done"
