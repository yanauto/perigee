import {
  EVENT_SCHEMA_VERSION,
  newEventId,
  nowIso,
  type SessionEvent
} from '@perigee/event-schema'
import { EventBus } from './event-bus.js'
import { DiffService } from './diff-service.js'

/**
 * 轮次追踪器：订阅事件总线，收轮时聚合发布 turn.summary。
 * 摘要经 bus 发布 → 自动进 transcript / history / 广播，前端零额外拉取。
 */

type TestSignal = 'pass' | 'fail' | 'none'

type TurnState = {
  turnId: string
  startTs: string
  filesChanged: Map<string, 'created' | 'modified' | 'deleted'>
  toolsRun: number
  /** 疑似测试类调用的 callId 集（tool.call 时识别，result 时结算） */
  testCalls: Set<string>
  testToolsRun: number
  testFailed: boolean
  inputTokens?: number
  outputTokens?: number
}

const SENSITIVE_RE = /(^|\/)(\.env(\.|$)|credentials?|secrets?|\.git\/|id_rsa|\.ssh\/)/i
const TEST_RE = /test|vitest|jest|pytest|mocha|spec/i
const MANY_FILES = 10

/** 疑似测试类工具调用：名称或命令文本命中 test 家族 */
function isTestCall(name: string | undefined, args: unknown): boolean {
  if (name && TEST_RE.test(name)) return true
  if (args && typeof args === 'object') {
    const o = args as Record<string, unknown>
    const cmd = typeof o.command === 'string' ? o.command : typeof o.cmd === 'string' ? o.cmd : ''
    if (cmd && TEST_RE.test(cmd)) return true
  }
  return false
}

export class TurnTracker {
  private turns = new Map<string, TurnState>() // sessionId -> 当前轮
  private unsub: (() => void) | null = null
  private getDiffs: (() => DiffService | null) | null = null

  constructor(private bus: EventBus) {}

  /** diffs 可能尚未创建（未开工作区），用惰性取值 */
  attach(getDiffs: () => DiffService | null): void {
    this.getDiffs = getDiffs
    this.unsub = this.bus.subscribe((ev) => this.onEvent(ev))
  }

  dispose(): void {
    this.unsub?.()
    this.unsub = null
  }

  currentTurnId(sessionId: string): string | undefined {
    return this.turns.get(sessionId)?.turnId
  }

  private onEvent(ev: SessionEvent): void {
    switch (ev.type) {
      case 'user.message': {
        const turnId = newEventId('turn')
        this.turns.set(ev.sessionId, {
          turnId,
          startTs: ev.ts,
          filesChanged: new Map(),
          toolsRun: 0,
          testCalls: new Set(),
          testToolsRun: 0,
          testFailed: false
        })
        this.getDiffs?.()?.beginTurn(ev.sessionId, turnId)
        break
      }
      case 'tool.call': {
        const t = this.turns.get(ev.sessionId)
        if (!t) break
        t.toolsRun += 1
        if (isTestCall(ev.name, ev.args)) t.testCalls.add(ev.callId ?? ev.id)
        break
      }
      case 'tool.result': {
        const t = this.turns.get(ev.sessionId)
        if (!t) break
        const callId = ev.callId ?? ''
        if (t.testCalls.delete(callId)) {
          t.testToolsRun += 1
          if (!ev.ok) t.testFailed = true
        }
        break
      }
      case 'file.changed': {
        const t = this.turns.get(ev.sessionId)
        // 引擎可能给绝对路径，归一为工作区相对路径再入卡
        if (t) t.filesChanged.set(this.getDiffs?.()?.normalizePath(ev.path) ?? ev.path, ev.kind)
        break
      }
      case 'usage': {
        const t = this.turns.get(ev.sessionId)
        if (t) {
          t.inputTokens = ev.inputTokens ?? t.inputTokens
          t.outputTokens = ev.outputTokens ?? t.outputTokens
        }
        break
      }
      case 'turn.end':
        this.closeTurn(ev.sessionId, ev.ts)
        break
      case 'session.status':
        // 无显式 turn.end 的引擎（headless 降级等）以状态回落收轮
        if (ev.status === 'idle' || ev.status === 'done' || ev.status === 'error') {
          this.closeTurn(ev.sessionId, ev.ts)
        }
        break
      default:
        break
    }
  }

  private closeTurn(sessionId: string, endTs: string): void {
    const t = this.turns.get(sessionId)
    if (!t) return
    this.turns.delete(sessionId)
    this.getDiffs?.()?.endTurn(sessionId)

    const files = [...t.filesChanged.keys()]
    const riskReasons: string[] = []
    if (files.length >= MANY_FILES) riskReasons.push(`一轮改了 ${files.length} 个文件`)
    const sensitive = files.filter((f) => SENSITIVE_RE.test(f))
    if (sensitive.length) riskReasons.push(`触及敏感路径：${sensitive.slice(0, 3).join('、')}`)
    const deleted = [...t.filesChanged.values()].filter((k) => k === 'deleted').length
    if (deleted) riskReasons.push(`删除了 ${deleted} 个文件`)

    const testSignal: TestSignal =
      t.testToolsRun === 0 ? 'none' : t.testFailed ? 'fail' : 'pass'
    const durationMs = Date.parse(endTs) - Date.parse(t.startTs)

    const summary: SessionEvent = {
      type: 'turn.summary',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId,
      id: newEventId('tsm'),
      ts: endTs,
      turnId: t.turnId,
      filesChanged: files,
      toolsRun: t.toolsRun,
      testSignal,
      risk: riskReasons.length ? 'elevated' : 'normal',
      riskReasons,
      durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : undefined,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens
    }
    this.bus.publish(summary)
  }
}
