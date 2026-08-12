import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SessionAttention, SessionRecord, WorktreeStatus } from '../../lib/perigee-api'
import type { SidebarGroup } from '../../state/sidebar-groups'
import { attentionOf } from '../../state/session-order'
import { closePop, usePopover } from '../../lib/popovers'
import { placeRowMenu, type MenuPlacement } from './menu-placement'
import {
  resolveSessionDeleteClick,
  SESSION_DELETE_CONFIRM_MS
} from './session-delete-confirm'
import { useT } from '../../i18n'
import { Icon } from '../ui'

/** 四态状态点（T008 attention；视觉对齐原型 DOT 表，CSS 见 global.css §5） */
const ATT_DOT: Record<SessionAttention, string> = {
  working: 'dot-working',
  needs_input: 'dot-needs',
  unread: 'dot-unread',
  read: 'dot-read'
}

/** 四态标题样式：needs/unread 深一档加粗（原型 titleColor/titleWeight） */
const ATT_TITLE: Record<SessionAttention, string> = {
  working: '',
  needs_input: 'is-strong',
  unread: 'is-strong',
  read: ''
}

/**
 * 会话行（T016 只有状态点 + 名字；T025 改 CCD 交互形态）——
 * 行尾一个 `⋮`：**默认隐身但占位**（不挤标题、不跳布局），hover 该行才显现，
 * 点击弹出小菜单（接 T013 的 data-pop 统一弹层机制：点外关、换弹层一次点击、Esc 关最上层）。
 * 菜单项按**真实能力**裁剪：重命名 / 标记已读 / 移动到分组 / 归档 / 导出 / worktree 三项 / 删除（danger 两步确认）。
 * CCD 的 Open in / Pin / Fork 无对应能力，不做（缺口见 T025 回执）。
 */
