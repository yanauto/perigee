import type { SessionEvent } from './perigee-api'
import type { ChatBlock, PlanEntry } from './types'

/**
 * SessionEvent → ChatBlock[] 归约器（纯函数）。
 * - 所有会话的事件都进各自缓冲区（修原型丢非活动会话事件的问题）
 * - tool.call / tool.result 按 callId ?? id 配对
 * - delta 累计进流式块，message / turn.end 收尾
 */

const STREAM_ASSISTANT_ID = 'stream:assistant'
const STREAM_THOUGHT_ID = 'stream:thought'
const PLAN_ID = 'latest:plan'
const USAGE_ID = 'latest:usage'

export function seedBlocks(history: SessionEvent[]): ChatBlock[] {
  let blocks: ChatBlock[] = []
  for (const ev of history) blocks = reduceEvent(blocks, ev)
  return finalizeStreaming(blocks)
}

export function reduceEvent(blocks: ChatBlock[], ev: SessionEvent): ChatBlock[] {
  switch (ev.type) {
    case 'user.message':
      if (blocks.some((b) => b.id === ev.id)) return blocks
      return [...blocks, { kind: 'user', id: ev.id, text: ev.text ?? '', ts: ev.ts }]

    case 'assistant.delta':
      return appendDelta(blocks, STREAM_ASSISTANT_ID, 'assistant', ev)

    case 'assistant.message': {
      const block: ChatBlock = { kind: 'assistant', id: ev.id, text: ev.text ?? '', ts: ev.ts }
      /**
       * T028 顺序稳定：原位替换流式块（含 tool.call 后 seal 的 stream:assistant:sealed:*）。
       * Z6-02：tool 后新 delta 用新 stream id，不会再 append 到已 seal 块。
       */
      const idx = blocks.findIndex(
        (b) =>
          b.id === STREAM_ASSISTANT_ID ||
          (typeof b.id === 'string' && b.id.startsWith(STREAM_ASSISTANT_ID + ':sealed:'))
      )
      if (idx >= 0) {
        const streamId = blocks[idx]!.id
        if (blocks.some((b) => b.id === ev.id)) return removeBlock(blocks, streamId)
        const next = [...blocks]
        next[idx] = block
        return next
      }
      if (blocks.some((b) => b.id === ev.id)) return blocks
      // 没有流式块（非流式引擎/历史回放）：追加；末尾是轮次卡时插到卡前
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'turn') return [...blocks.slice(0, -1), block, last]
      return [...blocks, block]
    }

    case 'thought.delta':
      return appendDelta(blocks, STREAM_THOUGHT_ID, 'thought', ev)

    case 'thought.message': {
      /* T028：与正文同理——原位替换（含 seal 后的固定 stream id） */
      const block: ChatBlock = { kind: 'thought', id: ev.id, text: ev.text ?? '', ts: ev.ts }
      const idx = blocks.findIndex(
        (b) =>
          b.id === STREAM_THOUGHT_ID ||
          (typeof b.id === 'string' && b.id.startsWith(STREAM_THOUGHT_ID + ':sealed:'))
      )
      if (idx >= 0) {
        const streamId = blocks[idx]!.id
        if (blocks.some((b) => b.id === ev.id)) return removeBlock(blocks, streamId)
        const next = [...blocks]
        next[idx] = block
        return next
      }
      if (blocks.some((b) => b.id === ev.id)) return blocks
      return [...blocks, block]
    }

    case 'tool.call': {
      const callId = ev.callId ?? ev.id
      if (blocks.some((b) => b.kind === 'tool' && b.callId === callId)) return blocks
      // 工具前封口流式正文，避免「工具后叙事钉在工具前」
      const sealed = sealStreamBlocks(blocks, STREAM_ASSISTANT_ID)
      return [
        ...sealed,
        {
          kind: 'tool',
          id: ev.id,
          callId,
          name: ev.name ?? 'tool',
          toolKind: ev.kind,
          args: ev.args,
          status: 'running',
          ts: ev.ts
        }
      ]
    }

    case 'tool.result': {
      const callId = ev.callId ?? ''
      const result =
        typeof ev.result === 'string' ? ev.result : safeStringify(ev.result)
      let matched = false
      const next = blocks.map((b) => {
        if (b.kind === 'tool' && b.callId === callId) {
          matched = true
          return { ...b, status: ev.ok ? ('done' as const) : ('error' as const), result }
        }
        return b
      })
      if (matched) return next
      // 孤立 result（历史里 call 被截断）：落成系统行，不丢信息
      return [
        ...blocks,
        {
          kind: 'tool',
          id: ev.id,
          callId,
          name: ev.name ?? 'tool',
          args: undefined,
          status: ev.ok ? 'done' : 'error',
          result,
          ts: ev.ts
        }
      ]
    }

    case 'plan': {
      const entries = normalizePlan(ev.entries)
      const existing = blocks.findIndex((b) => b.id === PLAN_ID)
      const block: ChatBlock = { kind: 'plan', id: PLAN_ID, entries, ts: ev.ts }
      if (existing >= 0) {
        const next = [...blocks]
        next[existing] = block
        return next
      }
      return [...blocks, block]
    }

    case 'usage': {
      const existing = blocks.findIndex((b) => b.id === USAGE_ID)
      const block: ChatBlock = {
        kind: 'usage',
        id: USAGE_ID,
        inputTokens: ev.inputTokens,
        outputTokens: ev.outputTokens,
        ts: ev.ts
      }
      if (existing >= 0) {
        const next = [...blocks]
        next[existing] = block
        return next
      }
      return [...blocks, block]
    }

    case 'turn.end':
      return finalizeStreaming(blocks)

    case 'turn.summary':
      if (blocks.some((b) => b.id === ev.id)) return blocks
      return [
        ...blocks,
        {
          kind: 'turn',
          id: ev.id,
          turnId: ev.turnId,
          filesChanged: ev.filesChanged ?? [],
          toolsRun: ev.toolsRun ?? 0,
          testSignal: ev.testSignal ?? 'none',
          risk: ev.risk ?? 'normal',
          riskReasons: ev.riskReasons ?? [],
          durationMs: ev.durationMs,
          inputTokens: ev.inputTokens,
          outputTokens: ev.outputTokens,
          ts: ev.ts
        }
      ]

    case 'approval.requested':
      if (blocks.some((b) => b.id === ev.id)) return blocks
      return [
        ...blocks,
        {
          kind: 'approval',
          id: ev.id,
          // resolve 要的是 host 审批 id（= 事件 id，apr_*）；engineRequestId 是引擎侧 id，不能拿去 resolve
          requestId: ev.requestId ?? ev.id ?? ev.engineRequestId,
          action: ev.action ?? '',
          detail: ev.detail ?? '',
          risk: ev.risk ?? 'low',
          status: 'pending',
          ts: ev.ts
        }
      ]

    case 'approval.resolved': {
      // 批准/拒绝后不保留任何审批记录（对话保持干净）
      let idx = -1
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i]
        if (b.kind === 'approval' && b.status === 'pending') {
          idx = i
          break
        }
      }
      if (idx < 0) return blocks
      return [...blocks.slice(0, idx), ...blocks.slice(idx + 1)]
    }

    case 'error':
      if (blocks.some((b) => b.id === ev.id)) return blocks
      return [
        ...finalizeStreaming(blocks),
        { kind: 'error', id: ev.id, text: ev.message ?? '未知错误', code: ev.code, ts: ev.ts }
      ]

    case 'lifecycle': {
      const d = ev.detail as {
        error?: string
        modelId?: string
        modeId?: string
        count?: number
        action?: string
        policy?: string
        reason?: string
      } | undefined
      const text =
        ev.name === 'max_turns'
          ? '已达最大回合数（max_turns），引擎停止'
          : ev.name === 'permission.set_mode.fail'
            ? `权限模式热切失败：${d?.error ?? '未知'}（Host 分类器仍生效）`
            : ev.name === 'permission.set_mode.ok'
              ? `权限模式已热切 → ${d?.modeId ?? ''}`
              : ev.name === 'permission.host_deny'
                ? `权限拒绝（${d?.policy ?? 'host'}）：${d?.action ?? '操作'}${d?.reason ? ` · ${d.reason}` : ''}`
                : ev.name === 'model.set.fail'
                  ? `模型热切失败：${d?.error ?? '未知'}（可在设置「重建引擎」）`
                  : ev.name === 'model.set.ok'
                    ? `模型已热切 → ${d?.modelId ?? ''}`
                    : ev.name === 'mcp.update.fail'
                      ? `MCP 热更失败：${d?.error ?? '未知'}（可重建会话）`
                      : ev.name === 'mcp.update.ok'
                        ? `MCP 已热更（${d?.count ?? '?'} 项）`
                        : `引擎事件：${ev.name}`
      if (blocks.some((b) => b.id === ev.id)) return blocks
      // 成功类热切不刷屏；失败 / host_deny / max_turns 进流
      if (
        ev.name === 'permission.set_mode.ok' ||
        ev.name === 'model.set.ok' ||
        ev.name === 'mcp.update.ok'
      ) {
        return blocks
      }
      // 同轮同 action 的 host_deny 合并：若末条已是相同拒绝则跳过
      if (ev.name === 'permission.host_deny') {
        const last = blocks[blocks.length - 1]
        if (last?.kind === 'system' && last.text === text) return blocks
      }
      return [...blocks, { kind: 'system', id: ev.id, text, ts: ev.ts }]
    }

    case 'subagent.spawned': {
      const text = `子代理已启动 · ${ev.subagentType}${ev.description ? ` · ${ev.description}` : ''}`
      if (blocks.some((b) => b.id === ev.id)) return blocks
      return [...blocks, { kind: 'system', id: ev.id, text, ts: ev.ts }]
    }
    case 'subagent.finished': {
      const st =
        ev.status === 'failed'
          ? '失败'
          : ev.status === 'cancelled' || ev.status === 'canceled'
            ? '已取消'
            : '完成'
      const dur =
        ev.durationMs != null ? ` · ${Math.round(ev.durationMs / 1000)}s` : ''
      const text = `子代理${st}${dur}${ev.error ? ` · ${ev.error}` : ''}`
      if (blocks.some((b) => b.id === ev.id)) return blocks
      return [...blocks, { kind: 'system', id: ev.id, text, ts: ev.ts }]
    }
    case 'task.backgrounded': {
      const label = ev.isMonitor ? 'Monitor' : '后台任务'
      const text = `${label} 已后台化 · ${ev.monitorDescription || ev.command || ev.taskId}`
      if (blocks.some((b) => b.id === ev.id)) return blocks
      return [...blocks, { kind: 'system', id: ev.id, text, ts: ev.ts }]
    }
    case 'task.completed': {
      const text = `后台任务完成 · ${ev.taskId}`
      if (blocks.some((b) => b.id === ev.id)) return blocks
      return [...blocks, { kind: 'system', id: ev.id, text, ts: ev.ts }]
    }
    // subagent.progress / session.status / file.changed 不进消息流
    case 'subagent.progress':
      return blocks

    default:
      return blocks
  }
}

