import type { SessionStatus } from './perigee-api'

/** 检查器内容模型：右栏默认收起，内容由上下文决定 */
export type InspectorState =
  | { kind: 'closed' }
  | { kind: 'tool'; sessionId: string; callId: string }
  | { kind: 'file'; path: string }
  | { kind: 'md'; path: string }
  | { kind: 'turnDiff'; sessionId: string; turnId: string }
  | { kind: 'terminal'; sessionId: string }
  | { kind: 'preview' }

export type ToolStatus = 'running' | 'done' | 'error'

export type PlanEntry = {
  text: string
  status?: string
}

/** 聊天流里的渲染单元（由 session-reducer 从 SessionEvent 归约而来） */
export type ChatBlock =
  | { kind: 'user'; id: string; text: string; ts: string }
  | { kind: 'assistant'; id: string; text: string; ts: string; streaming?: boolean }
  | { kind: 'thought'; id: string; text: string; ts: string; streaming?: boolean }
  | {
      kind: 'tool'
      id: string
      callId: string
      name: string
      toolKind?: string
      args: unknown
      status: ToolStatus
      result?: string
      ts: string
      /** call→result 墙钟差；前端派生，不升 schema */
      durationMs?: number
    }
  | { kind: 'plan'; id: string; entries: PlanEntry[]; ts: string }
  | {
      kind: 'approval'
      id: string
      /** host 审批 id（resolve 用）：requestId ?? 事件 id ?? engineRequestId（T015 修正：engineRequestId 是引擎侧 id，不可用于 resolve） */
      requestId: string
      action: string
      detail: string
      risk: 'low' | 'medium' | 'high'
      status: 'pending' | 'approved' | 'rejected'
      ts: string
    }
  | { kind: 'error'; id: string; text: string; code?: string; ts: string }
  | { kind: 'system'; id: string; text: string; ts: string }
  | {
      kind: 'usage'
      id: string
      inputTokens?: number
      outputTokens?: number
      ts: string
    }
  | {
      kind: 'turn'
      id: string
      turnId: string
      filesChanged: string[]
      toolsRun: number
      testSignal: 'pass' | 'fail' | 'none'
      risk: 'normal' | 'elevated'
      riskReasons: string[]
      durationMs?: number
      inputTokens?: number
      outputTokens?: number
      /** 前端派生：该轮 pending diff 是否还存在（未被打回/接受） */
      ts: string
    }

export type SessionUiStatus = SessionStatus | string

export type RecentWorkspace = { path: string; name: string; lastOpenedAt?: string }
