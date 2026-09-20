import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  expandUserPath,
  parseWorktreeListJson,
  parseWorktreeListText,
  pickCreatedWorktreePath,
  sessionCwdInWorktree,
  worktreeEmptyNote
} from './grok-worktree.ts'

test('parseWorktreeListJson 认官方 WorktreeRecord', () => {
  const rows = parseWorktreeListJson(`
[
  {
    "id": "wt-1",
    "path": "/Users/me/.grok/worktrees/perigee/feat",
    "source_repo": "/Users/me/workspace/perigee",
    "repo_name": "perigee",
    "kind": "session",
    "creation_mode": "linked",
    "git_ref": "HEAD",
    "session_id": "019c43b5-c4ae-7190-b058-693e24669ba9",
    "status": "alive",
    "metadata": { "label": "feat" }
  }
]
`)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'wt-1')
  assert.equal(rows[0].path, '/Users/me/.grok/worktrees/perigee/feat')
  assert.equal(rows[0].repo, 'perigee')
  assert.equal(rows[0].label, 'feat')
  assert.equal(rows[0].branch, 'HEAD')
  assert.equal(rows[0].sessionId, '019c43b5-c4ae-7190-b058-693e24669ba9')
  assert.equal(rows[0].status, 'alive')
})

test('parseWorktreeListJson 空数组', () => {
  assert.deepEqual(parseWorktreeListJson('[]'), [])
})

test('parseWorktreeListText 空态', () => {
  const parsed = parseWorktreeListText('No worktrees found.\n')
  assert.equal(parsed.empty, true)
  assert.equal(parsed.items.length, 0)
})

test('parseWorktreeListText 带 AGE 列', () => {
  const parsed = parseWorktreeListText(`
  ID               TYPE    REPO   LABEL  BRANCH               AGE        PATH
  wt-1             session peri   feat   HEAD                 2h         /Users/me/.grok/worktrees/perigee/feat
  1 worktrees (1 session)
`)
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].id, 'wt-1')
  assert.equal(parsed.items[0].kind, 'session')
  assert.equal(parsed.items[0].repo, 'peri')
  assert.equal(parsed.items[0].label, 'feat')
  assert.equal(parsed.items[0].branch, 'HEAD')
  assert.equal(parsed.items[0].path, '/Users/me/.grok/worktrees/perigee/feat')
})

test('sessionCwdInWorktree 带相对偏移', () => {
  assert.equal(
    sessionCwdInWorktree({
      worktreePath: '/tmp/.grok/worktrees/repo/a',
      sourcePath: '/src/repo/apps/workbench',
      sourceGitRoot: '/src/repo'
    }),
    '/tmp/.grok/worktrees/repo/a/apps/workbench'
  )
  assert.equal(
    sessionCwdInWorktree({
      worktreePath: '/tmp/.grok/worktrees/repo/a',
      sourcePath: '/src/repo',
      sourceGitRoot: '/src/repo'
    }),
    '/tmp/.grok/worktrees/repo/a'
  )
})

test('pickCreatedWorktreePath 认官方同步回包', () => {
  assert.equal(
    pickCreatedWorktreePath({
      status: 'created',
      newSessionId: 'sid',
      worktreePath: '/tmp/.grok/worktrees/repo/a',
      sourceGitRoot: '/src/repo'
    }),
    '/tmp/.grok/worktrees/repo/a'
  )
})

test('expandUserPath', () => {
  assert.equal(expandUserPath('~/.grok/worktrees/x', '/Users/me'), '/Users/me/.grok/worktrees/x')
})

test('worktreeEmptyNote 跟官方空句对齐', () => {
  assert.equal(
    worktreeEmptyNote(0, 'No worktrees found.'),
    '还没有隔离目录。官方 grok worktree list 也是空的。'
  )
  assert.equal(worktreeEmptyNote(1, 'No worktrees found.'), null)
})
