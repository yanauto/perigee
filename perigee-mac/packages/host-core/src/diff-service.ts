import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { extractPathsFromToolArgs } from '@perigee/event-schema'
import { resolveInWorkspace, canonicalPath } from './path-guard.js'

export type DiffStatus = 'pending' | 'accepted' | 'rejected'

export interface FileDiff {
  id: string
  sessionId: string
  /** 工作区相对路径 */
  relativePath: string
  absPath: string
  before: string | null
  after: string | null
  status: DiffStatus
  createdAt: string
  /** 产生该变更的轮次（TurnTracker 通报；老记录可能缺） */
  turnId?: string
  /** 创建顺序（同毫秒 createdAt 无法定序，用于跨轮新旧判断） */
  seq?: number
  /** 行级 +/−（写盘时预计算，广播元数据可不带全文） */
  lineAdd?: number
  lineDel?: number
  /** 广播瘦身：true 表示 before/after 已省略 */
  contentOmitted?: boolean
}

/**
 * 回合前对路径做快照；变更后 diff；人审 accept/reject。
 * 关键：必须在写盘**之前** captureBefore；写后再 capture 会 before===after 漏 diff。
 */
export class DiffService {
  private diffs = new Map<string, FileDiff>()
  /**
   * 按会话隔离的路径快照（sessionId → abs → content|null）。
   * 全局 Map 会在 A 会话 beginTurn 时清空 B 的快照（审计 Z2-01）。
   */
  private snapshotsBySession = new Map<string, Map<string, string | null>>()
  /** sessionId -> 当前轮次 id（TurnTracker 通报） */
  private currentTurns = new Map<string, string>()
  /** sessionId → 本轮已 capture 待结算的 abs */
  private pendingCaptureBySession = new Map<string, Set<string>>()
  private seq = 0

  private snaps(sessionId: string): Map<string, string | null> {
    let m = this.snapshotsBySession.get(sessionId)
    if (!m) {
      m = new Map()
      this.snapshotsBySession.set(sessionId, m)
    }
    return m
  }

  private pending(sessionId: string): Set<string> {
    let s = this.pendingCaptureBySession.get(sessionId)
    if (!s) {
      s = new Set()
      this.pendingCaptureBySession.set(sessionId, s)
    }
    return s
  }

  constructor(private workspaceRoot: string) {
    this.workspaceRoot = canonicalPath(workspaceRoot)
  }

  setRoot(root: string): void {
    this.workspaceRoot = canonicalPath(root)
  }

  /** 归一为工作区相对路径（引擎可能给绝对路径）；越界/无法解析时原样返回 */
  normalizePath(relOrAbs: string): string {
    try {
      return relative(this.workspaceRoot, resolveInWorkspace(this.workspaceRoot, relOrAbs))
    } catch {
      return relOrAbs
    }
  }

  /** 回合开始前：记录当前内容（已存在则不覆盖，保留最早快照）；按 session 隔离 */
  captureBefore(sessionId: string, relOrAbs: string): void {
    let abs: string
    try {
      abs = resolveInWorkspace(this.workspaceRoot, relOrAbs)
    } catch {
      return
    }
    const snaps = this.snaps(sessionId)
    const pend = this.pending(sessionId)
    if (snaps.has(abs)) return
    if (!existsSync(abs)) {
      snaps.set(abs, null)
      pend.add(abs)
      return
    }
    try {
      snaps.set(abs, readFileSync(abs, 'utf8'))
      pend.add(abs)
    } catch {
      snaps.set(abs, null)
    }
  }

  /** 从工具参数批量 capture（tool.call 时调用） */
  captureFromToolArgs(sessionId: string, args: unknown): string[] {
    const paths = extractPathsFromToolArgs(args)
    for (const p of paths) this.captureBefore(sessionId, p)
    return paths
  }

  capturePaths(sessionId: string, paths: string[]): void {
    for (const p of paths) this.captureBefore(sessionId, p)
  }

