export type RiskLevel = 'low' | 'medium' | 'high'

export interface ApprovalRequest {
  id: string
  sessionId: string
  action: string
  detail: string
  risk: RiskLevel
  createdAt: string
  engineRequestId?: string
}

export type ApprovalPolicy = 'always-ask' | 'session-allow' | 'always-allow'

/**
 * 人审闸。Grok CLI always-approve 时主要用于「外发/高危 shell」扩展点；
 * 写盘人审走 DiffService。
 */
export class ApprovalGate {
  private pending = new Map<string, ApprovalRequest>()
  private sessionAllow = new Set<string>() // `${sessionId}:${action}`
  private alwaysAllow = new Set<string>() // action
  private waiters = new Map<
    string,
    { resolve: (ok: boolean) => void }
  >()

  /** 是否已 session-allow / always-allow（可自动放行，无需进 pending UI） */
  isPreapproved(sessionId: string, action: string): boolean {
    return (
      this.alwaysAllow.has(action) ||
      this.sessionAllow.has(`${sessionId}:${action}`)
    )
  }

  request(
    req: Omit<ApprovalRequest, 'createdAt'> & { createdAt?: string }
  ): Promise<boolean> {
    if (this.isPreapproved(req.sessionId, req.action)) return Promise.resolve(true)
    const full: ApprovalRequest = {
      ...req,
      createdAt: req.createdAt ?? new Date().toISOString()
    }
    this.pending.set(full.id, full)
    return new Promise<boolean>((resolve) => {
      this.waiters.set(full.id, { resolve })
    })
  }

  listPending(sessionId?: string): ApprovalRequest[] {
    const all = [...this.pending.values()]
    return sessionId ? all.filter((r) => r.sessionId === sessionId) : all
  }

  resolve(
    id: string,
    approved: boolean,
    policy: ApprovalPolicy = 'always-ask'
  ): ApprovalRequest | null {
    const req = this.pending.get(id)
    if (!req) return null
    this.pending.delete(id)
    if (approved) {
      if (policy === 'session-allow') {
        this.sessionAllow.add(`${req.sessionId}:${req.action}`)
      } else if (policy === 'always-allow') {
        this.alwaysAllow.add(req.action)
      }
    }
    this.waiters.get(id)?.resolve(approved)
    this.waiters.delete(id)
    return req
  }

  isDangerousShell(command: string): boolean {
    const c = command.toLowerCase()
    return (
      /rm\s+-rf\s+[\/~]/.test(c) ||
      /curl\s+.*\|\s*(ba)?sh/.test(c) ||
      /mkfs|dd\s+if=|shutdown|reboot/.test(c) ||
      /git\s+push\s+--force/.test(c)
    )
  }
}
