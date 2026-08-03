import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ExternalCliSession } from '../../lib/perigee-api'
import type { Workbench } from '../../state/useWorkbench'
import { cliArchiveKey, isArchived } from '../../state/archived-sessions'
import { dedupeCliSessions } from '../../state/session-dedupe'
import { mixEntries, type SidebarEntry } from '../../state/session-order'
import { baseName, homeTilde } from '../../lib/format'
import { useI18n } from '../../i18n'
import { formatRunTime } from '../../lib/routines'
import { Icon } from '../ui'

/** 行高（等高行 → 虚拟滚动可用固定估高，千条级也不掉帧） */
const ROW_H = 46
/** 一次把全部 CLI transcript 拉回来（侧栏只取 12 条；这里要看全量归档） */
const CLI_FETCH_LIMIT = 5000

/**
 * 设置 →「已归档」子页（T026：归档区从侧栏迁到这里）。
 * 桌面会话 + CLI 会话混排，按最近活动降序（与侧栏同一把尺子 state/session-order）。
 * 每条可「取消归档」；**桌面会话可删除**（session.remove，两步确认），
 * CLI 条目后端没有删除能力 —— 不摆假按钮（纲领 §5）。
 * 千条级列表走 @tanstack/react-virtual（与 ChatStream 同一套虚拟滚动方案）。
 */
export function ArchivedPage({ wb }: { wb: Workbench }): JSX.Element {
  const { lang, t } = useI18n()
  const archived = wb.archived
  const [cli, setCli] = useState<ExternalCliSession[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  /* CLI 全量：进页面拉一次（侧栏那份 limit=12 不够看归档） */
  useEffect(() => {
    let alive = true
    setLoading(true)
    void window.perigee.session
      .listExternal({ limit: CLI_FETCH_LIMIT })
      .then((list) => {
        if (!alive) return
        setCli(Array.isArray(list) ? list : [])
      })
      .catch(() => alive && setCli([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const entries = useMemo<SidebarEntry[]>(() => {
    const deskArchived = wb.sessions.filter(
      (s) => s.kind !== 'side' && isArchived(archived, s.id)
    )
    /* 与侧栏同规则：已被 Desktop 会话代表的 CLI transcript 不重复列 */
    const cliArchived = dedupeCliSessions(cli, wb.sessions).filter((c) =>
      isArchived(archived, cliArchiveKey(c.id))
    )
    return mixEntries(deskArchived, cliArchived)
  }, [wb.sessions, cli, archived])

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
    getItemKey: (i) => {
      const e = entries[i]
      if (!e) return i
      return e.kind === 's' ? `s:${e.session.id}` : `c:${e.cli.id}`
    }
  })

  const remove = (id: string) => {
    if (confirmDel !== id) {
      setConfirmDel(id)
      window.setTimeout(() => setConfirmDel((cur) => (cur === id ? null : cur)), 2000)
      return
    }
    setConfirmDel(null)
    void wb.removeSession(id)
  }

  return (
    <div className="arch-page">
      <div className="arch-note">
        {t('归档的会话不在侧栏显示；取消归档即可放回。')}
        <span className="arch-count">
          {entries.length} {t('条')}
        </span>
      </div>

      {loading && entries.length === 0 ? (
        <div className="composer-hint">{t('加载中…')}</div>
      ) : entries.length === 0 ? (
        <div className="composer-hint">{t('还没有归档的会话')}</div>
      ) : (
        <div className="arch-scroll" ref={scrollRef}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const e = entries[vi.index]!
              const isDesk = e.kind === 's'
              const title = isDesk ? e.session.title : e.cli.title
              const where = isDesk
                ? (e.session.primaryWorkspacePath ?? e.session.workspacePath)
                : e.cli.cwd
              const key = isDesk ? e.session.id : cliArchiveKey(e.cli.id)
              return (
                <div
                  key={isDesk ? `s:${e.session.id}` : `c:${e.cli.id}`}
                  className="arch-row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: ROW_H,
                    transform: `translateY(${vi.start}px)`
                  }}
                >
                  <span className={`arch-kind${isDesk ? ' is-desk' : ''}`}>
                    <Icon name={isDesk ? 'message' : 'terminal'} size={12} />
                  </span>
                  <span className="arch-main">
                    <span className="arch-title" title={title}>
                      {title || t('未命名会话')}
                    </span>
                    <span className="arch-sub" title={where}>
                      {baseName(where) || homeTilde(where)} · {formatRunTime(e.ts, Date.now(), lang)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="arch-btn"
                    onClick={() => wb.unarchiveItem(key)}
                  >
                    {t('取消归档')}
                  </button>
                  {isDesk ? (
                    <button
                      type="button"
                      className={`arch-btn is-danger${confirmDel === e.session.id ? ' is-armed' : ''}`}
                      onClick={() => remove(e.session.id)}
                    >
                      {confirmDel === e.session.id ? t('再点一次确认删除') : t('删除')}
                    </button>
                  ) : (
                    /* CLI transcript 后端无删除能力：留空位保持右缘对齐，不摆假按钮 */
                    <span className="arch-btn-placeholder" aria-hidden />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