  /**
   * 文件可能已变更：与最早快照比，生成/更新 pending diff。
   * 若从未 snapshot，会先 snapshot 当前内容（可能已是 after——调用方应先 capture）。
   * hint：引擎权威 diff（oldText/newText），有 after 时绕过磁盘快照竞态。
   *
   * 记录按（sessionId, turnId, path）唯一：同一文件跨轮变更产生多条记录，
   * 各自保留本轮起点 before —— revertTurn 才能精确还原「该轮之前」。
   *
   * T021：若当前无 turnId（endTurn 后 idle 刷新），合并到同 session+path 最新 pending，
   * 避免 hashId 因 turnId 空串漂移产生重复 FileDiff（产物条 +2 假象）。
   */
  noteChanged(
    sessionId: string,
    relOrAbs: string,
    hint?: { before?: string | null; after?: string | null }
  ): FileDiff | null {
    let abs: string
    try {
      abs = resolveInWorkspace(this.workspaceRoot, relOrAbs)
    } catch {
      return null
    }
    const relativePath = relative(this.workspaceRoot, abs)
    const turnId = this.currentTurns.get(sessionId)
    const id = hashId(sessionId, relativePath, turnId)
    let existing = this.diffs.get(id)
    // 仅当无活跃 turn 时（endTurn 后 idle 刷新）合并到同路径最新 pending；
    // 有 turnId 时必须按轮唯一，revertTurn 依赖多轮多条。
    if (!existing && turnId == null) {
      existing = this.findLatestPending(sessionId, relativePath) ?? undefined
    }
    // 已 accept/reject 的不再被同轮覆盖为 pending
    if (existing && existing.status !== 'pending') return existing

    const snaps = this.snaps(sessionId)
    const pend = this.pending(sessionId)

    if (hint && hint.after !== undefined) {
      // 引擎权威路径：before 以首条记录/hint 为准（已有记录绝不覆盖），after 逐条推进
      const before = existing ? existing.before : (hint.before ?? null)
      const after = hint.after ?? null
      if (before === after) return existing ?? null
      if (existing) {
        existing.after = after
        stampLineStats(existing)
        // 必须用 existing.id：findLatestPending 命中时 id 可能与 hashId 不一致
        this.diffs.set(existing.id, existing)
        pend.delete(abs)
        return existing
      }
      const rec: FileDiff = {
        id,
        sessionId,
        relativePath,
        absPath: abs,
        before,
        after,
        status: 'pending',
        createdAt: new Date().toISOString(),
        turnId,
        seq: ++this.seq
      }
      stampLineStats(rec)
      this.diffs.set(id, rec)
      pend.delete(abs)
      return rec
    }

    if (!snaps.has(abs)) this.captureBefore(sessionId, abs)
    const before = snaps.get(abs) ?? null
    let after: string | null = null
    if (existsSync(abs)) {
      try {
        after = readFileSync(abs, 'utf8')
      } catch {
        after = null
      }
    }
    if (before === after) return existing ?? null
    if (existing) {
      // 已有记录只推进 after：before 永远是本轮首次变更前的状态
      existing.after = after
      stampLineStats(existing)
      this.diffs.set(existing.id, existing)
      pend.delete(abs)
      return existing
    }

    const rec: FileDiff = {
      id,
      sessionId,
      relativePath,
      absPath: abs,
      before,
      after,
      status: 'pending',
      createdAt: new Date().toISOString(),
      turnId,
      seq: ++this.seq
    }
    stampLineStats(rec)
    this.diffs.set(id, rec)
    pend.delete(abs)
    return rec
  }

  list(sessionId?: string): FileDiff[] {
    const all = [...this.diffs.values()]
    return (sessionId ? all.filter((d) => d.sessionId === sessionId) : all).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
  }

  /**
   * IPC 广播用：去掉 before/after 全文，只带元数据 + 行统计（审计 C2-03）。
   * 详情仍走 diff:unified / 完整 list()。
   */
  listMeta(sessionId?: string): FileDiff[] {
    return this.list(sessionId).map((d) => {
      const stats = lineAddDel(d.before, d.after)
      return {
        id: d.id,
        sessionId: d.sessionId,
        relativePath: d.relativePath,
        absPath: d.absPath,
        before: null,
        after: null,
        status: d.status,
        createdAt: d.createdAt,
        turnId: d.turnId,
        seq: d.seq,
        lineAdd: d.lineAdd ?? stats.add,
        lineDel: d.lineDel ?? stats.del,
        contentOmitted: true
      }
    })
  }

  get(id: string): FileDiff | undefined {
    return this.diffs.get(id)
  }

  accept(id: string): FileDiff {
    const d = this.diffs.get(id)
    if (!d) throw new Error('diff not found')
    d.status = 'accepted'
    this.snaps(d.sessionId).delete(d.absPath)
    this.diffs.set(id, d)
    return d
  }

  reject(id: string): FileDiff {
    const d = this.diffs.get(id)
    if (!d) throw new Error('diff not found')
    if (d.before === null) {
      if (existsSync(d.absPath)) unlinkSync(d.absPath)
    } else {
      mkdirSync(dirname(d.absPath), { recursive: true })
      writeFileSync(d.absPath, d.before, 'utf8')
    }
    d.status = 'rejected'
    d.after = d.before
    this.snaps(d.sessionId).delete(d.absPath)
    this.diffs.set(id, d)
    return d
  }

  acceptAll(sessionId: string): FileDiff[] {
    return this.list(sessionId)
      .filter((d) => d.status === 'pending')
      .map((d) => this.accept(d.id))
  }

