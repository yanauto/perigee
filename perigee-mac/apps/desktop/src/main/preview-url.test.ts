import { describe, expect, it } from 'vitest'
import { validatePreviewUrl } from './preview-url.js'

describe('validatePreviewUrl', () => {
  it('允许 localhost http', () => {
    expect(validatePreviewUrl('http://127.0.0.1:3000').ok).toBe(true)
    expect(validatePreviewUrl('http://localhost:5173/app').ok).toBe(true)
    expect(validatePreviewUrl('127.0.0.1:3000').ok).toBe(true)
  })

  it('允许 https', () => {
    expect(validatePreviewUrl('https://example.com').ok).toBe(true)
  })

  it('拒绝 file 与非本地 http', () => {
    expect(validatePreviewUrl('file:///tmp/x').ok).toBe(false)
    expect(validatePreviewUrl('http://evil.com').ok).toBe(false)
  })
})
