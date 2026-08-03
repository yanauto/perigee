# 阶段 0 冒烟剧本

1. `cd projects/perigee/perigee-mac && pnpm install && pnpm dev`
2. 出现独立桌面窗口（非浏览器标签）
3. 侧栏「渲染进程 require：无（正常）」
4. 打开任意文件夹 → 显示工作区名
5. 点 + 新建会话 → 输入「你好」→ Stub 回声
6. 退出后再次 `pnpm dev` → 最近列表仍有该文件夹
7. `pnpm run doctor` 全 OK；`pnpm test` 全绿
