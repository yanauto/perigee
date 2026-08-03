import { useLayoutEffect, useRef } from 'react'
import type { JSX, RefObject } from 'react'
import { useT } from '../../i18n'
import { Icon } from '../ui'

/**
 * `+` 菜单（CCD ccd-06 对齐）：附件与扩展统一入口——
 * 添加文件 / Slash 命令 / 连接器 MCP / 插件（未就绪置灰注明「桥接中」，纲领 §5 不做假按钮）。
 * 形态：锚定 + 钮上方的白底弹层（.popover + .menu-item）。
 * T013：关闭走全站统一机制（data-pop / data-pop-trigger，open/onClose 由 usePopover 供）。
 * 快捷键 hint 不造假：⌘U 未接线就不标。
 */
export function PlusMenu({
  open,
  onClose,
  anchorRef,
  onAddFiles,
  onSlashCommands,
  onConnectors,
  onCrossSession
}: {
  open: boolean
  onClose: () => void
  /** + 钮（锚点测量 + 点外关闭豁免，使 + 点击可正常 toggle） */
  anchorRef: RefObject<HTMLElement | null>
  /** 添加文件：打开 Composer 既有的工作区文件索引附件选择器；不传则不渲染该项（如主页派活框无附件系统） */
  onAddFiles?: () => void
  /** Slash 命令：textarea 插入 `/` 并聚焦，触发既有 slash 菜单 */
  onSlashCommands: () => void
  /** 连接器 MCP：打开设置 */
  onConnectors: () => void
  /** 跨会话投递（r02 A4：从行尾独立图标收进菜单）；无活动会话时不传即不渲染 */
  onCrossSession?: () => void
}): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null)
  const t = useT()

  /* 定位：锚定 + 钮正上方（offsetLeft 为动态测量值 → 内联；其余视觉走 CSS 类） */
  useLayoutEffect(() => {
    if (!open) return
    const el = rootRef.current
    const anchor = anchorRef.current
    if (!el || !anchor) return
    const parent = el.offsetParent
    const max = parent ? parent.clientWidth - el.offsetWidth - 8 : anchor.offsetLeft
    el.style.left = `${Math.max(0, Math.min(anchor.offsetLeft, max))}px`
  }, [open, anchorRef])

  if (!open) return null

  const pick = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <div
      ref={rootRef}
      className="popover plus-menu"
      role="menu"
      aria-label={t('添加')}
      data-pop="plus"
      style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0 }}
    >
      {onAddFiles ? (
        <button type="button" role="menuitem" className="menu-item" onClick={pick(onAddFiles)}>
          <Icon name="attach" size={13} />
          <span>{t('添加文件')}</span>
        </button>
      ) : null}
      <button type="button" role="menuitem" className="menu-item" onClick={pick(onSlashCommands)}>
        <Icon name="command" size={13} />
        <span>{t('Slash 命令')}</span>
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={pick(onConnectors)}>
        <Icon name="plug" size={13} />
        <span>{t('连接器 MCP')}</span>
      </button>
      {onCrossSession ? (
        <button type="button" role="menuitem" className="menu-item" onClick={pick(onCrossSession)}>
          <Icon name="external" size={13} />
          <span>{t('跨会话投递')}</span>
        </button>
      ) : null}
      <button type="button" role="menuitem" className="menu-item is-disabled" disabled>
        <Icon name="bot" size={13} />
        <span>{t('插件')}</span>
        <span className="mi-hint">{t('桥接中')}</span>
      </button>
    </div>
  )
}
