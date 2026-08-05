# macOS 打包安装 Perigee（.app → /Applications）

> 2026-08-01 真机打通：rebuild → pack → 安装 → 启动。  
> 平台：Apple Silicon；未签名（`identity: null`）。

## 前置

```bash
cd ~/projects/perigee/perigee-mac
pnpm install
pnpm run doctor   # 宜绿
```

本机需有 Grok CLI（`~/.grok/bin/grok`）方可真机发消息；装壳本身不依赖登录。

## 步骤

```bash
# 1) 关掉已在跑的实例（勿用 pkill -f "Perigee"，会误杀脚本）
osascript -e 'quit app "Perigee"' 2>/dev/null || true

# 2) 原生模块对齐当前 Electron
pnpm --filter @perigee/app run rebuild:native

# 3) 构建 + electron-builder --mac --dir
pnpm --filter @perigee/app run pack
# 产物：apps/desktop/release/mac-arm64/Perigee.app

# 4) 安装到 Applications（覆盖旧版）
SRC="apps/desktop/release/mac-arm64/Perigee.app"
DEST="/Applications/Perigee.app"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
xattr -cr "$DEST"   # 清 quarantine，减少 Gatekeeper 误伤

# 5) 启动
open "$DEST"
```

## 验收

| 检查 | 期望 |
|------|------|
| 进程 | `pgrep -fl "Perigee"` 见主进程 + Helper |
| 路径 | `/Applications/Perigee.app` 存在 |
| 窗 | 能起窗；preload 为 CJS（黑屏则查 asar 内 `out/preload/index.cjs`） |
| PTY | 设置切 PTY 档；失败应诚实降级 shell-c（pack 前漏 rebuild 常见） |

## 用户数据（默认保留）

| 用途 | 路径 |
|------|------|
| 设置 / 会话元数据 | `~/Library/Application Support/@perigee/app/` |

重装 **不** 清 userData。要干净环境再手动删该目录。

### 从旧版 Grok Desktop 升级(改名迁移,一次性)

改名(2026-08-02,b036d51)后 userData 目录随包名从 `@grok-desktop/app` 变为 `@perigee/app`,不迁移则新版启动为空数据:

```bash
# 1) 退出两个可能的旧实例
osascript -e 'quit app "Grok Desktop"' 2>/dev/null; osascript -e 'quit app "Perigee"' 2>/dev/null

# 2) 复制迁移(不移动,旧目录留作备份;目标已存在则跳过勿覆盖)
SRC="$HOME/Library/Application Support/@grok-desktop/app"
DST="$HOME/Library/Application Support/@perigee/app"
[ -d "$SRC" ] && [ ! -d "$DST" ] && mkdir -p "$(dirname "$DST")" && cp -R "$SRC" "$DST"

# 3) 顺手移除旧应用
rm -rf "/Applications/Grok Desktop.app"
```

验证:启动后会话/归档条数与旧版一致(2026-08-02 实测 19 会话 + 1143 归档零丢失)。

## 坑

1. **pack 前必须 rebuild:native**（node-pty ↔ Electron 版本）。  
2. 未签名：本机可开；若「无法打开」→ 系统设置 → 隐私与安全性 → 仍要打开。  
3. 图标为 Electron 默认（未配置 custom icon）。  
4. 仅 `pnpm dev` 不等于安装版验收。  

## 相关

- 工程手册命令表 · 代码地图操作入口  
- 集成测：`docs/playbooks/integration.md`  
