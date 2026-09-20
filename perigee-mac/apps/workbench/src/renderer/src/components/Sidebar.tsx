import { useState } from 'react'
import { folderName, formatSessionWhen, type GrokSessionRow } from '../../../shared/grok-sessions'
import { isAutoPage } from '../../../shared/pages'
import type { AppState } from '../../../shared/types'
import { UI } from '../../../shared/ui-copy'
import { useCliLedger } from '../cli-ledger'
import { useWorkbench } from '../state'
import { IconClock, IconSearch, IconSliders, IconSpark } from './Icons'

export function Sidebar({ state }: { state: AppState }) {
  const { goto, newAgent, openSession, openWorkspace, resumeCli, continueRecent, renameCli, deleteCli } =
    useWorkbench()
  const { pack, loading, query, selected, select, setQuery, reload } = useCliLedger()
  const rows = state.sessions.filter((s) => !s.kind || s.kind === 'chat')
  const localEmpty = rows.length === 0
  const folder = state.workspace.name
  const cliItems = pack?.items ?? []
  const cliError = pack && !pack.ok ? pack.error : undefined
  const cliEmpty = !loading && !cliError && cliItems.length === 0
  const [cliUser, setCliUser] = useState<boolean | null>(null)
  const cliOpen = cliError ? true : (cliUser ?? !localEmpty)
  const [pendingDelete, setPendingDelete] = useState<GrokSessionRow | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const goLocal = (id: string) => {
    select(null)
    void openSession(id)
  }

  const goCli = (row: GrokSessionRow) => {
    select(null)
    void resumeCli(row.id).then((ok) => {
      if (!ok) select(row)
    })
  }

  const startChat = () => {
    select(null)
    void newAgent()
  }

  const onContinue = () => {
    if (busy) return
    setBusy(true)
    select(null)
    void continueRecent()
      .then((ok) => {
        if (ok) setCliUser(true)
      })
      .finally(() => setBusy(false))
  }

  const onDelete = (row: GrokSessionRow) => {
    if (busy) return
    setBusy(true)
    void deleteCli(row.id)
      .then((ok) => {
        if (ok) {
          if (selected?.id === row.id) select(null)
          setPendingDelete(null)
          reload()
        }
      })
      .finally(() => setBusy(false))
  }

  const onRename = (row: GrokSessionRow) => {
    const title = renameDraft.trim()
    if (!title || busy) return
    setBusy(true)
    void renameCli(row.id, title)
      .then((ok) => {
        if (ok) {
          setRenaming(null)
          reload()
        }
      })
      .finally(() => setBusy(false))
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-drag" />
      <div className="sidebar-tools">
        <button
          type="button"
          className={folder ? 'workspace-chip' : 'workspace-chip is-empty'}
          onClick={() => void openWorkspace()}
          title={state.workspace.path ?? UI.openFolder}
        >
          {folder ?? UI.noFolder}
        </button>
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className={state.page === 'agents-home' && !selected ? 'nav-item is-on' : 'nav-item'}
          onClick={startChat}
        >
          <IconSpark />
          <span>{UI.newChat}</span>
        </button>
        <button
          type="button"
          className={isAutoPage(state.page) && !selected ? 'nav-item is-on' : 'nav-item'}
          title="Perigee 定时 · 不是 CLI /loop"
          onClick={() => {
            select(null)
            void goto('automations')
          }}
        >
          <IconClock />
          <span>自动化</span>
        </button>
        <button
          type="button"
          className={state.page === 'settings-models' && !selected ? 'nav-item is-on' : 'nav-item'}
          onClick={() => {
            select(null)
            void goto('settings-models')
          }}
        >
          <IconSliders />
          <span>模型与钥匙</span>
        </button>
      </nav>

      <div className="session-block">
        <div className="session-label">{UI.localLabel}</div>
        {localEmpty ? (
          <button type="button" className="session-empty is-group is-action" onClick={startChat}>
            {UI.localEmpty}
          </button>
        ) : (
          <ul className="session-list">
            {rows.map((s) => {
              const on = !selected && state.activeSessionId === s.id && state.page === 'chat'
              const live = s.status === 'streaming' || s.status === 'waiting'
              const mark = live ? '进行中' : s.unread ? '未读' : s.badge
              const markClass = live
                ? 'session-badge is-live'
                : s.unread
                  ? 'session-badge is-unread'
                  : 'session-badge'
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={on ? 'session-row is-on' : 'session-row'}
                    onClick={() => goLocal(s.id)}
                  >
                    <span className="session-row-title">{s.title}</span>
                    {mark ? <span className={markClass}>{mark}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <button
          type="button"
          className="session-label is-toggle"
          aria-expanded={cliOpen}
          title="点开可续聊终端里的会话"
          onClick={() => setCliUser(!cliOpen)}
        >
          <span>{UI.cliLabel}</span>
          {cliItems.length > 0 ? <span className="session-fold-count">{cliItems.length}</span> : null}
        </button>
        {cliError ? <div className="session-empty is-group">{cliError}</div> : null}
        {cliOpen && !cliError ? (
          <>
            <div className="session-ledger-tools">
              <label className="session-search">
                <IconSearch size={13} />
                <input
                  type="search"
                  value={query}
                  placeholder="搜标题和开头"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="session-continue"
                disabled={busy || !state.workspace.path}
                title={state.workspace.path ? '续这个文件夹最近一条，不用自己翻' : '先打开文件夹'}
                onClick={onContinue}
              >
                {busy ? '正在续…' : '继续本目录最近一条'}
              </button>
            </div>
            {pendingDelete ? (
              <div className="session-confirm">
                <div>删掉「{pendingDelete.title}」？官方账本里也没了，回不来。</div>
                <div className="session-confirm-actions">
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => setPendingDelete(null)}>
                    取消
                  </button>
                  <button type="button" className="btn-danger" disabled={busy} onClick={() => onDelete(pendingDelete)}>
                    确认删除
                  </button>
                </div>
              </div>
            ) : null}
            {loading && !pack ? (
              <div className="session-empty is-group">{UI.cliLoading}</div>
            ) : cliEmpty ? (
              <div className="session-empty is-group">
                {query.trim() ? '没有搜到' : UI.cliEmpty}
              </div>
            ) : (
              <ul className="session-list">
                {cliItems.map((row) => {
                  const on =
                    selected?.id === row.id ||
                    (!selected && state.activeSessionId === row.id && state.page === 'chat')
                  const meta = [formatSessionWhen(row.updatedAt || row.createdAt), folderName(row.cwd)]
                    .filter(Boolean)
                    .join(' · ')
                  const editing = renaming === row.id
                  return (
                    <li key={row.id}>
                      {editing ? (
                        <form
                          className="session-rename"
                          onSubmit={(e) => {
                            e.preventDefault()
                            onRename(row)
                          }}
                        >
                          <input
                            value={renameDraft}
                            autoFocus
                            onChange={(e) => setRenameDraft(e.target.value)}
                            placeholder="本机窗标题"
                          />
                          <button type="submit" className="btn-solid" disabled={busy || !renameDraft.trim()}>
                            改
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setRenaming(null)}
                          >
                            取消
                          </button>
                        </form>
                      ) : (
                        <div className={on ? 'session-cli-wrap is-on' : 'session-cli-wrap'}>
                          <button
                            type="button"
                            className={on ? 'session-row is-cli is-on' : 'session-row is-cli'}
                            onClick={() => goCli(row)}
                            title={row.cwd ?? row.id}
                          >
                            <span className="session-row-top">
                              <span className="session-row-title">{row.title}</span>
                              <span className="session-badge is-cli">CLI</span>
                            </span>
                            {meta ? <span className="session-row-meta">{meta}</span> : null}
                          </button>
                          <div className="session-row-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setRenaming(row.id)
                                setRenameDraft(row.title)
                              }}
                            >
                              改名
                            </button>
                            <button type="button" onClick={() => setPendingDelete(row)}>
                              删除
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : null}
      </div>

      <div className="sidebar-foot">
        <div className="avatar" aria-hidden="true">
          P
        </div>
        <div className="who">
          <div className="who-name">本机</div>
          <div className="who-plan">Perigee</div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="模型与钥匙"
          onClick={() => {
            select(null)
            void goto('settings-models')
          }}
        >
          <IconSliders />
        </button>
      </div>
    </aside>
  )
}
