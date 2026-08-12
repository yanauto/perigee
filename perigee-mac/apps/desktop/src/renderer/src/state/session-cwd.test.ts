import { describe, expect, it } from 'vitest'
import { sharedCwdCollisionCount } from './session-cwd.js'

describe('sharedCwdCollisionCount', () => {
  const cwd = '/tmp/proj'

  it('本会话已有 worktree → 0（隔离已生效）', () => {
    expect(
      sharedCwdCollisionCount(
        [
          { id: 'a', workspacePath: cwd, worktreePath: '/tmp/wt-a' },
          { id: 'b', workspacePath: cwd, worktreePath: '/tmp/wt-b' }
        ],
        { id: 'a', workspacePath: cwd, worktreePath: '/tmp/wt-a' }
      )
    ).toBe(0)
  })

  it('两会话共享同一 cwd 且都无 worktree → 2', () => {
    expect(
      sharedCwdCollisionCount(
        [
          { id: 'a', workspacePath: cwd },
          { id: 'b', workspacePath: cwd }
        ],
        { id: 'a', workspacePath: cwd }
      )
    ).toBe(2)
  })

  it('只有自己 → 1（调用方用 >1 才警告）', () => {
    expect(
      sharedCwdCollisionCount([{ id: 'a', workspacePath: cwd }], { id: 'a', workspacePath: cwd })
    ).toBe(1)
  })
})
