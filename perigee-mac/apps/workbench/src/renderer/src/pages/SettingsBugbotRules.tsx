import { useState } from 'react'
import { IconSearch, IconSliders } from '../components/Icons'
import { useWorkbench } from '../state'

function RulesEmpty({
  enabled,
  learningOn,
  onEnable,
  onLearn
}: {
  enabled: boolean
  learningOn: boolean
  onEnable: () => void
  onLearn: () => void
}) {
  if (!enabled) {
    return (
      <div className="white-card wash bugbot-empty">
        <div className="bugbot-empty-title">No organizations with Bugbot enabled</div>
        <p className="muted">Enable Bugbot for at least one organization to start using repository rules.</p>
        <button type="button" className="btn-ghost" onClick={onEnable}>
          Enable repositories
        </button>
      </div>
    )
  }
  if (!learningOn) {
    return (
      <div className="white-card wash bugbot-empty">
        <div className="bugbot-empty-title">Enable Learning for this Organization</div>
        <p className="muted">Learning allows Bugbot to automatically create and update rules based on PR activity.</p>
        <button type="button" className="btn-ghost" onClick={onLearn}>
          Enable
        </button>
      </div>
    )
  }
  return (
    <div className="white-card wash bugbot-empty">
      <div className="bugbot-empty-title">No Learned Rules Yet</div>
      <p className="muted">Bugbot will write rules here after it sees enough PR activity.</p>
    </div>
  )
}

