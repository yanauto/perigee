#!/bin/sh
# 把 electron-builder 的 GrokApp.app 改名为 Grok.app，并用本机已有码签身份签名。
# 身份从钥匙串现查，不把人名/证书写进仓。
set -e
cd "$(dirname "$0")/../release/mac-arm64"

if [ -d GrokApp.app ]; then
  rm -rf Grok.app
  mv GrokApp.app Grok.app
fi

if [ ! -d Grok.app ]; then
  echo "找不到 Grok.app（先跑 electron-builder --mac --dir）" >&2
  exit 1
fi

ID=$(security find-identity -v -p codesigning | awk -F'"' '/Apple Development|Developer ID Application|Grok Local/{print $2; exit}')
ENT="$(dirname "$0")/../build/entitlements.mac.plist"

if [ -z "$ID" ]; then
  echo "没有可用码签身份，改为 ad-hoc（本机打开可能要右键）" >&2
  codesign --force --deep --sign - Grok.app
  echo "signed ad-hoc  Grok.app"
  exit 0
fi

if [ -f "$ENT" ] && codesign --force --deep --sign "$ID" --options runtime --entitlements "$ENT" --timestamp=none Grok.app; then
  echo "signed hardened  identity=$ID"
else
  echo "hardened 失败，关 hardened 再签" >&2
  codesign --force --deep --sign "$ID" --timestamp=none Grok.app
  echo "signed  identity=$ID  hardened=off"
fi
