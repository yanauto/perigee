import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { AuthShell, AuthTitle } from '../components/AuthShell'
import { useWorkbench } from '../state'

const BOXES = 6
const RESEND_SEC = 30

export function VerifyEmail() {
  const { state, goto, verifyCode } = useWorkbench()
  const email = state?.pendingEmail || 'you@local.test'
  const [digits, setDigits] = useState<string[]>(Array.from({ length: BOXES }, () => ''))
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [left, setLeft] = useState(RESEND_SEC)
  const refs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    const t = window.setInterval(() => {
      setLeft((n) => (n > 0 ? n - 1 : 0))
    }, 1000)
    return () => window.clearInterval(t)
  }, [])

  const fill = (next: string[], start = 0) => {
    setDigits(next)
    const joined = next.join('')
    if (joined.length === BOXES) void submit(joined)
    else {
      const idx = next.findIndex((d, i) => i >= start && !d)
      refs.current[idx === -1 ? BOXES - 1 : idx]?.focus()
    }
  }

  const submit = async (code: string) => {
    setHint(null)
    setBusy(true)
    try {
      await verifyCode(code)
    } catch (err) {
      setHint(err instanceof Error ? err.message : String(err))
      setDigits(Array.from({ length: BOXES }, () => ''))
      refs.current[0]?.focus()
    } finally {
      setBusy(false)
    }
  }

  const onChange = (index: number, value: string) => {
    const ch = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = ch
    fill(next, index)
  }

  const onKey = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits]
      next[index - 1] = ''
      setDigits(next)
      refs.current[index - 1]?.focus()
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, BOXES)
    if (!text) return
    e.preventDefault()
    const next = Array.from({ length: BOXES }, (_, i) => text[i] ?? '')
    fill(next)
  }

  const resend = () => {
    if (left > 0) return
    setLeft(RESEND_SEC)
    setHint('Code resent locally. Any 6 digits work.')
  }

  return (
    <AuthShell footer={null}>
      <AuthTitle />
      <p className="auth-instruct">
        Enter the code sent to <strong>{email}</strong>
      </p>
      <div className="auth-code" onPaste={onPaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            className="auth-code-box"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={i === 0}
            maxLength={1}
            value={d}
            disabled={busy}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
          />
        ))}
      </div>
      {hint ? <p className="auth-error">{hint}</p> : null}
      <p className="auth-resend">
        Didn&apos;t receive a code?{' '}
        {left > 0 ? (
          <span>Resend ({left})</span>
        ) : (
          <button type="button" className="auth-text-btn" onClick={resend}>
            Resend now
          </button>
        )}
      </p>
      <button type="button" className="auth-back" onClick={() => void goto('sign-in')}>
        &lt; Back to sign-in
      </button>
    </AuthShell>
  )
}
