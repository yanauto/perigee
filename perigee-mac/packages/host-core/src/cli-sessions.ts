/**
 * 枚举本机 CLI 会话（~/.grok/sessions）。
 * 布局：sessions/<url-encoded-cwd>/<uuid>/summary.json
 */
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs'
import { join, sep, basename, dirname } from 'node:path'
import { homedir } from 'node:os'

export type ExternalCliSession = {
  id: string
  title: string
  cwd: string
  createdAt: string
  updatedAt: string
  modelId?: string
  reasoningEffort?: string
  numMessages?: number
  agentName?: string
  /** summary.json 绝对路径（调试） */
  summaryPath: string
}

export type ListExternalOptions = {
  /** 只列该 cwd 下；缺省全部 */
  cwd?: string
  /** 最多条数，默认 50 */
  limit?: number
  /** 覆盖 ~/.grok */
  grokHome?: string
}

function sessionsRoot(grokHome?: string): string {
  return join(grokHome ?? join(homedir(), '.grok'), 'sessions')
}

function decodeCwdKey(key: string): string {
  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

/** 比较 cwd：去尾部分隔符、统一为 /；win 再小写 */
export function normalizeCwdForCompare(p: string): string {
  let s = p.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  if (process.platform === 'win32') s = s.toLowerCase()
  return s
}

function readSummary(summaryPath: string): ExternalCliSession | null {
  try {
    const raw = JSON.parse(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>
    const info = (raw.info && typeof raw.info === 'object' ? raw.info : {}) as Record<
      string,
      unknown
    >
    const id = String(info.id ?? '')
    if (!id) return null
    const cwd = String(info.cwd ?? '')
    const title =
      String(raw.generated_title || raw.session_summary || '').trim() ||
      id.slice(0, 8)
    return {
      id,
      title,
      cwd,
      createdAt: String(raw.created_at ?? ''),
      updatedAt: String(raw.updated_at ?? raw.last_active_at ?? ''),
      modelId: raw.current_model_id != null ? String(raw.current_model_id) : undefined,
      reasoningEffort:
        raw.reasoning_effort != null ? String(raw.reasoning_effort) : undefined,
      numMessages:
        typeof raw.num_messages === 'number'
          ? raw.num_messages
          : typeof raw.num_chat_messages === 'number'
            ? raw.num_chat_messages
            : undefined,
      agentName: raw.agent_name != null ? String(raw.agent_name) : undefined,
      summaryPath
    }
  } catch {
    return null
  }
}

/**
 * 扫描磁盘 CLI 会话库。不依赖 ACP 活进程。
 */
export function listExternalCliSessions(opts: ListExternalOptions = {}): ExternalCliSession[] {
  const root = sessionsRoot(opts.grokHome)
  if (!existsSync(root)) return []
  const limit = opts.limit ?? 50
  const filterCwd = opts.cwd ? normalizeCwdForCompare(opts.cwd) : null
  const out: ExternalCliSession[] = []

  let cwdKeys: string[]
  try {
    cwdKeys = readdirSync(root)
  } catch {
    return []
  }

  for (const key of cwdKeys) {
    const cwdDir = join(root, key)
    try {
      if (!statSync(cwdDir).isDirectory()) continue
    } catch {
      continue
    }
    const decoded = decodeCwdKey(key)
    if (filterCwd && normalizeCwdForCompare(decoded) !== filterCwd) continue

    let sessionIds: string[]
    try {
      sessionIds = readdirSync(cwdDir)
    } catch {
      continue
    }
    for (const sid of sessionIds) {
      const summaryPath = join(cwdDir, sid, 'summary.json')
      if (!existsSync(summaryPath)) continue
      const rec = readSummary(summaryPath)
      if (rec) out.push(rec)
    }
  }

  out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  return out.slice(0, limit)
}

export function findExternalCliSession(
  cliSessionId: string,
  opts?: ListExternalOptions
): ExternalCliSession | null {
  const id = cliSessionId.trim()
  if (!id) return null
  // 先精确扫（可带 cwd 过滤）
  const all = listExternalCliSessions({ ...opts, limit: 5000 })
  return all.find((s) => s.id === id) ?? null
}


/* ---------- T030：物理删除（破坏性操作，安全闸从严） ---------- */

export type RemoveExternalResult =
  | { ok: true; removed: string }
  | { ok: false; reason: 'invalid_id' | 'not_found' | 'unsafe_path'; detail?: string }

/** 合法的 CLI 会话 id：单段目录名，不含路径分隔符 / 上跳 / 空白 */
const SAFE_ID = /^[A-Za-z0-9._-]+$/

export function isSafeCliSessionId(id: string): boolean {
  const s = (id ?? '').trim()
  return s.length > 0 && s.length <= 128 && SAFE_ID.test(s) && s !== '.' && s !== '..'
}

/**
 * 物理删除一个 CLI 会话的 transcript 目录（`~/.grok/sessions/<cwd-key>/<id>/`）。
 *
 * 删除是**破坏性**操作，所以这里的路径包含检查是**该有的防线**
 * （与 T027 放开 fs 读写不冲突：读写是能力，删除是破坏，标准不同）。四道闸：
 * ① id 必须是单段安全目录名（挡 `../`、绝对路径、分隔符注入）；
 * ② 目标必须真实存在且是目录；
 * ③ **realpath** 后必须仍严格位于 `~/.grok/sessions/` 之下（挡符号链接逃逸）；
 * ④ 目录名必须等于该 id，且深度恰为 `<root>/<cwd-key>/<id>`（挡「删到 cwd 层甚至整个 sessions」）。
 */
export function removeExternalCliSession(
  cliSessionId: string,
  opts: ListExternalOptions = {}
): RemoveExternalResult {
  const id = (cliSessionId ?? '').trim()
  if (!isSafeCliSessionId(id)) return { ok: false, reason: 'invalid_id', detail: id }

  const root = sessionsRoot(opts.grokHome)
  if (!existsSync(root)) return { ok: false, reason: 'not_found', detail: root }
  let realRoot: string
  try {
    realRoot = realpathSync(root)
  } catch {
    return { ok: false, reason: 'not_found', detail: root }
  }

  /* 在 cwd 分片里找这个 id 的目录（与 listExternalCliSessions 同一套布局） */
  let cwdKeys: string[]
  try {
    cwdKeys = readdirSync(realRoot)
  } catch {
    return { ok: false, reason: 'not_found', detail: realRoot }
  }
  let target: string | null = null
  for (const key of cwdKeys) {
    const candidate = join(realRoot, key, id)
    if (existsSync(candidate)) {
      target = candidate
      break
    }
  }
  if (!target) return { ok: false, reason: 'not_found', detail: id }

  let real: string
  try {
    real = realpathSync(target)
  } catch {
    return { ok: false, reason: 'not_found', detail: target }
  }
  try {
    if (!statSync(real).isDirectory()) return { ok: false, reason: 'unsafe_path', detail: real }
  } catch {
    return { ok: false, reason: 'not_found', detail: real }
  }
  /* ③ realpath 仍须在 sessions 根下（符号链接指向外部 → 拒绝） */
  if (!(real === realRoot || real.startsWith(realRoot + sep))) {
    return { ok: false, reason: 'unsafe_path', detail: real }
  }
  /* ④ 只允许删「根/<cwd-key>/<id>」这一层，且目录名必须等于 id */
  if (basename(real) !== id) return { ok: false, reason: 'unsafe_path', detail: real }
  const rel = real.slice(realRoot.length + 1)
  if (rel.split(sep).length !== 2) return { ok: false, reason: 'unsafe_path', detail: real }
  if (dirname(real) === realRoot) return { ok: false, reason: 'unsafe_path', detail: real }

  rmSync(real, { recursive: true, force: true })
  return { ok: true, removed: real }
}
