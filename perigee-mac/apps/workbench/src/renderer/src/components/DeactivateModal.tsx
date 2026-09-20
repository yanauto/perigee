import { useState } from 'react'
import { useWorkbench } from '../state'
import { IconX } from './Icons'

export function DeactivateModal() {
  const { setModal, deactivate } = useWorkbench()
  const [text, setText] = useState('')
  const ready = text === 'Delete'

  return (
    <div className="modal-back" onClick={() => void setModal(null)}>
      <div className="deact-modal" role="dialog" aria-label="Delete Account" onClick={(e) => e.stopPropagation()}>
        <header className="deact-head">
          <h2>Delete Account</h2>
          <button type="button" className="modal-x" aria-label="Close" onClick={() => void setModal(null)}>
            <IconX />
          </button>
        </header>
        <p>Are you sure you want to delete your account? This action is irreversible.</p>
        <input
          className="acct-input"
          placeholder="Type 'Delete' to confirm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="deact-actions">
          <button type="button" className="btn-ghost" onClick={() => void setModal(null)}>
            Cancel
          </button>
          <button type="button" className="btn-danger" disabled={!ready} onClick={() => void deactivate()}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
