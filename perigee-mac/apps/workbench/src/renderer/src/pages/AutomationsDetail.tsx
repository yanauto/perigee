import { formatWhen } from '../../../shared/routines'
import { UI } from '../../../shared/ui-copy'
import { IconChevronLeft } from '../components/Icons'
import { useWorkbench } from '../state'

export function AutomationsDetail() {
  const { state, goto, openSession, toggleRoutine, removeRoutine, runRoutine } = useWorkbench()
  const id = state?.routines.activeId
  const row = state?.routines.items.find((r) => r.id === id)

  if (!row) {
    return (
      <div className="stage-auto">
        <header className="auto-detail-head">
          <button type="button" className="back-btn" onClick={() => void goto('automations')}>
            <IconChevronLeft />
            自动化
          </button>
        </header>
        <div className="auto-empty">
          <div className="auto-empty-title">没有这条本机定时</div>
          <p className="muted">回列表再点进去。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stage-auto stage-auto-detail">
      <header className="auto-detail-head">
        <button type="button" className="back-btn" onClick={() => void goto('automations')}>
          <IconChevronLeft />
          自动化
        </button>
        <div className="row-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={row.running}
            onClick={() => void runRoutine(row.id)}
          >
            {row.running ? '进行中' : '立刻跑一次'}
          </button>
          <button
            type="button"
            className={row.enabled ? 'toggle is-on' : 'toggle'}
            role="switch"
            aria-checked={row.enabled}
            onClick={() => void toggleRoutine(row.id, !row.enabled)}
          />
          <span className={row.enabled ? 'ok-text' : 'muted'}>{row.enabled ? '开着' : '已停'}</span>
          <button type="button" className="btn-danger" onClick={() => void removeRoutine(row.id)}>
            删除
          </button>
        </div>
      </header>

      <div className="auto-detail-title">
        <div className="auto-lane-kicker">Perigee 本机定时</div>
        <h1 className="auto-title-input">{row.name}</h1>
        {row.running ? <span className="session-badge is-live">进行中</span> : null}
        <p className="muted">{UI.autoDetailHint}</p>
      </div>

      <section className="auto-block">
        <div className="auto-block-label">到点</div>
        <div className="auto-block-body">
          <div className="routine-meta">
            <span>
              cron <em>{row.cron || '—'}</em>
            </span>
            <span>
              下次 <em>{formatWhen(row.nextRunAt)}</em>
            </span>
            <span>
              上次 <em>{formatWhen(row.lastRunAt)}</em>
              {row.lastStatus ? ` · ${row.lastStatus === 'ok' ? '成' : '败'}` : ''}
            </span>
          </div>
        </div>
      </section>

      <section className="auto-block">
        <div className="auto-block-label">要说的话</div>
        <div className="auto-instr">
          <div className="routine-say is-plain">{row.instruction}</div>
        </div>
      </section>

      <section className="auto-block">
        <div className="auto-block-label">跑过</div>
        {row.runs.length === 0 ? (
          <p className="muted">还没跑过。立刻跑一次，或等到点。</p>
        ) : (
          <table className="auto-table">
            <thead>
              <tr>
                <th>开始</th>
                <th>结果</th>
                <th>摘要</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {row.runs.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => {
                    if (run.sessionId) void openSession(run.sessionId)
                  }}
                >
                  <td className="muted">{formatWhen(run.startedAt)}</td>
                  <td className={run.status === 'ok' ? 'ok-text' : 'bad-text'}>
                    {run.status === 'ok' ? '成' : '败'}
                  </td>
                  <td>{run.summary?.split('\n')[0] ?? '—'}</td>
                  <td className="muted">{run.sessionId ? '看对话' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {row.lastSummary && row.runs.length === 0 ? <p>{row.lastSummary}</p> : null}
      </section>
    </div>
  )
}
