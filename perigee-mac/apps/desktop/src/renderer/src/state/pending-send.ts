import type { ChatBlock } from '../lib/types'

/**
 * 主页发送的乐观导航状态机（T025）。
 *
 * 原来的顺序是「建会话 → 发消息 → 刷列表 → 切页」，三个 await 串行（其中 session.create 要建
 * worktree + ACP session/new），2–3 秒都卡在首页。现在改成：点发送**立刻**切到对话页，
 * 先渲染一条乐观的用户消息 + 等待态，真正的建会话/发送在后台跑。
 *
 * 去重规则：引擎回显 `user.message` 时会带自己的 id，与乐观块 id 不同，直接叠加会出现两条一样的
 * 用户消息。所以乐观块**只在真实块里还没有同文本的用户消息时**渲染，回显一到即撤下。
 */

export type PendingSend = {
  text: string
  /** 会话建好后回填；null = 还在建 */
  sessionId: string | null
  startedAt: number
}

/** 乐观用户块的固定 id（不会与引擎事件 id 撞车） */
export const OPTIMISTIC_USER_ID = 'pending:user'

/** 兜底：超过这个时长仍未回显就撤下乐观块（防止 slash / 异常路径永久挂着） */
export const PENDING_TIMEOUT_MS = 15_000

export function startPending(text: string, now: number = Date.now()): PendingSend {
  return { text, sessionId: null, startedAt: now }
}

export function attachSession(pending: PendingSend, sessionId: string): PendingSend {
  return { ...pending, sessionId }
}

/** 真实块里是否已经有同文本的用户消息（引擎回显） */
export function isEchoed(text: string, blocks: readonly ChatBlock[]): boolean {
  const target = text.trim()
  if (!target) return true
  return blocks.some((b) => b.kind === 'user' && b.id !== OPTIMISTIC_USER_ID && b.text.trim() === target)
}

/** 还要不要渲染乐观块：回显了不渲染、超时了不渲染 */
export function shouldShowOptimistic(
  pending: PendingSend | null,
  blocks: readonly ChatBlock[],
  now: number = Date.now()
): boolean {
  if (!pending) return false
  if (now - pending.startedAt > PENDING_TIMEOUT_MS) return false
  return !isEchoed(pending.text, blocks)
}

export function optimisticUserBlock(pending: PendingSend): ChatBlock {
  return {
    kind: 'user',
    id: OPTIMISTIC_USER_ID,
    text: pending.text,
    ts: new Date(pending.startedAt).toISOString()
  }
}

/** 对话流最终要渲染的块序列（乐观块永远排在真实块之后） */
export function withOptimistic(
  blocks: readonly ChatBlock[],
  pending: PendingSend | null,
  now: number = Date.now()
): ChatBlock[] {
  if (!shouldShowOptimistic(pending, blocks, now)) return blocks as ChatBlock[]
  return [...blocks, optimisticUserBlock(pending!)]
}
