import { describe, expect, it } from 'vitest'
import {
  extractTaskMeta,
  isTaskToolName,
  tasksFromBlocks
} from './tasks-from-blocks'
import type { ChatBlock } from './types'

describe('isTaskToolName', () => {
  it('识别上游 task 族', () => {
    expect(isTaskToolName('task')).toBe(true)
    expect(isTaskToolName('wait_tasks')).toBe(true)
    expect(isTaskToolName('kill_task')).toBe(true)
    expect(isTaskToolName('get_task_output')).toBe(true)
    expect(isTaskToolName('write_file')).toBe(false)
    expect(isTaskToolName('bash')).toBe(false)
  })
})

describe('extractTaskMeta', () => {
  it('抽 description / subagent_type', () => {
    const m = extractTaskMeta({
      description: '扫依赖',
      prompt: '请分析 package.json',
      subagent_type: 'explore'
    })
    expect(m.title).toBe('扫依赖')
    expect(m.subagentType).toBe('explore')
  })
})

describe('tasksFromBlocks', () => {
  it('无 task 工具 → 空列表', () => {
    const blocks: ChatBlock[] = [
      {
        kind: 'tool',
        id: '1',
        callId: 'c1',
        name: 'read_file',
        args: {},
        status: 'done',
        ts: 't1'
      }
    ]
    expect(tasksFromBlocks(blocks)).toEqual([])
  })

  it('task call → running；result → done', () => {
    const running: ChatBlock = {
      kind: 'tool',
      id: '1',
      callId: 'tc1',
      name: 'task',
      args: { description: '探索 API', subagent_type: 'explore', prompt: ' dig ' },
      status: 'running',
      ts: '2026-01-01T00:00:00Z'
    }
    expect(tasksFromBlocks([running])[0]).toMatchObject({
      callId: 'tc1',
      title: '探索 API',
      subagentType: 'explore',
      status: 'running'
    })
    const done: ChatBlock = {
      kind: 'tool',
      id: '1',
      callId: 'tc1',
      name: 'task',
      args: { description: '探索 API', subagent_type: 'explore', prompt: ' dig ' },
      status: 'done',
      result: 'ok\n<subagent_meta>id=sub_abc, type=explore',
      ts: '2026-01-01T00:00:01Z'
    }
    const t = tasksFromBlocks([done])[0]
    expect(t.status).toBe('done')
    expect(t.resultPreview).toMatch(/sub_abc|ok/)
  })
})
