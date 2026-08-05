# 剧本：同步最新 Grok CLI 源码

## 何时

需要对照 headless / streaming-json / 工具协议，或确认上游变更。

## 步骤

```bash
cd ~/projects/perigee/perigee-mac
./scripts/sync-grok-cli.sh
git -C vendor/grok-build log -1 --oneline
```

## 验收

- `vendor/grok-build` 存在且 `git log -1` 为最新 main  
- 有 `SOURCE_REV` 文件可读  

## 注意

- 目录只读参考，勿在 vendor 内改代码  
- 本仓业务适配只动 `packages/engine-grok-build`  
