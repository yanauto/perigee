import { useState } from 'react'
import { BUGBOT_ORG } from '../../../shared/bugbot'
import { IconChevron, IconDownload, IconExternal } from '../components/Icons'
import { useWorkbench } from '../state'

const RANGES = ['1d', '7d', '30d'] as const
const DRAFT_OPTS = ['On', 'Off', 'Use Installation Default']
const DEFAULT_OPTS = ['Use Installation Defaults', 'On', 'Off']
const AUTOFIX_OPTS = ['Use Installation Default', 'On', 'Off']

export function BugbotBanner() {
  const { setModal } = useWorkbench()
  return (
    <button type="button" className="bugbot-banner" onClick={() => void setModal('plan')}>
      You have limited free Bugbot reviews. Upgrade to Bugbot Pro for unlimited reviews.
    </button>
  )
}

function RangeBar({
  range,
  onRange
}: {
  range: string
  onRange: (v: '1d' | '7d' | '30d') => void
}) {
  return (
    <div className="bugbot-toolbar">
      <button type="button" className="select-btn" tabIndex={-1}>
        Feb 26 - Mar 27 <IconChevron />
      </button>
      <div className="seg">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={range === r ? 'seg-btn is-on' : 'seg-btn'}
            onClick={() => onRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}

function ConnectionRows({ onRules }: { onRules: () => void }) {
  const { setModal } = useWorkbench()
  const [note, setNote] = useState<string | null>(null)
  return (
    <section className="acct-block">
      <div className="settings-row">
        <div>
          <div className="settings-row-title">GitHub Connections</div>
          <p className="muted">Manage connected accounts and repositories.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setNote('GitHub stays local (demo)')}>
          Manage <IconExternal />
        </button>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">GitLab Connections</div>
          <p className="muted">Manage connected accounts and repositories.</p>
        </div>
        <button type="button" className="btn-solid" onClick={() => setNote('GitLab stays local (demo)')}>
          Manage
        </button>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">Bugbot Pro License</div>
          <p className="muted">Get unlimited Bugbot reviews with Bugbot Pro. Start your 14-day free trial.</p>
        </div>
        <button type="button" className="btn-solid" onClick={() => void setModal('plan')}>
          Upgrade
        </button>
      </div>
      <button type="button" className="settings-row bugbot-link-row" onClick={onRules}>
        <div>
          <div className="settings-row-title">Repository Rules</div>
          <p className="muted">Project rules and automatic learned rules for your repositories.</p>
        </div>
        <span className="bugbot-chevron">
          <IconChevron />
        </span>
      </button>
      {note ? <p className="tiny muted">{note}</p> : null}
    </section>
  )
}

function SettingToggles({
  draftPrs,
  setDraftPrs
}: {
  draftPrs: string
  setDraftPrs: (v: string) => void
}) {
  const [mention, setMention] = useState(false)
  const [once, setOnce] = useState(false)
  const [summaries, setSummaries] = useState('Use Installation Defaults')
  const [autofix, setAutofix] = useState('Use Installation Default')
  const [severity, setSeverity] = useState('Use Installation Default')

  return (
    <section className="acct-block">
      <div className="settings-row">
        <div>
          <div className="settings-row-title">Only Run When Mentioned</div>
          <p className="muted">Only run when &apos;bugbot run&apos; or &apos;@cursor review&apos; is commented on a PR.</p>
        </div>
        <button
          type="button"
          className={mention ? 'toggle is-on' : 'toggle'}
          role="switch"
          aria-checked={mention}
          onClick={() => setMention((v) => !v)}
        />
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">Only Run Once Automatically</div>
          <p className="muted">Automatically review when a PR is published, ignoring new pushes.</p>
        </div>
        <button
          type="button"
          className={once ? 'toggle is-on' : 'toggle'}
          role="switch"
          aria-checked={once}
          onClick={() => setOnce((v) => !v)}
        />
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">Review Draft PRs</div>
          <p className="muted">Allow Bugbot to automatically review draft pull requests.</p>
        </div>
        <select className="acct-select" value={draftPrs} onChange={(e) => setDraftPrs(e.target.value)}>
          {DRAFT_OPTS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">PR Summaries</div>
          <p className="muted">Generate descriptions on pull requests.</p>
        </div>
        <select className="acct-select" value={summaries} onChange={(e) => setSummaries(e.target.value)}>
          {DEFAULT_OPTS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">Bugbot Autofix</div>
          <p className="muted">Using your organization&apos;s default autofix settings. Billed at plan rates.</p>
        </div>
        <select className="acct-select" value={autofix} onChange={(e) => setAutofix(e.target.value)}>
          {AUTOFIX_OPTS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">Bugbot Autofix Severity Threshold</div>
          <p className="muted">Using your organization&apos;s default severity settings.</p>
        </div>
        <select className="acct-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {AUTOFIX_OPTS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
    </section>
  )
}

function ReviewChart() {
  const w = 640
  const h = 180
  const pad = { l: 36, r: 16, t: 16, b: 28 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const y = (v: number) => pad.t + innerH - (v / 3) * innerH
  const x = (i: number, n: number) => pad.l + (i / (n - 1)) * innerW
  const pts = [0, 0, 0, 0, 0, 2]
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i, pts.length)} ${y(v)}`).join(' ')
  const lastX = x(pts.length - 1, pts.length)
  const lastY = y(2)

  return (
    <svg className="bugbot-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="PRs reviewed">
      <text x="10" y="20" className="svg-label">
        3
      </text>
      <text x="10" y={pad.t + innerH + 4} className="svg-label">
        0
      </text>
      <line x1={pad.l} y1={pad.t + innerH} x2={w - pad.r} y2={pad.t + innerH} stroke="#e8e8e8" />
      <path d={line} fill="none" stroke="#22c55e" strokeWidth="2" />
      <circle cx={lastX} cy={lastY} r="4" fill="#22c55e" />
      <text x={lastX} y={h - 6} className="svg-label" textAnchor="middle">
        Mar 26
      </text>
    </svg>
  )
}

export function OrgRepos() {
  const { state, goto } = useWorkbench()
  const seed = state?.bugbot.repos ?? []
  const [repos, setRepos] = useState(seed)
  const [filter, setFilter] = useState('All repos')

  const setAll = (on: boolean) => setRepos((rows) => rows.map((r) => ({ ...r, on })))

  return (
    <div className="acct-page">
      <div>
        <div className="bugbot-kicker">Bugbot</div>
        <h1 className="acct-title">{BUGBOT_ORG}</h1>
      </div>
      <div className="card-head">
        <h2 className="bugbot-section-title">Repositories</h2>
        <div className="row-actions">
          <button type="button" className="select-btn" onClick={() => setFilter(filter === 'All repos' ? 'Enabled' : 'All repos')}>
            {filter} <IconChevron />
          </button>
          <button type="button" className="btn-ghost" onClick={() => setAll(true)}>
            Enable All
          </button>
          <button type="button" className="btn-ghost" onClick={() => setAll(false)}>
            Disable All
          </button>
        </div>
      </div>
      <section className="acct-block">
        {repos.map((repo) => (
          <div key={repo.id} className="settings-row">
            <div className="settings-row-title">{repo.name}</div>
            <button
              type="button"
              className={repo.on ? 'toggle is-on' : 'toggle'}
              role="switch"
              aria-checked={repo.on}
              onClick={() => setRepos((rows) => rows.map((r) => (r.id === repo.id ? { ...r, on: !r.on } : r)))}
            />
          </div>
        ))}
      </section>
      <button type="button" className="account-text" onClick={() => void goto('settings-bugbot-rules')}>
        Back to Repository Rules
      </button>
    </div>
  )
}

export function SettingsBugbot() {
  const { state, goto } = useWorkbench()
  const bugbot = state?.bugbot
  const [range, setRange] = useState(bugbot?.range ?? '30d')
  const [tab, setTab] = useState<'all' | 'merged' | 'open'>('all')
  const [draftPrs, setDraftPrs] = useState(bugbot?.draftPrs ?? 'Use Installation Default')
  const reviews = bugbot?.reviews ?? []
  const enabled = bugbot?.enabled === true

  if (bugbot?.view === 'repos') return <OrgRepos />

  const empty = reviews.length === 0

  return (
    <div className="acct-page">
      <div className="bugbot-head">
        <h1 className="acct-title">
          Bugbot <span className="plan-badge">Free</span>
        </h1>
        <p className="muted">Automatically review pull requests (PRs) for bugs and issues</p>
      </div>
      <RangeBar range={range} onRange={setRange} />

      {empty && !enabled ? (
        <section className="white-card wash bugbot-empty">
          <div className="bugbot-empty-title">Enable Bugbot on a repository to get started</div>
          <p className="muted">
            To start using Bugbot, you need to enable it on at least one repository. Select an organization below to get
            started.
          </p>
        </section>
      ) : null}

      {empty && enabled ? (
        <section className="white-card wash bugbot-empty">
          <div className="bugbot-empty-title">No Data For This Period</div>
          <p className="muted">Try selecting a different date range.</p>
        </section>
      ) : null}

      {!empty ? (
        <section className="white-card">
          <div className="bugbot-metrics">
            <button type="button" className="bugbot-metric is-on">
              <span>PRs Reviewed (2 Runs)</span>
              <strong>2</strong>
            </button>
            <button type="button" className="bugbot-metric">
              <span>Issues Resolved (2 Total)</span>
              <strong>0.0%</strong>
            </button>
            <button type="button" className="bugbot-metric">
              <span>Users</span>
              <strong>1</strong>
            </button>
            <button type="button" className="bugbot-metric">
              <span>Autofixes Merged (0 Runs)</span>
              <strong>0</strong>
            </button>
          </div>
          <ReviewChart />
        </section>
      ) : null}

      {!empty ? (
        <section className="white-card">
          <div className="card-head">
            <div className="seg">
              <button type="button" className={tab === 'all' ? 'seg-btn is-on' : 'seg-btn'} onClick={() => setTab('all')}>
                All Reviews
              </button>
              <button
                type="button"
                className={tab === 'merged' ? 'seg-btn is-on' : 'seg-btn'}
                onClick={() => setTab('merged')}
              >
                Merged
              </button>
              <button type="button" className={tab === 'open' ? 'seg-btn is-on' : 'seg-btn'} onClick={() => setTab('open')}>
                Open
              </button>
            </div>
            <div className="row-actions">
              <button type="button" className="icon-btn" aria-label="Download" tabIndex={-1}>
                <IconDownload />
              </button>
              <button type="button" className="select-btn" tabIndex={-1}>
                Repository: All <IconChevron />
              </button>
              <button type="button" className="select-btn" tabIndex={-1}>
                Author: All <IconChevron />
              </button>
            </div>
          </div>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Review</th>
                <th>PR Status</th>
                <th>Author</th>
                <th>Issues Resolved</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {reviews
                .filter((r) => tab === 'all' || (tab === 'open' ? r.status === 'Open' : r.status === 'Merged'))
                .map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>
                      <span className="bugbot-status">
                        <i className="dot green" /> {row.status}
                      </span>
                    </td>
                    <td>{row.author}</td>
                    <td>{row.issues}</td>
                    <td>{row.date}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="bugbot-page muted">1–1 of 1</div>
        </section>
      ) : null}

      <ConnectionRows onRules={() => void goto('settings-bugbot-rules')} />

      {empty && !enabled ? (
        <section className="acct-block">
          <h2>Organizations</h2>
          <div className="settings-row">
            <div>
              <div className="settings-row-title">{BUGBOT_ORG} (GitHub)</div>
              <p className="muted">0/6 Repositories Enabled</p>
            </div>
            <button type="button" className="btn-solid" onClick={() => void goto('settings-bugbot', 'repos')}>
              Enable
            </button>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-title">gitlab.com (GitLab)</div>
              <p className="muted">0 Repositories Available</p>
            </div>
            <button type="button" className="btn-ghost" tabIndex={-1}>
              Manage <IconExternal />
            </button>
          </div>
        </section>
      ) : (
        <SettingToggles draftPrs={draftPrs} setDraftPrs={setDraftPrs} />
      )}
    </div>
  )
}
