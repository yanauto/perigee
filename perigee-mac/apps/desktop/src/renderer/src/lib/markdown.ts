/**
 * 渲染进程 Markdown（聊天 / 文件预览）。
 * 主进程 `md:render` / md-core 是另一条管线（TOC）；见 docs/API-preload.md。
 */
import { marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'

export type TocItem = { id: string; level: number; text: string }

marked.setOptions({ gfm: true, breaks: false })

const SANITIZE_OPTS = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['target', 'rel']
}

/** 轻量关键字高亮（零依赖；仅常见词着色，不做完整解析器） */
function lightHighlight(code: string, language: string): string {
  const esc = escapeHtml(code)
  if (!language || language === 'text' || language === 'plain') return esc
  // 字符串 → 注释 → 关键字；顺序避免二次替换
  let out = esc
  out = out.replace(
    /(&quot;|&#39;|")(?:(?!\1)[^\\]|\\.)*?\1|`(?:[^`\\]|\\.)*`/g,
    (m) => `<span class="tok-str">${m}</span>`
  )
  out = out.replace(
    /(^|\n)(\s*)(\/\/.*?$|#(?!!).*$)/gm,
    (_m, a, b, c) => `${a}${b}<span class="tok-cmt">${c}</span>`
  )
  const kw =
    language.match(/^(ts|tsx|js|jsx|typescript|javascript)$/i)
      ? /\b(const|let|var|function|return|import|export|from|class|interface|type|extends|implements|async|await|if|else|for|while|switch|case|break|continue|try|catch|throw|new|typeof|instanceof|void|null|undefined|true|false)\b/g
      : language.match(/^(py|python)$/i)
        ? /\b(def|class|return|import|from|as|if|elif|else|for|while|try|except|raise|with|async|await|True|False|None|pass|yield|lambda)\b/g
        : language.match(/^(rs|rust)$/i)
          ? /\b(fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|if|else|match|return|async|await|true|false|Self|self)\b/g
          : null
  if (kw) {
    out = out.replace(kw, (m) =>
      m.includes('<') ? m : `<span class="tok-kw">${m}</span>`
    )
  }
  return out
}

export type MarkdownRenderOpts = {
  /** 代码块复制钮文案（默认中文源串「复制」；EN 由调用方传 t('复制')） */
  copyLabel?: string
}

/** 代码块渲染为带头栏（语言 + 复制钮）的结构，复制由容器点击委托处理 */
function makeCodeBlock(copyLabel: string) {
  return ({ text, lang }: Tokens.Code): string => {
    const language = (lang ?? '').trim().split(/\s/)[0] ?? ''
    return (
      `<div class="codeblock"><div class="codeblock-head">` +
      `<span class="codeblock-lang">${escapeHtml(language || 'code')}</span>` +
      `<button type="button" class="codeblock-copy" data-copy>${escapeHtml(copyLabel)}</button></div>` +
      `<pre><code class="language-${escapeHtml(language)}">${lightHighlight(text, language)}</code></pre></div>`
    )
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Markdown → 安全 HTML（GFM；脚本/事件属性剥离） */
export function renderMarkdown(source: string, opts?: MarkdownRenderOpts): string {
  const renderer = new marked.Renderer()
  renderer.code = makeCodeBlock(opts?.copyLabel ?? '复制')
  const html = marked.parse(source, { async: false, renderer }) as string
  return DOMPurify.sanitize(html, SANITIZE_OPTS)
}

/** Markdown → 安全 HTML + 标题目录（MD 阅读器用） */
export function renderMarkdownWithToc(
  source: string,
  opts?: MarkdownRenderOpts
): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = []
  const renderer = new marked.Renderer()
  renderer.code = makeCodeBlock(opts?.copyLabel ?? '复制')
  const slugCount = new Map<string, number>()

  renderer.heading = function ({ tokens, depth }: Tokens.Heading): string {
    const text = this.parser.parseInline(tokens)
    const plain = text.replace(/<[^>]+>/g, '')
    let id = slugify(plain)
    const n = slugCount.get(id) ?? 0
    slugCount.set(id, n + 1)
    if (n > 0) id = `${id}-${n}`
    toc.push({ id, level: depth, text: plain })
    return `<h${depth} id="${id}">${text}</h${depth}>\n`
  }

  const html = marked.parse(source, { async: false, gfm: true, renderer }) as string
  return { html: DOMPurify.sanitize(html, SANITIZE_OPTS), toc }
}

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  )
}
