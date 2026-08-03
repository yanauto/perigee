import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react'
import type { ChatBlock } from '../../lib/types'
import { useT } from '../../i18n'
import type { Workbench } from '../../state/useWorkbench'
import { Button, EmptyState } from '../ui'
import { Message } from './Message'
import { ThoughtBlock } from './ThoughtBlock'
import { ToolRow } from './ToolRow'
import { PlanBlock } from './PlanBlock'
import { ApprovalCard } from './ApprovalCard'
import { ToolSegment } from './ToolSegment'
import { isApprovalKey, pendingApprovalOf } from './approval-flow'
import { hasTurnArtifacts, diffsOfTurn } from './turn-artifacts'

type TurnBlock = Extract<ChatBlock, { kind: 'turn' }>

/**
 * 虚拟列表条目（T028）：
 * - `track` = 连续的思考/工具/计划收成**一条聚合行**（默认折叠，点开才是明细）；
 *   轮次收尾时把 `turn` 挂到它身上（产物条融进行尾，不再另起一条）。
 * - `block` = 普通消息块（正文 / 用户 / 审批 / 系统 / 错误）。
 * - `thinking` = 底部流式指示。
 * 顺序 = 事件真实时间序，**不做完成态归组重排**（T028 §4）。
 */
type ViewItem =
  | { key: string; type: 'track'; blocks: ChatBlock[]; live: boolean; turn: TurnBlock | null }
  | { key: string; type: 'block'; block: ChatBlock }
  | { key: string; type: 'thinking' }

const TRACK_KINDS = new Set(['thought', 'tool', 'plan'])

function estimateBlockSize(b: ChatBlock): number {
  switch (b.kind) {
    case 'tool':
      return 24
    case 'thought':
      return b.streaming ? 140 : 24
    case 'turn':
      return 64
    case 'approval':
      return 120
    case 'plan':
      return 24 + b.entries.length * 21
    case 'assistant':
    case 'user':
      return Math.min(480, 48 + Math.ceil((b.text?.length ?? 0) / 80) * 18)
    case 'system':
    case 'error':
      return 32
    default:
      return 60
  }
}

/** 折叠态的聚合行就是一行；展开才按明细估高（T028） */
function estimateItemSize(item: ViewItem, openTracks: ReadonlySet<string>): number {
  if (item.type === 'thinking') return 26
  if (item.type === 'track') {
    const head = 28
    if (!openTracks.has(item.key)) return head
    return head + 8 + item.blocks.reduce((a, b) => a + estimateBlockSize(b), 0)
  }
  return estimateBlockSize(item.block)
}

/** 中栏对话流（T015 三形态）：工作轨道（干活）/ 主干（说话）/ 产物条（轮次落点）。
 *  虚拟滚动 + 钉底（T001 红线内核逐字保留）；A/D 键盘审批（输入框聚焦时除外）。 */
