import { useMemo, useState } from 'react'
import { isFreePlan, planLabel } from '../account'
import { IconExternal } from '../components/Icons'
import { useWorkbench } from '../state'

const LIMITS = [50, 100, 200, 500] as const

const INTEGS = [
  { id: 'github', name: 'GitHub', blurb: 'Connect GitHub for Cloud Agents, Bugbot and enhanced codebase context.' },
  { id: 'gitlab', name: 'GitLab', blurb: 'Connect GitLab for Cloud Agents, Bugbot and enhanced codebase context.' },
  { id: 'slack', name: 'Slack', blurb: 'Work with Cloud Agents from Slack.' },
  { id: 'linear', name: 'Linear', blurb: 'Connect a Linear workspace to delegate issues to Cloud Agents.' }
]

export function DashboardOverview() {
  const { state, setModal, setSpendLimit, setPlan } = useWorkbench()
  const account = state?.account
  const free = isFreePlan(account?.plan ?? 'pro')
  const limit = account?.spendLimit ?? 5
  const [heat, setHeat] = useState<'All' | 'Tab' | 'Agent'>('All')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(limit == null ? '' : String(limit))
  const [linked, setLinked] = useState<Record<string, boolean>>({ github: !free })
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const cells = useMemo(() => {
    const n = 53 * 7
    const arr = Array.from({ length: n }, () => 0)
    if (!free) arr[n - 1] = 4
    return arr
  }, [free])

  const saveLimit = () => {
    if (draft === '' || draft === 'unlimited') void setSpendLimit(null)
    else void setSpendLimit(Number(draft) || 5)
    setEditing(false)
  }

  return (
    <div className="acct-page">
      <div className={free ? 'plan-row three' : 'plan-row two'}>
        {free ? (
          <article className="white-card">
            <div className="card-kicker">Pro $20/mo.</div>
            <p className="muted">Entry-level plan with premium models and unlimited Tab completions.</p>
            <button
              type="button"
              className={busy === 'pro' ? 'btn-ghost' : 'btn-solid'}
              onClick={() => {
                setBusy('pro')
                void setPlan('pro')
              }}
            >
              {busy === 'pro' ? 'Processing...' : 'Upgrade to Pro'}
            </button>
          </article>
        ) : null}
        {account?.plan !== 'pro+' && account?.plan !== 'ultra' ? (
          <article className="white-card">
            <div className="card-kicker">Pro+ $60/mo.</div>
            <p className="muted">Get 3x more usage than Pro, unlock higher limits on Agent, and more.</p>
            <button type="button" className="btn-solid" onClick={() => void setModal('plan')}>
              Upgrade to Pro+
            </button>
          </article>
        ) : null}
        {account?.plan !== 'ultra' ? (
          <article className="white-card">
            <div className="card-kicker">Ultra $200/mo.</div>
            <p className="muted">Get maximum value with 20x usage limits and early access to advanced features.</p>
            <button type="button" className="btn-solid" onClick={() => void setModal('plan')}>
              Upgrade to Ultra
            </button>
          </article>
        ) : null}
      </div>

      {!free ? (
        <section className="white-card split-card">
          <div>
            <div className="card-kicker">
              {planLabel(account?.plan ?? 'pro')} <span className="plan-badge">Current</span>
              <span className="muted"> $20/mo.</span>
            </div>
            <p className="muted">Entry-level plan with access to premium models, unlimited Tab completions, and more.</p>
            <button type="button" className="btn-ghost" onClick={() => void setModal('plan')}>
              Adjust Plan
            </button>
          </div>
          <div>
            {editing ? (
              <>
                <div className="card-kicker">Set a monthly spend limit for on-demand usage</div>
                <div className="chip-row">
                  {LIMITS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={draft === String(n) ? 'mini-chip is-on' : 'mini-chip'}
                      onClick={() => setDraft(String(n))}
                    >
                      ${n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={draft === 'unlimited' ? 'mini-chip is-on' : 'mini-chip'}
                    onClick={() => setDraft('unlimited')}
                  >
                    Unlimited
                  </button>
                  <input
                    className="acct-input slim"
                    value={draft === 'unlimited' ? '' : draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                </div>
                <div className="row-actions">
                  <button type="button" className="btn-ghost" onClick={saveLimit}>
                    Save
                  </button>
                  <button type="button" className="account-text" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="big-num">${0} / ${limit ?? '∞'}</div>
                <p className="muted">On-Demand Usage this Month</p>
                <div className="bar">
                  <span style={{ width: '0%' }} />
                </div>
                <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
                  Edit Limit
                </button>
              </>
            )}
          </div>
        </section>
      ) : null}

      <section className="white-card">
        <div className="card-head">
          <div>
            <div className="card-kicker">AI Line Edits</div>
            <div className="big-num">{free ? 0 : 853}</div>
          </div>
          <div className="seg">
            {(['All', 'Tab', 'Agent'] as const).map((k) => (
              <button key={k} type="button" className={heat === k ? 'is-on' : ''} onClick={() => setHeat(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="heat-wrap">
          <div className="heat-days">
            <span>M</span>
            <span>W</span>
            <span>F</span>
          </div>
          <div>
            <div className="heat-months">
              {'A M J J A S O N D J F M'.split(' ').map((m, i) => (
                <span key={`${m}-${i}`}>{m}</span>
              ))}
            </div>
            <div className="heat-grid">
              {cells.map((v, i) => (
                <span key={i} className={`heat-cell l${v}`} />
              ))}
            </div>
          </div>
        </div>
        {!free ? (
          <div className="heat-stats">
            <div>
              <span className="muted">Most Active Month</span>
              <strong>March</strong>
            </div>
            <div>
              <span className="muted">Most Active Day</span>
              <strong>Mar 24, 2026</strong>
            </div>
            <div>
              <span className="muted">Longest Streak</span>
              <strong>1d</strong>
            </div>
            <div>
              <span className="muted">Current Streak</span>
              <strong>1d</strong>
            </div>
          </div>
        ) : null}
        <div className="heat-legend">
          <span className="muted">Fewer</span>
          <span className="heat-cell l0" />
          <span className="heat-cell l1" />
          <span className="heat-cell l2" />
          <span className="heat-cell l3" />
          <span className="heat-cell l4" />
          <span className="muted">More</span>
        </div>
      </section>

      <section className="white-card">
        {INTEGS.map((item) => {
          const on = linked[item.id]
          return (
            <div key={item.id} className="integ-row">
              <div>
                <div className="settings-row-title">{item.name}</div>
                <div className="muted">
                  {on && item.id === 'github'
                    ? 'Connected as local-demo to repositories in organizations: local-demo.'
                    : item.blurb}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  if (on && item.id === 'github') {
                    setNote('Manage stays local (demo)')
                    return
                  }
                  setLinked((prev) => ({ ...prev, [item.id]: true }))
                }}
              >
                {on ? (
                  'Manage'
                ) : (
                  <>
                    Connect <IconExternal />
                  </>
                )}
              </button>
            </div>
          )
        })}
      </section>
      {note ? <p className="account-inline-note">{note}</p> : null}
    </div>
  )
}
