import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShellRunner } from './shell-runner.js'

describe('ShellRunner', () => {
  it('flag 关时不 spawn', () => {
    const onChunk = vi.fn()
    const r = new ShellRunner(onChunk)
    expect(r.isEnabled()).toBe(false)
    const res = r.run('s1', process.cwd(), 'echo hi')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('pty_disabled')
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('flag 开时执行简单命令', async () => {
    const chunks: string[] = []
    const r = new ShellRunner((_id, c) => chunks.push(c))
    r.setEnabled(true)
    const dir = mkdtempSync(join(tmpdir(), 'gd-shell-'))
    const res = r.run('s1', dir, 'echo hello-shell')
    expect(res.ok).toBe(true)
    // 等进程结束
    await new Promise((resolve) => setTimeout(resolve, 800))
    const text = chunks.join('')
    expect(text).toContain('hello-shell')
    expect(text).toMatch(/exit 0/)
    r.dispose()
  })

  it('kill 可中止长命令', async () => {
    const chunks: string[] = []
    const r = new ShellRunner((_id, c) => chunks.push(c))
    r.setEnabled(true)
    const dir = mkdtempSync(join(tmpdir(), 'gd-shell-k-'))
    r.run('s1', dir, 'sleep 30')
    expect(r.isRunning('s1')).toBe(true)
    r.kill('s1')
    expect(r.isRunning('s1')).toBe(false)
    r.dispose()
  })
})
