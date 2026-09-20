/** 官方 `grok worktree list` 一行。字段跟 `--json` 对齐。 */

export type WorktreeRow = {
  id: string
  path: string
  kind: string
  repo: string
  label: string | null
  branch: string | null
  sessionId: string | null
  status: string | null
}

export type WorktreeState = {
  items: WorktreeRow[]
  error: string | null
  emptyNote: string | null
  raw: string
  loading: boolean
}

export function emptyWorktrees(): WorktreeState {
  return { items: [], error: null, emptyNote: null, raw: '', loading: false }
}

export function isWorktreePath(path: string | null | undefined): boolean {
  if (!path) return false
  return /[/\\]\.grok[/\\]worktrees[/\\]/.test(path)
}

/** 官方建完隔离目录后，cwd 要带上源目录相对 git 根的偏移。 */
export function sessionCwdInWorktree(opts: {
  worktreePath: string
  sourcePath: string
  sourceGitRoot?: string | null
}): string {
  const wt = opts.worktreePath.replace(/[\\/]+$/, '')
  const root = (opts.sourceGitRoot ?? '').replace(/[\\/]+$/, '')
  const source = opts.sourcePath.replace(/[\\/]+$/, '')
  if (
    root &&
    (source === root || source.startsWith(`${root}/`) || source.startsWith(`${root}\\`))
  ) {
    const rel = source.slice(root.length).replace(/^[\\/]+/, '')
    if (rel) return `${wt}/${rel}`
  }
  return wt
}

export function pickCreatedWorktreePath(raw: unknown): string | null {
  const rec = asRecord(raw)
  if (!rec) return null
  return (
    pathOf(rec.worktreePath) ??
    pathOf(rec.worktree_path) ??
    pathOf(rec.WorktreePath)
  )
}

export function expandUserPath(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return `${home.replace(/[\\/]+$/, '')}/${path.slice(2)}`
  return path
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

function isAgeToken(t: string): boolean {
  return /^(just now|now|<1m|\d+\s*[smhdwy])$/i.test(t)
}

function pathOf(v: unknown): string | null {
  const s = str(v)
  if (s) return s
  const rec = asRecord(v)
  if (!rec) return null
  return str(rec.path) ?? str(rec.Path)
}

export function rowFromOfficialJson(raw: unknown): WorktreeRow | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const id = str(rec.id) ?? str(rec.ID)
  const path = pathOf(rec.path) ?? pathOf(rec.Path)
  if (!id || !path) return null
  const meta = asRecord(rec.metadata) ?? asRecord(rec.meta)
  const label =
    str(rec.label) ??
    (meta ? str(meta.label) : null)
  const kind = str(rec.kind) ?? str(rec.type) ?? 'session'
  const sourceRepo = pathOf(rec.source_repo) ?? pathOf(rec.sourceRepo)
  return {
    id,
    path,
    kind,
    repo: str(rec.repo_name) ?? str(rec.repoName) ?? str(rec.repo) ?? sourceRepo ?? '',
    label,
    branch: str(rec.git_ref) ?? str(rec.gitRef) ?? str(rec.branch),
    sessionId: str(rec.session_id) ?? str(rec.sessionId),
    status: str(rec.status)
  }
}

export function parseWorktreeListJson(text: string): WorktreeRow[] {
  const t = text.replace(/^\uFEFF/, '').trim()
  if (!t) return []
  const start = t.indexOf('[')
  if (start < 0) return []
  try {
    const parsed: unknown = JSON.parse(t.slice(start))
    if (!Array.isArray(parsed)) return []
    const items: WorktreeRow[] = []
    for (const item of parsed) {
      const row = rowFromOfficialJson(item)
      if (row) items.push(row)
    }
    return items
  } catch {
    return []
  }
}

export function parseWorktreeListText(text: string): { items: WorktreeRow[]; empty: boolean } {
  const lines = text.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/)
  const items: WorktreeRow[] = []
  let empty = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    const t = line.trim()
    if (!t) continue
    if (/^no worktrees found\.?$/i.test(t)) {
      empty = true
      continue
    }
    if (/^\d+\s+worktrees?\b/i.test(t)) continue
    if (/^id\b/i.test(t) && /\btype\b/i.test(t) && /\bpath\b/i.test(t)) continue
    const pathMatch = t.match(/(\/[^\s]*\.grok\/worktrees\/\S+|~\/\.grok\/worktrees\/\S+)/)
    if (!pathMatch) continue
    const path = pathMatch[1]
    const left = t.slice(0, pathMatch.index).trim().split(/\s+/).filter(Boolean)
    const id = left[0]
    if (!id || id === 'ID') continue
    let rest = left.slice(3)
    if (rest.length && isAgeToken(rest[rest.length - 1])) rest = rest.slice(0, -1)
    const branchRaw = rest.length ? rest[rest.length - 1] : null
    const labelRaw = rest.length > 1 ? rest.slice(0, -1).join(' ') : null
    items.push({
      id,
      path,
      kind: left[1] ?? 'session',
      repo: left[2] ?? '',
      label: labelRaw && labelRaw !== '-' ? labelRaw : null,
      branch: branchRaw && branchRaw !== '(detached)' ? branchRaw : null,
      sessionId: null,
      status: null
    })
  }
  return { items, empty: empty && items.length === 0 }
}

export function worktreeEmptyNote(n: number, raw: string): string | null {
  if (n > 0) return null
  if (/no worktrees found/i.test(raw)) return '还没有隔离目录。官方 grok worktree list 也是空的。'
  return '还没有隔离目录。'
}
