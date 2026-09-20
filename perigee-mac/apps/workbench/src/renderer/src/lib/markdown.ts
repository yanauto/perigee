import { marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: false })

const SANITIZE_OPTS = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['target', 'rel']
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderCode({ text, lang }: Tokens.Code): string {
  const language = (lang ?? '').trim().split(/\s/)[0] ?? ''
  const head = language
    ? `<div class="codeblock-head"><span class="codeblock-lang">${escapeHtml(language)}</span></div>`
    : ''
  return (
    `<div class="codeblock">${head}` +
    `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(text)}</code></pre></div>`
  )
}

/** Markdown → 安全 HTML。流式未完稿也可反复调用。 */
export function renderMarkdown(source: string): string {
  if (!source) return ''
  const renderer = new marked.Renderer()
  renderer.code = renderCode
  const html = marked.parse(source, { async: false, renderer }) as string
  return DOMPurify.sanitize(html, SANITIZE_OPTS)
}
