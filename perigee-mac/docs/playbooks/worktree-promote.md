# Worktree 审查闭环：摘要 / promote / discard

> ADR 0009 · **promote = push + 可选 gh pr create**；**永不** `git merge` 主工作区。

## 前提

- 工作区是 Git 仓  
- 设置开启「Git 会话 worktree 隔离」  
- 本机 `git`；开 PR 需已登录 `gh`

## 流程

```text
新建会话 → 引擎 cwd = userData/worktrees/<id>
    → agent 改文件 → Diff 审查
    → agent/用户 commit（promote 要求工作区干净）
    → 「推送并开 PR」
    → 或「丢弃 worktree」删会话
```

## 手点

1. **开两会话**改不同文件 → 主仓不被静默污染。  
2. 侧栏 **list 图标** → worktree 摘要（分支 / dirty / shortstat）。  
3. 未 commit 点 **git 图标（推送）** → 应失败 `uncommitted`。  
4. 在会话内 commit 后再次 promote → push；有 gh 则 PR URL。  
5. **丢弃** → worktree 目录删除；主仓无自动 merge。

## API

| 方法 | 说明 |
|------|------|
| `session.worktreeStatus(id)` | 摘要 |
| `session.promote(id, opts?)` | push + PR；`pushOnly: true` 只推 |
| `session.discardWorktree(id)` | 删 wt + 会话 |
| `session.revealWorktree(id)` | Finder |

## 命令面板

- `当前会话 worktree 变更摘要`  
- `推送 worktree 并开 PR（不 merge 主仓）`  
- `丢弃当前会话 worktree`
