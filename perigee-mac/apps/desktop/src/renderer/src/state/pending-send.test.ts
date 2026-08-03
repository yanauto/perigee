import { describe, expect, it } from 'vitest'
import type { ChatBlock } from '../lib/types'
import {
  OPTIMISTIC_USER_ID,
  PENDING_TIMEOUT_MS,
  attachSession,
  isEchoed,
  optimisticUserBlock,
  shouldShowOptimistic,
  startPending,
  withOptimistic
} from './pending-send'

const user = (id: string, text: string): ChatBlock => ({
  kind: 'user',
  id,
  text,
  ts: '2026-08-02T10:00:00.000Z'
})
const assistant = (text: string): ChatBlock => ({
  kind: 'assistant',
  id: 'a1',
  text,
  ts: '2026-08-02T10:00:01.000Z'
})

const T0 = Date.parse('2026-08-02T10:00:00.000Z')

describe('乐观发送状态机（T025）', () => {
  it('startPending / attachSession：会话 id 建好才回填', () => {
    const p = startPending('跑一遍测试', T0)
    expect(p).toEqual({ text: '跑一遍测试', sessionId: null, startedAt: T0 })
    expect(attachSession(p, 's1').sessionId).toBe('s1')
    expect(attachSession(p, 's1').text).toBe('跑一遍测试')
  })

  it('还没有真实块时渲染乐观块（这就是「立刻切页」看到的东西）', () => {
    const p = startPending('跑一遍测试', T0)
    const out = withOptimistic([], p, T0 + 100)
    expect(out).toHaveLength(1)
    expect(out[0]!.kind).toBe('user')
    expect(out[0]!.id).toBe(OPTIMISTIC_USER_ID)
  })

  it('引擎回显同文本后撤下乐观块——不出现两条一样的用户消息', () => {
    const p = startPending('跑一遍测试', T0)
    const real = [user('ev-1', '跑一遍测试'), assistant('好的')]
    expect(isEchoed(p.text, real)).toBe(true)
    expect(withOptimistic(real, p, T0 + 500)).toEqual(real)
    expect(withOptimistic(real, p, T0 + 500)).toHaveLength(2)
  })

  it('回显判定忽略首尾空白，且不会把自己的乐观块当成回显', () => {
    const p = startPending('  跑一遍测试  ', T0)
    expect(isEchoed(p.text, [user('ev-1', '跑一遍测试')])).toBe(true)
    expect(isEchoed(p.text, [optimisticUserBlock(p)])).toBe(false)
  })

  it('别的会话内容不算回显（文本不同就还挂着）', () => {
    const p = startPending('跑一遍测试', T0)
    expect(withOptimistic([user('ev-9', '另一件事')], p, T0 + 500)).toHaveLength(2)
  })

  it('超时兜底：永不回显（slash / 异常路径）也不会永久挂着', () => {
    const p = startPending('/compact', T0)
    expect(shouldShowOptimistic(p, [], T0 + PENDING_TIMEOUT_MS - 1)).toBe(true)
    expect(shouldShowOptimistic(p, [], T0 + PENDING_TIMEOUT_MS + 1)).toBe(false)
  })

  it('没有 pending 时原样返回真实块（同一引用语义，不做无谓拷贝）', () => {
    const real = [assistant('hi')]
    expect(withOptimistic(real, null, T0)).toBe(real)
    expect(shouldShowOptimistic(null, real, T0)).toBe(false)
  })

  it('空文本视为已回显（不渲染空气泡）', () => {
    expect(isEchoed('   ', [])).toBe(true)
  })
})
