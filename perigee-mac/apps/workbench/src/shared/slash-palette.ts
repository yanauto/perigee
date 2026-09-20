/**
 * 斜杠板：官方 TUI 命令 + inspect 里用户可调技能。
 * 能当 ACP 斜杠发出去的才算「真发出」；其余灰掉写「仅 TUI」。
 * 官方没有 grok compact / grok context 子命令，不要编。
 */
import type { InspectReport, InspectSkill } from './inspect'
import type { QueuedTurn } from './types'

export type SlashKind = 'send' | 'local' | 'tui-only'

export type SlashLocal = 'export-file' | 'export-clip' | 'context' | 'queue'

export type SlashItem = {
  id: string
  name: string
  label: string
  hint: string
  kind: SlashKind
  group: 'core' | 'tui' | 'skill'
  sendText?: string
  local?: SlashLocal
  aliases?: string[]
}

export type ExportDest = 'file' | 'clipboard'

export type ExportCurrentResult = {
  ok: boolean
  dest?: ExportDest
  path?: string
  error?: string
  detail?: string
}

export type CompactCurrentResult = {
  ok: boolean
  error?: string
}

export type ContextUsageHint = {
  kind: 'live' | 'unknown'
  label: string
  detail: string
}

export const CONTEXT_UNKNOWN =
  '终端里 /context 才有实时占用'

export const CONTEXT_UNKNOWN_DETAIL =
  '官方没有 grok context 子命令。inspect 也不报这条会话此刻占了多少。窗上不编百分比。'

const TUI_ONLY: SlashItem[] = [
  {
    id: 'rewind',
    name: 'rewind',
    label: '/rewind',
    hint: '仅 TUI · ACP 没有 session/rewind',
    kind: 'tui-only',
    group: 'tui'
  },
  {
    id: 'todos',
    name: 'todos',
    label: '/todos',
    hint: '仅 TUI · 终端里 Ctrl+T 看待办',
    kind: 'tui-only',
    group: 'tui',
    aliases: ['todo']
  },
  {
    id: 'btw',
    name: 'btw',
    label: '/btw',
    hint: '仅 TUI · 旁问不打断',
    kind: 'tui-only',
    group: 'tui'
  },
  {
    id: 'imagine',
    name: 'imagine',
    label: '/imagine',
    hint: '仅 TUI · 有功能才出现',
    kind: 'tui-only',
    group: 'tui'
  }
]

const CORE: SlashItem[] = [
  {
    id: 'plan',
    name: 'plan',
    label: '/plan',
    hint: '进入 Plan · 发给当前会话',
    kind: 'send',
    group: 'core',
    sendText: '/plan'
  },
  {
    id: 'view-plan',
    name: 'view-plan',
    label: '/view-plan',
    hint: '打开已写的计划',
    kind: 'send',
    group: 'core',
    sendText: '/view-plan',
    aliases: ['show-plan', 'plan-view']
  },
  {
    id: 'loop',
    name: 'loop',
    label: '/loop',
    hint: '定时再问 · 发给当前会话（如 /loop 5m 检查）',
    kind: 'send',
    group: 'core',
    sendText: '/loop'
  },
  {
    id: 'workflow',
    name: 'workflow',
    label: '/workflow',
    hint: '跑已存的 workflow',
    kind: 'send',
    group: 'core',
    sendText: '/workflow'
  },
  {
    id: 'deep-research',
    name: 'deep-research',
    label: '/deep-research',
    hint: '深度研究 workflow',
    kind: 'send',
    group: 'core',
    sendText: '/deep-research'
  },
  {
    id: 'config-agents',
    name: 'config-agents',
    label: '/config-agents',
    hint: '子 agent / 人设',
    kind: 'send',
    group: 'core',
    sendText: '/config-agents',
    aliases: ['agents']
  },
  {
    id: 'hooks',
    name: 'hooks',
    label: '/hooks',
    hint: 'Hooks',
    kind: 'send',
    group: 'core',
    sendText: '/hooks'
  },
  {
    id: 'hooks-trust',
    name: 'hooks-trust',
    label: '/hooks-trust',
    hint: '信任项目 hooks',
    kind: 'send',
    group: 'core',
    sendText: '/hooks-trust'
  },
  {
    id: 'remember',
    name: 'remember',
    label: '/remember',
    hint: '记一条跨会话记忆',
    kind: 'send',
    group: 'core',
    sendText: '/remember'
  },
  {
    id: 'effort',
    name: 'effort',
    label: '/effort',
    hint: '推理力度 · 发给当前会话',
    kind: 'send',
    group: 'core',
    sendText: '/effort'
  },
  {
    id: 'compact',
    name: 'compact',
    label: '/compact',
    hint: '压上下文 · 发给当前会话',
    kind: 'send',
    group: 'core',
    sendText: '/compact'
  },
  {
    id: 'context',
    name: 'context',
    label: '/context',
    hint: '看这条还剩多少',
    kind: 'local',
    group: 'core',
    local: 'context',
    aliases: ['session-info']
  },
  {
    id: 'export',
    name: 'export',
    label: '/export',
    hint: '导出这条 · 存成文件',
    kind: 'local',
    group: 'core',
    local: 'export-file'
  },
  {
    id: 'export-clip',
    name: 'export-clip',
    label: '/export',
    hint: '导出这条 · 复制到剪贴板',
    kind: 'local',
    group: 'core',
    local: 'export-clip',
    aliases: ['export-clipboard']
  },
  {
    id: 'queue',
    name: 'queue',
    label: '/queue',
    hint: '看看下一句排了什么',
    kind: 'local',
    group: 'core',
    local: 'queue'
  }
]

