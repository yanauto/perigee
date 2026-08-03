/**
 * 用量总账（T011）：只追加、与会话生命周期解耦。
 * 按月分片 usage-ledger/YYYY-MM.jsonl；按 eventId 幂等去重。
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

export type UsageLedgerEntry = {
  /** 本地时区 YYYY-MM-DD */
  date: string
  sessionId: string
  model: string | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  ts: string
  /** 去重键：优先 usage 事件 id，否则 sessionId|ts|tokens 合成 */
  eventId: string
  hour: number
}

export type UsageEventLike = {
  type?: string
  id?: string
  sessionId?: string
  ts?: string
  inputTokens?: number
  outputTokens?: number
  raw?: unknown
  /** 可选顶层 model（部分引擎/Host 注入）；优先于 raw 解析 */
  model?: string
}

export type LedgerFromUsageOpts = {
  /**
   * 事件 raw 解析不出模型时的兜底（T020 优先级 ②③）：
   * 会话指定 model / settings.model 等；Host 注入，禁止编造。
   */
  fallbackModel?: string | null
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  return undefined
}

function parseTs(ts: unknown): number | null {
  if (typeof ts === 'string') {
    const n = Date.parse(ts)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function localDateAndHour(
  ms: number,
  timeZone?: string
): { date: string; hour: number } {
  try {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(ms))
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      hour: 'numeric',
      hour12: false
    }).formatToParts(new Date(ms))
    let hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
    if (hour === 24) hour = 0
    return { date, hour }
  } catch {
    const d = new Date(ms)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return { date: `${y}-${m}-${day}`, hour: d.getHours() }
  }
}

/**
 * T020：从 usage 事件解析真实模型名。
 *
 * 实况（本机 transcript）：ACP 回报 `raw.modelUsage: { "grok-4.5-build": {...} }`，
 * **无** `modelId` 字段；旧逻辑只读 modelId → 全落 null → stats 桶 `unknown`。
 *
 * 优先级（字段内）：
 * 1. 显式 model / modelId（事件顶层或 raw）
 * 2. modelUsage 对象的 key（引擎实际调用的模型）
 * 3. opts.fallbackModel（Host：会话/settings）
 * 4. null（stats 侧映射为 unknown；**不**在此写 unknown 字符串，保持账本诚实）
 */
export function resolveUsageModelName(
  ev: UsageEventLike,
  opts?: LedgerFromUsageOpts
): string | null {
  const raw = (ev.raw && typeof ev.raw === 'object' ? ev.raw : {}) as Record<
    string,
    unknown
  >
  const nested =
    raw.usage && typeof raw.usage === 'object'
      ? (raw.usage as Record<string, unknown>)
      : raw

  const tryStr = (v: unknown): string | null => {
    if (v == null) return null
    const s = String(v).trim()
    return s ? s : null
  }

  const explicit =
    tryStr(ev.model) ??
    tryStr(nested.modelId) ??
    tryStr(nested.model) ??
    tryStr(nested.model_id) ??
    tryStr(raw.modelId) ??
    tryStr(raw.model) ??
    tryStr(raw.model_id)
  if (explicit) return explicit

  // ACP：modelUsage map 的 key 即实际模型 id（如 grok-4.5-build）
  const muRaw = raw.modelUsage ?? nested.modelUsage
  if (muRaw && typeof muRaw === 'object' && !Array.isArray(muRaw)) {
    const mu = muRaw as Record<string, unknown>
    const keys = Object.keys(mu).filter((k) => k.trim())
    if (keys.length === 1) return keys[0]!
    if (keys.length > 1) {
      let best: string | null = null
      let bestTok = -1
      for (const k of keys) {
        const u = mu[k]
        let tok = 0
        if (u && typeof u === 'object') {
          const o = u as Record<string, unknown>
          tok = num(o.totalTokens ?? o.total_tokens) ?? 0
        }
        if (tok > bestTok) {
          bestTok = tok
          best = k
        }
      }
      return best ?? keys[0]!
    }
  }

  return tryStr(opts?.fallbackModel ?? null)
}

/** 从 usage 事件抽出账本行（纯函数，便于单测） */
export function ledgerEntryFromUsageEvent(
  ev: UsageEventLike,
  timeZone?: string,
  opts?: LedgerFromUsageOpts
): UsageLedgerEntry | null {
  if (ev.type != null && ev.type !== 'usage') return null
  const sessionId = String(ev.sessionId ?? '')
  if (!sessionId) return null
  const ts = String(ev.ts ?? '')
  const ms = parseTs(ts) ?? Date.now()
  const raw = (ev.raw && typeof ev.raw === 'object' ? ev.raw : {}) as Record<
    string,
    unknown
  >
  const nested =
    raw.usage && typeof raw.usage === 'object'
      ? (raw.usage as Record<string, unknown>)
      : raw
  const input =
    num(ev.inputTokens) ??
    num(nested.inputTokens ?? nested.input_tokens) ??
    0
  const output =
    num(ev.outputTokens) ??
    num(nested.outputTokens ?? nested.output_tokens) ??
    0
  const total =
    num(nested.totalTokens ?? nested.total_tokens) ??
    (input + output > 0 ? input + output : 0)
  if (total <= 0 && input <= 0 && output <= 0) return null

  const model = resolveUsageModelName(ev, opts)

  // 去重：事件 id 优先；否则 sessionId + ts + 三量 合成（同 turn 重放可挡）
  const eventId =
    (ev.id && String(ev.id).trim()) ||
    `${sessionId}|${ts}|${total}|${input}|${output}`

  const { date, hour } = localDateAndHour(ms, timeZone)
  return {
    date,
    sessionId,
    model,
    inputTokens: input,
    outputTokens: output,
    totalTokens: total || input + output,
    ts: ts || new Date(ms).toISOString(),
    eventId,
    hour
  }
}

