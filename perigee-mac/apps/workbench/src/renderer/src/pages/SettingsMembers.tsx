import { useState } from 'react'
import { IconChart, IconNodes, IconShield, IconUsers } from '../components/Icons'
import { useWorkbench } from '../state'

const FEATURES = [
  { title: 'Team Management', blurb: 'Invite members, manage roles, and control access', Icon: IconUsers },
  { title: 'Usage Analytics', blurb: 'Track team usage and optimize your subscription', Icon: IconChart },
  { title: 'Admin Controls', blurb: 'Centralized billing and privacy mode controls', Icon: IconShield },
  { title: 'Rules & Commands', blurb: 'Share rules and commands across your team', Icon: IconNodes }
]

export function SettingsMembers() {
  const { goto } = useWorkbench()
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="acct-page members-page">
      <h1 className="acct-title">Upgrade to Teams</h1>
      <p className="muted members-lead">Work with your team and unlock collaborative features</p>

      <section className="white-card members-card">
        <div className="members-grid">
          {FEATURES.map((item) => {
            const Icon = item.Icon
            return (
              <div key={item.title} className="members-feat">
                <span className="members-feat-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div>
                  <div className="settings-row-title">{item.title}</div>
                  <p className="muted">{item.blurb}</p>
                </div>
              </div>
            )
          })}
        </div>
        <button type="button" className="btn-solid members-cta" onClick={() => void goto('onboarding-team')}>
          Create team
        </button>
      </section>

      <section className="members-ent">
        <p className="muted">
          Need enterprise features? Get pooled usage, SCIM seat management, and granular admin controls
        </p>
        <button type="button" className="btn-ghost" onClick={() => setNote('Sales stays local (demo). No payment.')}>
          Contact sales
        </button>
      </section>
      {note ? <p className="account-inline-note">{note}</p> : null}
    </div>
  )
}
