import { describe, expect, it } from 'vitest'
import type { SessionEvent } from './perigee-api'
import { reduceEvent, seedBlocks } from './session-reducer'

const base = { schemaVersion: 3 as const, sessionId: 's1' }
let seq = 0
function ev<T extends Partial<SessionEvent> & { type: SessionEvent['type'] }>(e: T): SessionEvent {
  seq += 1
  return { ...base, id: `e${seq}`, ts: new Date(seq * 1000).toISOString(), ...e } as SessionEvent
}

describe('session-reducer', () => {
  it('delta 累计进流式块，message 收尾替换', () => {
    let blocks = reduceEvent([], ev({ type: 'assistant.delta', text: '你' }))
    blocks = reduceEvent(blocks, ev({ type: 'assistant.delta', text: '好' }))
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'assistant', text: '你好', streaming: true })

    blocks = reduceEvent(blocks, ev({ type: 'assistant.message', text: '你好！' }))
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'assistant', text: '你好！' })
    expect('streaming' in blocks[0] && blocks[0].streaming).toBeFalsy()
  })

  it('tool.call / tool.result 按 callId 配对', () => {
    let blocks = reduceEvent(
      [],
      ev({ type: 'tool.call', name: 'run_command', args: { command: 'ls' }, callId: 'c1' })
    )
    blocks = reduceEvent(blocks, ev({ type: 'tool.result', callId: 'c1', ok: true, result: 'a.txt' }))
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'tool', callId: 'c1', status: 'done', result: 'a.txt' })
  })

  it('tool.call 缺 callId 时回退事件 id 配对', () => {
    let blocks = reduceEvent([], ev({ type: 'tool.call', name: 'read_file', args: {} }))
    const callEv = blocks[0]
    if (callEv.kind !== 'tool') throw new Error('expect tool')
    blocks = reduceEvent(blocks, ev({ type: 'tool.result', callId: callEv.id, ok: false, result: 'x' }))
    expect(blocks[0]).toMatchObject({ kind: 'tool', status: 'error' })
  })

  it('空流式块在 turn.end 时被清理', () => {
    let blocks = reduceEvent([], ev({ type: 'user.message', text: 'hi' }))
    blocks = reduceEvent(blocks, ev({ type: 'assistant.delta', text: '' }))
    blocks = reduceEvent(blocks, ev({ type: 'turn.end', stopReason: 'end_turn' }))
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('user')
  })

  it('plan 事件整单原地更新', () => {
    let blocks = reduceEvent([], ev({ type: 'plan', entries: [{ content: '第一步', status: 'pending' }] }))
    blocks = reduceEvent(
      blocks,
      ev({ type: 'plan', entries: [{ content: '第一步', status: 'completed' }] })
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'plan', entries: [{ text: '第一步', status: 'completed' }] })
  })

  it('approval.resolved 移除 pending 审批块（不留已允许/已拒绝痕迹）', () => {
    let blocks = reduceEvent(
      [],
      ev({ type: 'approval.requested', action: 'run', detail: 'rm -rf x', risk: 'high' })
    )
    expect(blocks).toHaveLength(1)
    blocks = reduceEvent(blocks, ev({ type: 'approval.resolved', requestId: 'whatever', approved: true }))
    expect(blocks).toHaveLength(0)
    // 拒绝同样清掉
    blocks = reduceEvent(
      [],
      ev({ type: 'approval.requested', action: 'run', detail: 'x', risk: 'low' })
    )
    blocks = reduceEvent(blocks, ev({ type: 'approval.resolved', requestId: 'x', approved: false }))
    expect(blocks).toHaveLength(0)
  })

  it('seedBlocks 从历史还原并清掉流式态', () => {
    const blocks = seedBlocks([
      ev({ type: 'user.message', text: '问题' }),
      ev({ type: 'assistant.delta', text: '半截回复' }),
      ev({ type: 'error', message: 'boom', code: 'engine.timeout' })
    ])
    expect(blocks.map((b) => b.kind)).toEqual(['user', 'assistant', 'error'])
    expect('streaming' in blocks[1] && blocks[1].streaming).toBeFalsy()
  })

  it('同 id 消息去重（历史 + 实时并发）', () => {
    const m = ev({ type: 'assistant.message', text: '唯一' })
    let blocks = reduceEvent([], m)
    blocks = reduceEvent(blocks, m)
    expect(blocks).toHaveLength(1)
  })

  it('turn.summary → turn 块（轮次卡数据）', () => {
    const blocks = reduceEvent(
      [],
      ev({
        type: 'turn.summary',
        turnId: 'turn_1',
        filesChanged: ['a.ts', 'b.ts'],
        toolsRun: 3,
        testSignal: 'pass',
        risk: 'normal',
        riskReasons: [],
        durationMs: 4200,
        inputTokens: 100,
        outputTokens: 50
      })
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      kind: 'turn',
      turnId: 'turn_1',
      filesChanged: ['a.ts', 'b.ts'],
      toolsRun: 3,
      testSignal: 'pass'
    })
  })

  it('真引擎序：turn.summary 先于 assistant.message 时，结语插到轮次卡前', () => {
    let blocks = reduceEvent([], ev({ type: 'assistant.delta', text: '做完了' }))
    blocks = reduceEvent(
      blocks,
      ev({
        type: 'turn.summary',
        turnId: 'turn_1',
        filesChanged: ['a.ts'],
        toolsRun: 1,
        testSignal: 'none',
        risk: 'normal',
        riskReasons: []
      })
    )
    blocks = reduceEvent(blocks, ev({ type: 'turn.end', stopReason: 'end_turn' }))
    blocks = reduceEvent(blocks, ev({ type: 'assistant.message', text: '做完了' }))
    expect(blocks.map((b) => b.kind)).toEqual(['assistant', 'turn'])
    expect(blocks[0]).toMatchObject({ text: '做完了' })
  })

  it('approval.requested 优先使用 host requestId', () => {
    const blocks = reduceEvent(
      [],
      ev({
        type: 'approval.requested',
        action: 'run',
        detail: 'cmd',
        risk: 'medium',
        engineRequestId: 'eng_1',
        requestId: 'host_1'
      })
    )
    expect(blocks[0]).toMatchObject({ kind: 'approval', requestId: 'host_1' })
  })

  it('approval.requested 无 requestId 字段时取事件 id（host 审批 id），不用 engineRequestId（T015 修正）', () => {
    const event = ev({
      type: 'approval.requested',
      action: 'write',
      detail: '/tmp/x',
      risk: 'medium',
      engineRequestId: '1'
    })
    const blocks = reduceEvent([], event)
    expect(blocks[0]).toMatchObject({ kind: 'approval', requestId: event.id })
    expect((blocks[0] as { requestId: string }).requestId).not.toBe('1')
  })
})

