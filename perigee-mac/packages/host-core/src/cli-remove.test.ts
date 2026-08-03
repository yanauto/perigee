import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { isSafeCliSessionId, removeExternalCliSession } from './cli-sessions.js'

/**
 * T030 物理删除的安全闸：删除是破坏性操作，路径包含检查必须严
 * （与 T027 放开 fs 读写不冲突——读写是能力，删除是破坏）。
 */

let home: string | null = null
const setup = (): { home: string; sessions: string } => {
  home = mkdtempSync(join(tmpdir(), 't030-home-'))
  const sessions = join(home, 'sessions')
  mkdirSync(sessions, { recursive: true })
  return { home, sessions }
}
const mkSession = (sessions: string, cwdKey: string, id: string): string => {
  const d = join(sessions, cwdKey, id)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'summary.json'), JSON.stringify({ info: { id, cwd: '/repo' } }))
  writeFileSync(join(d, 'events.jsonl'), '{}\n')
  return d
}
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true })
  home = null
})

describe('removeExternalCliSession：正常删除', () => {
  it('物理删掉该会话目录，同级会话不受影响', () => {
    const { home: h, sessions } = setup()
    const a = mkSession(sessions, '%2Frepo', '019fc0cd-aaaa')
    const b = mkSession(sessions, '%2Frepo', '019fc0cd-bbbb')
    const r = removeExternalCliSession('019fc0cd-aaaa', { grokHome: h })
    expect(r.ok).toBe(true)
    expect(existsSync(a)).toBe(false)
    expect(existsSync(b)).toBe(true)
    expect(existsSync(sessions)).toBe(true) // 根目录不能被带走
  })

  it('删不存在的 id → not_found（幂等，不炸）', () => {
    const { home: h } = setup()
    expect(removeExternalCliSession('nope-nope', { grokHome: h })).toMatchObject({
      ok: false,
      reason: 'not_found'
    })
  })
})

describe('安全闸：逃逸路径一律拒绝', () => {
  it('id 含上跳 / 分隔符 / 绝对路径 → invalid_id，且不动磁盘', () => {
    const { home: h, sessions } = setup()
    const keep = mkSession(sessions, '%2Frepo', 'keep-me')
    for (const bad of [
      '../',
      '../../etc',
      'a/b',
      '/etc/passwd',
      '..',
      '.',
      '',
      '   ',
      'has space',
      'x'.repeat(200)
    ]) {
      const r = removeExternalCliSession(bad, { grokHome: h })
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(['invalid_id', 'not_found']).toContain(r.reason)
    }
    expect(existsSync(keep)).toBe(true)
  })

  it('isSafeCliSessionId 只认单段安全目录名', () => {
    expect(isSafeCliSessionId('019fc0cd-dbe8-7512-a76c-036f38372718')).toBe(true)
    expect(isSafeCliSessionId('a.b_c-1')).toBe(true)
    expect(isSafeCliSessionId('../x')).toBe(false)
    expect(isSafeCliSessionId('a/b')).toBe(false)
    expect(isSafeCliSessionId('')).toBe(false)
  })

  it('符号链接指向 sessions 之外 → unsafe_path，链接目标完好', () => {
    const { home: h, sessions } = setup()
    const outside = mkdtempSync(join(tmpdir(), 't030-outside-'))
    writeFileSync(join(outside, 'precious.txt'), '别删我')
    mkdirSync(join(sessions, '%2Frepo'), { recursive: true })
    symlinkSync(outside, join(sessions, '%2Frepo', 'evil-link'))

    const r = removeExternalCliSession('evil-link', { grokHome: h })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unsafe_path')
    expect(existsSync(join(outside, 'precious.txt'))).toBe(true)
    rmSync(outside, { recursive: true, force: true })
  })

  it('不允许删到 cwd 分片层（深度必须是 根/<cwd-key>/<id>）', () => {
    const { home: h, sessions } = setup()
    mkSession(sessions, '%2Frepo', 'aaa')
    // cwd 分片本身当作 id 传进来：它在根下深度为 1 → 拒绝
    const r = removeExternalCliSession('%2Frepo', { grokHome: h })
    expect(r.ok).toBe(false)
    expect(existsSync(join(sessions, '%2Frepo'))).toBe(true)
  })

  it('sessions 根不存在时安全返回，不创建也不删除', () => {
    const h = mkdtempSync(join(tmpdir(), 't030-empty-'))
    expect(removeExternalCliSession('anything', { grokHome: h })).toMatchObject({ ok: false })
    expect(existsSync(join(h, 'sessions'))).toBe(false)
    rmSync(h, { recursive: true, force: true })
  })
})
