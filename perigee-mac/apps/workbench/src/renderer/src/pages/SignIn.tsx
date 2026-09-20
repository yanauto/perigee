import { useState, type FormEvent } from 'react'
import { AuthShell, AuthSocial, AuthTitle } from '../components/AuthShell'
import { useWorkbench } from '../state'

export function SignIn() {
  const { goto, requestCode } = useWorkbench()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const go = async (value: string) => {
    setHint(null)
    setBusy(true)
    try {
      await requestCode({ email: value })
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
    <AuthShell footer="Terms of Service and Privacy Policy">
      <AuthTitle />
      <AuthSocial onPick={(value) => void go(value)} />
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="auth-label" htmlFor="sign-in-email">
          Email
        </label>
        <input
          id="sign-in-email"
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
        Don&apos;t have an account?{' '}
        <button type="button" className="auth-text-btn" onClick={() => void goto('sign-up')}>
          Sign up
        </button>
      </p>
    </AuthShell>
  )
}
