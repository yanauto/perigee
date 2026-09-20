import { useEffect, useState } from 'react'
import { renderMarkdown } from '../lib/markdown'

/** 流式时略防抖，避免每个字都同步跑 marked；完稿立刻定稿。 */
const STREAM_MD_DEBOUNCE_MS = 40

export function AssistantMarkdown({
  text,
  streaming
}: {
  text: string
  streaming: boolean
}) {
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
    const timer = window.setTimeout(() => {
      setHtml(renderMarkdown(text))
    }, STREAM_MD_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text, streaming])

  return (
    <div className={`prose${streaming ? ' is-streaming' : ''}`}>
      {html ? <div className="prose-body" dangerouslySetInnerHTML={{ __html: html }} /> : null}
      {streaming ? <span className="stream-caret" aria-hidden /> : null}
    </div>
  )
}
