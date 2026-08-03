import { resolve, join } from 'node:path'
import { mkdtempSync, symlinkSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { resolveInWorkspace } from './path-guard.js'

describe('path-guard', () => {
  it('allows relative inside workspace', () => {
    // 返回真实路径（/tmp 在 macOS 是 /private/tmp 的符号链接）
    const p = resolveInWorkspace(resolve('/tmp/ws'), 'src/a.ts')
    expect(p.endsWith(join('ws', 'src', 'a.ts'))).toBe(true)
    expect(p.includes('..')).toBe(false)
  })

  it('blocks traversal', () => {
    expect(() => resolveInWorkspace(resolve('/tmp/ws'), '../etc/passwd')).toThrow(/越界/)
  })

  it('符号链接根与真实路径互通（macOS /var→/private/var 场景）', () => {
    const real = mkdtempSync(join(tmpdir(), 'pg-real-'))
    const link = join(tmpdir(), `pg-link-${Date.now()}`)
    symlinkSync(real, link)
    try {
      // 链接根 + 真实路径 target（尚未存在的文件也算在内）
      const realNew = join(realpathSync(real), 'new.txt')
      expect(resolveInWorkspace(link, join(real, 'new.txt'))).toBe(realNew)
      // 真实根 + 链接路径 target
      expect(resolveInWorkspace(real, join(link, 'new.txt'))).toBe(realNew)
      // 相对路径不受影响
      expect(resolveInWorkspace(link, 'src/a.ts')).toBe(join(realpathSync(real), 'src/a.ts'))
    } finally {
      rmSync(link, { force: true })
      rmSync(real, { recursive: true, force: true })
    }
  })

  it('相对路径用平台 sep 拼接后仍在工作区内', () => {
    const root = mkdtempSync(join(tmpdir(), 'pg-sep-'))
    try {
      const rel = join('sub', 'a.ts')
      const abs = resolveInWorkspace(root, rel)
      expect(abs.startsWith(realpathSync(root))).toBe(true)
      expect(abs.endsWith(join('sub', 'a.ts'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
