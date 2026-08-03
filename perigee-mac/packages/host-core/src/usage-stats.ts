/**
 * 用量聚合（T008）：Desktop transcript + CLI ~/.grok/sessions 两路合并。
 * 能取到什么记什么，不估算编造 tokens。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveUsageModelName } from './usage-ledger.js'

export type UsageRange = 'all' | '30d' | '7d'

export type UsageStats = {
  sessions: number
  messages: number
  totalTokens: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  peakHour: number | null
  favoriteModel: string | null
  daily: Array<{ date: string; tokens: number; messages: number }>
  /** T012：模型总量 + in/out 明细 */
  byModel: Array<{
    model: string
    tokens: number
    messages: number
    inputTokens: number
    outputTokens: number
  }>
  /** T012：日期×模型堆叠柱数据源；无数据日不补零 */
  dailyByModel: Array<{ date: string; model: string; tokens: number }>
}

export type LedgerTokenRow = {
  date: string
  totalTokens: number
  model?: string | null
  ts?: string
  hour?: number
  inputTokens?: number
  outputTokens?: number
}

/** 账本/usage 无 modelId 时的桶名（不编造 token，仅标注缺失） */
export const UNKNOWN_MODEL = 'unknown'

export type UsageStatsOptions = {
  /** Desktop transcripts 目录（*.jsonl） */
  transcriptDir: string
  /**
   * Desktop 会话 meta：含 id / engineSessionId（resume 后 CLI UUID）/ createdAt
   * 用于去重与会话计数
   */
  desktopSessions?: Array<{
    id: string
    engineSessionId?: string
    createdAt?: string
    updatedAt?: string
  }>
  /** 默认 ~/.grok/sessions */
  cliSessionsRoot?: string
  range?: UsageRange
  now?: Date
  /** 本地时区归桶用；缺省系统本地 */
  timeZone?: string
  /**
   * T011：若提供账本条目，token/daily/byModel 的 tokens 以账本为准，
   * transcript 内 usage 行跳过（防双计）；messages 仍扫 transcript。
   */
  ledgerEntries?: LedgerTokenRow[]
}

type DayBucket = { tokens: number; messages: number }
type ModelBucket = {
  tokens: number
  messages: number
  inputTokens: number
  outputTokens: number
}
type DayModelBucket = { tokens: number }

function localDateKey(ms: number, timeZone?: string): string {
  try {
    // en-CA → YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(ms))
  } catch {
    const d = new Date(ms)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}

function localHour(ms: number, timeZone?: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      hour: 'numeric',
      hour12: false
    }).formatToParts(new Date(ms))
    const h = parts.find((p) => p.type === 'hour')?.value
    const n = h != null ? parseInt(h, 10) : new Date(ms).getHours()
    // hour12:false 偶发 24
    return n === 24 ? 0 : n
  } catch {
    return new Date(ms).getHours()
  }
}

function rangeStartMs(range: UsageRange | undefined, now: Date): number | null {
  if (!range || range === 'all') return null
  const days = range === '7d' ? 7 : 30
  return now.getTime() - days * 24 * 60 * 60 * 1000
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return undefined
}

