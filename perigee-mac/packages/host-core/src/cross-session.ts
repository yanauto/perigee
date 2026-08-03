/**
 * F2：跨会话消息闸（gated messaging）。
 * 默认关；开启后允许把文本投递到另一主会话（不自动合并 worktree）。
 */

export type CrossSessionPolicy = {
  /** 全局开关（settings） */
  enabled: boolean
}

export type CrossSessionSendRequest = {
  fromSessionId: string
  toSessionId: string
  text: string
  fromKind?: 'main' | 'side'
  toKind?: 'main' | 'side'
}

export type CrossSessionGateResult =
  | { ok: true; engineText: string; displayText: string }
  | { ok: false; reason: string }

/**
 * 校验跨会话发送。
 * - flag 关 → 拒绝
 * - 同会话 → 拒绝（请用普通 send）
 * - side 源允许（侧问结论推回主会话是典型场景）
 * - 目标禁止 side（避免污染侧问）
 */
export function gateCrossSessionSend(
  policy: CrossSessionPolicy,
  req: CrossSessionSendRequest
): CrossSessionGateResult {
  if (!policy.enabled) {
    return { ok: false, reason: 'cross_session_disabled' }
  }
  if (!req.fromSessionId || !req.toSessionId) {
    return { ok: false, reason: 'missing_session' }
  }
  if (req.fromSessionId === req.toSessionId) {
    return { ok: false, reason: 'same_session' }
  }
  if (req.toKind === 'side') {
    return { ok: false, reason: 'target_is_side' }
  }
  const text = req.text.trim()
  if (!text) return { ok: false, reason: 'empty' }

  const displayText = text
  const engineText =
    `【跨会话投递 · 来自 ${req.fromSessionId.slice(0, 12)}】\n` +
    `以下内容由另一会话转发，请结合当前工作区处理；不要假设已自动合并 worktree。\n\n${text}`

  return { ok: true, engineText, displayText }
}
