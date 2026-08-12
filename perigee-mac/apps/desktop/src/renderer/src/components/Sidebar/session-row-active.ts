/**
 * 侧栏会话行是否呈现「当前选中」高亮。
 * Routines 打开时主栏是调度页而非对话流——保留 activeSessionId 供点回会话，
 * 但视觉上不应再高亮会话行（否则像同时选了两个导航目标）。
 */
export function sessionRowLooksActive(
  sessionId: string,
  activeSessionId: string | null | undefined,
  routinesActive: boolean
): boolean {
  if (routinesActive) return false
  return sessionId === activeSessionId
}
