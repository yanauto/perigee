import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EventBus } from './event-bus.js'
import { DiffService } from './diff-service.js'
import { TurnTracker } from './turn-tracker.js'
import type { SessionEvent } from '@perigee/event-schema'

const base = { schemaVersion: 3 as const, sessionId: 's1' }
let seq = 0
function ev<T extends Partial<SessionEvent> & { type: SessionEvent['type'] }>(e: T): SessionEvent {
  seq += 1
  return { ...base, id: `e${seq}`, ts: new Date(Date.now() + seq).toISOString(), ...e } as SessionEvent
}

describe('TurnTracker + DiffService', () => {
  let dir: string
  let bus: EventBus
  let diffs: DiffService
  let tracker: TurnTracker
  let summaries: SessionEvent[]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'turn-tracker-'))
    bus = new EventBus()
    diffs = new DiffService(dir)
    tracker = new TurnTracker(bus)
    tracker.attach(() => diffs)
    summaries = []
    bus.subscribe((e) => {
      if (e.type === 'turn.summary') summaries.push(e)
    })
  })

  afterEach(() => {
    tracker.dispose()
    rmSync(dir, { recursive: true, force: true })
  })

  it('capture 时文件尚未写盘，收轮时兜底生成 diff 并挂 turnId', () => {
    bus.publish(ev({ type: 'user.message', text: '干活' }))
    diffs.captureBefore('s1', 'late.txt') // 此刻文件不存在，快照为 null
    writeFileSync(join(dir, 'late.txt'), 'new content')
    bus.publish(ev({ type: 'turn.end', stopReason: 'end_turn' }))

    const list = diffs.list('s1')
    expect(list.map((d) => d.relativePath)).toContain('late.txt')
    const s = summaries[0]
    if (s.type !== 'turn.summary') throw new Error('expect turn.summary')
    expect(list.find((d) => d.relativePath === 'late.txt')?.turnId).toBe(s.turnId)
  })

  it('多轮改同一文件：按轮各自记录 before，打回旧轮被防护跳过', () => {
    const file = join(dir, 'multi.txt')
    // 轮 1：创建（hint 路径）
    bus.publish(ev({ type: 'user.message', text: '创建' }))
    diffs.noteChanged('s1', 'multi.txt', { before: null, after: 'v1\n' })
    writeFileSync(file, 'v1\n')
    bus.publish(ev({ type: 'turn.end', stopReason: 'end_turn' }))
    // 轮 2：修改（hint 路径）
    bus.publish(ev({ type: 'user.message', text: '改' }))
    diffs.noteChanged('s1', 'multi.txt', { before: 'v1\n', after: 'v2\n' })
    writeFileSync(file, 'v2\n')
    bus.publish(ev({ type: 'turn.end', stopReason: 'end_turn' }))

    const [s1, s2] = summaries
    if (s1.type !== 'turn.summary' || s2.type !== 'turn.summary')
      throw new Error('expect two turn.summary')
    const all = diffs.list('s1')
    expect(all).toHaveLength(2)
    const r1 = all.find((d) => d.turnId === s1.turnId)!
    const r2 = all.find((d) => d.turnId === s2.turnId)!
    expect(r1.before).toBeNull()
    expect(r2.before).toBe('v1\n')

    // 打回轮 1：文件在轮 2 被改过 → 防护跳过，磁盘不动
    expect(diffs.revertTurn('s1', s1.turnId)).toHaveLength(0)
    expect(readFileSync(file, 'utf8')).toBe('v2\n')
    // 打回轮 2：还原到 v1
    expect(diffs.revertTurn('s1', s2.turnId)).toHaveLength(1)
    expect(readFileSync(file, 'utf8')).toBe('v1\n')
  })

  it('file.changed 绝对路径归一为工作区相对路径', () => {
    bus.publish(ev({ type: 'user.message', text: '干活' }))
    bus.publish(ev({ type: 'file.changed', path: join(dir, 'abs.ts'), kind: 'created' }))
    bus.publish(ev({ type: 'turn.end', stopReason: 'end_turn' }))

    expect(summaries).toHaveLength(1)
    const s = summaries[0]
    if (s.type !== 'turn.summary') throw new Error('expect turn.summary')
    expect(s.filesChanged).toEqual(['abs.ts'])
  })

  it('收轮时聚合发布 turn.summary（文件/工具/耗时/测试信号）', () => {
    bus.publish(ev({ type: 'user.message', text: '干活' }))
    bus.publish(
      ev({ type: 'tool.call', name: 'run_command', args: { command: 'pnpm test' }, callId: 'c1' })
    )
    bus.publish(ev({ type: 'tool.result', callId: 'c1', ok: true, result: '10 passed' }))
    bus.publish(ev({ type: 'file.changed', path: 'src/a.ts', kind: 'modified' }))
    bus.publish(ev({ type: 'usage', inputTokens: 100, outputTokens: 50 }))
    bus.publish(ev({ type: 'turn.end', stopReason: 'end_turn' }))

    expect(summaries).toHaveLength(1)
    const s = summaries[0]
    if (s.type !== 'turn.summary') throw new Error('expect turn.summary')
    expect(s.filesChanged).toEqual(['src/a.ts'])
    expect(s.toolsRun).toBe(1)
    expect(s.testSignal).toBe('pass')
    expect(s.risk).toBe('normal')
    expect(s.inputTokens).toBe(100)
    expect(s.turnId).toMatch(/^turn_/)
  })

  it('测试失败与高风险（删除/敏感路径）', () => {
    bus.publish(ev({ type: 'user.message', text: '危险操作' }))
    bus.publish(ev({ type: 'tool.call', name: 'run_command', args: { command: 'pytest' }, callId: 'c1' }))
    bus.publish(ev({ type: 'tool.result', callId: 'c1', ok: false, result: '1 failed' }))
    bus.publish(ev({ type: 'file.changed', path: '.env', kind: 'modified' }))
    bus.publish(ev({ type: 'file.changed', path: 'old.ts', kind: 'deleted' }))
    bus.publish(ev({ type: 'session.status', status: 'idle' }))

    const s = summaries[0]
    if (s.type !== 'turn.summary') throw new Error('expect turn.summary')
    expect(s.testSignal).toBe('fail')
    expect(s.risk).toBe('elevated')
    expect(s.riskReasons.join(' ')).toContain('敏感路径')
    expect(s.riskReasons.join(' ')).toContain('删除')
  })

  it('diff 打上 turnId，revertTurn 只还原该轮', () => {
    writeFileSync(join(dir, 'a.txt'), 'v1', 'utf8')
    // 轮 1：修改 a.txt
    bus.publish(ev({ type: 'user.message', text: '轮1' }))
    diffs.captureBefore('s1', 'a.txt')
    writeFileSync(join(dir, 'a.txt'), 'v2', 'utf8')
    bus.publish(ev({ type: 'file.changed', path: 'a.txt', kind: 'modified' }))
    const rec1 = diffs.noteChanged('s1', 'a.txt')
    bus.publish(ev({ type: 'turn.end', stopReason: 'end_turn' }))
    const turn1 = tracker === null ? '' : (summaries[0] as { turnId: string }).turnId
    expect(rec1?.turnId).toBe(turn1)

    // 轮 2：创建 b.txt
    bus.publish(ev({ type: 'user.message', text: '轮2' }))
    diffs.captureBefore('s1', 'b.txt') // 模拟 tool.call 前的快照（真实流程由 captureFromToolArgs 做）
    writeFileSync(join(dir, 'b.txt'), 'new', 'utf8')
    bus.publish(ev({ type: 'file.changed', path: 'b.txt', kind: 'created' }))
    const rec2 = diffs.noteChanged('s1', 'b.txt')
    bus.publish(ev({ type: 'turn.end', stopReason: 'end_turn' }))
    const turn2 = (summaries[1] as { turnId: string }).turnId
    expect(rec2?.turnId).toBe(turn2)

    // 打回轮 2：b.txt 应被删除，a.txt 保持 v2
    const reverted = diffs.revertTurn('s1', turn2)
    expect(reverted).toHaveLength(1)
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('v2')
    expect(() => readFileSync(join(dir, 'b.txt'), 'utf8')).toThrow()

    // 打回轮 1：a.txt 还原 v1
    diffs.revertTurn('s1', turn1)
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('v1')
  })
})