/** T028：流式 → 完成的顺序稳定（治「工具段跳到正文上面」的布局重排） */
describe('顺序稳定（T028）', () => {
  const ev = (o: Record<string, unknown>) =>
    ({ schemaVersion: 3, sessionId: 's', ts: '2026-08-02T10:00:00.000Z', ...o }) as never

  const kinds = (bs: { kind: string }[]) => bs.map((b) => b.kind)

  it('流式正文在前、工具在后 → 收尾后顺序不变（原位替换，不搬到末尾）', () => {
    let blocks = reduceEvent([], ev({ type: 'user.message', id: 'u1', text: '干活' }))
    blocks = reduceEvent(blocks, ev({ type: 'assistant.delta', id: 'd1', text: '我先看看…' }))
    blocks = reduceEvent(blocks, ev({ type: 'tool.call', id: 'tc1', callId: 'c1', name: 'Grep' }))
    blocks = reduceEvent(blocks, ev({ type: 'tool.call', id: 'tc2', callId: 'c2', name: 'Bash' }))
    expect(kinds(blocks)).toEqual(['user', 'assistant', 'tool', 'tool'])

    // 轮次收尾：引擎给出完整正文
    blocks = reduceEvent(
      blocks,
      ev({ type: 'assistant.message', id: 'am1', text: '我先看看…看完了' })
    )
    // 关键断言：正文仍在工具**之前**（旧实现会变成 user,tool,tool,assistant）
    expect(kinds(blocks)).toEqual(['user', 'assistant', 'tool', 'tool'])
    const a = blocks.find((b) => b.kind === 'assistant')
    expect(a && 'text' in a ? a.text : '').toBe('我先看看…看完了')
    expect(a && 'streaming' in a ? a.streaming : undefined).toBeFalsy()
  })

  it('正文 → 工具 → 正文：两段正文各自留在原位', () => {
    let blocks = reduceEvent([], ev({ type: 'assistant.delta', id: 'd1', text: '第一段' }))
    blocks = reduceEvent(blocks, ev({ type: 'assistant.message', id: 'am1', text: '第一段' }))
    blocks = reduceEvent(blocks, ev({ type: 'tool.call', id: 'tc1', callId: 'c1', name: 'Read' }))
    blocks = reduceEvent(blocks, ev({ type: 'assistant.delta', id: 'd2', text: '第二段' }))
    blocks = reduceEvent(blocks, ev({ type: 'assistant.message', id: 'am2', text: '第二段' }))
    expect(kinds(blocks)).toEqual(['assistant', 'tool', 'assistant'])
    expect((blocks[0] as { text: string }).text).toBe('第一段')
    expect((blocks[2] as { text: string }).text).toBe('第二段')
  })

  it('思考块同样原位替换，不跳到末尾', () => {
    let blocks = reduceEvent([], ev({ type: 'thought.delta', id: 'td', text: '嗯' }))
    blocks = reduceEvent(blocks, ev({ type: 'tool.call', id: 'tc1', callId: 'c1', name: 'Grep' }))
    blocks = reduceEvent(blocks, ev({ type: 'thought.message', id: 'tm', text: '嗯，先搜' }))
    expect(kinds(blocks)).toEqual(['thought', 'tool'])
  })

  it('重复的 assistant.message 不产生第二条（幂等）', () => {
    let blocks = reduceEvent([], ev({ type: 'assistant.delta', id: 'd1', text: 'x' }))
    blocks = reduceEvent(blocks, ev({ type: 'assistant.message', id: 'am1', text: 'x' }))
    blocks = reduceEvent(blocks, ev({ type: 'assistant.message', id: 'am1', text: 'x' }))
    expect(blocks.filter((b) => b.kind === 'assistant')).toHaveLength(1)
  })
})
