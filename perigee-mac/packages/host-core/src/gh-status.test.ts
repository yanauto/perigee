import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fetchGhStatus } from './gh-status.js'

describe('fetchGhStatus', () => {
  it('无路径失败', () => {
    const s = fetchGhStatus(null)
    expect(s.ok).toBe(false)
    expect(s.isGit).toBe(false)
  })

  it('普通目录 isGit=false（非 git 仓）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gd-nongit-'))
    writeFileSync(join(dir, 'readme.txt'), 'x')
    const s = fetchGhStatus(dir)
    expect(s.ok).toBe(false)
    expect(s.isGit).toBe(false)
    expect(s.detail).toMatch(/非 Git/)
  })

  it('git 仓至少返回 branch 且 isGit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gd-gh-'))
    execFileSync('git', ['init'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
    writeFileSync(join(dir, 'a.txt'), 'x')
    execFileSync('git', ['add', '.'], { cwd: dir })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir })
    const s = fetchGhStatus(dir)
    expect(s.ok).toBe(true)
    expect(s.isGit).toBe(true)
    expect(s.branch).toBeTruthy()
    expect(s.dirty).toBe(false)
  })
})
