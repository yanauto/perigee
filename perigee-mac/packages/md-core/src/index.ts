/**
 * 主进程 Markdown → HTML + TOC。
 * 聊天/文件预览请用 renderer `lib/markdown.ts`（DOMPurify）；本包供 `md:render` IPC / 导出类场景。
 * 见 docs/API-preload.md「双管线定界」。
 */
import { marked, type Tokens } from 'marked'

export interface TocItem {
  id: string
  level: number
  text: string
}

export interface RenderResult {
  html: string
  toc: TocItem[]
}

/** 将 markdown 渲染为 HTML + 目录（主进程；含轻量 sanitize） */
export function renderMarkdown(source: string): RenderResult {
  const toc: TocItem[] = []
  const renderer = new marked.Renderer()
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

  const raw = marked.parse(source, {
    async: false,
    gfm: true,
    breaks: false,
    renderer
  }) as string

  // 出站消毒：IPC md:render / 预览不可执行脚本与危险协议
  return { html: sanitizeHtml(raw), toc }
}

/** 轻量 HTML 消毒（无 DOM 依赖，主进程/渲染均可） */
export function sanitizeHtml(html: string): string {
  let out = html
  // 去掉 script/style/iframe/object/embed 整块
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, '')
  // 去掉 on* 事件属性
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  return sanitizeUrlAttrs(out)
}

function sanitizeUrlAttrs(html: string): string {
  return html.replace(
    /\b(href|src|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, attr: string, _raw: string, dq?: string, sq?: string, bare?: string) => {
      const value = dq ?? sq ?? bare ?? ''
      return isDangerousUrl(value) ? `${attr}="#"` : match
    }
  )
}

function isDangerousUrl(raw: string): boolean {
  const value = decodeHtmlEntities(raw).replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase()
  return value.startsWith('javascript:') || value.startsWith('vbscript:') || value.startsWith('data:text/html')
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|colon|tab|newline|amp);/gi, (_m, entity: string) => {
    const e = entity.toLowerCase()
    if (e === 'colon') return ':'
    if (e === 'tab') return '\t'
    if (e === 'newline') return '\n'
    if (e === 'amp') return '&'
    if (e.startsWith('#x')) {
      const n = Number.parseInt(e.slice(2), 16)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ''
    }
    if (e.startsWith('#')) {
      const n = Number.parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ''
    }
    return ''
  })
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