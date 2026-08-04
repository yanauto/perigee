import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ChatBlock } from '../../lib/types'
import { renderMarkdown } from '../../lib/markdown'
import { linkify, looksLikePath } from '../../lib/paths'

/** 流式 MD 渲染节流（ms）：让 UI 跟着动画帧走，避免整块跳字 */
const STREAM_MD_DEBOUNCE_MS = 24
const STREAM_MIN_CHARS_PER_FRAME = 1
const STREAM_MAX_CHARS_PER_FRAME = 18

type Props = {
  block: ChatBlock
  onOpenPath: (p: string) => void
}

/** 点击委托：代码块复制钮 + 行内 code 里的可点路径（沿旧 Message 能力） */
function useMdClick(onOpenPath: (p: string) => void) {
  return (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const copyBtn = target.closest('[data-copy]')
    if (copyBtn) {
      const pre = copyBtn.closest('.codeblock')?.querySelector('pre code')
      if (pre?.textContent) {
        void window.perigee.clipboard.write(pre.textContent)
        copyBtn.textContent = '已复制'
        setTimeout(() => {
          copyBtn.textContent = '复制'
        }, 1200)
      }
      return
    }
    const code = target.closest('code')
    if (code && !code.closest('pre') && code.textContent && looksLikePath(code.textContent)) {
      onOpenPath(code.textContent.trim().replace(/^\.\//, ''))
    }
  }
}

/** 消息类块：user / assistant / system / error（T023：usage 计量行不再上屏） */
export function Message({ block, onOpenPath }: Props) {
  const onMdClick = useMdClick(onOpenPath)

  if (block.kind === 'user') {
    return (
      <div className="msg msg-user">
        <div className="mu-bubble">{linkify(block.text, onOpenPath)}</div>
      </div>
    )
  }

  if (block.kind === 'assistant') {
    return <AssistantBody text={block.text} streaming={!!block.streaming} onMdClick={onMdClick} />
  }

  if (block.kind === 'system') {
    return <div className="msg-system">{block.text}</div>
  }

  if (block.kind === 'error') {
    return (
      <div className="msg-error">
        {block.code ? `[${block.code}] ` : ''}
        {block.text}
      </div>
    )
  }

  return null
}

function useSmoothStreamingText(text: string, streaming: boolean): string {
  const [displayText, setDisplayText] = useState(text)
  const displayRef = useRef(text)
  const targetRef = useRef(text)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    targetRef.current = text

    if (!streaming) {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      displayRef.current = text
      setDisplayText(text)
      return
    }

    if (!text.startsWith(displayRef.current)) {
      displayRef.current = text
      setDisplayText(text)
      return
    }

    if (rafRef.current != null) return

    const tick = () => {
      const target = targetRef.current
      const current = displayRef.current
      const backlog = target.length - current.length
      if (backlog <= 0) {
        rafRef.current = null
        return
      }
      const step = Math.max(
        STREAM_MIN_CHARS_PER_FRAME,
        Math.min(STREAM_MAX_CHARS_PER_FRAME, Math.ceil(backlog / 5))
      )
      const next = target.slice(0, current.length + step)
      displayRef.current = next
      setDisplayText(next)
      rafRef.current = window.requestAnimationFrame(tick)
    }

    rafRef.current = window.requestAnimationFrame(tick)
  }, [text, streaming])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return displayText
}

function AssistantBody({
  text,
  streaming,
  onMdClick
}: {
  text: string
  streaming: boolean
  onMdClick: (e: MouseEvent<HTMLDivElement>) => void
}) {
  const displayText = useSmoothStreamingText(text, streaming)
  const [html, setHtml] = useState(() => (displayText.trim() ? renderMarkdown(displayText) : ''))

  useEffect(() => {
    if (!displayText.trim()) {
      setHtml('')
      return
    }
    if (!streaming) {
      setHtml(renderMarkdown(displayText))
      return
    }
    const t = window.setTimeout(() => {
      setHtml(renderMarkdown(displayText))
    }, STREAM_MD_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [displayText, streaming])

  return (
    <div className={`msg msg-assistant${streaming ? ' is-streaming' : ''}`}>
      <div className="md-body" onClick={onMdClick} dangerouslySetInnerHTML={{ __html: html }} />
      {streaming ? <span className="stream-caret" /> : null}
    </div>
  )
}
