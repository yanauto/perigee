import { useEffect, useState, type MouseEvent } from 'react'
import type { ChatBlock } from '../../lib/types'
import { renderMarkdown } from '../../lib/markdown'
import { linkify, looksLikePath } from '../../lib/paths'

/** 流式 MD 渲染防抖（ms）：避免每个 delta 同步跑 marked */
const STREAM_MD_DEBOUNCE_MS = 40

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

function AssistantBody({
  text,
  streaming,
  onMdClick
}: {
  text: string
  streaming: boolean
  onMdClick: (e: MouseEvent<HTMLDivElement>) => void
}) {
  // 方案 A：流式也即时 Markdown 渲染（防抖），完稿立刻再渲一次定稿
  const [html, setHtml] = useState(() => (text.trim() ? renderMarkdown(text) : ''))

  useEffect(() => {
    if (!text.trim()) {
      setHtml('')
      return
    }
    if (!streaming) {
      setHtml(renderMarkdown(text))
      return
    }
    const t = window.setTimeout(() => {
      setHtml(renderMarkdown(text))
    }, STREAM_MD_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [text, streaming])

  return (
    <div className={`msg msg-assistant${streaming ? ' is-streaming' : ''}`}>
      <div className="md-body" onClick={onMdClick} dangerouslySetInnerHTML={{ __html: html }} />
      {streaming ? <span className="stream-caret" /> : null}
    </div>
  )
}
