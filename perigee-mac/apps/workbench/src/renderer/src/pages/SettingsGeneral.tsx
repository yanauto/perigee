import { useState } from 'react'
import { LOGOUT_CONFIRM } from '../../../shared/grok-cmd'
import { IconBook, IconMonitor } from '../components/Icons'
import { askDanger, cmdText, runGrokCmd } from '../grok-cmd-client'
import { useWorkbench } from '../state'

const SESSIONS0 = [
  { id: '1', title: 'Web', when: 'Created 1 day ago' },
  { id: '2', title: 'Web', when: 'Created about 7 hours ago' }
]

export function SettingsGeneral() {
  const { state, updateProfile, logout, setModal } = useWorkbench()
  const [first, setFirst] = useState(state?.account.firstName || 'alex')
  const [last, setLast] = useState(state?.account.lastName || 'smith')
  const [theme, setTheme] = useState('System')
  const [sessions, setSessions] = useState(SESSIONS0)
  const [saved, setSaved] = useState<string | null>(null)

  return (
    <div className="acct-page">
      <h1 className="acct-title">Settings</h1>

      <section className="acct-block">
        <h2>Privacy</h2>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">
              Share Data <span className="ok-badge">Active</span>
            </div>
            <p className="muted">
              Your codebase, prompts, edits and other usage data will be stored and trained on by Perigee to improve
              the product.
            </p>
            <button type="button" className="account-text">
              Learn More
            </button>
          </div>
          <button type="button" className="btn-ghost" onClick={() => setSaved('Privacy stays local (demo)')}>
            Edit
          </button>
        </div>
      </section>

      <section className="acct-block">
        <h2>Student Verification</h2>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">Student Status</div>
            <p className="muted">Only .edu emails and specific educational domains are eligible for student verification.</p>
          </div>
          <button type="button" className="btn-ghost" disabled>
            <IconBook /> Not eligible
          </button>
        </div>
      </section>

      <section className="acct-block">
        <h2>Profile</h2>
        <label className="acct-field">
          <span>First Name</span>
          <input className="acct-input" value={first} onChange={(e) => setFirst(e.target.value)} />
        </label>
        <label className="acct-field">
          <span>Last Name</span>
          <input className="acct-input" value={last} onChange={(e) => setLast(e.target.value)} />
        </label>
        <div className="row-actions end">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void updateProfile({ firstName: first, lastName: last })
              setSaved('Saved')
            }}
          >
            Save
          </button>
        </div>
      </section>

      <section className="acct-block">
        <h2>Appearance</h2>
        <div className="settings-row">
          <div className="settings-row-title">Theme</div>
          <select className="acct-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option>System</option>
            <option>Light</option>
            <option>Dark</option>
          </select>
        </div>
      </section>

      <section className="acct-block">
        <h2>Active Sessions</h2>
        {sessions.map((s) => (
          <div key={s.id} className="settings-row">
            <div className="session-who">
              <IconMonitor />
              <div>
                <div className="settings-row-title">{s.title}</div>
                <div className="muted">{s.when}</div>
              </div>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setSessions((list) => list.filter((x) => x.id !== s.id))}>
              Revoke
            </button>
          </div>
        ))}
        <p className="muted tiny">Session revocation may take up to 10 minutes to complete.</p>
      </section>

      <section className="acct-block">
        <h2>More</h2>
        <div className="settings-row">
          <div className="settings-row-title">退出 grok.com</div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (!askDanger(LOGOUT_CONFIRM)) return
              void runGrokCmd(['logout'], true).then((r) => setSaved(cmdText(r)))
            }}
          >
            退出 grok.com
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-title">退出本窗演示账号</div>
          <button type="button" className="btn-ghost" onClick={() => void logout()}>
            退出演示账号
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-title">Delete Account</div>
          <button type="button" className="btn-danger" onClick={() => void setModal('deactivate')}>
            Delete
          </button>
        </div>
      </section>
      {saved ? <p className="account-inline-note">{saved}</p> : null}
    </div>
  )
}