export function ChatStream({ wb }: { wb: Workbench }): JSX.Element {
  const { blocks, busy, activeSessionId, currentWorkspace } = wb
  const t = useT()
  const sessionId = activeSessionId ?? ''
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  /* T028：聚合行展开态按条目 key 记在列表层——虚拟滚动下滚出视口也不丢 */
  const [openTracks, setOpenTracks] = useState<ReadonlySet<string>>(() => new Set())
  const toggleTrack = useCallback((key: string) => {
    setOpenTracks((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  /* A/D 键盘审批：有待审批块时全局监听（无修饰键、非输入聚焦才生效） */
  const pending = useMemo(() => pendingApprovalOf(blocks), [blocks])
  /* 审批「先看 diff」：开最近一轮的轮次 Diff（无轮次则不提供该钮） */
  const lastTurnId = useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]!
      if (b.kind === 'turn') return b.turnId
    }
    return null
  }, [blocks])
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      const action = isApprovalKey(e)
      if (!action) return
      e.preventDefault()
      wb.resolveApproval(pending.requestId, action === 'approve')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, wb])

  // r02 C4：轮次分隔线删除（CCD 无此元素，分隔靠留白）；
  // r02 C5：session.load.ok 等引擎生命周期系统行静默（诊断有 transcript 兜底）；
  // T023：轮内 token 计量行（usage 块）不再上屏——块本身留在流里给 Composer 算上下文占比；
  // T015：连续的 thought/tool/plan 收进一条工作轨道；流式指示：busy 且末块非流式 assistant 时底部补行
  const items = useMemo<ViewItem[]>(() => {
    const out: ViewItem[] = []
    let track: ChatBlock[] = []
    const flush = () => {
      if (!track.length) return
      const live = track.some(
        (b) =>
          (b.kind === 'thought' && !!b.streaming) || (b.kind === 'tool' && b.status === 'running')
      )
      out.push({ key: `track:${track[0]!.id}`, type: 'track', blocks: track, live, turn: null })
      track = []
    }
    blocks.forEach((b) => {
      if (b.kind === 'usage') return
      if (b.kind === 'system' && b.text.includes('session.load.ok')) return
      if (TRACK_KINDS.has(b.kind)) {
        track.push(b)
        return
      }
      /* T028：产物条取消——轮次挂到**最近一条**聚合行行尾（保持时间位置，不重排） */
      if (b.kind === 'turn') {
        flush()
        for (let i = out.length - 1; i >= 0; i--) {
          const it = out[i]!
          if (it.type === 'track' && !it.turn) {
            it.turn = b
            return
          }
          if (it.type === 'block' && it.block.kind === 'user') break // 不跨轮回挂
        }
        /* 没有工具段但有文件变更（如纯写文件轮次）→ 单独一条聚合行只放产物信息 */
        if (hasTurnArtifacts(b.filesChanged, diffsOfTurn(wb.diffs, b.turnId))) {
          out.push({ key: `turn:${b.id}`, type: 'track', blocks: [], live: false, turn: b })
        }
        return
      }
      flush()
      out.push({ key: b.id, type: 'block', block: b })
    })
    flush()
    const last = blocks[blocks.length - 1]
    const lastStreamingAssistant = last?.kind === 'assistant' && !!last.streaming
    if (busy && !lastStreamingAssistant) out.push({ key: 'stream:thinking', type: 'thinking' })
    return out
  }, [blocks, busy, wb.diffs])

  // 切会话 → 重新钉底
  useEffect(() => {
    pinnedRef.current = true
  }, [activeSessionId])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateItemSize(items[i]!, openTracks),
    overscan: 8,
    getItemKey: (i) => items[i]?.key ?? i
  })

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // 粘底键：块数量变化 + 末块流式文本增长（同块 delta 时 length 不变，必须跟 text.length）
  const stickKey = useMemo(() => {
    const last = blocks[blocks.length - 1]
    if (!last) return `${activeSessionId ?? ''}:0`
    const textLen = 'text' in last && typeof last.text === 'string' ? last.text.length : 0
    const streaming =
      'streaming' in last && (last as { streaming?: boolean }).streaming ? '1' : '0'
    return `${activeSessionId ?? ''}:${items.length}:${last.id}:${textLen}:${streaming}`
  }, [blocks, items.length, activeSessionId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinnedRef.current || items.length === 0) return
    // 粘底：滚到最后一项（含同块流式增高）
    virtualizer.scrollToIndex(items.length - 1, { align: 'end' })
  }, [stickKey, virtualizer, items.length])

  /* ---------- 空态 ---------- */
  if (!currentWorkspace) {
    return (
      <div className="chat-scroll">
        <EmptyState
          icon="folder-open"
          title={t('打开一个工作区')}
          sub={t('Grok 以工作区为单位编排会话与变更')}
        >
          <Button variant="primary" icon="folder-open" onClick={() => void wb.openFolder()}>
            {t('打开文件夹…')}
          </Button>
        </EmptyState>
      </div>
    )
  }
  /* T025：乐观发送期间还没有 activeSessionId，但流里已有乐观用户消息 —— 不能落空态 */
  if (!activeSessionId && !wb.pendingSend) {
    return (
      <div className="chat-scroll">
        <EmptyState icon="spark" title={t('开始一个会话')} sub={t('按 ⌘N 快速新建会话')}>
          <Button variant="primary" icon="plus" onClick={() => void wb.newSession()}>
            {t('新建会话')}
          </Button>
        </EmptyState>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="chat-scroll">
        <EmptyState
          icon="message"
          title={t('和 Grok 说点什么')}
          sub={t('⌘K 命令面板 · / 斜杠命令 · @ 引用文件')}
        />
      </div>
    )
  }

  /* ---------- 空态后渲染 ---------- */

  const renderBlock = (b: ChatBlock) => {
    switch (b.kind) {
      case 'thought':
        return <ThoughtBlock block={b} />
      case 'tool':
        return (
          <ToolRow
            block={b}
            onOpenPanel={() => wb.openTool(sessionId, b.callId)}
            onOpenPath={wb.openPath}
          />
        )
      case 'plan':
        return <PlanBlock block={b} />
      case 'approval':
        return (
          <ApprovalCard
            block={b}
            onResolve={wb.resolveApproval}
            onOpenDiff={lastTurnId ? () => wb.openTurnDiff(sessionId, lastTurnId) : undefined}
          />
        )
      case 'turn':
        return null // T028：产物条已融进聚合行行尾，不再单独渲染
      default:
        return <Message block={b} onOpenPath={wb.openPath} />
    }
  }

  const renderItem = (item: ViewItem) => {
    if (item.type === 'thinking') {
      return (
        <div className="msg-meta">
          <span className="dot dot-accent dot-pulse" />
          <span>{t('Grok 正在思考…')}</span>
        </div>
      )
    }
    if (item.type === 'track') {
      /* T028：默认只有一行聚合摘要；点开才是既有的工作轨道明细 */
      return (
        <ToolSegment
          blocks={item.blocks}
          live={item.live}
          turn={item.turn}
          diffs={wb.diffs}
          workspaceRoot={currentWorkspace}
          open={openTracks.has(item.key)}
          onToggle={() => toggleTrack(item.key)}
          onOpenPath={wb.openPath}
          onOpenTurnDiff={(turnId) => wb.openTurnDiff(sessionId, turnId)}
          onRevert={(turnId) => void wb.revertTurn(sessionId, turnId)}
        >
          <div className={`work-track${item.live ? ' is-live' : ''}`}>
            <div className="wt-rail" />
            <div className="wt-body">{item.blocks.map((b) => renderBlock(b))}</div>
          </div>
        </ToolSegment>
      )
    }
    return renderBlock(item.block)
  }

  const virtualItems = virtualizer.getVirtualItems()
  const total = virtualizer.getTotalSize()

  return (
    <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="chat-pad">
        <div style={{ height: total, position: 'relative' }}>
          {virtualItems.map((vi) => {
            const item = items[vi.index]!
            const style: CSSProperties = {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vi.start}px)`
            }
            return (
              <div key={item.key} data-index={vi.index} ref={virtualizer.measureElement} style={style}>
                {renderItem(item)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
