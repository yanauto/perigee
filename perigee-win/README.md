# perigee-win

**Perigee for Windows** — Grok Build CLI 编排台的 Windows 平台工区。

| | |
|---|---|
| 产品名 | Perigee（Win 平台） |
| vitals 项目 id | `perigee-win` |
| 兄弟主仓（mac） | `../perigee-mac`（vitals id 仍为 `grok-desktop`） |
| 本仓阶段 | **工区骨架**（规划 / 缺口 / 验收；尚未声明可交付 Win 安装包） |

## 与 grok-desktop 的关系

- **mac 主仓** = 现网产品与共享能力源：`apps/desktop`、`packages/*`、引擎 ACP、Host IPC、`window.perigee` 契约。
- **本仓** = Windows 平台轨道：平台决策、缺口清单、Win 专用适配与打包剧本、验收记录。
- **默认不整仓分叉**：共享代码优先在主仓以平台抽象落地；本仓只放 Win 独有物与对照文档。无 ADR 不得复制整树「另起炉灶」。

## 开场

```bash
cd ~/workspace/myself/projects/perigee/perigee-win
vitals proj now perigee-win --pretty
```

Agent 入口：`CLAUDE.md` → `docs/代码地图.md` → `docs/平台缺口.md`。

## 当前非目标

- 不在本轮承诺可安装的 Windows 构建物  
- 不重写引擎协议 / 不另起 UI 框架  
- 不以「先 MVP 砍 md/diff/多会话」换 Win 首跑  

## 关键文档

| 文档 | 用途 |
|---|---|
| `CLAUDE.md` | 宪法与铁律 |
| `docs/代码地图.md` | 模块与操作入口 |
| `docs/工程手册.md` | 环境、路径、坑 |
| `docs/平台缺口.md` | Win 相对 mac 的缺口总表 |
| `docs/playbooks/` | 可复跑操作（装机等，打通后写入） |
| `docs/decisions/` | ADR |
