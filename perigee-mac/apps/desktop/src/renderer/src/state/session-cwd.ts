/**
 * 同 cwd 并行写盘：已隔离 worktree 的会话不计入碰撞。
 * 返回共享该 cwd 且无 worktree 的会话数；调用方用 >1 才警告。
 */
export function sharedCwdCollisionCount(
  list: Array<{ id: string; workspacePath?: string; worktreePath?: string }>,
  rec: { id: string; workspacePath?: string; worktreePath?: string }
): number {
  if (rec.worktreePath) return 0
  const cwd = rec.workspacePath
  if (!cwd) return 0
  return list.filter((s) => s.workspacePath === cwd && !s.worktreePath).length
}
