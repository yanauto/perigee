import { describe, expect, it } from 'vitest'
import {
  applyNativeTaskEvent,
  mergeTaskEntries,
  nativeTasksList
} from './tasks-from-events'
import type { SessionEvent } from './perigee-api'

const base = {
  schemaVersion: 3 as const,
  sessionId: 'ui',
  id: 'e1',
  ts: '2026-01-01T00:00:00Z'
}

describe('applyNativeTaskEvent', () => {
  it('spawn → progress → finished', () => {
    let m = new Map()
    m = applyNativeTaskEvent(m, {
      ...base,
      type: 'subagent.spawned',
      subagentId: 'sa1',
      childSessionId: 'c1',
      subagentType: 'explore',
      description: '扫 API'
    } as SessionEvent)
    expect(nativeTasksList(m)[0]).toMatchObject({
      status: 'running',
      title: '扫 API',
      source: 'native',
      kind: 'subagent'
    })
    m = applyNativeTaskEvent(m, {
      ...base,
      id: 'e2',
      type: 'subagent.progress',
      subagentId: 'sa1',
      childSessionId: 'c1',
      durationMs: 2000,
      turnCount: 1,
      toolCallCount: 3,
      contextUsagePct: 12
    } as SessionEvent)
    expect(nativeTasksList(m)[0].progress?.toolCallCount).toBe(3)
    m = applyNativeTaskEvent(m, {
      ...base,
      id: 'e3',
      type: 'subagent.finished',
      subagentId: 'sa1',
      childSessionId: 'c1',
      status: 'completed',
      durationMs: 5000
    } as SessionEvent)
    expect(nativeTasksList(m)[0].status).toBe('done')
  })

  it('task backgrounded + completed', () => {
    let m = new Map()
    m = applyNativeTaskEvent(m, {
      ...base,
      type: 'task.backgrounded',
      taskId: 't1',
      command: 'sleep 9',
      isMonitor: false
    } as SessionEvent)
    m = applyNativeTaskEvent(m, {
      ...base,
      id: 'e2',
      type: 'task.completed',
      taskId: 't1'
    } as SessionEvent)
    expect(nativeTasksList(m)[0]).toMatchObject({ status: 'done', kind: 'bg_task' })
  })
})

describe('mergeTaskEntries', () => {
  it('原生覆盖同 id 的 tool 派生', () => {
    const merged = mergeTaskEntries(
      [
        {
          id: 'x',
          callId: 'x',
          name: 'subagent',
          title: '原生标题',
          status: 'running',
          ts: 't2',
          source: 'native',
          kind: 'subagent'
        }
      ],
      [
        {
          id: 'x',
          callId: 'tc',
          name: 'task',
          title: '工具标题',
          status: 'running',
          ts: 't1'
        }
      ]
    )
    expect(merged[0].title).toBe('原生标题')
    expect(merged[0].source).toBe('native')
  })
})