export function invocableSkills(skills: InspectSkill[]): InspectSkill[] {
  return skills.filter((s) => {
    if (s.disabled) return false
    if (s.userInvocable === false) return false
    return true
  })
}

export function skillSlashName(skill: InspectSkill): string {
  const raw = (skill.invocableAs || skill.name).trim()
  return raw.replace(/^\/+/, '')
}

export function skillToSlash(skill: InspectSkill): SlashItem | null {
  const name = skillSlashName(skill)
  if (!name) return null
  return {
    id: `skill:${name}`,
    name,
    label: `/${name}`,
    hint: skill.description?.trim() || '技能 · 点了就发出去',
    kind: 'send',
    group: 'skill',
    sendText: `/${name}`
  }
}

export function builtinSlashItems(): SlashItem[] {
  return [...CORE, ...TUI_ONLY]
}

export function buildSlashItems(skills: InspectSkill[]): SlashItem[] {
  const taken = new Set(builtinSlashItems().map((i) => i.name.toLowerCase()))
  const extra: SlashItem[] = []
  for (const skill of invocableSkills(skills)) {
    const item = skillToSlash(skill)
    if (!item) continue
    if (taken.has(item.name.toLowerCase())) continue
    taken.add(item.name.toLowerCase())
    extra.push(item)
  }
  extra.sort((a, b) => a.name.localeCompare(b.name))
  return [...builtinSlashItems(), ...extra]
}

export function getSlashQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = before.match(/(^|[\s])\/([^\s]*)$/)
  if (!m) return null
  const full = m[0]
  const start = before.length - full.length + (m[1] ? m[1].length : 0)
  return { start, query: m[2] ?? '' }
}

