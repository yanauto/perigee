/** 会话/任务状态点：颜色语义 + 流式脉冲 */
const MAP: Record<string, string> = {
  idle: '',
  streaming: 'dot-accent dot-pulse',
  tool_running: 'dot-accent dot-pulse',
  waiting_approval: 'dot-warn dot-pulse',
  error: 'dot-danger',
  done: 'dot-ok',
  running: 'dot-accent dot-pulse',
  ok: 'dot-ok',
  warn: 'dot-warn',
  danger: 'dot-danger',
  accent: 'dot-accent'
}

export function StatusDot({ status }: { status: string }) {
  return <span className={`dot ${MAP[status] ?? ''}`.trim()} />
}
