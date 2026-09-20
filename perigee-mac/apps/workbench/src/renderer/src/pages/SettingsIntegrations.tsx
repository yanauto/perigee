import { useState } from 'react'
import { INTEG_ROWS } from '../../../shared/plugins'
import { IconChevron, IconExternal, IconGitHub, IconPlus, IconSlack } from '../components/Icons'
import { PluginMark } from '../components/PluginMark'
import { useWorkbench } from '../state'

function Brand({ id }: { id: string }) {
  if (id === 'github') {
    return (
      <span className="plug-mark plug-mark-github">
        <IconGitHub size={16} />
      </span>
    )
  }
  if (id === 'slack') {
    return (
      <span className="plug-mark plug-mark-slack">
        <IconSlack size={15} />
      </span>
    )
  }
  return <PluginMark mark={id === 'gitlab' ? 'gitlab' : id === 'linear' ? 'linear' : 'plus'} />
}

function connected(id: string, cloud: { gitConnected: boolean; slackLinked: boolean; gitlabConnected: boolean; linearLinked: boolean }) {
  if (id === 'github') return cloud.gitConnected
  if (id === 'slack') return cloud.slackLinked
  if (id === 'gitlab') return cloud.gitlabConnected
  return cloud.linearLinked
}

export function SettingsIntegrations() {
  const { state, goto, setModal } = useWorkbench()
  const cloud = state?.cloud
  const keys = cloud?.apiKeys ?? []
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="acct-page">
      <h1 className="acct-title">Integrations</h1>

      <section className="white-card">
        {INTEG_ROWS.map((row) => {
          const on = cloud ? connected(row.id, cloud) : false
          return (
            <div key={row.id} className="integ-row">
              <div className="integ-who">
                <Brand id={row.id} />
                <div>
                  <div className="settings-row-title">{row.name}</div>
                  <div className="muted">{on ? row.connected : row.blurb}</div>
                </div>
              </div>
              {on ? (
                <div className="plug-vis">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setOpen((v) => (v === row.id ? null : row.id))}
                  >
                    Manage <IconChevron />
                  </button>
                  {open === row.id ? (
                    <div className="plug-vis-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(null)
                          setNote(`${row.name} stays connected locally (demo)`)
                        }}
                      >
                        Manage stays local
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(null)
                          void goto('settings-integrations', `disconnect-${row.id}`)
                        }}
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void goto('settings-integrations', row.id)}
                >
                  Connect <IconExternal />
                </button>
              )}
            </div>
          )
        })}
      </section>

      <section className="acct-block">
        <div className="card-head">
          <div>
            <h2>User API Keys</h2>
            <p className="muted">
              User API Keys provide programmatic access to the account. They can be used with the Perigee Agent CLI and
              Cloud Agent API. Treat them like passwords and do not share them. The API is in beta.
            </p>
          </div>
          {keys.length > 0 ? (
            <button type="button" className="btn-ghost" onClick={() => void setModal('api-key')}>
              New User API Key
            </button>
          ) : null}
        </div>
        {keys.length === 0 ? (
          <div className="settings-empty">
            <div>No API Keys Yet</div>
            <div className="muted">No API Keys have been created yet.</div>
            <button type="button" className="btn-ghost" onClick={() => void setModal('api-key')}>
              <IconPlus /> New API Key
            </button>
          </div>
        ) : (
          <table className="acct-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Token</th>
                <th>Scope</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="mono">{k.tokenHint}</td>
                  <td className="muted">{k.scope}</td>
                  <td>{k.created}</td>
                  <td>
                    <button type="button" className="icon-btn" aria-label="Delete">
                      ×
                    </button>
                  </td>
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
