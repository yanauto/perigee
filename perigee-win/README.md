# Perigee for Windows

**Windows port of Perigee** — currently in **porting and testing**. There is no installer yet.

[English](#) · [简体中文](README.zh-CN.md)

## Relation to the mac tree

- `../perigee-mac` = the product and shared capabilities (apps, packages, engine adapters, `window.perigee` contract)
- This directory = the Windows track: Win-only adapters, packaging scripts, platform gaps, and test notes
- Shared code lands as platform abstractions on the mac side first. This directory only holds Windows-specific pieces — not a forked tree

## For testers

1. Environment: Windows 10/11 + Node ≥ 20
2. Follow the build notes in this directory once packaging scripts land
3. **File issues on GitHub** with: OS version / repro steps / expected vs actual; screenshots help

## Out of scope for now

- No promise of an installable Windows build in this phase
- No rewrite of the engine protocol, no second UI framework
