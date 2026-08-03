import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { RoutineStore } from './routine-store.js'
import { ROUTINE_RUNS_MAX } from './routine-types.js'

function tmpPath(): string {
  return join(tmpdir(), `routines-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
}

const baseInput = {
  name: '夜间扫描',
  instruction: '检查仓库状态并汇总',
  enabled: true,
  workspace: '/tmp/ws',
  model: 'grok-4.5',
  triggers: [{ kind: 'daily' as const, time: '02:30' }],
  mcpServers: [] as string[],
  notify: false
}

describe('RoutineStore', () => {
  it('create / list / get / update / remove 持久化', () => {
    const path = tmpPath()
    const s = new RoutineStore(path)
    const r = s.create(baseInput)
    expect(r.id).toMatch(/^rtn_/)
    expect(r.runs).toEqual([])
    expect(r.createdAt).toBeGreaterThan(0)
    expect(s.list()).toHaveLength(1)
    expect(s.get(r.id)?.name).toBe('夜间扫描')

    const u = s.update(r.id, { name: '改名', enabled: false, notify: true })
    expect(u.name).toBe('改名')
    expect(u.enabled).toBe(false)
    expect(u.notify).toBe(true)

    const s2 = new RoutineStore(path)
    expect(s2.get(r.id)?.name).toBe('改名')
    s2.remove(r.id)
    expect(s2.list()).toHaveLength(0)
    rmSync(path, { force: true })
  })

  it('prependRun 新在前且截断 50', () => {
    const path = tmpPath()
    const s = new RoutineStore(path)
    const r = s.create(baseInput)
    for (let i = 0; i < ROUTINE_RUNS_MAX + 5; i++) {
      s.prependRun(r.id, {
        id: `run_${i}`,
        sessionId: `ses_${i}`,
        startedAt: 1000 + i,
        durationMs: 10,
        status: 'ok',
        summary: `n${i}`
      })
    }
    const runs = s.get(r.id)!.runs
    expect(runs).toHaveLength(ROUTINE_RUNS_MAX)
    expect(runs[0]!.id).toBe(`run_${ROUTINE_RUNS_MAX + 4}`)
    expect(runs[ROUTINE_RUNS_MAX - 1]!.id).toBe(`run_5`)
    rmSync(path, { force: true })
  })

  it('校验：空 name / instruction / workspace', () => {
    const path = tmpPath()
    const s = new RoutineStore(path)
    expect(() => s.create({ ...baseInput, name: '  ' })).toThrow(/name/)
    expect(() => s.create({ ...baseInput, instruction: '' })).toThrow(/instruction/)
    expect(() => s.create({ ...baseInput, workspace: '' })).toThrow(/workspace/)
    rmSync(path, { force: true })
  })
})
