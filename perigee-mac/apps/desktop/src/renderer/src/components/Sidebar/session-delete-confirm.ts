/**
 * 会话行两步删除确认（纯函数，可单测）。
 * 未武装 → 武装；已武装 → 提交删除。
 */
export function resolveSessionDeleteClick(armed: boolean): {
  /** 应进入/保持确认态 */
  arm: boolean
  /** 应真正执行删除 */
  commit: boolean
} {
  if (!armed) return { arm: true, commit: false }
  return { arm: false, commit: true }
}

/** 确认窗时长（ms）。过短会导致「再点一次」时已回落，看起来像删不掉。 */
export const SESSION_DELETE_CONFIRM_MS = 6000