export class UsageLedger {
  private seen = new Set<string>()
  private loaded = false

  constructor(
    private baseDir: string,
    private timeZone?: string
  ) {}

  static defaultDir(userData: string): string {
    return join(userData, 'usage-ledger')
  }

  private ensureDir(): void {
    mkdirSync(this.baseDir, { recursive: true })
  }

  private monthFile(dateYmd: string): string {
    // date = YYYY-MM-DD → 2026-08.jsonl
    const ym = dateYmd.slice(0, 7)
    return join(this.baseDir, `${ym}.jsonl`)
  }

  private loadSeen(): void {
    if (this.loaded) return
    this.loaded = true
    this.ensureDir()
    let files: string[] = []
    try {
      files = readdirSync(this.baseDir).filter((f) => f.endsWith('.jsonl'))
    } catch {
      return
    }
    for (const f of files) {
      let text: string
      try {
        text = readFileSync(join(this.baseDir, f), 'utf8')
      } catch {
        continue
      }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as UsageLedgerEntry
          if (e.eventId) this.seen.add(e.eventId)
        } catch {
          /* skip bad line */
        }
      }
    }
  }

  /** 已见 eventId 数（测试用） */
  get size(): number {
    this.loadSeen()
    return this.seen.size
  }

  /**
   * 追加一条；重复 eventId 返回 false。
   */
  append(entry: UsageLedgerEntry): boolean {
    this.loadSeen()
    if (this.seen.has(entry.eventId)) return false
    this.ensureDir()
    appendFileSync(this.monthFile(entry.date), `${JSON.stringify(entry)}\n`, 'utf8')
    this.seen.add(entry.eventId)
    return true
  }

  /** 从 SessionEvent usage 入账；opts.fallbackModel 见 T020 */
  appendFromUsageEvent(ev: UsageEventLike, opts?: LedgerFromUsageOpts): boolean {
    const entry = ledgerEntryFromUsageEvent(ev, this.timeZone, opts)
    if (!entry) return false
    return this.append(entry)
  }

  /**
   * 一次性：扫 Desktop transcript 中的真实 usage 事件迁入账本。
   * 幂等（已存在 eventId 跳过）。不估算。
   */
  migrateFromTranscripts(transcriptDir: string): { added: number; skipped: number } {
    this.loadSeen()
    let added = 0
    let skipped = 0
    if (!existsSync(transcriptDir)) {
      this.markMigrated()
      return { added: 0, skipped: 0 }
    }
    let files: string[] = []
    try {
      files = readdirSync(transcriptDir).filter((f) => f.endsWith('.jsonl'))
    } catch {
      this.markMigrated()
      return { added: 0, skipped: 0 }
    }
    for (const f of files) {
      let text: string
      try {
        text = readFileSync(join(transcriptDir, f), 'utf8')
      } catch {
        continue
      }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let ev: UsageEventLike
        try {
          ev = JSON.parse(line) as UsageEventLike
        } catch {
          continue
        }
        if (ev.type !== 'usage') continue
        if (!ev.sessionId) {
          // 补 sessionId（文件名 stem）
          ev = { ...ev, sessionId: f.replace(/\.jsonl$/, '') }
        }
        const entry = ledgerEntryFromUsageEvent(ev, this.timeZone)
        if (!entry) {
          skipped++
          continue
        }
        if (this.append(entry)) added++
        else skipped++
      }
    }
    this.markMigrated()
    return { added, skipped }
  }

  private migrateFlag(): string {
    return join(this.baseDir, '.migrated-v1')
  }

  isMigrated(): boolean {
    return existsSync(this.migrateFlag())
  }

  markMigrated(): void {
    this.ensureDir()
    writeFileSync(
      this.migrateFlag(),
      JSON.stringify({ at: new Date().toISOString(), version: 1 }) + '\n',
      'utf8'
    )
  }

  /** 确保迁移做过一次（启动或 stats 前调用） */
  ensureMigrated(transcriptDir: string): { added: number; skipped: number } | null {
    if (this.isMigrated()) return null
    return this.migrateFromTranscripts(transcriptDir)
  }

  /**
   * 读全部账本条目（可选 sinceMs 过滤）。
   */
  readAll(opts?: { sinceMs?: number | null }): UsageLedgerEntry[] {
    this.loadSeen()
    const out: UsageLedgerEntry[] = []
    let files: string[] = []
    try {
      files = readdirSync(this.baseDir).filter((f) => f.endsWith('.jsonl')).sort()
    } catch {
      return out
    }
    const since = opts?.sinceMs ?? null
    for (const f of files) {
      let text: string
      try {
        text = readFileSync(join(this.baseDir, f), 'utf8')
      } catch {
        continue
      }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as UsageLedgerEntry
          if (since != null) {
            const ms = parseTs(e.ts)
            if (ms != null && ms < since) continue
          }
          out.push(e)
        } catch {
          /* */
        }
      }
    }
    return out
  }
}
