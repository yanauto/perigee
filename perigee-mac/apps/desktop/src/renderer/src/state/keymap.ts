import { useEffect } from 'react'

/**
 * 全局键盘流总线（纲领 §3）。
 * Composer 局部的键（/、↑、Shift+Tab、Enter）由 Composer 自己处理；
 * 这里管全局键：⌘K ⌘N ⌘1-9 ⌘M ⌘B ⌘I ⌘U ⌘` 与 Esc 逐层关闭。
 */

export type KeymapHandlers = {
  /** ⌘K 统一命令面板 */
  onPalette: () => void
  /** ⌘N 新会话 */
  onNewSession: () => void
  /** ⌘1…⌘9 切第 N 个会话（0-based） */
  onSwitchSession: (index: number) => void
  /** ⌘M 模型切换器 */
  onModelSwitcher: () => void
  /** ⌘` 终端抽屉 */
  onToggleTerminal: () => void
  /** ⌘B 侧栏收起/展开（r04） */
  onToggleSidebar: () => void
  /** ⌘I 右栏上下文面板（T017 补齐总表） */
  onToggleContext: () => void
  /** ⌘U 添加文件到输入框（T017 补齐总表；由 Composer 接事件打开附件选择器） */
  onAddFiles: () => void
  /** Esc 逐层关闭（由 App 按栈顶解析：菜单→面板→取消流式） */
  onEscape: () => void
}

export function useGlobalKeymap(handlers: KeymapHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase()
        if (k === 'k') {
          e.preventDefault()
          handlers.onPalette()
          return
        }
        if (k === 'n') {
          e.preventDefault()
          handlers.onNewSession()
          return
        }
        if (k === 'm') {
          e.preventDefault()
          handlers.onModelSwitcher()
          return
        }
        if (k === 'b') {
          e.preventDefault()
          handlers.onToggleSidebar()
          return
        }
        if (k === 'i') {
          e.preventDefault()
          handlers.onToggleContext()
          return
        }
        if (k === 'u') {
          e.preventDefault()
          handlers.onAddFiles()
          return
        }
        if (e.key >= '1' && e.key <= '9') {
          e.preventDefault()
          handlers.onSwitchSession(Number(e.key) - 1)
          return
        }
        if (e.key === '`' || e.code === 'Backquote') {
          e.preventDefault()
          handlers.onToggleTerminal()
          return
        }
      }
      if (e.key === 'Escape') {
        handlers.onEscape()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers])
}
