import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './index.js'

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
})