export function SessionRow({
  session,
  active,
  onSelect,
  onRename,
  onExport,
  onRemove,
  onRefresh,
  groups,
  groupId,
  onAssignGroup,
  archived,
  onArchive,
  onUnarchive,
  canMarkRead,
  onMarkRead,
  preview,
  canCancel,
  onCancel
}: {
  session: SessionRecord
  active: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onExport: (id: string) => void
  onRemove: (id: string) => void
  /** worktree 操作后刷新会话列表 */
  onRefresh: () => void
  /** 自定义分组（「移动到分组」子列表） */
  groups: SidebarGroup[]
  /** 当前所属分组 id（null = 未分组） */
  groupId: string | null
  onAssignGroup: (groupId: string | null) => void
  archived: boolean
  onArchive: () => void
  onUnarchive: () => void
  /** T008 已读追踪桥就绪才给「标记已读」 */
  canMarkRead: boolean
  onMarkRead: () => void
  /** 后台会话最后一句/工具名；多会话同步用 */
  preview?: string
  /** 后台仍在生成时可从 ⋮ 停止，不必先切过去 */
  canCancel?: boolean
  onCancel?: () => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [movePage, setMovePage] = useState(false)
  const delTimer = useRef<number | null>(null)
  const [wt, setWt] = useState<WorktreeStatus | null>(null)
  const [dragging, setDragging] = useState(false)
  const popName = `row:${session.id}`
  const menu = usePopover(popName)
  const menuOpen = menu.open
  const moreRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /* 菜单定位（fixed）：null = 还没量，先按下方渲染一帧再由 layout effect 定位 */
  const [place, setPlace] = useState<MenuPlacement | null>(null)

  /* worktree 状态（分支/dirty）：挂载时拉一次，防御性 try/catch */
  useEffect(() => {
    if (!session.worktreePath) return
    let alive = true
    void (async () => {
      try {
        const st = await window.perigee.session.worktreeStatus(session.id)
        if (alive && st?.ok) setWt(st)
      } catch {
        /* 桥不可用时静默 */
      }
    })()
    return () => {
      alive = false
    }
  }, [session.id, session.worktreePath])

  /* 卸载清掉删除确认的回退计时器 */
  useEffect(
    () => () => {
      if (delTimer.current !== null) window.clearTimeout(delTimer.current)
    },
    []
  )

  /**
   * 菜单定位：量按钮矩形 + 菜单**自然高**（scrollHeight，与 maxHeight 无关）→ 纯函数算 fixed 坐标。
   * 下方空间不够就翻转到按钮上方（底缘对齐按钮上缘）。用 fixed 是因为 `.sb-scroll` 会裁剪
   * absolute 子元素；DOM 节点仍在原处，data-pop 机制（closest 判定）不受影响。
   */
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
    /* 捕获相位收 scroll：侧栏列表滚动时菜单跟着按钮走，不会飘在原地 */
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [menuOpen, movePage])

  /* 菜单关掉即复位（下次打开是干净的一级菜单，不残留确认态/子页） */
  useEffect(() => {
    if (menuOpen) return
    setMovePage(false)
    setConfirmDel(false)
  }, [menuOpen])

  /* T029：确认窗口 2s → 6s。真机「删了没反应、删几遍都在」有一半是这里——
     2 秒太短，用户第二次点下去时已经回落成「删除会话」，于是只是又 arm 了一次。 */
  const armDelete = () => {
    setConfirmDel(true)
    if (delTimer.current !== null) window.clearTimeout(delTimer.current)
    delTimer.current = window.setTimeout(() => setConfirmDel(false), SESSION_DELETE_CONFIRM_MS)
  }

  /** 两步删除：未武装 → 武装；已武装 → 关菜单 + 真正删除（键鼠共用） */
  const performDeleteStep = () => {
    const step = resolveSessionDeleteClick(confirmDel)
    if (step.arm) {
      armDelete()
      return
    }
    if (delTimer.current !== null) window.clearTimeout(delTimer.current)
    setConfirmDel(false)
    closePop(popName)
    onRemove(session.id)
  }

  /* 字母快捷键：菜单开着时 R / A / D 直接生效（菜单是最上层，捕获相位吃掉事件，
     不让 ChatStream 的 A/D 审批键与之打架）。输入框聚焦时不接管。
     D 二次：必须提交删除，不能只反复 arm（2026-08-04 真机：再点 / 再按 D 无响应）。 */
  useEffect(() => {
    if (!menuOpen || movePage) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement | null)?.isContentEditable) {
        return
      }
      const k = e.key.toLowerCase()
      if (k !== 'r' && k !== 'a' && k !== 'd') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (k === 'r') {
        closePop(popName)
        setEditing(true)
      } else if (k === 'a') {
        closePop(popName)
        if (archived) onUnarchive()
        else onArchive()
      } else {
        performDeleteStep()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [menuOpen, movePage, popName, archived, onArchive, onUnarchive, confirmDel, session.id, onRemove])

  const commitRename = (raw: string) => {
    const v = raw.trim()
    if (v && v !== session.title) onRename(session.id, v)
    setEditing(false)
  }

  const revealWorktree = () => {
    void window.perigee.session.revealWorktree(session.id).catch(() => {})
  }

  const promote = async () => {
    if (!window.confirm(t('推送并创建 PR？（需已 commit，不会 merge 主仓）'))) return
    try {
      const res = await window.perigee.session.promote(session.id)
      if (!res?.ok) window.alert(`${t('推送失败')}：${res?.reason ?? res?.detail ?? t('未知原因')}`)
      onRefresh()
    } catch (e) {
      window.alert(`${t('推送失败')}：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const discard = async () => {
    if (!window.confirm(t('丢弃该会话的 worktree 并删除会话？未推送的改动将丢失（不会 merge 主仓）。')))
      return
    try {
      await window.perigee.session.discardWorktree(session.id)
      onRefresh()
    } catch {
      /* 静默：列表刷新后状态自洽 */
    }
  }

  const attention = attentionOf(session, active)
  const run = (fn: () => void) => () => {
    menu.close()
    fn()
  }

  return (
    <div
      className={`sb-item${active ? ' is-active' : ''}${dragging ? ' is-dragging' : ''}${menuOpen ? ' is-menu-open' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(session.id)
        }
      }}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/session-id', session.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
    >
      <span className={`dot ${ATT_DOT[attention]}`} />
      {editing ? (
        <input
          className="input si-rename"
          autoFocus
          defaultValue={session.title}
          aria-label={t('重命名会话')}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation()
              commitRename(e.currentTarget.value)
            } else if (e.key === 'Escape') {
              e.stopPropagation() /* 防止冒泡到全局 Esc（关面板/取消流式） */
              setEditing(false)
            }
          }}
          onBlur={(e) => commitRename(e.currentTarget.value)}
        />
      ) : (
        <span className="si-text">
          <span
            className={`si-title ${ATT_TITLE[attention]}`.trim()}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
          >
            {session.title || t('未命名会话')}
          </span>
          {preview ? <span className="si-preview">{preview}</span> : null}
        </span>
      )}

      {/* ⋮：默认隐身但占位（hover / 菜单开着时显现） */}
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
                : /* 首帧还没量到坐标：先藏起来（layout effect 在绘制前就会补上，正常看不到这一帧） */
                  { visibility: 'hidden' }
            }
          >
            {movePage ? (
              <>
                <div className="menu-label">{t('移动到分组')}</div>
                <button
                  type="button"
                  className={`menu-item${groupId === null ? ' is-active' : ''}`}
                  onClick={run(() => onAssignGroup(null))}
                >
                  {t('未分组')}
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`menu-item${groupId === g.id ? ' is-active' : ''}`}
                    onClick={run(() => onAssignGroup(g.id))}
                  >
                    {g.name}
                  </button>
                ))}
                {groups.length === 0 ? (
                  <div className="menu-label">{t('还没有分组（侧栏「分组 +」新建）')}</div>
                ) : null}
                <div className="menu-sep" />
                <button type="button" className="menu-item" onClick={() => setMovePage(false)}>
                  {t('返回')}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="menu-item" onClick={run(() => setEditing(true))}>
                  {t('重命名')}
                  <span className="mi-hint">R</span>
                </button>
                {canCancel && onCancel ? (
                  <button type="button" className="menu-item" onClick={run(onCancel)}>
                    {t('停止生成')}
                  </button>
                ) : null}
                {canMarkRead ? (
                  <button
                    type="button"
                    className="menu-item"
                    disabled={attention === 'read'}
                    onClick={run(onMarkRead)}
                  >
                    {t('标记已读')}
                  </button>
                ) : null}
                <button type="button" className="menu-item" onClick={() => setMovePage(true)}>
                  {t('移动到分组')}
                  <span className="mi-hint">›</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={run(archived ? onUnarchive : onArchive)}
                >
                  {archived ? t('取消归档') : t('归档')}
                  <span className="mi-hint">A</span>
                </button>
                <div className="menu-sep" />
                <button
                  type="button"
                  className="menu-item"
                  onClick={run(() => onExport(session.id))}
                >
                  {t('导出 Markdown')}
                </button>
                {session.worktreePath ? (
                  <>
                    <button type="button" className="menu-item" onClick={run(revealWorktree)}>
                      {t('在 Finder 打开 worktree')}
                      {wt?.branch ? <span className="mi-hint">{wt.branch}</span> : null}
                    </button>
                    <button type="button" className="menu-item" onClick={run(() => void promote())}>
                      {t('推送并开 PR（需已 commit）')}
                    </button>
                    <button
                      type="button"
                      className="menu-item is-danger"
                      onClick={run(() => void discard())}
                    >
                      {t('丢弃 worktree 并删除会话')}
                    </button>
                  </>
                ) : null}
                <div className="menu-sep" />
                {/* 单按钮两步：避免拆成两个 button 时 DOM 替换/键位只 arm 不提交 */}
                <button type="button" className="menu-item is-danger" onClick={performDeleteStep}>
                  {confirmDel ? t('再点一次确认删除') : t('删除会话')}
                  {!confirmDel ? <span className="mi-hint">D</span> : null}
                </button>
              </>
            )}
          </div>
        ) : null}
      </span>
    </div>
  )
}
