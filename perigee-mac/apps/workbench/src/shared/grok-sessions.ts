/** CLI 会话账本。列表/搜索只读；删除走官方命令。不把会话正文当聊天记录。 */

export type GrokSessionSource = 'cli' | 'index' | 'cli+index' | 'none'

export type GrokSessionRow = {
  id: string
  title: string
  cwd: string | null
  createdAt: string | null
  updatedAt: string | null
  status: string | null
  worktreeLabel: string | null
  score?: number | null
  snippet?: string | null
}

export type GrokSessionDeleteResult = {
  ok: boolean
  id: string
  command?: string[]
  error?: string
}

export type GrokSessionRenameResult = {
  ok: boolean
  id: string
  title: string
  official: false
  note: string
  error?: string
  state?: unknown
}

export type GrokSessionsResult = {
  ok: boolean
  source: GrokSessionSource
  items: GrokSessionRow[]
  cwd: string
  command?: string[]
  error?: string
  note?: string
}

const TITLE_MAX = 80
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function clipSessionTitle(raw: string): string {
  const line = raw.replace(/\s+/g, ' ').trim()
  if (!line) return ''
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX)}…` : line
}

export function isSessionId(value: string): boolean {
  return UUID.test(value.trim())
}

export function folderName(cwd: string | null | undefined): string | null {
  if (!cwd) return null
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  const last = parts[parts.length - 1]
  return last || cwd
}

export function sameCwd(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const na = a.replace(/[\\/]+$/, '')
  const nb = b.replace(/[\\/]+$/, '')
  return na === nb
}

export function rowMatchesQuery(row: GrokSessionRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = `${row.title} ${row.id} ${row.cwd ?? ''} ${row.snippet ?? ''}`.toLowerCase()
  return hay.includes(q)
}

export function formatSessionWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    const day = iso.match(/^(\d{4}-\d{2}-\d{2})/)
    return day ? day[1] : iso
  }
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

/** 解析 `grok sessions list` 文本表（官方此子命令没有 --json）。 */
export function parseSessionsListText(text: string): {
  items: GrokSessionRow[]
  empty: boolean
} {
  const lines = text.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/)
  const items: GrokSessionRow[] = []
  let label: string | null = null
  let sawEmpty = false

  for (const raw of lines) {
    const line = raw.trimEnd()
    const t = line.trim()
    if (!t) continue
    if (/^no sessions found\.?$/i.test(t)) {
      sawEmpty = true
      continue
    }
    if (/^session id\b/i.test(t)) continue

    const m = t.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(.*)$/i
    )
    if (m) {
      const title = clipSessionTitle(m[5] || '')
      items.push({
        id: m[1],
        title: title || m[1],
        cwd: null,
        createdAt: m[2],
        updatedAt: m[3],
        status: m[4] || null,
        worktreeLabel: label && label !== '(no label)' ? label : null
      })
      continue
    }
    if (!t.startsWith('-')) label = t
  }

  return { items, empty: sawEmpty && items.length === 0 }
}

const SEARCH_HEAD =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+\(score:\s*([\d.]+)\)\s+(.*)$/i

/** 解析 `grok sessions search` 文本（官方此子命令没有 --json）。 */
export function parseSessionsSearchText(text: string): {
  items: GrokSessionRow[]
  empty: boolean
  total?: number
} {
  const lines = text.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/)
  const items: GrokSessionRow[] = []
  let total: number | undefined
  let current: GrokSessionRow | null = null

  for (const raw of lines) {
    const line = raw.trimEnd()
    const t = line.trim()
    if (!t) continue
    if (/^warning:/i.test(t)) continue
    const tot = t.match(/^total:\s*(\d+)\s*$/i)
    if (tot) {
      total = Number(tot[1])
      continue
    }
    if (/^no sessions found\.?$/i.test(t)) continue
    if (/^session id\b/i.test(t)) continue

    const head = t.match(SEARCH_HEAD)
    if (head) {
      current = {
        id: head[1],
        title: head[1],
        cwd: null,
        createdAt: null,
        updatedAt: head[3]?.trim() || null,
        status: 'local',
        worktreeLabel: null,
        score: Number(head[2]),
        snippet: null
      }
      items.push(current)
      continue
    }

    const listed = t.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(.*)$/i
    )
    if (listed) {
      current = {
        id: listed[1],
        title: clipSessionTitle(listed[5] || '') || listed[1],
        cwd: null,
        createdAt: listed[2],
        updatedAt: listed[3],
        status: listed[4] || null,
        worktreeLabel: null
      }
      items.push(current)
      continue
    }

    if (!current) continue
    if (t.startsWith('…') || t.startsWith('...')) {
      if (!current.snippet) current.snippet = clipSessionTitle(t.replace(/^[.…\s]+/, ''))
      continue
    }
    if (current.title === current.id) {
      current.title = clipSessionTitle(t) || current.id
    } else if (!current.snippet) {
      current.snippet = clipSessionTitle(t)
    }
  }

  const empty = (total === 0 || items.length === 0) && items.length === 0
  return { items, empty, total }
}

export function mergeSessionRows(parts: GrokSessionRow[][]): GrokSessionRow[] {
  const byId = new Map<string, GrokSessionRow>()
  for (const list of parts) {
    for (const row of list) {
      const prev = byId.get(row.id)
      if (!prev) {
        byId.set(row.id, { ...row })
        continue
      }
      byId.set(row.id, {
        id: row.id,
        title: pickTitle(prev.title, row.title, row.id),
        cwd: row.cwd || prev.cwd,
        createdAt: richerTime(prev.createdAt, row.createdAt),
        updatedAt: richerTime(prev.updatedAt, row.updatedAt),
        status: row.status || prev.status,
        worktreeLabel: row.worktreeLabel || prev.worktreeLabel,
        score: row.score ?? prev.score,
        snippet: row.snippet || prev.snippet
      })
    }
  }
  return [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.createdAt || '') || 0
    const tb = Date.parse(b.updatedAt || b.createdAt || '') || 0
    if (tb !== ta) return tb - ta
    return a.id.localeCompare(b.id)
  })
}

function pickTitle(a: string, b: string, id: string): string {
  const ca = clipSessionTitle(a)
  const cb = clipSessionTitle(b)
  if (cb && cb !== id && (cb.length > ca.length || ca === id)) return cb
  return ca || cb || id
}

function richerTime(a: string | null, b: string | null): string | null {
  if (b && b.includes('T')) return b
  if (a && a.includes('T')) return a
  return b || a
}