function parseTs(ts: unknown): number | null {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts
  if (typeof ts === 'string') {
    const n = Date.parse(ts)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function addDay(
  daily: Map<string, DayBucket>,
  date: string,
  tokens: number,
  messages: number
): void {
  const cur = daily.get(date) ?? { tokens: 0, messages: 0 }
  cur.tokens += tokens
  cur.messages += messages
  daily.set(date, cur)
}

function addModel(
  byModel: Map<string, ModelBucket>,
  model: string,
  tokens: number,
  messages: number,
  inputTokens = 0,
  outputTokens = 0
): void {
  const cur = byModel.get(model) ?? {
    tokens: 0,
    messages: 0,
    inputTokens: 0,
    outputTokens: 0
  }
  cur.tokens += tokens
  cur.messages += messages
  cur.inputTokens += inputTokens
  cur.outputTokens += outputTokens
  byModel.set(model, cur)
}

function addDayModel(
  dailyByModel: Map<string, DayModelBucket>,
  date: string,
  model: string,
  tokens: number
): void {
  if (tokens <= 0) return
  const key = `${date}\t${model}`
  const cur = dailyByModel.get(key) ?? { tokens: 0 }
  cur.tokens += tokens
  dailyByModel.set(key, cur)
}

function modelKey(model: string | null | undefined): string {
  const m = (model ?? '').trim()
  return m || UNKNOWN_MODEL
}

function streakFromDates(sortedAscDates: string[], todayKey: string): {
  current: number
  longest: number
} {
  if (sortedAscDates.length === 0) return { current: 0, longest: 0 }
  let longest = 1
  let run = 1
  for (let i = 1; i < sortedAscDates.length; i++) {
    const prev = sortedAscDates[i - 1]!
    const cur = sortedAscDates[i]!
    const prevD = Date.parse(prev + 'T12:00:00')
    const curD = Date.parse(cur + 'T12:00:00')
    const gap = Math.round((curD - prevD) / (24 * 60 * 60 * 1000))
    if (gap === 1) {
      run++
      longest = Math.max(longest, run)
    } else if (gap > 1) {
      run = 1
    }
  }
  // current streak: 必须含今天或昨天
  let current = 0
  const set = new Set(sortedAscDates)
  if (!set.has(todayKey)) {
    // 昨天
    const yest = localDateKey(Date.parse(todayKey + 'T12:00:00') - 86400000)
    if (!set.has(yest)) return { current: 0, longest }
    // 从昨天往回
    let cursor = yest
    while (set.has(cursor)) {
      current++
      cursor = localDateKey(Date.parse(cursor + 'T12:00:00') - 86400000)
    }
    return { current, longest }
  }
  let cursor = todayKey
  while (set.has(cursor)) {
    current++
    cursor = localDateKey(Date.parse(cursor + 'T12:00:00') - 86400000)
  }
  return { current, longest: Math.max(longest, current) }
}

/** 从 Desktop jsonl 行抽取 */
function ingestDesktopLine(
  line: string,
  ctx: {
    since: number | null
    timeZone?: string
    daily: Map<string, DayBucket>
    byModel: Map<string, ModelBucket>
    dailyByModel: Map<string, DayModelBucket>
    hourCounts: number[]
    totals: { messages: number; tokens: number }
    /** true：跳过 usage（已由账本覆盖） */
    skipUsage: boolean
  }
): void {
  let ev: Record<string, unknown>
  try {
    ev = JSON.parse(line) as Record<string, unknown>
  } catch {
    return
  }
  const ts = parseTs(ev.ts)
  if (ts == null) return
  if (ctx.since != null && ts < ctx.since) return
  const type = String(ev.type ?? '')
  if (type === 'user.message') {
    ctx.totals.messages += 1
    addDay(ctx.daily, localDateKey(ts, ctx.timeZone), 0, 1)
    ctx.hourCounts[localHour(ts, ctx.timeZone)]! += 1
    return
  }
  if (type === 'usage' && !ctx.skipUsage) {
    const raw = (ev.raw && typeof ev.raw === 'object' ? ev.raw : {}) as Record<
      string,
      unknown
    >
    const nested =
      raw.usage && typeof raw.usage === 'object'
        ? (raw.usage as Record<string, unknown>)
        : raw
    const input =
      num(ev.inputTokens ?? nested.inputTokens ?? nested.input_tokens) ?? 0
    const output =
      num(ev.outputTokens ?? nested.outputTokens ?? nested.output_tokens) ?? 0
    const tokens =
      num(nested.totalTokens ?? nested.total_tokens) ??
      (input + output > 0 ? input + output : 0)
    if (tokens > 0) {
      ctx.totals.tokens += tokens
      const date = localDateKey(ts, ctx.timeZone)
      addDay(ctx.daily, date, tokens, 0)
      // T020：与账本同一解析（含 modelUsage key）
      const model = modelKey(
        resolveUsageModelName({
          type: 'usage',
          inputTokens: input,
          outputTokens: output,
          raw
        })
      )
      addModel(ctx.byModel, model, tokens, 0, input, output)
      addDayModel(ctx.dailyByModel, date, model, tokens)
      ctx.hourCounts[localHour(ts, ctx.timeZone)]! += 1
    }
  }
}

/**
 * 聚合用量。
 * T011：有 ledgerEntries 时 tokens 以账本为准（删会话不丢）；
 * messages / CLI 口径照旧。CLI contextTokensUsed 不当 lifetime tokens。
 */
export function aggregateUsageStats(opts: UsageStatsOptions): UsageStats {
  const now = opts.now ?? new Date()
  const range = opts.range ?? 'all'
  const since = rangeStartMs(range, now)
  const timeZone = opts.timeZone
  const daily = new Map<string, DayBucket>()
  const byModel = new Map<string, ModelBucket>()
  const dailyByModel = new Map<string, DayModelBucket>()
  const hourCounts = Array.from({ length: 24 }, () => 0)
  const totals = { messages: 0, tokens: 0 }
  const countedIds = new Set<string>()
  let sessions = 0
  const useLedger = Array.isArray(opts.ledgerEntries)

  // —— Desktop sessions ——
  for (const s of opts.desktopSessions ?? []) {
    countedIds.add(s.id)
    if (s.engineSessionId) countedIds.add(s.engineSessionId)
    const created = parseTs(s.createdAt) ?? parseTs(s.updatedAt)
    if (since != null && created != null && created < since) {
      // 会话创建过旧但仍可能有 range 内事件 → 仍扫 transcript，会话数按「有 range 内活动」另计
    } else {
      sessions += 1
    }
  }

  // —— T011 账本 tokens ——
  if (useLedger) {
    for (const row of opts.ledgerEntries!) {
      const ts = parseTs(row.ts)
      if (since != null && ts != null && ts < since) continue
      if (since != null && ts == null) {
        // 无 ts 时用 date 粗滤
        const dayStart = Date.parse(row.date + 'T00:00:00')
        if (Number.isFinite(dayStart) && dayStart < since - 86400000) continue
      }
      const tok = row.totalTokens || 0
      if (tok <= 0) continue
      const input = row.inputTokens ?? 0
      const output = row.outputTokens ?? 0
      const model = modelKey(row.model)
      totals.tokens += tok
      addDay(daily, row.date, tok, 0)
      addModel(byModel, model, tok, 0, input, output)
      addDayModel(dailyByModel, row.date, model, tok)
      if (typeof row.hour === 'number' && row.hour >= 0 && row.hour < 24) {
        hourCounts[row.hour]! += 1
      } else if (ts != null) {
        hourCounts[localHour(ts, timeZone)]! += 1
      }
    }
  }

  // —— Desktop transcripts（messages；无账本时也读 usage）——
  const tdir = opts.transcriptDir
  if (tdir && existsSync(tdir)) {
    let files: string[] = []
    try {
      files = readdirSync(tdir).filter((f) => f.endsWith('.jsonl'))
    } catch {
      files = []
    }
    for (const f of files) {
      const sid = f.replace(/\.jsonl$/, '')
      countedIds.add(sid)
      const path = join(tdir, f)
      let text: string
      try {
        text = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        ingestDesktopLine(line, {
          since,
          timeZone,
          daily,
          byModel,
          dailyByModel,
          hourCounts,
          totals,
          skipUsage: useLedger
        })
      }
    }
  }

  // —— CLI sessions ——
  const cliRoot =
    opts.cliSessionsRoot ?? join(homedir(), '.grok', 'sessions')
  if (existsSync(cliRoot)) {
    let cwdKeys: string[] = []
    try {
      cwdKeys = readdirSync(cliRoot)
    } catch {
      cwdKeys = []
    }
    for (const key of cwdKeys) {
      const cwdDir = join(cliRoot, key)
      try {
        if (!statSync(cwdDir).isDirectory()) continue
      } catch {
        continue
      }
      let sids: string[] = []
      try {
        sids = readdirSync(cwdDir)
      } catch {
        continue
      }
      for (const sid of sids) {
        if (countedIds.has(sid)) continue // 与 Desktop resume 去重
        const sumPath = join(cwdDir, sid, 'summary.json')
        if (!existsSync(sumPath)) continue
        let summary: Record<string, unknown>
        try {
          summary = JSON.parse(readFileSync(sumPath, 'utf8')) as Record<string, unknown>
        } catch {
          continue
        }
        const info = (summary.info && typeof summary.info === 'object'
          ? summary.info
          : {}) as Record<string, unknown>
        const id = String(info.id ?? sid)
        if (countedIds.has(id)) continue
        countedIds.add(id)

        const updated =
          parseTs(summary.updated_at ?? summary.last_active_at ?? summary.created_at) ??
          null
        if (since != null && updated != null && updated < since) continue

        sessions += 1

        let messages = 0
        let model: string | null =
          summary.current_model_id != null ? String(summary.current_model_id) : null
        // signals：真实消息计数；contextTokensUsed 不当 lifetime tokens
        const sigPath = join(cwdDir, sid, 'signals.json')
        if (existsSync(sigPath)) {
          try {
            const sig = JSON.parse(readFileSync(sigPath, 'utf8')) as Record<
              string,
              unknown
            >
            messages =
              num(sig.userMessageCount) ??
              num(summary.num_chat_messages) ??
              num(summary.num_messages) ??
              0
            if (sig.primaryModelId != null) model = String(sig.primaryModelId)
            else if (Array.isArray(sig.modelsUsed) && sig.modelsUsed[0]) {
              model = String(sig.modelsUsed[0])
            }
          } catch {
            messages =
              num(summary.num_chat_messages) ?? num(summary.num_messages) ?? 0
          }
        } else {
          messages =
            num(summary.num_chat_messages) ?? num(summary.num_messages) ?? 0
        }

        if (messages > 0 && updated != null) {
          totals.messages += messages
          const date = localDateKey(updated, timeZone)
          addDay(daily, date, 0, messages)
          hourCounts[localHour(updated, timeZone)]! += 1
          if (model) addModel(byModel, model, 0, messages, 0, 0)
        } else if (updated != null) {
          // 仍记活跃日（0 消息会话）
          addDay(daily, localDateKey(updated, timeZone), 0, 0)
        }
      }
    }
  }

  // 若 desktopSessions 为空但有 transcript，会话数至少为有文件数
  if (sessions === 0 && tdir && existsSync(tdir)) {
    try {
      sessions = readdirSync(tdir).filter((f) => f.endsWith('.jsonl')).length
    } catch {
      /* */
    }
  }

  const dailyArr = [...daily.entries()]
    .map(([date, v]) => ({ date, tokens: v.tokens, messages: v.messages }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const dates = dailyArr.map((d) => d.date)
  const todayKey = localDateKey(now.getTime(), timeZone)
  const { current, longest } = streakFromDates(dates, todayKey)

  let peakHour: number | null = null
  let peak = 0
  let hourSamples = 0
  for (let h = 0; h < 24; h++) {
    const c = hourCounts[h]!
    hourSamples += c
    if (c > peak) {
      peak = c
      peakHour = h
    }
  }
  if (hourSamples < 3) peakHour = null // 样本不足

  let favoriteModel: string | null = null
  let favScore = -1
  for (const [m, v] of byModel) {
    // 偏好模型：只看有 token 的；纯消息的 CLI 模型可参与但权重低
    const score = v.tokens * 1000 + v.messages
    if (score > favScore) {
      favScore = score
      favoriteModel = m
    }
  }
  // 避免 favorite 落到仅 messages、0 tokens 的模型上盖过真实 token 模型
  const withTok = [...byModel.entries()].filter(([, v]) => v.tokens > 0)
  if (withTok.length > 0) {
    withTok.sort((a, b) => b[1].tokens - a[1].tokens)
    favoriteModel = withTok[0]![0]
  }

  const byModelArr = [...byModel.entries()]
    .map(([model, v]) => ({
      model,
      tokens: v.tokens,
      messages: v.messages,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens
    }))
    .sort((a, b) => b.tokens - a.tokens || b.messages - a.messages)

  const dailyByModelArr = [...dailyByModel.entries()]
    .map(([key, v]) => {
      const i = key.indexOf('\t')
      const date = i >= 0 ? key.slice(0, i) : key
      const model = i >= 0 ? key.slice(i + 1) : UNKNOWN_MODEL
      return { date, model, tokens: v.tokens }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model))

  return {
    sessions,
    messages: totals.messages,
    totalTokens: totals.tokens,
    activeDays: dailyArr.filter((d) => d.messages > 0 || d.tokens > 0).length || dailyArr.length,
    currentStreak: current,
    longestStreak: longest,
    peakHour,
    favoriteModel,
    daily: dailyArr,
    byModel: byModelArr,
    dailyByModel: dailyByModelArr
  }
}

/** 供单测：纯去重逻辑 */
export function shouldCountCliSession(
  cliId: string,
  alreadyCounted: Set<string>
): boolean {
  return !alreadyCounted.has(cliId)
}