function appendDelta(
  blocks: ChatBlock[],
  streamId: string,
  kind: 'assistant' | 'thought',
  ev: SessionEvent & { text?: string }
): ChatBlock[] {
  const idx = blocks.findIndex((b) => b.id === streamId)
  const text = ev.text ?? ''
  if (idx >= 0) {
    const b = blocks[idx]
    if (b.kind === kind) {
      const next = [...blocks]
      next[idx] = { ...b, text: b.text + text, ts: ev.ts }
      return next
    }
  }
  const block: ChatBlock =
    kind === 'assistant'
      ? { kind, id: streamId, text, ts: ev.ts, streaming: true }
      : { kind, id: streamId, text, ts: ev.ts, streaming: true }
  return [...blocks, block]
}

function removeBlock(blocks: ChatBlock[], id: string): ChatBlock[] {
  return blocks.filter((b) => b.id !== id)
}

/**
 * 流式块收尾（turn.end / error / 历史播种后）。
 * 关键：把固定 stream:thought / stream:assistant id 换成唯一 id，
 * 否则下一轮 delta 会 append 到旧块 → 多轮思考串台（审计 Z6-01）。
 */
function finalizeStreaming(blocks: ChatBlock[]): ChatBlock[] {
  let changed = false
  const next = blocks.map((b) => {
    if ((b.kind === 'assistant' || b.kind === 'thought') && b.streaming) {
      changed = true
      if (!b.text.trim()) return null // 空流式块直接丢
      const sealedId =
        b.id === STREAM_ASSISTANT_ID || b.id === STREAM_THOUGHT_ID
          ? `${b.id}:sealed:${b.ts}`
          : b.id
      return { ...b, id: sealedId, streaming: false }
    }
    return b
  })
  return changed ? next.filter((b): b is ChatBlock => b !== null) : blocks
}

