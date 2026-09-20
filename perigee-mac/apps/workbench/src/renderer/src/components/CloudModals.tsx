import { useState } from 'react'
import { DEMO_KEY_ONCE, REPO, SNAPSHOT_ID, UPDATE_SCRIPT } from '../../../shared/cloud'
import { useWorkbench } from '../state'
import { IconX } from './Icons'

export function CloudModals() {
  const { state } = useWorkbench()
  if (!state) return null
  if (state.modal === 'env') return <EnvModal />
  if (state.modal === 'api-key') return <ApiKeyModal />
  if (state.modal === 'secret') return <SecretModal />
  if (state.modal === 'secret-scope') return <SecretScopeModal />
  return null
}

function EnvModal() {
  const { state, setModal } = useWorkbench()
  const cloud = state?.cloud
  const [testing, setTesting] = useState(cloud?.testingOn ?? true)

  return (
    <div className="modal-back" onClick={() => void setModal(null)}>
      <div className="cloud-modal" role="dialog" aria-label="Edit personal environment" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-x" aria-label="Close" onClick={() => void setModal(null)}>
          <IconX />
        </button>
        <h2>Edit personal environment</h2>
        <p className="muted">{cloud?.defaultRepo || REPO}</p>
        <label className="acct-field col">
          <span>Snapshot</span>
          <input className="acct-input wide" readOnly value={cloud?.snapshotId || SNAPSHOT_ID} />
        </label>
        <div className="acct-field col">
          <span>Update Script</span>
          <pre className="script-box">{cloud?.updateScript || UPDATE_SCRIPT}</pre>
        </div>
        <div className="settings-row tight">
          <div>
            <div className="settings-row-title">Enable testing</div>
            <p className="muted">Allow cloud agents to use computer-use testing for this repo.</p>
          </div>
          <button
            type="button"
            className={testing ? 'toggle is-on' : 'toggle'}
            role="switch"
            aria-checked={testing}
            onClick={() => setTesting((v) => !v)}
          />
        </div>
        <div className="deact-actions">
          <button type="button" className="btn-ghost" onClick={() => void setModal(null)}>
            Cancel
          </button>
          <button type="button" className="btn-solid" onClick={() => void setModal(null)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function ApiKeyModal() {
  const { state, setModal } = useWorkbench()
  const key = state?.cloud.revealedKey || DEMO_KEY_ONCE
  const [copied, setCopied] = useState(false)

  return (
    <div className="modal-back" onClick={() => void setModal(null)}>
      <div className="cloud-modal slim" role="dialog" aria-label="User API Key Created" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-x" aria-label="Close" onClick={() => void setModal(null)}>
          <IconX />
        </button>
        <h2>User API Key Created</h2>
        <p className="muted">Your new User API Key has been created. Copy this key now as it won&apos;t be shown again.</p>
        <div className="key-once">
          <code>{key}</code>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(key)
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="tiny muted">
          Demo key only. Shown once here. Not a live credential.
        </p>
        <div className="deact-actions">
          <button type="button" className="btn-solid" onClick={() => void setModal(null)}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function SecretModal() {
  const { setModal } = useWorkbench()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')

  return (
    <div className="modal-back" onClick={() => void setModal(null)}>
      <div className="cloud-modal" role="dialog" aria-label="Add Secrets" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-x" aria-label="Close" onClick={() => void setModal(null)}>
          <IconX />
        </button>
        <h2>Add Secrets</h2>
        <p className="muted">Paste your .env or type a secret name (optional)</p>
        <label className="acct-field col">
          <span>Name</span>
          <input className="acct-input wide" value={name} onChange={(e) => setName(e.target.value)} placeholder="SECRET_NAME" />
        </label>
        <label className="acct-field col">
          <span>Value</span>
          <input className="acct-input wide" value={value} onChange={(e) => setValue(e.target.value)} placeholder="stays local (demo)" />
        </label>
        <label className="acct-field">
          <span>Apply to</span>
          <select className="acct-select" defaultValue="all">
            <option value="all">All Repositories</option>
            <option value="one">{REPO}</option>
          </select>
        </label>
        <div className="deact-actions">
          <button type="button" className="btn-ghost" onClick={() => void setModal(null)}>
            Cancel
          </button>
          <button type="button" className="btn-solid" disabled={!name.trim()} onClick={() => void setModal(null)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function SecretScopeModal() {
  const { setModal } = useWorkbench()
  const [scope, setScope] = useState('all')

  return (
    <div className="modal-back" onClick={() => void setModal(null)}>
      <div className="cloud-modal slim" role="dialog" aria-label="Secret repository scope" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-x" aria-label="Close" onClick={() => void setModal(null)}>
          <IconX />
        </button>
        <h2>Repository scope</h2>
        <p className="muted">Choose which repositories can read this secret.</p>
        <label className="scope-row">
          <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} />
          All Repositories
        </label>
        <label className="scope-row">
          <input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} />
          {REPO}
        </label>
        <div className="deact-actions">
          <button type="button" className="btn-ghost" onClick={() => void setModal(null)}>
            Cancel
          </button>
          <button type="button" className="btn-solid" onClick={() => void setModal(null)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
