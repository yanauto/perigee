import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { xml } from '@codemirror/lang-xml'
import type { Extension } from '@codemirror/state'

/** 按扩展名选语言；未知返回 null（纯文本） */
export function languageExtensionForPath(path: string): Extension | null {
  const base = path.split('/').pop() ?? path
  const lower = base.toLowerCase()
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''

  if (['ts', 'mts', 'cts'].includes(ext)) return javascript({ typescript: true })
  if (['tsx'].includes(ext)) return javascript({ typescript: true, jsx: true })
  if (['js', 'mjs', 'cjs'].includes(ext)) return javascript()
  if (['jsx'].includes(ext)) return javascript({ jsx: true })
  if (ext === 'json' || ext === 'jsonc') return json()
  if (ext === 'md' || ext === 'mdx') return markdown()
  if (ext === 'py') return python()
  if (ext === 'css' || ext === 'scss' || ext === 'less') return css()
  if (ext === 'html' || ext === 'htm') return html()
  if (ext === 'xml' || ext === 'svg') return xml()
  if (ext === 'rs' || ext === 'go' || ext === 'toml' || ext === 'yaml' || ext === 'yml') return null
  return null
}
