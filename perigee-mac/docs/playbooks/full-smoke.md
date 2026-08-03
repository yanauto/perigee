# 全量验收剧本（S1–S6）

## S1 桌面窗
1. `pnpm dev` → 独立窗口，非浏览器标签
2. Dock/菜单可见

## S2 读写闭环
1. 打开 `projects/perigee/perigee-mac` 工作区
2. 新建会话，发送：`Read README.md and reply with its first heading only.`
3. 见工具卡 `read_file` 与助手回复
4. 再发送：`Create a file /tmp is wrong — instead write docs/playbooks/_smoke-note.md with one line: smoke-ok`（或改现有测试文件）
5. Diff 面板出现变更 → 接受或拒绝

## S3 MD 阅读
1. 文件树打开 `docs/PLAN.md`
2. 切 MD 页：有目录、排版可读

## S4 并行会话
1. 建两个会话
2. 各发一条短消息
3. 侧栏状态点可辨

## S5 安全
1. 侧栏 require=无
2. 拒绝 diff 后文件还原

## S6 引擎可替换
1. 设置 → 引擎 Stub → 发送得回声
2. 切回 Grok Build
