import { useState } from 'react'
import { IconMark } from '../components/Icons'
import { useWorkbench } from '../state'

export function OnboardingDownload() {
  const { state, goto } = useWorkbench()
  const email = state?.account.email || state?.pendingEmail || 'you@local.test'
  const [note, setNote] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const pretend = () => {
    setDone(true)
    setNote('Ready (demo). Nothing was saved.')
  }

  return (
    <div className="onboard">
      <div className="onboard-drag" />
      <div className="onboard-center">
        <div className="onboard-mark" aria-hidden="true">
          <IconMark size={28} />
        </div>
        <h1>You&apos;re all set!</h1>
        <p className="onboard-lead">Download Perigee to start building</p>
        <button type="button" className="onboard-dl" onClick={pretend} disabled={done}>
          {done ? 'Downloaded' : 'Download'}
        </button>
        <button type="button" className="onboard-later" onClick={() => void goto('agents-home')}>
          I&apos;ll do this later
        </button>
        {note ? <p className="onboard-note">{note}</p> : null}
      </div>
      <p className="onboard-who">You&apos;re logged in as {email}</p>
    </div>
  )
}
