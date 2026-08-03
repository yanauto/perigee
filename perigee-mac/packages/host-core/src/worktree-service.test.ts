import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { WorktreeService, isGitRepo } from './worktree-service.js'

describe('isGitRepo / WorktreeService', () => {
  let dir: string
  let wtRoot: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gd-wt-repo-'))
    wtRoot = mkdtempSync(join(tmpdir(), 'gd-wt-store-'))
    execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' })
    execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir, stdio: 'pipe' })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir, stdio: 'pipe' })
    writeFileSync(join(dir, 'a.txt'), 'hi')
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'pipe' })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(wtRoot, { recursive: true, force: true })
  })

  it('识别 git 仓', () => {
    expect(isGitRepo(dir)).toBe(true)
    expect(isGitRepo(wtRoot)).toBe(false)
  })

  it('创建并删除 worktree（仅托管目录）', () => {
    const svc = new WorktreeService(wtRoot)
    const created = svc.create(dir, 'ses_test1')
    expect(created).not.toBeNull()
    expect(created!.worktreePath.startsWith(wtRoot)).toBe(true)
    expect(existsSync(join(created!.worktreePath, 'a.txt'))).toBe(true)

    svc.remove(dir, created!.worktreePath)
    // remove 后路径应不存在或已 prune
    expect(existsSync(created!.worktreePath)).toBe(false)
  })

  it('拒绝删除托管根外路径', () => {
    const svc = new WorktreeService(wtRoot)
    const outside = join(dir, 'nope')
    // 不应抛；也不应删用户仓
    svc.remove(dir, outside)
    expect(existsSync(dir)).toBe(true)
  })

  it('status：干净 worktree 有 branch', () => {
    const svc = new WorktreeService(wtRoot)
    const created = svc.create(dir, 'ses_st')
    expect(created).not.toBeNull()
    const st = svc.status(dir, created!.worktreePath)
    expect(st.ok).toBe(true)
    expect(st.branch).toMatch(/perigee/)
    expect(st.dirty).toBe(false)
  })

  it('status：脏文件 dirty=true', () => {
    const svc = new WorktreeService(wtRoot)
    const created = svc.create(dir, 'ses_dirty')!
    writeFileSync(join(created.worktreePath, 'b.txt'), 'x')
    const st = svc.status(dir, created.worktreePath)
    expect(st.dirty).toBe(true)
    expect((st.dirtyCount ?? 0) > 0).toBe(true)
  })

  it('promote：未提交拒绝', () => {
    const svc = new WorktreeService(wtRoot)
    const created = svc.create(dir, 'ses_prom')!
    writeFileSync(join(created.worktreePath, 'c.txt'), 'y')
    const r = svc.promote({
      primaryWorkspacePath: dir,
      worktreePath: created.worktreePath,
      branch: created.branch
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('uncommitted')
  })

  it('promote：相对 primary 无新提交拒绝', () => {
    const svc = new WorktreeService(wtRoot)
    const created = svc.create(dir, 'ses_empty')!
    const r = svc.promote({
      primaryWorkspacePath: dir,
      worktreePath: created.worktreePath,
      branch: created.branch
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('no_commits')
  })

  it('promote：拒绝非托管路径', () => {
    const svc = new WorktreeService(wtRoot)
    const r = svc.promote({
      primaryWorkspacePath: dir,
      worktreePath: dir,
      branch: 'main'
    })
    expect(r.ok).toBe(false)
    expect(['not_managed', 'is_primary']).toContain(r.reason)
  })
})
