import { useEffect, useState } from 'react'
import { REPO } from '../../../shared/cloud'
import { isFreePlan } from '../account'
import { IconChevron, IconExternal, IconPencil, IconPlus, IconSearch, IconTrash } from '../components/Icons'
import { useWorkbench } from '../state'

export function SettingsCloudAgents() {
  const { state, setPlan, setModal, goto } = useWorkbench()
  const account = state?.account
  const cloud = state?.cloud
  const free = isFreePlan(account?.plan ?? 'pro') || !cloud?.envReady
  const [testing, setTesting] = useState(cloud?.testingOn ?? true)
  const [selfHost, setSelfHost] = useState(cloud?.selfHosted ?? false)
  const [notify, setNotify] = useState(cloud?.slackNotify ?? true)
  const [network, setNetwork] = useState(cloud?.network ?? 'all')
  const [gitOn, setGitOn] = useState(cloud?.gitConnected ?? false)
  const [q, setQ] = useState('')

  useEffect(() => {
    setGitOn(cloud?.gitConnected ?? false)
    setTesting(cloud?.testingOn ?? true)
    setSelfHost(cloud?.selfHosted ?? false)
    setNotify(cloud?.slackNotify ?? true)
    setNetwork(cloud?.network ?? 'all')
  }, [cloud?.envReady, cloud?.gitConnected, cloud?.testingOn, cloud?.selfHosted, cloud?.slackNotify, cloud?.network])

  const secrets = (cloud?.secrets ?? []).filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="acct-page">
      <div>
        <h1 className="acct-title">Cloud Agents</h1>
        <p className="muted">Create Agents to edit and run code, asynchronously</p>
      </div>

      <section className="acct-block">
        <div className="card-head">
          <div>
            <h2>Environments</h2>
            <p className="muted">Cloud agents write better code if their development environment is configured.</p>
          </div>
          {!free ? (
            <button type="button" className="btn-ghost" onClick={() => void setModal('env')}>
              Add Environment
            </button>
          ) : null}
        </div>

        {free ? (
          <div className="git-banner">
            <span>Cloud Agents push code to your remote so you can review and merge their changes.</span>
            <button type="button" className="btn-solid" onClick={() => setGitOn(true)}>
              {gitOn ? 'Git connected (demo)' : 'Connect Git'}
            </button>
          </div>
        ) : (
          <div className="env-card">
            <div className="card-head">
              <div>
                <div className="env-repo">{cloud?.defaultRepo || REPO}</div>
                <span className="ok-badge">PERSONAL</span>
              </div>
              <div className="row-actions">
                <span className="muted">Personal environment active</span>
                <button type="button" className="btn-ghost" onClick={() => void setModal('env')}>
                  Edit
                </button>
                <button type="button" className="btn-ghost">
                  Delete
                </button>
                <button type="button" className="btn-ghost" onClick={() => void setModal('env')}>
                  New environment
                </button>
              </div>
            </div>
            <div className="caps">Snapshot ID</div>
            <div className="mono">{cloud?.snapshotId}</div>
            <div className="caps">Update Script</div>
            <pre className="script-box">{cloud?.updateScript}</pre>
            <div className="settings-row tight">
              <div className="settings-row-title">Enable testing</div>
              <button
                type="button"
                className={testing ? 'toggle is-on' : 'toggle'}
                role="switch"
                aria-checked={testing}
                onClick={() => setTesting((v) => !v)}
              />
            </div>
          </div>
        )}
      </section>

      {free ? (
        <section className="white-card wash upgrade-card">
          <p>Upgrade to unlock Cloud Agents. Upgrade for Cloud Agents, unlimited completions, MAX Mode, and more.</p>
          <button type="button" className="btn-solid" onClick={() => void setPlan('pro')}>
            Upgrade to Pro
          </button>
        </section>
      ) : (
        <>
          <section className="acct-block">
            <h2>Setup Runs</h2>
            <table className="acct-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Snapshot</th>
                  <th>PR</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(cloud?.setupRuns.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No setup runs yet.
                    </td>
                  </tr>
                ) : (
                  cloud?.setupRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="mono">{run.id}…</td>
                      <td>
                        <span className="ok-badge">{run.status}</span>
                      </td>
                      <td className="mono">{run.snapshot}…</td>
                      <td>{run.pr ? <IconExternal /> : '—'}</td>
                      <td>{run.created}</td>
                      <td>
                        <button type="button" className="btn-ghost" onClick={() => void goto('agents-setup')}>
                          Continue
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="acct-block">
            <h2>Self-hosted Agents</h2>
            <p className="muted">Monitor and manage your self-hosted cloud agent workers.</p>
            <div className="settings-row">
              <div>
                <div className="settings-row-title">Allow self-hosted agents</div>
                <p className="muted">
                  Enable self-hosted agents for your account. You can route cloud agents through workers you connect from
                  your own machines.
                </p>
              </div>
              <button
                type="button"
                className={selfHost ? 'toggle is-on' : 'toggle'}
                role="switch"
                aria-checked={selfHost}
                onClick={() => setSelfHost((v) => !v)}
              />
            </div>
            {selfHost ? (
              <div className="settings-empty">
                <div>No personal self-hosted agents.</div>
                <div className="muted">Connect a self-hosted agent from your machine to run cloud agents on your own hardware.</div>
              </div>
            ) : null}
          </section>

          <section className="acct-block">
            <div className="card-head">
              <h2>Defaults</h2>
              <button type="button" className="btn-ghost">
                Unlink Slack
              </button>
            </div>
            <label className="acct-field">
              <span>
                Default Model
                <div className="tiny muted">Used when no model is specified</div>
              </span>
              <button type="button" className="select-btn">
                {cloud?.defaultModel || 'Select model'} <IconChevron />
              </button>
            </label>
            <label className="acct-field">
              <span>
                Default Repository
                <div className="tiny muted">Used when no repository is specified</div>
              </span>
              <button type="button" className="select-btn">
                {cloud?.defaultRepo || REPO} <IconChevron />
              </button>
            </label>
            <label className="acct-field">
              <span>
                Base Branch
                <div className="tiny muted">When empty, Cloud Agent will use a repository&apos;s default branch</div>
              </span>
              <input className="acct-input" placeholder="Branch name..." defaultValue={cloud?.baseBranch} />
            </label>
            <label className="acct-field">
              <span>Branch Prefix</span>
              <input className="acct-input" defaultValue={cloud?.branchPrefix || 'cursor/'} />
            </label>
          </section>

          <section className="acct-block">
            <h2>Notifications</h2>
            <div className="settings-row">
              <div>
                <div className="settings-row-title">Slack Notifications</div>
                <p className="muted">Get notified in Slack when a Cloud Agent completes a task.</p>
              </div>
              <button
                type="button"
                className={notify ? 'toggle is-on' : 'toggle'}
                role="switch"
                aria-checked={notify}
                onClick={() => setNotify((v) => !v)}
              />
            </div>
          </section>

          <section className="acct-block">
            <div className="card-head">
              <div>
                <h2>Repository routing</h2>
                <p className="muted">Routing rules to help the Slack bot pick the right repository.</p>
              </div>
              <button type="button" className="btn-ghost">
                Add Rule
              </button>
            </div>
            {cloud?.routeRule ? (
              <table className="acct-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Repository</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Use this repository for documentation, guides, setup instructions, and general project knowledge.</td>
                    <td className="mono">samleemobbin-dot/docs</td>
                    <td>
                      <button type="button" className="icon-btn" aria-label="Edit">
                        <IconPencil />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Delete">
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="muted">No routing rules.</div>
            )}
          </section>
        </>
      )}

      <section className="acct-block">
        <h2>Security</h2>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">Network Access Settings</div>
            <p className="muted">Control which network destinations your cloud agents can access.</p>
          </div>
          <select className="acct-select" value={network} onChange={(e) => setNetwork(e.target.value as 'all' | 'restricted')}>
            <option value="all">Allow all network access</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
      </section>

      <section className="acct-block">
        <div className="card-head">
          <div>
            <h2>User API Keys</h2>
            <p className="muted">
              User API Keys provide programmatic access to the account, CLI, and API (beta). Treat them like passwords.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={() => void setModal('api-key')}>
            <IconPlus /> New API Key
          </button>
        </div>
        {(cloud?.apiKeys.length ?? 0) === 0 ? (
          <div className="settings-empty">
            <div>No API Keys Yet.</div>
            <div className="muted">No API Keys have been created yet.</div>
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
              {cloud?.apiKeys.map((k) => (
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

      <section className="acct-block">
        <div className="card-head">
          <div>
            <h2>My Secrets{cloud?.secrets.length ? ` (${cloud.secrets.length})` : ''}</h2>
            <p className="muted">Securely set environment variables for your Cloud Agents.</p>
          </div>
          <div className="row-actions">
            <span className="secret-search">
              <IconSearch />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
            </span>
            <button type="button" className="btn-ghost" onClick={() => void setModal('secret')}>
              Add Secrets
            </button>
          </div>
        </div>
        {secrets.length === 0 ? (
          <div className="settings-empty">No secrets yet.</div>
        ) : (
          <table className="acct-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Repositories</th>
                <th>Type</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {secrets.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.name}</td>
                  <td>{s.repos}</td>
                  <td>{s.type}</td>
                  <td>
                    <button type="button" className="icon-btn" aria-label="Scope" onClick={() => void setModal('secret-scope')}>
                      <IconPencil />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
