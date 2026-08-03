import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

/** Grok 黑白极简 · CodeMirror 主题（映射 CSS 变量语义） */
export const grokEditorTheme: Extension = [
  EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '12px',
        backgroundColor: 'var(--bg-1)',
        color: 'var(--tx-1)'
      },
      '.cm-scroller': {
        fontFamily: 'var(--mono)',
        lineHeight: '1.55',
        overflow: 'auto'
      },
      '.cm-content': {
        caretColor: 'rgba(255,255,255,0.9)',
        padding: '8px 0'
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'rgba(255,255,255,0.85)'
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'rgba(255,255,255,0.16) !important'
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255,255,255,0.04)'
      },
      '.cm-gutters': {
        backgroundColor: 'var(--bg-1)',
        color: 'var(--tx-3)',
        border: 'none',
        borderRight: '1px solid var(--border)'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(255,255,255,0.04)',
        color: 'var(--tx-2)'
      },
      '.cm-lineNumbers .cm-gutterElement': {
        minWidth: '2.5em',
        padding: '0 8px 0 6px'
      }
    },
    { dark: true }
  ),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: t.comment, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' },
      { tag: t.keyword, color: 'rgba(255,255,255,0.78)' },
      { tag: [t.string, t.special(t.string)], color: 'rgba(255,255,255,0.72)' },
      { tag: [t.number, t.bool, t.null], color: 'rgba(255,255,255,0.65)' },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'rgba(255,255,255,0.88)' },
      { tag: [t.definition(t.variableName), t.variableName], color: 'rgba(255,255,255,0.82)' },
      { tag: [t.typeName, t.className, t.namespace], color: 'rgba(255,255,255,0.75)' },
      { tag: [t.propertyName, t.attributeName], color: 'rgba(255,255,255,0.7)' },
      { tag: t.operator, color: 'rgba(255,255,255,0.55)' },
      { tag: t.punctuation, color: 'rgba(255,255,255,0.45)' },
      { tag: t.meta, color: 'rgba(255,255,255,0.4)' },
      { tag: t.heading, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
      { tag: t.link, color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' },
      { tag: t.emphasis, fontStyle: 'italic' },
      { tag: t.strong, fontWeight: '600' }
    ])
  )
]
