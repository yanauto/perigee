/**
 * 输入框草稿按会话隔离（进程内）。切会话 / 回首页再点回来，未发送的字还在。
 * 不落盘：草稿可能含密钥或未完成指令。
 */

const drafts = new Map<string, string>()

function key(sessionId: string | null | undefined): string | null {
  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  return id || null
}

export function stashComposerDraft(sessionId: string | null | undefined, text: string): void {
  const id = key(sessionId)
  if (!id) return
  if (!text) {
    drafts.delete(id)
    return
  }
  drafts.set(id, text)
}

export function loadComposerDraft(sessionId: string | null | undefined): string {
  const id = key(sessionId)
  if (!id) return ''
  return drafts.get(id) ?? ''
}

export function clearComposerDraft(sessionId: string | null | undefined): void {
  const id = key(sessionId)
  if (!id) return
  drafts.delete(id)
}
