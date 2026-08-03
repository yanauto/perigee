import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveInWorkspace } from './workspace-path.js'

describe('resolveInWorkspace', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gd-ws-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'a.ts'), 'x', 'utf8')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('相对路径落在工作区内', () => {
    const abs = resolveInWorkspace(root, 'src/a.ts')
    expect(abs).toContain('src')
    expect(abs.endsWith('a.ts')).toBe(true)
  })

  it('越界抛错', () => {
    expect(() => resolveInWorkspace(root, '../outside')).toThrow(/越界/)
    expect(() => resolveInWorkspace(root, '/etc/passwd')).toThrow(/越界/)
  })
})
