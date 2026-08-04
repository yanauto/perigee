import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import type { ExternalCliSession } from '../../lib/perigee-api'
import { usePopover } from '../../lib/popovers'
import { useT } from '../../i18n'
import { Icon } from '../ui'
import { placeRowMenu, type MenuPlacement } from './menu-placement'

/**
 * CLI 历史会话行（T016：与普通会话同形态——状态点 + 名字，徽标删除）。
 * 点击 = session.resumeExternal 恢复（真 ACP session/load，历史经事件流回放）；
 * headless/stub 引擎模式 → 置灰并注明；恢复中整列表置灰防并发。
 * T025-返修 3：补上 ⋮ 菜单（与 SessionRow 同一套 data-pop + 翻转定位），
 * 菜单项按真实能力裁剪 = 恢复到 Desktop（可用时）+ 归档 / 取消归档。
 */
export function CliRow({
  item,
  resumable,
  resuming,
  anyResuming,
  onResume,
  archived,
  onArchive,
  onUnarchive,
  onDelete
}: {
  item: ExternalCliSession
  /** features.resumeExternal 且 engineMode=acp */
  resumable: boolean
  /** 本行正在恢复 */
  resuming: boolean
  /** 有任意恢复进行中（其它行视觉置灰，点击由父级 guard） */
  anyResuming: boolean
  onResume: (item: ExternalCliSession) => void
  archived: boolean
  onArchive: () => void
  onUnarchive: () => void
  /** T030：物理删除该 CLI 会话的 transcript 目录（不可恢复） */
  onDelete: () => void
}): JSX.Element {
  const t = useT()
  const dimmed = !resumable || anyResuming
  const popName = `cli:${item.id}`
  const menu = usePopover(popName)
  const menuOpen = menu.open
  const moreRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<MenuPlacement | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const delTimer = useRef<number | null>(null)

  /* 菜单关掉即复位确认态；卸载清计时器 */
  useEffect(() => {
    if (!menuOpen) setConfirmDel(false)
  }, [menuOpen])
  useEffect(
    () => () => {
      if (delTimer.current !== null) window.clearTimeout(delTimer.current)
    },
    []
  )

  const armDelete = () => {
    setConfirmDel(true)
    if (delTimer.current !== null) window.clearTimeout(delTimer.current)
    delTimer.current = window.setTimeout(() => setConfirmDel(false), 6000)
  }

  /* 定位与 SessionRow 同款：量按钮 + 菜单自然高 → 纯函数算 fixed 坐标，下方不够就上翻 */
  useLayoutEffect(() => {
    if (!menuOpen) {
      setPlace(null)
      return
    }
    const measure = () => {
      const btn = moreRef.current
      const el = menuRef.current
      if (!btn || !el) return
      const r = btn.getBoundingClientRect()
      setPlace(
        placeRowMenu(
          { top: r.top, bottom: r.bottom, right: r.right },
          window.innerWidth,
          window.innerHeight,
          el.scrollHeight
        )
      )
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [menuOpen])

  const run = (fn: () => void) => () => {
    menu.close()
    fn()
  }

  return (
    <div
      className={`sb-item${dimmed ? ' is-bridging' : ''}${menuOpen ? ' is-menu-open' : ''}`}
      role="button"
      tabIndex={0}
      aria-disabled={!resumable}
      data-tip={
        resumable
          ? `${t('恢复到 Desktop')}（${item.numMessages ?? '?'} ${t('条消息')}）`
          : t('需 ACP 引擎模式（设置 → 引擎）')
      }
      onClick={() => resumable && onResume(item)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if ((e.key === 'Enter' || e.key === ' ') && resumable) {
          e.preventDefault()
          onResume(item)
        }
      }}
    >
      <span className={`dot ${resuming ? 'dot-working' : 'dot-read'}`} />
      <span className="si-title">
        {resuming ? `${t('恢复中…')} ` : ''}
        {item.title || t('未命名会话')}
      </span>

      <span className="si-more-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          ref={moreRef}
          className="si-more"
          data-pop-trigger={popName}
          aria-label={t('更多')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={menu.toggle}
        >
          <Icon name="more" size={13} />
        </button>
        {menuOpen ? (
          <div
            ref={menuRef}
            className={`popover si-menu${place?.dir === 'up' ? ' is-up' : ''}`}
            data-pop={popName}
            role="menu"
            style={
              place
                ? { top: place.top, right: place.right, maxHeight: place.maxHeight }
                : { visibility: 'hidden' }
            }
          >
            {resumable ? (
              <button type="button" className="menu-item" onClick={run(() => onResume(item))}>
                {t('恢复到 Desktop')}
              </button>
            ) : null}
            <button
              type="button"
              className="menu-item"
              onClick={run(archived ? onUnarchive : onArchive)}
            >
              {archived ? t('取消归档') : t('归档')}
            </button>
            <div className="menu-sep" />
            {/* T030：物理删除（两步确认，文案明示不可恢复） */}
            {confirmDel ? (
              <button
                type="button"
                className="menu-item is-danger"
                onClick={run(() => {
                  if (delTimer.current !== null) window.clearTimeout(delTimer.current)
                  setConfirmDel(false)
                  onDelete()
                })}
              >
                {t('再点一次：从磁盘永久删除')}
              </button>
            ) : (
              <button
                type="button"
                className="menu-item is-danger"
                data-tip={t('将从磁盘永久删除该 CLI 会话记录，不可恢复')}
                onClick={armDelete}
              >
                {t('删除')}
              </button>
            )}
          </div>
        ) : null}
      </span>
    </div>
  )
}
