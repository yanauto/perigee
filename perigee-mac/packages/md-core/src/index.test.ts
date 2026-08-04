import { describe, expect, it } from 'vitest'
import { renderMarkdown, sanitizeHtml } from './index.js'

describe('md-core', () => {
  it('renders gfm heading and toc', () => {
    const r = renderMarkdown('# Hello\n\n**bold** and `code`\n')
    expect(r.html).toContain('<h1 id="hello">Hello</h1>')
    expect(r.html).toContain('<strong>bold</strong>')
    expect(r.toc[0]).toMatchObject({ id: 'hello', level: 1, text: 'Hello' })
  })

  it('strips script and event handlers from markdown HTML', () => {
    const r = renderMarkdown('hi<script>alert(1)</script>\n\n<a href="javascript:alert(1)">x</a>')
    expect(r.html.toLowerCase()).not.toContain('<script')
    expect(r.html.toLowerCase()).not.toContain('javascript:')
    expect(r.html.toLowerCase()).not.toMatch(/\son\w+\s*=/)
  })

  it('preserves safe links', () => {
    expect(sanitizeHtml('<a href="https://example.com/a">safe</a>')).toContain(
      'href="https://example.com/a"'
    )
  })

  it('neutralizes dangerous url protocols even when obfuscated', () => {
    expect(sanitizeHtml('<a href="java&#x73;cript:alert(1)">x</a>')).toContain('href="#"')
    expect(sanitizeHtml('<img src=java\nscript:alert(1)>')).toContain('src="#"')
    expect(sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toContain(
      'href="#"'
    )
  })
})