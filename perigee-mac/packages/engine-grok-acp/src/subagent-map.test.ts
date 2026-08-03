import { describe, expect, it } from 'vitest'
import {
  isExtSessionUpdateTag,
  mapExtSessionUpdate,
  normalizeAcpNotification,
  sessionUpdateTag
} from './subagent-map.js'

describe('normalizeAcpNotification', () => {
  it('session/update 带 update', () => {
    const n = normalizeAcpNotification('session/update', {
      sessionId: 'eng-1',
      update: { sessionUpdate: 'subagent_spawned', subagent_id: 'sa' }
    })
    expect(n?.engineSessionId).toBe('eng-1')
    expect(sessionUpdateTag(n!.update)).toBe('subagent_spawned')
  })

  it('剥双包 _x.ai/session_notification', () => {
    const n = normalizeAcpNotification('_x.ai/session_notification', {
      method: 'x.ai/session_notification',
      params: {
        sessionId: 'p',
        update: {
          sessionUpdate: 'subagent_finished',
          subagent_id: 'sa',
          child_session_id: 'c',
          status: 'completed'
        }
      }
    })
    expect(n?.engineSessionId).toBe('p')
    expect(sessionUpdateTag(n!.update)).toBe('subagent_finished')
  })

  it('x.ai/task_backgrounded 顶层合成', () => {
    const n = normalizeAcpNotification('x.ai/task_backgrounded', {
      sessionId: 's',
      task_id: 4242,
      command: 'sleep 10'
    })
    expect(sessionUpdateTag(n!.update)).toBe('task_backgrounded')
    expect(n!.update.task_id).toBe(4242)
  })
})

describe('mapExtSessionUpdate', () => {
  it('subagent_spawned → subagent.spawned', () => {
    const evs = mapExtSessionUpdate('ui-1', {
      sessionUpdate: 'subagent_spawned',
      subagent_id: 'sub-1',
      parent_session_id: 'p',
      child_session_id: 'c',
      subagent_type: 'explore',
      description: '扫依赖'
    })
    expect(evs).toHaveLength(1)
    expect(evs[0]).toMatchObject({
      type: 'subagent.spawned',
      sessionId: 'ui-1',
      subagentId: 'sub-1',
      childSessionId: 'c',
      subagentType: 'explore',
      description: '扫依赖'
    })
  })

  it('subagent_progress / finished', () => {
    const prog = mapExtSessionUpdate('ui', {
      sessionUpdate: 'subagent_progress',
      subagent_id: 's',
      child_session_id: 'c',
      duration_ms: 5000,
      turn_count: 2,
      tool_call_count: 4,
      tokens_used: 1000,
      context_usage_pct: 10
    })
    expect(prog[0]).toMatchObject({
      type: 'subagent.progress',
      durationMs: 5000,
      turnCount: 2,
      toolCallCount: 4
    })
    const fin = mapExtSessionUpdate('ui', {
      sessionUpdate: 'subagent_finished',
      subagent_id: 's',
      child_session_id: 'c',
      status: 'failed',
      error: 'boom',
      tool_calls: 1,
      turns: 1,
      duration_ms: 9
    })
    expect(fin[0]).toMatchObject({
      type: 'subagent.finished',
      status: 'failed',
      error: 'boom'
    })
  })

  it('task_backgrounded / completed', () => {
    const bg = mapExtSessionUpdate('ui', {
      sessionUpdate: 'task_backgrounded',
      task_id: 't1',
      tool_call_id: 'tc',
      command: 'npm test',
      monitor_description: 'watch'
    })
    expect(bg[0]).toMatchObject({
      type: 'task.backgrounded',
      taskId: 't1',
      isMonitor: true
    })
    const done = mapExtSessionUpdate('ui', {
      sessionUpdate: 'task_completed',
      task_snapshot: { task_id: 99 },
      will_wake: true
    })
    expect(done[0]).toMatchObject({
      type: 'task.completed',
      taskId: '99',
      willWake: true
    })
  })

  it('缺 id 不产出事件', () => {
    expect(mapExtSessionUpdate('ui', { sessionUpdate: 'subagent_spawned' })).toEqual([])
  })
})

describe('isExtSessionUpdateTag', () => {
  it('识别扩展 tag', () => {
    expect(isExtSessionUpdateTag('subagent_spawned')).toBe(true)
    expect(isExtSessionUpdateTag('agent_message_chunk')).toBe(false)
  })
})
