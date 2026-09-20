import { useState } from 'react'
import { BUGBOT_ORG, REPO_NAMES } from '../../../shared/bugbot'
import { useWorkbench } from '../state'
import { IconCheck, IconX } from './Icons'

export function BugbotModals() {
  const { state } = useWorkbench()
  if (!state) return null
  if (state.modal === 'bugbot-rule') {
    const draft = state.bugbot.draft
    return <AddRuleModal key={`${draft.id}-${draft.name}-${draft.content.length}`} />
  }
  return null
}

export function BugbotToast() {
  const { state, goto } = useWorkbench()
  const toast = state?.bugbot.toast
  if (!toast) return null
  const ok = toast.startsWith('Manual')
  return (
    <div className="auto-toast" role="status">
      <span className={ok ? 'auto-toast-ok' : 'bugbot-toast-info'}>{ok ? <IconCheck size={10} /> : 'i'}</span>
      <span>{toast}</span>
      <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => void goto('settings-bugbot-rules')}>
        <IconX size={12} />
      </button>
    </div>
  )
}

function AddRuleModal() {
  const { state, setModal, goto } = useWorkbench()
  const seed = state?.bugbot.draft
  const [on, setOn] = useState(seed?.enabled !== false)
  const [org] = useState(seed?.org || BUGBOT_ORG)
  const [repo, setRepo] = useState(seed?.repo || '')
  const [name, setName] = useState(seed?.name || '')
  const [content, setContent] = useState(seed?.content || '')
  const [path, setPath] = useState('src/components/**')
  const chars = content.length
  const can = name.trim().length > 0 && content.trim().length > 0 && repo.length > 0

  return (
    <div className="modal-back" onClick={() => void setModal(null)}>
      <div className="cloud-modal" role="dialog" aria-label="Add Manual Rule" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-x" aria-label="Close" onClick={() => void setModal(null)}>
          <IconX />
        </button>
        <h2>Add Manual Rule</h2>
        <div className="bugbot-enabled-row">
          <span>Enabled</span>
          <button
            type="button"
            className={on ? 'toggle is-on' : 'toggle'}
            role="switch"
            aria-checked={on}
            onClick={() => setOn((v) => !v)}
          />
        </div>
        <label className="acct-field col">
          <span>Organization</span>
          <select className="acct-select" value={org} disabled>
            <option>{org}</option>
          </select>
        </label>
        <label className="acct-field col">
          <span>Repository</span>
          <select className="acct-select" value={repo} onChange={(e) => setRepo(e.target.value)}>
            <option value="">Select</option>
            {REPO_NAMES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="acct-field col">
          <span>Name</span>
          <input
            className="acct-input wide"
            placeholder="Rule name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="acct-field col">
          <span>
            Content <em className="bugbot-count">{chars} / 1000</em>
          </span>
          <p className="muted">Maximum 1000 characters (leading and trailing spaces are removed when you save).</p>
          <textarea
            className="bugbot-textarea"
            rows={7}
            maxLength={1000}
            placeholder="Rule content..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
        <div className="acct-field col">
          <span>Scoped Paths (optional)</span>
          <p className="muted">Limit this rule to specific files or directories. Leave empty to apply repo-wide.</p>
          <div className="bugbot-path-row">
            <input className="acct-input wide" value={path} onChange={(e) => setPath(e.target.value)} />
            <button type="button" className="btn-ghost" tabIndex={-1}>
              Add
            </button>
          </div>
        </div>
        <div className="deact-actions">
          <button type="button" className="btn-solid" disabled={!can} onClick={() => void goto('settings-bugbot-rules', 'save')}>
            Add Rule
          </button>
        </div>
      </div>
    </div>
  )
}
