import { useState } from 'react'
import { folderName, formatSessionWhen, type GrokSessionRow } from '../../../shared/grok-sessions'
import { IconChevronLeft } from '../components/Icons'
import { useCliLedger } from '../cli-ledger'
import { useWorkbench } from '../state'

export function GrokSessionPreview({ row }: { row: GrokSessionRow }) {
  const { newAgent, resumeCli, continueRecent, renameCli, deleteCli, error } = useWorkbench()
  const { select, reload } = useCliLedger()
  const folder = folderName(row.cwd)
  const [renameDraft, setRenameDraft] = useState(row.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const back = () => {
    select(null)
    void newAgent()
  }

  return (
    <div className="stage-settings">
      <header className="settings-head">
        <button type="button" className="back-btn" onClick={back}>
          <IconChevronLeft />
          返回对话
        </button>
        <div className="chat-title">{row.title}</div>
        <p className="settings-lead">
          {error
            ? error
            : '正在把这条 CLI 会话接到本机窗，接上就能接着聊。改名只改这边标题，官方 CLI 没有 rename。'}
        </p>
      </header>
      <div className="settings-body">
        <section className="settings-card">
          <div className="settings-card-label">CLI 会话</div>
          <div className="settings-row">
            <span>标题</span>
            <span className="muted">{row.title}</span>
          </div>
          <div className="settings-row">
            <span>id</span>
            <span className="muted">{row.id}</span>
          </div>
          <div className="settings-row">
            <span>目录</span>
            <span className="muted">{row.cwd || folder || '—'}</span>
          </div>
          <div className="settings-row">
            <span>更新</span>
            <span className="muted">{formatSessionWhen(row.updatedAt || row.createdAt)}</span>
          </div>
          {row.status ? (
            <div className="settings-row">
              <span>状态</span>
              <span className="muted">{row.status}</span>
            </div>
          ) : null}
          <div className="settings-row">
            <span>本机窗标题</span>
            <form
              className="session-rename"
              onSubmit={(e) => {
                e.preventDefault()
                if (busy || !renameDraft.trim()) return
                setBusy(true)
                void renameCli(row.id, renameDraft).finally(() => setBusy(false))
              }}
            >
              <input value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} />
              <button type="submit" className="btn-solid" disabled={busy || !renameDraft.trim()}>
                改名
              </button>
            </form>
          </div>
          <div className="settings-row">
            <span>接着聊</span>
            <span className="session-confirm-actions">
              <button
                type="button"
                className="btn-solid"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void resumeCli(row.id)
                    .then((ok) => {
                      if (ok) select(null)
                    })
                    .finally(() => setBusy(false))
                }}
              >
                {error ? '再试一次' : '接上这条'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                title="对照 grok -c，续当前文件夹最近一条"
                onClick={() => {
                  setBusy(true)
                  void continueRecent()
                    .then((ok) => {
                      if (ok) select(null)
                    })
                    .finally(() => setBusy(false))
                }}
              >
                继续本目录最近一条
              </button>
            </span>
          </div>
          <div className="settings-row">
            <span>删除</span>
            {confirmDelete ? (
              <div className="session-confirm-actions">
                <span className="muted">官方账本里也没了，回不来。</span>
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    void deleteCli(row.id)
                      .then((ok) => {
                        if (ok) {
                          select(null)
                          reload()
                          void newAgent()
                        }
                      })
                      .finally(() => setBusy(false))
                  }}
                >
                  确认删除
                </button>
              </div>
            ) : (
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
                删除这条
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
