import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceStore } from './workspace-store.js'

describe('WorkspaceStore', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('records recent workspaces and last path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gd-ws-'))
    dirs.push(dir)
    const store = new WorkspaceStore(join(dir, 'app-state.json'))
    store.recordOpen('/tmp/proj-a')
    const s = store.recordOpen('/tmp/proj-b')
    expect(s.lastWorkspacePath).toBe('/tmp/proj-b')
    expect(s.recentWorkspaces.map((w) => w.path)).toEqual([
      '/tmp/proj-b',
      '/tmp/proj-a'
    ])
    const loaded = store.load()
    expect(loaded.lastWorkspacePath).toBe('/tmp/proj-b')
  })
})
