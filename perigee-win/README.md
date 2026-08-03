# Perigee for Windows

**Perigee 的 Windows 移植**——当前处于**移植与测试阶段**,尚未产出可安装包。

## 与 mac 主目录的关系

- `../perigee-mac` = 产品本体与共享能力源(apps、packages、引擎适配、`window.perigee` 契约)
- 本目录 = Windows 平台轨道:Win 专用适配、打包脚本、平台缺口与测试记录
- 原则:共享代码优先在 mac 侧以平台抽象落地,本目录只放 Win 独有物——不整仓分叉

## 测试者指引

1. 环境:Windows 10/11 + Node ≥20
2. 跟随本目录后续的构建说明跑起产品(打包脚本就绪后更新到这里)
3. **发现问题直接开 GitHub Issue**,写清:系统版本 / 复现步骤 / 预期 vs 实际,截图更好

## 当前非目标

- 不承诺本阶段可安装的 Windows 构建物
- 不重写引擎协议、不另起 UI 框架
