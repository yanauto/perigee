import { useEffect, useRef, useState } from 'react'
import type { ChatBlock } from '../../lib/types'
import { useI18n, useT } from '../../i18n'
import { Icon } from '../ui'

type ThoughtBlock = Extract<ChatBlock, { kind: 'thought' }>

/**
 * 思考块（T015 工作轨道 · T023 极淡一行）：
 * 流式时自动展开（T001 红线：流式中禁折叠，避免空白干等）；
 * 完成后自动折叠成**一行淡灰小字**「思考 N 秒」——无图标、无背景、无摘要，点击展开/折叠全文。
 * N = 块创建（ts）到流式结束的实测秒数（组件内计时，schema 未加字段）。
 */
export function ThoughtBlock({ block }: { block: ThoughtBlock }) {
  const streaming = !!block.streaming
  const [open, setOpen] = useState(streaming)
  const [seconds, setSeconds] = useState<number | null>(null)
  const sawStreamingRef = useRef(streaming)
  const startRef = useRef<number | null>(null)
  const t = useT()
  const { lang } = useI18n()

  useEffect(() => {
    if (streaming) {
      sawStreamingRef.current = true
      startRef.current = Date.now()
      setOpen(true) // 流式开始 → 强制展开
      return
    }
    if (!sawStreamingRef.current) return // 历史块（无结束时刻数据）→ 保持折叠，不编造时长
    // 本组件见证过的流式结束 → 实测计时并自动折叠
    const ts = new Date(block.ts).getTime()
    const start = startRef.current ?? (Number.isNaN(ts) ? Date.now() : ts)
    setSeconds(Math.max(0, Math.round((Date.now() - start) / 1000)))
    setOpen(false)
  }, [streaming, block.ts])

  const label = streaming
    ? t('思考中…')
    : seconds != null
      ? lang === 'en'
        ? `Thought for ${seconds}s`
        : `思考 ${seconds} 秒`
      : t('思考过程')

  return (
    <div className={`thought${streaming ? ' is-streaming' : ''}`}>
      <button
        type="button"
        className="thought-row"
        disabled={streaming}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="thought-label">{label}</span>
        {streaming ? <span className="dot dot-accent dot-pulse" /> : null}
        {/* T023：折叠钮默认隐形（hover / 展开态才浮现），静态只剩一行淡灰小字 */}
        <Icon name="chevron" size={10} className={`thought-chevron${open ? ' is-open' : ''}`} />
      </button>
      {open ? <div className="thought-body">{block.text}</div> : null}
    </div>
  )
}