  rejectAll(sessionId: string): FileDiff[] {
    return this.list(sessionId)
      .filter((d) => d.status === 'pending')
      .map((d) => this.reject(d.id))
  }

  clearSession(sessionId: string): void {
    for (const [id, d] of this.diffs) {
      if (d.sessionId === sessionId) this.diffs.delete(id)
    }
    this.snapshotsBySession.delete(sessionId)
    this.pendingCaptureBySession.delete(sessionId)
    this.currentTurns.delete(sessionId)
  }

  /** 轮次开始（TurnTracker 通报）：仅清空本会话快照，不影响其它会话 */
  beginTurn(sessionId: string, turnId: string): void {
    this.currentTurns.set(sessionId, turnId)
    this.snapshotsBySession.set(sessionId, new Map())
    this.pendingCaptureBySession.set(sessionId, new Set())
  }

  /** 轮次结束：先把已 capture 的路径按磁盘现状结算成 diff */
  endTurn(sessionId: string): void {
    // headless 引擎的 file.changed 可能先于实际写盘到达，此处兜底生成 diff
    const pend = this.pending(sessionId)
    for (const abs of [...pend]) this.noteChanged(sessionId, abs)
    pend.clear()
    // T021：保留 currentTurns 到下一 beginTurn，避免 wireBus idle 刷新时 turnId 空串 → 重复 FileDiff
  }

  /** 同会话同路径最新 pending（seq 最大） */
  private findLatestPending(sessionId: string, relativePath: string): FileDiff | null {
    let best: FileDiff | null = null
    for (const d of this.diffs.values()) {
      if (d.sessionId !== sessionId || d.relativePath !== relativePath) continue
      if (d.status !== 'pending') continue
      if (!best || (d.seq ?? 0) > (best.seq ?? 0)) best = d
    }
    return best
  }

  /**
   * 打回一轮：该轮所有 pending diff 逐个还原磁盘。
   * 防护：若同文件存在更新的 pending 记录（后续轮改过），跳过该条——
   * 否则按旧 before 还原会把后续轮的成果一起抹掉。
   */
  revertTurn(sessionId: string, turnId: string): FileDiff[] {
    const pending = this.list(sessionId).filter((d) => d.status === 'pending')
    return pending
      .filter((d) => d.turnId === turnId)
      .filter(
        (d) =>
          !pending.some(
            (o) =>
              o.relativePath === d.relativePath && (o.seq ?? 0) > (d.seq ?? 0)
          )
      )
      .map((d) => this.reject(d.id))
  }
}

function hashId(sessionId: string, rel: string, turnId?: string): string {
  return createHash('sha1')
    .update(`${sessionId}:${turnId ?? ''}:${rel}`)
    .digest('hex')
    .slice(0, 16)
}

/** 轻量行统计（不跑完整 LCS；广播元数据够用） */
function lineAddDel(
  before: string | null | undefined,
  after: string | null | undefined
): { add: number; del: number } {
  if (before == null && after == null) return { add: 0, del: 0 }
  if (before == null) {
    const b = (after ?? '').split('\n')
    return { add: b.length === 1 && b[0] === '' ? 0 : b.length, del: 0 }
  }
  if (after == null) {
    const a = before.split('\n')
    return { add: 0, del: a.length === 1 && a[0] === '' ? 0 : a.length }
  }
  const a = before.split('\n')
  const b = after.split('\n')
  let i = 0
  let j = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  while (
    j < a.length - i &&
    j < b.length - i &&
    a[a.length - 1 - j] === b[b.length - 1 - j]
  ) {
    j++
  }
  return {
    add: Math.max(0, b.length - i - j),
    del: Math.max(0, a.length - i - j)
  }
}

function stampLineStats(d: FileDiff): void {
  const s = lineAddDel(d.before, d.after)
  d.lineAdd = s.add
  d.lineDel = s.del
}

/** 简易 unified diff（行级） */
export function unifiedDiff(
  relativePath: string,
  before: string | null,
  after: string | null
): string {
  const a = (before ?? '').split('\n')
  const b = (after ?? '').split('\n')
  const lines: string[] = [
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    `@@ -1,${a.length} +1,${b.length} @@`
  ]
  const max = Math.max(a.length, b.length)
  if (max > 2000) {
    lines.push(`/* large file: ${a.length} → ${b.length} lines */`)
    return lines.join('\n')
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push(` ${a[i]}`)
      i++
      j++
    } else if (j < b.length && (i >= a.length || !a.slice(i, i + 5).includes(b[j]))) {
      lines.push(`+${b[j]}`)
      j++
    } else if (i < a.length) {
      lines.push(`-${a[i]}`)
      i++
    } else {
      lines.push(`+${b[j++]}`)
    }
  }
  return lines.join('\n')
}