export function filterSlashItems(query: string, items: SlashItem[], limit = 24): SlashItem[] {
  const q = query.trim().toLowerCase().replace(/^\/+/, '')
  const scored = items
    .map((it) => {
      const name = it.name.toLowerCase()
      const aliases = (it.aliases ?? []).map((a) => a.toLowerCase())
      let score = 0
      if (!q) score = it.group === 'core' ? 3 : it.group === 'tui' ? 2 : 1
      else if (name === q || aliases.includes(q)) score = 200
      else if (name.startsWith(q) || aliases.some((a) => a.startsWith(q))) score = 100
      else if (name.includes(q) || aliases.some((a) => a.includes(q))) score = 50
      else if (it.hint.toLowerCase().includes(q) || it.label.toLowerCase().includes(q)) score = 20
      return { it, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.it.name.localeCompare(b.it.name))
  return scored.slice(0, limit).map((x) => x.it)
}

export type SlashLine =
  | { action: 'send'; text: string }
  | { action: 'export-file' }
  | { action: 'export-clip' }
  | { action: 'context' }
  | { action: 'queue' }
  | { action: 'block'; message: string }
  | { action: 'none' }

const TUI_BLOCK = new Set(['rewind', 'todos', 'todo', 'btw', 'remember', 'imagine'])

export function resolveSlashLine(text: string): SlashLine {
  const raw = text.trim()
  if (!raw.startsWith('/')) return { action: 'none' }
  const body = raw.slice(1)
  const m = body.match(/^(\S+)(?:\s+([\s\S]*))?$/)
  if (!m) return { action: 'none' }
  const name = m[1]!.toLowerCase()
  const args = (m[2] ?? '').trim()

  if (name === 'compact') return { action: 'send', text: raw }
  if (name === 'export') {
    if (args === '--clipboard' || args === '-c' || args === 'clipboard') return { action: 'export-clip' }
    return { action: 'export-file' }
  }
  if (name === 'context' || name === 'session-info') return { action: 'context' }
  if (name === 'queue') return { action: 'queue' }
  if (TUI_BLOCK.has(name)) {
    const item = TUI_ONLY.find((i) => i.name === name || i.aliases?.includes(name))
    return { action: 'block', message: item?.hint ?? '仅 TUI' }
  }
  return { action: 'send', text: raw }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

/** inspect / 以后 ACP 若带占用字段就用；没有就老实说。不编百分比。 */
export function contextUsageFromInspect(report: InspectReport | null | undefined): ContextUsageHint {
  if (!report) {
    return { kind: 'unknown', label: CONTEXT_UNKNOWN, detail: CONTEXT_UNKNOWN_DETAIL }
  }
  const extra = report as InspectReport & Record<string, unknown>
  const bags = [
    extra,
    asRecord(extra.context_window),
    asRecord(extra.contextWindow),
    asRecord(extra.usage),
    asRecord(extra.context)
  ].filter(Boolean) as Record<string, unknown>[]

  let used: number | null = null
  let windowTokens: number | null = null
  let pct: number | null = null
  for (const bag of bags) {
    used =
      used ??
      num(bag.usedTokens ?? bag.used_tokens ?? bag.contextTokens ?? bag.context_tokens ?? bag.used)
    windowTokens =
      windowTokens ??
      num(
        bag.windowTokens ??
          bag.window_tokens ??
          bag.totalContextTokens ??
          bag.total_context_tokens ??
          bag.context_window
      )
    pct = pct ?? num(bag.used_percentage ?? bag.usedPercentage ?? bag.usagePct ?? bag.usage_pct)
  }

  if (pct != null && pct >= 0 && pct <= 100) {
    const left = Math.max(0, Math.round(100 - pct))
    return {
      kind: 'live',
      label: `还剩约 ${left}%`,
      detail: `inspect 报了 used_percentage=${pct}`
    }
  }
  if (used != null && windowTokens != null && windowTokens > 0) {
    const left = Math.max(0, windowTokens - used)
    return {
      kind: 'live',
      label: `还剩 ${left.toLocaleString()} / ${windowTokens.toLocaleString()}`,
      detail: 'inspect 报了已用/窗口 token'
    }
  }
  return { kind: 'unknown', label: CONTEXT_UNKNOWN, detail: CONTEXT_UNKNOWN_DETAIL }
}

export function clipQueueText(text: string, max = 36): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (!one) return ''
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

export function formatQueuedPreview(queued: QueuedTurn[] | undefined): string {
  if (!queued?.length) return ''
  const first = clipQueueText(queued[0]?.text ?? '')
  const more = queued.length > 1 ? ` · 还有 ${queued.length - 1} 句` : ''
  return first ? `${first}${more}` : `已排 ${queued.length} 句`
}

export function queueNotice(queued: QueuedTurn[] | undefined): string {
  if (!queued?.length) return '没有排队的下一句'
  return `下一句已排上：${formatQueuedPreview(queued)}`
}

export function safeExportName(title: string, cliSessionId: string): string {
  const base = title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40)
  const id = cliSessionId.replace(/[\\/:*?"<>|]/g, '').slice(0, 8)
  return `${base || 'grok-chat'}-${id || 'session'}.md`
}
