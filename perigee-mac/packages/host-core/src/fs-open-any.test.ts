import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { FsService } from './fs-service.js'
import { resolveAnyPath, resolveInWorkspace } from './path-guard.js'

/**
 * T027：fs 通道解除工作区越界限制后的行为与错误语义（真实文件系统，不 mock）。
 * 背景：真机上右栏读 ~/Desktop/Text.md 报「路径越界工作区」——该拦截已摘除。
 */

const ws = mkdtempSync(join(tmpdir(), 't027-ws-'))
const outside = mkdtempSync(join(tmpdir(), 't027-out-'))
afterAll(() => {
  rmSync(ws, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

const fs = new FsService(ws)

describe('resolveAnyPath：解析但不做包含检查', () => {
  it('工作区外的绝对路径照常解析（resolveInWorkspace 仍会拒）', () => {
    const target = join(outside, 'a.txt')
    expect(resolveAnyPath(ws, target)).toContain('t027-out-')
    expect(() => resolveInWorkspace(ws, target)).toThrow(/越界/)
  })

  it('相对路径仍以工作区为基准（既有调用语义不变）', () => {
    expect(resolveAnyPath(ws, 'src/a.ts')).toBe(join(resolveAnyPath(ws, '.'), 'src/a.ts'))
  })

  it('~ 之外的任意绝对路径都可解析（含用户主目录）', () => {
    expect(resolveAnyPath(ws, join(homedir(), 'Desktop/Text.md'))).toContain('Desktop')
  })
})

describe('readText / writeText：跨工作区可读可写', () => {
  it('读工作区外的文件成功（就是真机那条报错的场景）', () => {
    const p = join(outside, 'Text.md')
    writeFileSync(p, '# 桌面文档\n')
    const r = fs.readText(p)
    expect(r.content).toBe('# 桌面文档\n')
    expect(r.path).toContain('Text.md')
  })

  it('写工作区外的文件成功，且父目录自动创建', () => {
    const p = join(outside, 'nested/deep/note.txt')
    const abs = fs.writeText(p, 'hello')
    expect(readFileSync(abs, 'utf8')).toBe('hello')
  })

  it('exists 对工作区外文件返回真（旧实现越界一律 false）', () => {
    expect(fs.exists(join(outside, 'Text.md'))).toBe(true)
    expect(fs.exists(join(outside, '不存在.md'))).toBe(false)
  })
})

describe('放开后的错误语义（不再是「越界」）', () => {
  it('文件不存在 → fs.not_found', () => {
    try {
      fs.readText(join(outside, 'nope.md'))
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('fs.not_found')
      expect((e as Error).message).toMatch(/文件不存在/)
      expect((e as Error).message).not.toMatch(/越界/)
    }
  })

  it('目录当文件读 → fs.is_directory', () => {
    const d = join(outside, 'adir')
    mkdirSync(d, { recursive: true })
    try {
      fs.readText(d)
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('fs.is_directory')
      expect((e as Error).message).toMatch(/目录/)
    }
  })

  it('无读取权限 → fs.permission_denied', () => {
    const p = join(outside, 'secret.txt')
    writeFileSync(p, 'x')
    chmodSync(p, 0o000)
    try {
      if (process.getuid?.() === 0) return // root 无视权限位，跳过
      fs.readText(p)
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('fs.permission_denied')
      expect((e as Error).message).toMatch(/权限/)
    } finally {
      chmodSync(p, 0o600)
    }
  })

  it('写入无权限目录 → fs.permission_denied', () => {
    if (process.getuid?.() === 0) return
    const d = join(outside, 'ro')
    mkdirSync(d, { recursive: true })
    chmodSync(d, 0o500)
    try {
      fs.writeText(join(d, 'x.txt'), 'y')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('fs.permission_denied')
    } finally {
      chmodSync(d, 0o700)
    }
  })
})

describe('文件树导航语义不变（listDir 仍以工作区为根）', () => {
  it('列工作区内目录正常', () => {
    mkdirSync(join(ws, 'src'), { recursive: true })
    writeFileSync(join(ws, 'src/a.ts'), 'x')
    expect(fs.listDir('.', 2).some((e) => e.name === 'a.ts')).toBe(true)
  })

  it('列工作区外目录仍被拒（放开的是打开/保存，不是导航）', () => {
    expect(() => fs.listDir(outside, 1)).toThrow(/越界/)
  })
})
