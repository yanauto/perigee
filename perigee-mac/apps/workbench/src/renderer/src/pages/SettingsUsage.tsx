import { useState } from 'react'
import { isFreePlan, USAGE_EVENTS, USAGE_POINTS } from '../account'
import { IconDownload } from '../components/Icons'
import { useWorkbench } from '../state'

function UsageChart({ empty }: { empty: boolean }) {
  const w = 640
  const h = 220
  const pad = { l: 56, r: 16, t: 16, b: 36 }
  const max = 6
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const pts = empty
    ? [{ x: pad.l, y: pad.t + innerH }]
    : USAGE_POINTS.map((p, i) => {
        const x = pad.l + (i / (USAGE_POINTS.length - 1)) * innerW
        const y = pad.t + innerH - ((p.gpt53 + p.gpt54 + p.composer) / max) * innerH
        return { x, y }
      })
  const area = empty
    ? ''
    : `M ${pts[0].x} ${pad.t + innerH} ` + pts.map((p) => `L ${p.x} ${p.y}`).join(' ') + ` L ${pts[pts.length - 1].x} ${pad.t + innerH} Z`
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const todayX = empty ? pad.l + innerW * 0.15 : pts[pts.length - 1]?.x ?? pad.l

  return (
    <svg className="usage-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Usage chart">
      <text x="16" y="120" className="svg-label" transform="rotate(-90 16 120)">
        Cumulative Spend
      </text>
      <line x1={pad.l} y1={pad.t + innerH} x2={w - pad.r} y2={pad.t + innerH} stroke="#e8e8e8" />
      <text x={pad.l - 8} y={pad.t + innerH + 4} className="svg-label" textAnchor="end">
        $0
      </text>
      {!empty ? (
        <text x={pad.l - 8} y={pad.t + 8} className="svg-label" textAnchor="end">
          $6
        </text>
      ) : null}
      {area ? <path d={area} fill="rgba(34, 134, 58, 0.18)" /> : null}
      <path d={line} fill="none" stroke="#2da44e" strokeWidth="2" />
      <line x1={todayX} y1={pad.t} x2={todayX} y2={pad.t + innerH} stroke="#bbb" strokeDasharray="4 4" />
      <text x={todayX + 6} y={pad.t + 12} className="svg-label">
        Today
      </text>
      {(empty ? [{ label: 'Mar 24' }] : USAGE_POINTS).map((p, i) => (
        <text
          key={p.label}
          x={empty ? pad.l : pad.l + (i / (USAGE_POINTS.length - 1)) * innerW}
          y={h - 8}
          className="svg-label"
          textAnchor="middle"
        >
          {p.label}
        </text>
      ))}
    </svg>
  )
}

export function SettingsUsage() {
  const { state } = useWorkbench()
  const empty = isFreePlan(state?.account.plan ?? 'pro')
  const [span, setSpan] = useState('30d')
  const [toast, setToast] = useState<string | null>(null)

  return (
    <div className="acct-page">
      <section className="white-card">
        <div className="card-head">
          <div>
            <h1 className="acct-title tight">Your Usage</h1>
            <p className="muted">Your usage per day across this billing period.</p>
          </div>
          <div className="chip-row">
            <button type="button" className="btn-ghost" tabIndex={-1}>
              By Model
            </button>
            <button type="button" className="btn-ghost" tabIndex={-1}>
              Spend
            </button>
          </div>
        </div>
        <UsageChart empty={empty} />
        {!empty ? (
          <div className="usage-legend">
            <span>
              <i className="dot green" /> gpt-5.3-codex-high
            </span>
            <span>
              <i className="dot blue" /> gpt-5.4-high
            </span>
            <span>
              <i className="dot navy" /> composer-1.5
            </span>
          </div>
        ) : null}
      </section>

      <div className="usage-toolbar">
        <button type="button" className="btn-ghost">
          {empty ? 'Feb 23 - Mar 24' : 'Feb 26 - Mar 27'}
        </button>
        <div className="seg">
          {['1d', '7d', '30d'].map((k) => (
            <button key={k} type="button" className={span === k ? 'is-on' : ''} onClick={() => setSpan(k)}>
              {k}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="account-text"
          onClick={() => setToast('Exported (demo). Nothing was saved.')}
        >
          <IconDownload /> Export CSV
        </button>
      </div>

      <section className="white-card">
        {empty ? (
          <div className="settings-empty">
            <div>No Events Found</div>
            <div className="muted">No usage events found for the selected filters</div>
          </div>
        ) : (
          <table className="acct-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {USAGE_EVENTS.map((row) => (
                <tr key={row.date + row.model}>
                  <td>{row.date}</td>
                  <td>{row.type}</td>
                  <td>
                    {row.model}
                    {row.max ? <span className="max-badge">MAX</span> : null}
                  </td>
                  <td>{row.tokens}</td>
                  <td>{row.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {toast ? <p className="account-inline-note">{toast}</p> : null}
    </div>
  )
}