/** 仅封口指定 stream id（tool.call 前封 assistant，保留 thought 流） */
function sealStreamBlocks(blocks: ChatBlock[], streamId: string): ChatBlock[] {
  let changed = false
  const next = blocks.map((b) => {
    if (b.id !== streamId) return b
    if ((b.kind === 'assistant' || b.kind === 'thought') && b.streaming) {
      changed = true
      if (!b.text.trim()) return null
      return { ...b, id: `${streamId}:sealed:${b.ts}`, streaming: false }
    }
    if ((b.kind === 'assistant' || b.kind === 'thought') && !b.streaming && b.id === streamId) {
      // 已非 streaming 但仍占固定 id（异常路径）
      changed = true
      return { ...b, id: `${streamId}:sealed:${b.ts}` }
    }
    return b
  })
  return changed ? next.filter((b): b is ChatBlock => b !== null) : blocks
}

function normalizePlan(entries: unknown): PlanEntry[] {
  if (!Array.isArray(entries)) return []
  return entries.map((e) => {
    if (typeof e === 'string') return { text: e }
    if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>
      const text =
        (typeof o.content === 'string' && o.content) ||
        (typeof o.title === 'string' && o.title) ||
        (typeof o.text === 'string' && o.text) ||
        JSON.stringify(e)
      const status =
        (typeof o.status === 'string' && o.status) ||
        (typeof o.state === 'string' && o.state) ||
        undefined
      return { text, status }
    }
    return { text: String(e) }
  })
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? String(v)
  } catch {
    return String(v)
  }
}
