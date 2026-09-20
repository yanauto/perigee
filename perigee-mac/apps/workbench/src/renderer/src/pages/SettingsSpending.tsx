import { useState } from 'react'
import { isFreePlan, planLabel } from '../account'
import { useWorkbench } from '../state'

export function SettingsSpending() {
  const { state, setModal, setSpendLimit } = useWorkbench()
  const free = isFreePlan(state?.account.plan ?? 'pro')
  const limit = state?.account.spendLimit
  const [mode, setMode] = useState(limit == null ? 'Unlimited' : 'Fixed')
  const [draft, setDraft] = useState(String(limit ?? 5))
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="acct-page">
      <div className="plan-row two">
        <article className="white-card">
          <div className="caps">CURRENT PLAN</div>
          <div className="card-kicker">
            {planLabel(state?.account.plan ?? 'pro')} {free ? '' : '$20/mo'}
          </div>
          <p className="muted">{free ? 'No paid plan yet.' : 'Resets on Apr 24 (29 days)'}</p>
          <button type="button" className="btn-ghost" onClick={() => void setModal('plan')}>
            Adjust plan
          </button>
        </article>
        <article className="white-card wash">
          <div className="caps">UPGRADE AVAILABLE</div>
          <div className="card-kicker">Pro+ $60/mo</div>
          <p className="muted">Unlock 3x more usage on Agent & more</p>
          <button type="button" className="btn-solid" onClick={() => void setModal('plan')}>
            Upgrade
          </button>
        </article>
      </div>

      <section className="white-card">
        <h2>Included in {planLabel(state?.account.plan ?? 'pro')}</h2>
        <div className="bar-label">
          <span>{free ? '0%' : '3%'} usage</span>
        </div>
        <div className="bar">
          <span style={{ width: free ? '0%' : '3%' }} />
        </div>
        <button type="button" className="account-text">
          {free ? '0% Auto and 0% API used' : '0% Auto and 11% API used'}
        </button>
      </section>

      <section className="white-card">
        <div className="settings-row">
          <div className="settings-row-title">On-Demand</div>
          <strong>$0.00 / ${limit ?? '∞'}</strong>
        </div>
        <p className="muted">On-demand usage is consumed after a usage limit is reached, and is billed in arrears.</p>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">Monthly Limit</div>
            <p className="muted">Set a fixed amount or make it unlimited.</p>
          </div>
          <div className="limit-controls">
            <select
              className="acct-select"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value)
                if (e.target.value === 'Unlimited') void setSpendLimit(null)
              }}
            >
              <option>Fixed</option>
              <option>Unlimited</option>
            </select>
            {mode === 'Fixed' ? (
              <input className="acct-input slim" value={draft} onChange={(e) => setDraft(e.target.value)} />
            ) : null}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (mode === 'Unlimited') void setSpendLimit(null)
                else void setSpendLimit(Number(draft) || 5)
                setNote('Saved (demo)')
              }}
            >
              Save
            </button>
          </div>
        </div>
      </section>
      {note ? <p className="account-inline-note">{note}</p> : null}
    </div>
  )
}
