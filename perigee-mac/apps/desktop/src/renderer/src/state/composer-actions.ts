/**
 * 发送 / 停止按钮的互斥状态（T026-返修 3，对齐 Grok CLI 原生行为，维护者拍板）。
 *
 * 铁律：**同一位置只有一个按钮**——
 * - 空闲 → 发送键 `↑`
 * - 流式 / 思考中 → 红色方形停止键（发送键**不渲染**，不是置灰）
 * 想在流式中发新消息，必须先点停止打断当前轮次。
 *
 * 配套：流式中输入框仍可打字（草稿不丢），但 **Enter 也不许发送**——
 * 否则就出现「按钮不能发、回车能发」的后门。`canSubmit` 是按钮与 Enter 的**同一个判据**。
 */

export type ComposerAction = 'send' | 'stop'

/** 当前该显示哪个按钮：跟真实引擎状态走（轮次结束 busy 落回 false，自动恢复发送键） */
export function composerAction(busy: boolean): ComposerAction {
  return busy ? 'stop' : 'send'
}

export type SubmitGate = {
  /** 引擎在跑（wb.busy：streaming / tool_running / waiting_approval / 乐观发送中） */
  busy: boolean
  /** 无工作区 / 无会话等硬性不可发 */
  disabled: boolean
  /** 草稿（未 trim 也行，内部 trim） */
  draft: string
  /** 附件数（只有附件没文字也算可发） */
  attachmentCount?: number
}

/** 能否发送——按钮 disabled 与 Enter 键共用这一个判据 */
export function canSubmit({ busy, disabled, draft, attachmentCount = 0 }: SubmitGate): boolean {
  if (busy || disabled) return false
  return draft.trim().length > 0 || attachmentCount > 0
}
