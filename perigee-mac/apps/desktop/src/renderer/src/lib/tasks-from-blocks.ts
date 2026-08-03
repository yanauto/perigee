/**
 * 从聊天块中的 task 类工具调用派生 Tasks 列表（诚实投影，无假数据）。
 * 上游：vendor task / wait_tasks / kill_task 等经 tool.call 出现。
 */
import type { ChatBlock } from './types'

export type TaskEntryStatus = 'running' | 'done' | 'error' | 'cancelled'

export type TaskEntry = {
  id: string
  callId: string
  name: string
  title: string
  subagentType?: string
  status: TaskEntryStatus
  resultPreview?: string
  ts: string
  source?: 'native' | 'tool'
  kind?: 'subagent' | 'bg_task' | 'monitor'
}

const TASK_NAME_RE =
  /^(task|wait_tasks|kill_task|get_task_output|task_output|spawn_subagent|subagent)(\b|_)/i

export function isTaskToolName(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  if (TASK_NAME_RE.test(n)) return true
  if (/\bsubagent\b/i.test(n)) return true
  if (/^task$/i.test(n) || /^wait_tasks$/i.test(n) || /^kill_task$/i.test(n)) return true
  return false
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function extractTaskMeta(args: unknown): {
  title: string
  subagentType?: string
  prompt?: string
} {
  const o = asRecord(args) ?? {}
  const description = typeof o.description === 'string' ? o.description.trim() : ''
  const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : ''
  const subagentType =
    typeof o.subagent_type === 'string'
      ? o.subagent_type
      : typeof o.subagentType === 'string'
        ? o.subagentType
        : undefined
  const title =
    description ||
    (prompt ? (prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt) : '') ||
    '任务'
  return { title, subagentType, prompt: prompt || undefined }
}

function resultPreview(result: unknown): string | undefined {
  if (result == null) return undefined
  if (typeof result === 'string') {
    const t = result.trim()
    return t.length > 120 ? `${t.slice(0, 120)}…` : t || undefined
  }
  try {
    const s = JSON.stringify(result)
    return s.length > 120 ? `${s.slice(0, 120)}…` : s
  } catch {
    return String(result).slice(0, 120)
  }
}

function extractSubagentId(result: unknown): string | undefined {
  if (typeof result === 'string') {
    const m = result.match(/subagent[_-]?id["\s:=]+([a-zA-Z0-9_-]+)/i)
    if (m?.[1]) return m[1]
    const m2 = result.match(/id=([a-zA-Z0-9_-]+)/)
    if (m2?.[1]) return m2[1]
  }
  const o = asRecord(result)
  if (!o) return undefined
  for (const k of ['subagent_id', 'subagentId', 'id', 'task_id', 'taskId']) {
    if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim()
  }
  return undefined
}

/** 从 ChatBlock[] 派生任务列表（按 callId 去重，后写覆盖） */
export function tasksFromBlocks(blocks: ChatBlock[]): TaskEntry[] {
  const map = new Map<string, TaskEntry>()
  for (const b of blocks) {
    if (b.kind !== 'tool') continue
    if (!isTaskToolName(b.name)) continue
    const meta = extractTaskMeta(b.args)
    const id = b.callId || b.id
    const prev = map.get(id)
    const status: TaskEntryStatus =
      b.status === 'running' ? 'running' : b.status === 'error' ? 'error' : 'done'
    const sid = extractSubagentId(b.result)
    map.set(id, {
      id,
      callId: b.callId,
      name: b.name,
      title: meta.title || prev?.title || b.name,
      subagentType: meta.subagentType ?? prev?.subagentType,
      status,
      resultPreview: resultPreview(b.result) ?? (sid ? `id=${sid}` : prev?.resultPreview),
      ts: b.ts
    })
  }
  return [...map.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
}
