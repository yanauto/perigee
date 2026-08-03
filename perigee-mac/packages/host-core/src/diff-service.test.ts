import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DiffService } from './diff-service.js'

describe('DiffService path-level capture', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('captures nested path before write and rejects restore', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-diff-'))
    dirs.push(root)
    const nested = join(root, 'src', 'a')
    mkdirSync(nested, { recursive: true })
    const file = join(nested, 'b.ts')
    writeFileSync(file, ' cons t x = 1\n'.replace(' cons t', 'const'), 'utf8')
    writeFileSync(file, 'const x = 1\n', 'utf8')

    const diff = new DiffService(root)
    diff.captureFromToolArgs('ses1', { target_file: 'src/a/b.ts' })
    writeFileSync(file, 'const x = 2\n', 'utf8')
    const rec = diff.noteChanged('ses1', 'src/a/b.ts')
    expect(rec).not.toBeNull()
    expect(rec!.before).toBe('const x = 1\n')
    expect(rec!.after).toBe('const x = 2\n')
    expect(rec!.relativePath).toBe('src/a/b.ts')

    diff.reject(rec!.id)
    expect(readFileSync(file, 'utf8')).toBe('const x = 1\n')
  })

  it('new file: before null, reject deletes', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-diff2-'))
    dirs.push(root)
    const diff = new DiffService(root)
    diff.captureFromToolArgs('ses1', { path: 'new.md' })
    writeFileSync(join(root, 'new.md'), 'hi\n', 'utf8')
    const rec = diff.noteChanged('ses1', 'new.md')
    expect(rec!.before).toBeNull()
    diff.reject(rec!.id)
    expect(() => readFileSync(join(root, 'new.md'))).toThrow()
  })

  it('引擎权威 hint：绕过磁盘快照竞态（yolo 下 tool_call 晚于写盘）', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-diff3-'))
    dirs.push(root)
    const diff = new DiffService(root)
    // 模拟竞态：capture 时文件已被写（快照到的是 after）
    writeFileSync(join(root, 'x.txt'), 'ok\n', 'utf8')
    diff.captureFromToolArgs('ses1', { file_path: 'x.txt' })
    // 磁盘路径判定不出 diff（before===after），hint 路径可以
    expect(diff.noteChanged('ses1', 'x.txt')).toBeNull()
    const rec = diff.noteChanged('ses1', 'x.txt', { before: null, after: 'ok\n' })
    expect(rec).not.toBeNull()
    expect(rec!.before).toBeNull()
    expect(rec!.after).toBe('ok\n')
    // 后续 hint 推进 after，before 不被覆盖
    const rec2 = diff.noteChanged('ses1', 'x.txt', { before: 'ok\n', after: 'ok\nv2\n' })
    expect(rec2!.before).toBeNull()
    expect(rec2!.after).toBe('ok\nv2\n')
    // reject 按 before=null 还原（删文件）
    diff.reject(rec!.id)
    expect(() => readFileSync(join(root, 'x.txt'))).toThrow()
  })

  it('T021：endTurn 后 idle 刷新不产生同路径重复 FileDiff', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-diff4-'))
    dirs.push(root)
    const file = join(root, 'one.txt')
    writeFileSync(file, 'v0\n', 'utf8')
    const diff = new DiffService(root)
    diff.beginTurn('ses1', 'turn_a')
    diff.captureBefore('ses1', 'one.txt')
    writeFileSync(file, 'v1\n', 'utf8')
    const r1 = diff.noteChanged('ses1', 'one.txt')
    expect(r1).not.toBeNull()
    expect(diff.list('ses1')).toHaveLength(1)

    // 模拟 turn-tracker endTurn + wireBus idle 再 noteChanged
    diff.endTurn('ses1')
    const r2 = diff.noteChanged('ses1', 'one.txt')
    expect(diff.list('ses1').filter((d) => d.status === 'pending')).toHaveLength(1)
    expect(r2!.id).toBe(r1!.id)

    // 新轮允许新记录（revertTurn 需要）
    diff.beginTurn('ses1', 'turn_b')
    diff.captureBefore('ses1', 'one.txt')
    writeFileSync(file, 'v2\n', 'utf8')
    const r3 = diff.noteChanged('ses1', 'one.txt')
    expect(r3!.id).not.toBe(r1!.id)
    expect(diff.list('ses1').filter((d) => d.relativePath === 'one.txt')).toHaveLength(2)
  })

  it('listMeta 省略 before/after 并带行统计', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-diff6-'))
    dirs.push(root)
    writeFileSync(join(root, 'm.txt'), 'a\n', 'utf8')
    const diff = new DiffService(root)
    diff.captureFromToolArgs('ses1', { path: 'm.txt' })
    writeFileSync(join(root, 'm.txt'), 'a\nb\n', 'utf8')
    const full = diff.noteChanged('ses1', 'm.txt')
    expect(full?.before).toBe('a\n')
    const meta = diff.listMeta('ses1')
    expect(meta).toHaveLength(1)
    expect(meta[0]!.before).toBeNull()
    expect(meta[0]!.after).toBeNull()
    expect(meta[0]!.contentOmitted).toBe(true)
    expect(typeof meta[0]!.lineAdd).toBe('number')
  })

  it('并发会话 beginTurn 不踩踏对方快照', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-diff5-'))
    dirs.push(root)
    const fa = join(root, 'a.txt')
    const fb = join(root, 'b.txt')
    writeFileSync(fa, 'A0\n', 'utf8')
    writeFileSync(fb, 'B0\n', 'utf8')
    const diff = new DiffService(root)
    diff.beginTurn('sesA', 't1')
    diff.captureBefore('sesA', 'a.txt')
    diff.beginTurn('sesB', 't1')
    diff.captureBefore('sesB', 'b.txt')
    writeFileSync(fa, 'A1\n', 'utf8')
    writeFileSync(fb, 'B1\n', 'utf8')
    const ra = diff.noteChanged('sesA', 'a.txt')
    const rb = diff.noteChanged('sesB', 'b.txt')
    expect(ra!.before).toBe('A0\n')
    expect(rb!.before).toBe('B0\n')
  })
})
