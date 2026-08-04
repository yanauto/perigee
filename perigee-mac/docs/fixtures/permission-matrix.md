# 权限矩阵 fixture 笔记（§12.2b）

> 实现：`packages/engine-grok-acp/src/permission-policy.ts`  
> 单测：`permission-policy.test.ts`

| 类别 | accept_edits | plan | ask | yolo |
|------|--------------|------|-----|------|
| 源码写工具 | allow | deny | pending | allow |
| 常见 FS（mkdir/touch/mv/cp） | allow | deny | pending | allow |
| 危险 shell（rm -rf 等） | pending | deny | pending | allow |
| Flyby 动作 | pending | deny | pending | allow |
| Flyby 只读 | allow | allow | pending | allow |
| 只读工具 | allow | allow | pending | allow |
| path 越界写 | deny（path-guard） | deny | deny | deny |

Client `fs/write_text_file`：plan 硬拒；accept/yolo 静默；ask 升审批。  
UI 编辑器 `fs:write` **不**走此矩阵（人手改文件）。
