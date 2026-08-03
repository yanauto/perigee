import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useT } from '../../i18n'
import { Icon, IconButton } from '../ui'

/**
 * 分组头（样式 global.css §14 .sb-group-head）— T026 一体化后的形态：
 * - **所有分组（含「未分组」默认组）同构**：`组名 ›` + 计数，点击折叠/展开。
 *   T026-返修：箭头在组名**右边**紧跟，收起 `›`（rotate 0）、展开 `ˇ`（rotate 90），行最右是计数/操作钮。
 * - `manageable`（自定义分组）：hover 组头才浮现「重命名 / 删除」小按钮（与会话行 ⋮ 同哲学）；
 *   删除两段确认，组内会话回未分组。**「未分组」传 false —— 不给删除/重命名入口。**
 * - 双击组名行内重命名（仅 manageable）。
 * - 外层 div[role=button]：内部要塞真实 button/input，避免 button 套 button。
 * - 所有形态都是拖拽投放目标（text/session-id → 归组；未分组组头 = 拖回未分组）。
 */
export function GroupHeader({
  name,
  count,
  collapsed = false,
  manageable,
  onToggle,
  onRename,
  onDelete,
  onDropSession
}: {
  name: string
  count: number
  collapsed?: boolean
  /** 可重命名 / 可删除（自定义分组 true；默认组「未分组」false） */
  manageable: boolean
  onToggle?: () => void
  onRename?: (name: string) => void
  onDelete?: () => void
  onDropSession: (sessionId: string) => void
}): JSX.Element {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const delTimer = useRef<number | null>(null)

  /* 卸载清掉删除确认的回退计时器 */
  useEffect(
    () => () => {
      if (delTimer.current !== null) window.clearTimeout(delTimer.current)
    },
    []
  )

  const armDelete = () => {
    setConfirmDel(true)
    if (delTimer.current !== null) window.clearTimeout(delTimer.current)
    delTimer.current = window.setTimeout(() => setConfirmDel(false), 2000)
  }

  const commitRename = (raw: string) => {
    const v = raw.trim()
    if (v && v !== name) onRename?.(v)
    setEditing(false)
  }

  const toggle = () => {
    if (!editing) onToggle?.()
  }

  return (
    <div
      className={`sb-group-head${collapsed ? ' is-collapsed' : ''}${dropActive ? ' is-drop-target' : ''}`}
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        /* 仅头部自身聚焦时响应；内部 IconButton 的键盘事件不劫持 */
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropActive(true)
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropActive(false)
        const id = e.dataTransfer.getData('text/session-id')
        if (id) onDropSession(id)
      }}
    >
      {editing ? (
        <input
          className="input"
          autoFocus
          defaultValue={name}
          aria-label={t('重命名分组')}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation()
              commitRename(e.currentTarget.value)
            } else if (e.key === 'Escape') {
              e.stopPropagation() /* 防止冒泡到全局 Esc */
              setEditing(false)
            }
          }}
          onBlur={(e) => commitRename(e.currentTarget.value)}
        />
      ) : (
        <span
          className="gh-name"
          onDoubleClick={(e) => {
            if (!manageable) return
            e.stopPropagation()
            setEditing(true)
          }}
        >
          {name}
        </span>
      )}
      {/* T026-返修：箭头在**组名右边**紧跟（展开 ˇ / 收起 ›），行最右留给计数与操作钮 */}
      {editing ? null : <Icon name="chevron" size={11} className="gh-chevron" />}
      <span className="gh-count">{count}</span>
      {manageable ? (
        <span className="gh-actions" onClick={(e) => e.stopPropagation()}>
          <IconButton
            tip={t('重命名分组')}
            icon="wrench"
            onClick={() => {
              setConfirmDel(false)
              setEditing(true)
            }}
          />
          {confirmDel ? (
            <IconButton
              tip={t('再点一次确认删除分组')}
              icon="check"
              onClick={() => {
                setConfirmDel(false)
                if (delTimer.current !== null) window.clearTimeout(delTimer.current)
                onDelete?.()
              }}
            />
          ) : (
            <IconButton tip={t('删除分组（组内会话回未分组）')} icon="x" onClick={armDelete} />
          )}
        </span>
      ) : null}
    </div>
  )
}
