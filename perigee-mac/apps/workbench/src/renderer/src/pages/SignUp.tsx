import { useState, type FormEvent } from 'react'
import { AuthShell, AuthSocial, AuthTitle } from '../components/AuthShell'
import { useWorkbench } from '../state'

export function SignUp() {
  const { goto, requestCode } = useWorkbench()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const go = async (value: string) => {
    setHint(null)
    setBusy(true)
    try {
      await requestCode({ email: value, firstName, lastName })
    } catch (err) {
      setHint(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void go(email)
  }

  return (
    <AuthShell footer="By creating an account, you agree to the Terms of Service and Privacy Policy">
      <AuthTitle />
      <AuthSocial onPick={(value) => void go(value)} />
      <form className="auth-form" onSubmit={onSubmit}>
        <div className="auth-name-row">
          <div>
            <label className="auth-label" htmlFor="sign-up-first">
              First name
            </label>
            <input
              id="sign-up-first"
              className="auth-input"
              autoComplete="given-name"
              placeholder="Your first name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <label className="auth-label" htmlFor="sign-up-last">
              Last name
            </label>
            <input
              id="sign-up-last"
              className="auth-input"
              autoComplete="family-name"
              placeholder="Your last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <label className="auth-label" htmlFor="sign-up-email">
          Email
        </label>
        <input
          id="sign-up-email"
          className="auth-input"
          type="email"
          autoComplete="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="auth-btn auth-primary" disabled={busy}>
          Continue
        </button>
        {hint ? <p className="auth-error">{hint}</p> : null}
      </form>
      <p className="auth-switch">
        Already have an account?{' '}
        <button type="button" className="auth-text-btn" onClick={() => void goto('sign-in')}>
          Sign in
        </button>
      </p>
    </AuthShell>
  )
}