export function SettingsBugbotRules() {
  const { state, goto, setModal } = useWorkbench()
  const bugbot = state?.bugbot
  const rules = bugbot?.rules ?? []
  const enabled = bugbot?.enabled === true
  const [tab, setTab] = useState<'enabled' | 'disabled' | 'all'>('enabled')
  const [learningOn, setLearningOn] = useState(bugbot?.learningOn ?? false)

  const shown = rules.filter((r) => {
    if (tab === 'enabled') return r.enabled
    if (tab === 'disabled') return !r.enabled
    return true
  })
  const en = rules.filter((r) => r.enabled).length
  const dis = rules.length - en

  return (
    <div className="acct-page">
      <div>
        <div className="bugbot-kicker">Bugbot</div>
        <h1 className="acct-title">Repository Rules</h1>
        <p className="muted">
          Learned and manually-created rules. Version control Rules with{' '}
          <span className="account-text">Repository Rules</span>.
        </p>
      </div>

      <div className="bugbot-toolbar wrap">
        <div className="seg">
          <button
            type="button"
            className={tab === 'enabled' ? 'seg-btn is-on' : 'seg-btn'}
            onClick={() => setTab('enabled')}
          >
            Enabled {en}
          </button>
          <button
            type="button"
            className={tab === 'disabled' ? 'seg-btn is-on' : 'seg-btn'}
            onClick={() => setTab('disabled')}
          >
            Disabled {dis}
          </button>
          <button type="button" className={tab === 'all' ? 'seg-btn is-on' : 'seg-btn'} onClick={() => setTab('all')}>
            All {rules.length}
          </button>
        </div>
        <div className="row-actions">
          <button type="button" className="icon-btn" aria-label="Search" tabIndex={-1}>
            <IconSearch />
          </button>
          <button type="button" className="icon-btn" aria-label="Filter" tabIndex={-1}>
            <IconSliders />
          </button>
          <button type="button" className="btn-ghost" onClick={() => setLearningOn(true)}>
            Manage Learning
          </button>
          <button type="button" className="btn-ghost" onClick={() => void goto('settings-bugbot-rules', 'gen')}>
            Generate Rules
          </button>
          <button type="button" className="btn-solid" onClick={() => void setModal('bugbot-rule')}>
            Add Rule
          </button>
        </div>
      </div>

      <section>
        <div className="bugbot-block-label">
          Learned Rules <span className="plan-badge">Beta</span>
        </div>
        <RulesEmpty
          enabled={enabled}
          learningOn={learningOn}
          onEnable={() => void goto('settings-bugbot', 'repos')}
          onLearn={() => setLearningOn(true)}
        />
      </section>

      <section>
        <div className="bugbot-block-label">
          Manual Rules <span className="plan-badge">Beta</span>
        </div>
        {shown.length === 0 ? (
          enabled ? (
            <div className="white-card wash bugbot-empty">
              <div className="bugbot-empty-title">No Manual Rules Yet</div>
              <p className="muted">Add manual rules to give Bugbot repository-specific guidance.</p>
            </div>
          ) : (
            <RulesEmpty
              enabled={false}
              learningOn={false}
              onEnable={() => void goto('settings-bugbot', 'repos')}
              onLearn={() => setLearningOn(true)}
            />
          )
        ) : (
          <section className="white-card">
            <table className="acct-table">
              <thead>
                <tr>
                  <th />
                  <th>Title</th>
                  <th>Repository</th>
                  <th>Status</th>
                  <th>Issues Resolved</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <input type="checkbox" readOnly tabIndex={-1} />
                    </td>
                    <td>
                      <button type="button" className="account-text" onClick={() => void goto('settings-bugbot-rule-edit')}>
                        {rule.name}
                      </button>
                    </td>
                    <td>{rule.repo}</td>
                    <td>
                      <span className={rule.enabled ? 'ok-badge' : 'plan-badge'}>
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>0/0</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </section>
    </div>
  )
}

export function SettingsBugbotRuleEdit() {
  const { state, goto } = useWorkbench()
  const seed = state?.bugbot.draft
  const [name, setName] = useState(seed?.name || 'Bugbot Usage')
  const [content, setContent] = useState(seed?.content || '')
  const [on, setOn] = useState(seed?.enabled !== false)
  const [path, setPath] = useState('')
  const [paths, setPaths] = useState(seed?.paths ?? [])
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="acct-page">
      <div className="auto-detail-head">
        <div>
          <div className="bugbot-kicker">
            Bugbot / <button type="button" className="crumb-btn" onClick={() => void goto('settings-bugbot-rules')}>Repository Rules</button>
          </div>
          <h1 className="acct-title">{name || 'Untitled rule'}</h1>
        </div>
        <div className="row-actions">
          <button type="button" className="btn-ghost" onClick={() => setNote('Saved (demo)')}>
            Save
          </button>
          <button type="button" className="btn-danger" onClick={() => void goto('settings-bugbot-rules', 'drop')}>
            Delete
          </button>
        </div>
      </div>

      <div className="bugbot-enabled-row">
        <span className="settings-row-title">Manual Rule</span>
        <span className="muted">{on ? 'Enabled' : 'Disabled'}</span>
        <button
          type="button"
          className={on ? 'toggle is-on' : 'toggle'}
          role="switch"
          aria-checked={on}
          onClick={() => setOn((v) => !v)}
        />
      </div>

      <label className="acct-field col">
        <span>Name</span>
        <input className="acct-input wide" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="acct-field col">
        <span>Rule Content</span>
        <textarea className="bugbot-textarea" rows={10} value={content} onChange={(e) => setContent(e.target.value)} />
      </label>
      <div className="acct-field col">
        <span>Scoped Paths (optional)</span>
        <p className="muted">Limit this rule to specific files or directories. Leave empty to apply repo-wide.</p>
        <div className="bugbot-path-row">
          <input
            className="acct-input wide"
            placeholder="src/components/**"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (!path.trim()) return
              setPaths([...paths, path.trim()])
              setPath('')
            }}
          >
            Add
          </button>
        </div>
        {paths.length ? (
          <div className="bugbot-tags">
            {paths.map((p) => (
              <span key={p} className="auto-chip">
                {p}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {note ? <p className="tiny muted">{note}</p> : null}
    </div>
  )
}
