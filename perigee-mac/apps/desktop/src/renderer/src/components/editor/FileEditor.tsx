import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { languageExtensionForPath } from './file-language'
import { grokEditorTheme } from './file-theme'

type Props = {
  path: string
  value: string
  onChange: (next: string) => void
  onSave: () => void
  readOnly?: boolean
}

/** CodeMirror 6 文件编辑器：受控 value，⌘S 保存 */
export function FileEditor({ path, value, onChange, onSave, readOnly }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  // 挂载 / 换路径：重建 EditorView（语言扩展随路径变）
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const lang = languageExtensionForPath(path)
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      grokEditorTheme,
      EditorView.lineWrapping,
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            onSaveRef.current()
            return true
          }
        },
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab
      ]),
      EditorState.readOnly.of(!!readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current(u.state.doc.toString())
      }),
      ...(lang ? [lang] : [])
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 仅 path/readOnly 重建；value 由下方 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, readOnly])

  // 外部 value 变更（重载磁盘 / 换缓冲）且非当前编辑：同步 doc
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur === value) return
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: value }
    })
  }, [value, path])

  return <div className="cm-host" ref={hostRef} />
}
