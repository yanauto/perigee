import { useState } from 'react'
import { INVOICES, isFreePlan, planLabel } from '../account'
import { IconGift } from '../components/Icons'
import { useWorkbench } from '../state'

export function SettingsBilling() {
  const { state, setModal } = useWorkbench()
  const free = isFreePlan(state?.account.plan ?? 'pro')
  const limit = state?.account.spendLimit ?? 5
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="acct-page">
      <h1 className="acct-title">Billing & Invoices</h1>

      {!free ? (
        <div className="annual-banner">
          <span>
            <IconGift /> Switch to annual billing and save 20%
          </span>
          <button type="button" className="btn-ghost" onClick={() => void setModal('plan')}>
            Upgrade Now
          </button>
        </div>
      ) : null}

      {!free ? (
        <section className="white-card">
          <div className="card-head">
            <div>
              <div className="card-kicker">
                {planLabel(state?.account.plan ?? 'pro')} <span className="muted">$20/mo.</span>
              </div>
              <p className="muted">Entry-level plan with access to premium models, unlimited Tab completions, and more.</p>
              <p className="muted">Your subscription will auto renew on April 24, 2026.</p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => void setModal('plan')}>
              Adjust plan
            </button>
          </div>
        </section>
      ) : null}

      {!free ? (
        <section className="white-card">
          <div className="settings-row">
            <div>
              <div className="settings-row-title">Payment</div>
              <p className="muted">Update your payment details</p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setNote('Stripe stays local (demo). No payment.')}>
              Manage in Stripe
            </button>
          </div>
        </section>
      ) : null}

      {!free ? (
        <section className="white-card">
          <div className="card-kicker">Included Usage</div>
          <p className="muted">Mar 24, 2026 - Apr 24, 2026</p>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Tokens</th>
                <th>Usage</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>API</td>
                <td>8.2M</td>
                <td>4.8%</td>
              </tr>
              <tr className="indent">
                <td>gpt-5.3-codex-high</td>
                <td>2.7M</td>
                <td>4.8%</td>
              </tr>
              <tr className="indent">
                <td>claude-4.6-opus-high-thinking</td>
                <td>5.5M</td>
                <td>0.0%</td>
              </tr>
              <tr>
                <td>Auto + Composer</td>
                <td>0</td>
                <td>0.0%</td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="white-card">
        <div className="card-head">
          <div>
            <div className="card-kicker">On-Demand Usage</div>
            <p className="muted">Mar 24, 2026 - Apr 24, 2026</p>
          </div>
          <button type="button" className="btn-ghost" tabIndex={-1}>
            Cycle Starting Mar 24, 2026
          </button>
        </div>
        <div className="big-num">{free ? '$0.00' : `$0.00 / $${Number(limit).toFixed(2)}`}</div>
        {free ? (
          <table className="acct-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Qty</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Subtotal:</td>
                <td />
                <td />
                <td />
                <td>$0.00</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </section>

      <section className="white-card">
        <div className="card-kicker">Invoices</div>
        {free ? (
          <div className="settings-empty">
            <div>No invoices found.</div>
          </div>
        ) : (
          <table className="acct-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {INVOICES.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.item}</td>
                  <td>{row.amount}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {note ? <p className="account-inline-note">{note}</p> : null}
    </div>
  )
}
