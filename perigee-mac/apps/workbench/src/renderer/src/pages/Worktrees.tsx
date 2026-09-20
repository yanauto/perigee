import { useEffect, useState } from 'react'
import { UI } from '../../../shared/ui-copy'
import { useWorkbench } from '../state'

export function Worktrees() {
  const { state, startIsolated, openWorktree, refreshWorktrees, housekeepWorktree, forkSession, error } =
    useWorkbench()
  const pack = state?.worktrees
  const items = pack?.items ?? []
  const empty = !pack?.loading && items.length === 0
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (pack && !pack.loading && (pack.items.length || pack.emptyNote || pack.error)) return
    void refreshWorktrees()
  }, [pack, refreshWorktrees])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stage-auto stage-worktrees">
      <header className="auto-head">
        <h1>隔离目录</h1>
        <p className="muted">{UI.worktreeLead}</p>
      </header>

      <section className="auto-lane">
        <div className="wt-actions">
          <input
            className="acct-input wide"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="名字（可空，官方会自己起）"
            disabled={busy}
          />
          <button
            type="button"
            className="btn-solid"
            disabled={busy || !state?.workspace.path}
            onClick={() =>
              void run(async () => {
                await startIsolated(label.trim() || undefined)
                setLabel('')
              })
            }
          >
            新开隔离会话
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => void run(() => forkSession())}
          >
            分叉当前聊
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy || !state?.workspace.path}
            onClick={() => void run(() => forkSession({ isolate: true }))}
          >
            分叉到新隔离目录
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => void refreshWorktrees()}
          >
            {pack?.loading ? UI.refreshing : UI.refresh}
          </button>
        </div>
        {!state?.workspace.path ? <p className="muted">先打开一个 git 仓库文件夹，再开隔离会话。</p> : null}
        {error ? <p className="wt-err">{error}</p> : null}
      </section>

      <section className="auto-lane">
        {pack?.loading && !items.length ? (
          <div className="auto-empty">
            <div className="auto-empty-title">正在读 grok worktree list…</div>
          </div>
        ) : empty ? (
          <div className="auto-empty">
            <div className="auto-empty-title">{pack?.emptyNote ?? UI.worktreeEmpty}</div>
            {pack?.error ? <p className="muted">{pack.error}</p> : null}
          </div>
        ) : (
          <table className="auto-table">
            <thead>
              <tr>
                <th>名字</th>
                <th>仓</th>
                <th>类型</th>
                <th>路径</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className="auto-name">{row.label || row.id}</td>
                  <td className="muted">{row.repo || '—'}</td>
                  <td className="muted">{row.kind}</td>
                  <td className="muted wt-path" title={row.path}>
                    {row.path}
                  </td>
                  <td className="wt-row-btns">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => void run(() => openWorktree(row.path))}
                    >
                      在这里开
                    </button>
                    <button
                      type="button"
                      className="btn-ghost is-danger"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`删掉这条隔离目录？\n${row.path}\n\n官方 grok worktree rm。主仓不动。`)) {
                          return
                        }
                        void run(() =>
                          housekeepWorktree({ action: 'rm', ids: [row.id], confirm: true })
                        )
                      }}
                    >
                      删
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="auto-lane">
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('跑官方 grok worktree gc？会清掉目录已经没了的条目。')) return
            void run(() => housekeepWorktree({ action: 'gc', confirm: true }))
          }}
        >
          清理失效条目（gc）
        </button>
      </section>
    </div>
  )
}
