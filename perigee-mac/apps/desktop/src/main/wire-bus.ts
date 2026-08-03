/**
 * EventBus → transcript / IPC 广播接线；含流式 delta 批合。
 */
import type { SessionEvent } from '@perigee/event-schema'
import type { MainCtx } from './ctx.js'

/** 流式 delta 广播批合：同 session+类型合并 text，降 IPC 风暴（审计 C2-01） */
const deltaBroadcastQ = new Map<
  string,
  { type: 'assistant.delta' | 'thought.delta'; texts: string[]; base: SessionEvent }
>()
let deltaBroadcastTimer: ReturnType<typeof setTimeout> | null = null
/** wireBus 安装后赋值，供 flush 与 before-quit 使用 */
let _broadcast: ((channel: string, payload: unknown) => void) | null = null

export function flushDeltaBroadcast(): void {
  deltaBroadcastTimer = null
  const broadcast = _broadcast
  if (!broadcast) {
    deltaBroadcastQ.clear()
    return
  }
  for (const [, q] of deltaBroadcastQ) {
    const ev = {
      ...q.base,
      text: q.texts.join(''),
      id: q.base.id
    } as SessionEvent
    broadcast('session:event', ev)
  }
  deltaBroadcastQ.clear()
}

export function enqueueDeltaBroadcast(event: SessionEvent): void {
  if (event.type !== 'assistant.delta' && event.type !== 'thought.delta') return
  const key = `${event.sessionId}:${event.type}`
  let q = deltaBroadcastQ.get(key)
  if (!q) {
    q = { type: event.type, texts: [], base: event }
    deltaBroadcastQ.set(key, q)
  }
  q.texts.push(event.text ?? '')
  q.base = event
  if (!deltaBroadcastTimer) {
    deltaBroadcastTimer = setTimeout(flushDeltaBroadcast, 16)
  }
}

/** 是否有未刷出的 delta（before-quit 用） */
export function hasPendingDeltaBroadcast(): boolean {
  return deltaBroadcastQ.size > 0
}

export function wireBus(ctx: MainCtx): void {
  _broadcast = (channel, payload) => ctx.broadcast(channel, payload)
  ctx.bus.subscribe((event: SessionEvent) => {
    // 已删除会话：不写 transcript、不广播（SessionManager 墓碑已丢弃大部分；双闸）
    if (ctx.sessionStore?.isRemoved(event.sessionId) || ctx.sessions?.isForgotten(event.sessionId)) {
      return
    }
    ctx.transcript.append(event.sessionId, event)
    // delta：批合 IPC；其它事件先 flush 再立即广播，保证顺序边界
    if (event.type === 'assistant.delta' || event.type === 'thought.delta') {
      enqueueDeltaBroadcast(event)
    } else {
      if (deltaBroadcastQ.size > 0) flushDeltaBroadcast()
      ctx.broadcast('session:event', event)
    }
    // 原生会话回写 CLI UUID，供 T030 联删与用量去重
    if (event.type === 'turn.end' && event.engineSessionId) {
      const rec = ctx.sessions.get(event.sessionId)
      if (rec && rec.engineSessionId !== event.engineSessionId) {
        ctx.persistSession(rec, event.engineSessionId)
      }
    }

    // T011：usage 永久入账（与会话删除解耦；eventId 幂等）
    // T020：model 归因 — raw 优先；兜底 引擎会话实际模型 → settings.model
    if (event.type === 'usage' && ctx.usageLedger) {
      let fallbackModel: string | undefined
      if (ctx.engine.acp) {
        try {
          const mid = ctx.engine.acp!.getContextInfo(event.sessionId)?.modelId
          if (mid && String(mid).trim()) fallbackModel = String(mid).trim()
        } catch {
          /* */
        }
      }
      if (!fallbackModel && ctx.settingsStore) {
        const m = ctx.settingsStore.load().model?.trim()
        if (m) fallbackModel = m
      }
      ctx.usageLedger.appendFromUsageEvent(event, {
        fallbackModel: fallbackModel ?? null
      })
    }

    if (event.type === 'tool.call') {
      // 写盘前 snapshot（引擎先 emit call 再 update）；按 session 隔离
      ctx.diffs?.captureFromToolArgs(event.sessionId, event.args)
      ctx.appendTerm(
        event.sessionId,
        `$ tool ${event.name} ${JSON.stringify(event.args).slice(0, 200)}\n`
      )
    }

    if (event.type === 'file.changed' && ctx.diffs) {
      const rec = ctx.diffs.noteChanged(event.sessionId, event.path, {
        before: event.before,
        after: event.after
      })
      if (rec) ctx.broadcastDiffs()
    }
    if (event.type === 'tool.result') {
      const text =
        typeof event.result === 'string'
          ? event.result
          : JSON.stringify(event.result)
      ctx.appendTerm(event.sessionId, text.slice(0, 4000) + '\n')
    }

    if (event.type === 'session.status' || event.type === 'error') {
      ctx.broadcast('session:updated', ctx.sessions.list())
      if (event.type === 'session.status' && event.status === 'waiting_approval') {
        ctx.notify('Perigee', '会话等待审批')
      }
      if (event.type === 'error') {
        ctx.notify('Perigee', event.message.slice(0, 120))
      }
    }

    // 回合结束：刷新 pending diff 的 after + 非焦点 OS 通知（B7）
    if (
      (event.type === 'session.status' && event.status === 'idle') ||
      event.type === 'turn.end'
    ) {
      if (ctx.diffs) {
        for (const d of ctx.diffs.list(event.sessionId)) {
          if (d.status === 'pending') ctx.diffs.noteChanged(event.sessionId, d.relativePath)
        }
        ctx.broadcastDiffs()
      }
      const s = ctx.settingsStore?.load()
      if (
        s?.notifyOnTurnEnd &&
        event.type === 'turn.end' &&
        ctx.mainWindow &&
        !ctx.mainWindow.isFocused()
      ) {
        const rec = ctx.sessions.get(event.sessionId)
        ctx.notify('Perigee', `${rec?.title ?? '会话'} 回合已完成`)
      }
    }
  })
}
