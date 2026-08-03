import type { SessionEvent } from '@perigee/event-schema'

export type EventListener = (event: SessionEvent) => void

/** 每会话内存历史上限（超出丢最早的） */
export const MAX_PER_SESSION = 500

/** 进程内事件总线：Host 汇聚引擎事件并投影给 UI */
export class EventBus {
  private listeners = new Set<EventListener>()
  private bySession = new Map<string, SessionEvent[]>()

  publish(event: SessionEvent): void {
    const list = this.bySession.get(event.sessionId) ?? []
    list.push(event)
    // 防止无限增长：保留最近 MAX_PER_SESSION 条/会话
    if (list.length > MAX_PER_SESSION) list.splice(0, list.length - MAX_PER_SESSION)
    this.bySession.set(event.sessionId, list)
    for (const l of this.listeners) l(event)
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  history(sessionId: string): SessionEvent[] {
    return [...(this.bySession.get(sessionId) ?? [])]
  }

  /** 本会话在内存里是否已有事件（决定要不要从 transcript 回灌） */
  hasHistory(sessionId: string): boolean {
    return (this.bySession.get(sessionId)?.length ?? 0) > 0
  }

  /**
   * T029：把持久化的 transcript 回灌进内存历史（**不广播**，只补历史）。
   * 背景：EventBus 是纯进程内的，重启后 Desktop 原生会话的历史全丢——
   * transcript 一直只写不读，点进去就是空白（被误认作「幽灵空会话」）。
   * 只在该会话内存历史为空时调用；同样受每会话上限约束，取最近 limit 条。
   */
  seed(sessionId: string, events: readonly SessionEvent[], limit = MAX_PER_SESSION): void {
    if (!sessionId || events.length === 0) return
    if (this.hasHistory(sessionId)) return
    const tail = events.length > limit ? events.slice(events.length - limit) : [...events]
    this.bySession.set(sessionId, tail)
  }

  clearSession(sessionId: string): void {
    this.bySession.delete(sessionId)
  }
}
