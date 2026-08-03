/**
 * Routines 持久化（T018）
 * 路径：userData/routines.json（与 sessions-meta 同级，不进 git）
 */
import { existsSync, readFileSync } from 'node:fs'
import { writeJsonAtomic } from './atomic-write.js'
import { join } from 'node:path'
import {
  ROUTINE_RUNS_MAX,
  type Routine,
  type RoutineCreateInput,
  type RoutinePatch,
  type RoutineRun,
  type RoutineTrigger
} from './routine-types.js'

export interface RoutineStoreData {
  version: 1
  routines: Routine[]
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeTriggers(raw: unknown): RoutineTrigger[] {
  if (!Array.isArray(raw)) return []
  const out: RoutineTrigger[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const o = t as Record<string, unknown>
    const kind = o.kind
    if (kind !== 'daily' && kind !== 'weekly' && kind !== 'interval') continue
    const tr: RoutineTrigger = { kind }
    if (typeof o.time === 'string') tr.time = o.time
    if (typeof o.weekday === 'number') tr.weekday = o.weekday
    if (typeof o.everyMinutes === 'number') tr.everyMinutes = o.everyMinutes
    out.push(tr)
  }
  return out
}

function normalizeRuns(raw: unknown): RoutineRun[] {
  if (!Array.isArray(raw)) return []
  const out: RoutineRun[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.sessionId !== 'string') continue
    if (typeof o.startedAt !== 'number' || typeof o.durationMs !== 'number') continue
    if (o.status !== 'ok' && o.status !== 'fail') continue
    const run: RoutineRun = {
      id: o.id,
      sessionId: o.sessionId,
      startedAt: o.startedAt,
      durationMs: o.durationMs,
      status: o.status
    }
    if (typeof o.summary === 'string') run.summary = o.summary
    out.push(run)
  }
  return out.slice(0, ROUTINE_RUNS_MAX)
}

function normalizeRoutine(raw: unknown): Routine | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  if (typeof o.instruction !== 'string') return null
  if (typeof o.workspace !== 'string') return null
  if (typeof o.model !== 'string') return null
  if (typeof o.createdAt !== 'number') return null
  const mcp = Array.isArray(o.mcpServers)
    ? o.mcpServers.filter((x): x is string => typeof x === 'string')
    : []
  const r: Routine = {
    id: o.id,
    name: o.name,
    instruction: o.instruction,
    enabled: o.enabled !== false,
    workspace: o.workspace,
    model: o.model,
    triggers: normalizeTriggers(o.triggers),
    mcpServers: mcp,
    notify: o.notify === true,
    createdAt: o.createdAt,
    runs: normalizeRuns(o.runs)
  }
  if (typeof o.effort === 'string' && o.effort) r.effort = o.effort
  return r
}

export class RoutineStore {
  constructor(private filePath: string) {}

  static defaultPath(userData: string): string {
    return join(userData, 'routines.json')
  }

  load(): RoutineStoreData {
    try {
      if (!existsSync(this.filePath)) return { version: 1, routines: [] }
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
      if (!raw || typeof raw !== 'object') return { version: 1, routines: [] }
      const o = raw as Record<string, unknown>
      const list = Array.isArray(o.routines) ? o.routines : []
      const routines: Routine[] = []
      for (const item of list) {
        const r = normalizeRoutine(item)
        if (r) routines.push(r)
      }
      return { version: 1, routines }
    } catch {
      return { version: 1, routines: [] }
    }
  }

  private save(data: RoutineStoreData): void {
    writeJsonAtomic(this.filePath, data)
  }

  list(): Routine[] {
    return this.load().routines.map((r) => ({ ...r, runs: [...r.runs], triggers: [...r.triggers] }))
  }

  get(id: string): Routine | undefined {
    return this.list().find((r) => r.id === id)
  }

  create(input: RoutineCreateInput): Routine {
    const name = String(input.name ?? '').trim()
    if (!name) throw new Error('routine name 不能为空')
    const instruction = String(input.instruction ?? '').trim()
    if (!instruction) throw new Error('routine instruction 不能为空')
    const workspace = String(input.workspace ?? '').trim()
    if (!workspace) throw new Error('routine workspace 不能为空')
    const data = this.load()
    const routine: Routine = {
      id: newId('rtn'),
      name,
      instruction,
      enabled: input.enabled !== false,
      workspace,
      model: String(input.model ?? ''),
      triggers: normalizeTriggers(input.triggers),
      mcpServers: Array.isArray(input.mcpServers)
        ? input.mcpServers.filter((x): x is string => typeof x === 'string')
        : [],
      notify: input.notify === true,
      createdAt: Date.now(),
      runs: []
    }
    if (typeof input.effort === 'string' && input.effort) routine.effort = input.effort
    data.routines.unshift(routine)
    this.save(data)
    return { ...routine, runs: [], triggers: [...routine.triggers] }
  }

  update(id: string, patch: RoutinePatch): Routine {
    const data = this.load()
    const i = data.routines.findIndex((r) => r.id === id)
    if (i < 0) throw new Error(`routine not found: ${id}`)
    const cur = data.routines[i]!
    const next: Routine = { ...cur, runs: [...cur.runs], triggers: [...cur.triggers] }
    if (patch.name !== undefined) {
      const name = String(patch.name).trim()
      if (!name) throw new Error('routine name 不能为空')
      next.name = name
    }
    if (patch.instruction !== undefined) {
      const instruction = String(patch.instruction).trim()
      if (!instruction) throw new Error('routine instruction 不能为空')
      next.instruction = instruction
    }
    if (patch.workspace !== undefined) {
      const workspace = String(patch.workspace).trim()
      if (!workspace) throw new Error('routine workspace 不能为空')
      next.workspace = workspace
    }
    if (patch.model !== undefined) next.model = String(patch.model ?? '')
    if (patch.effort !== undefined) {
      if (patch.effort == null || patch.effort === '') delete next.effort
      else next.effort = String(patch.effort)
    }
    if (patch.enabled !== undefined) next.enabled = !!patch.enabled
    if (patch.notify !== undefined) next.notify = !!patch.notify
    if (patch.triggers !== undefined) next.triggers = normalizeTriggers(patch.triggers)
    if (patch.mcpServers !== undefined) {
      next.mcpServers = Array.isArray(patch.mcpServers)
        ? patch.mcpServers.filter((x): x is string => typeof x === 'string')
        : []
    }
    data.routines[i] = next
    this.save(data)
    return { ...next, runs: [...next.runs], triggers: [...next.triggers] }
  }

  remove(id: string): void {
    const data = this.load()
    const before = data.routines.length
    data.routines = data.routines.filter((r) => r.id !== id)
    if (data.routines.length === before) throw new Error(`routine not found: ${id}`)
    this.save(data)
  }

  /** 前置插入 run，截断 50 */
  prependRun(id: string, run: RoutineRun): Routine {
    const data = this.load()
    const i = data.routines.findIndex((r) => r.id === id)
    if (i < 0) throw new Error(`routine not found: ${id}`)
    const cur = data.routines[i]!
    const runs = [run, ...cur.runs].slice(0, ROUTINE_RUNS_MAX)
    const next: Routine = { ...cur, runs }
    data.routines[i] = next
    this.save(data)
    return { ...next, runs: [...runs], triggers: [...next.triggers] }
  }
}
