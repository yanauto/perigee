import type { ReactNode } from 'react'
import { IconApple, IconGitHub, IconGoogle, IconMark } from './Icons'

type SocialKind = 'google' | 'github' | 'apple'

const SOCIAL: { kind: SocialKind; label: string; email: string }[] = [
  { kind: 'google', label: 'Continue with Google', email: 'google@local' },
  { kind: 'github', label: 'Continue with GitHub', email: 'github@local' },
  { kind: 'apple', label: 'Continue with Apple', email: 'apple@local' }
]

function SocialIcon({ kind }: { kind: SocialKind }) {
  if (kind === 'google') return <IconGoogle />
  if (kind === 'github') return <IconGitHub />
  return <IconApple />
}

export function AuthBrand() {
  return (
    <div className="auth-brand">
      <IconMark size={18} />
      <span>PERIGEE</span>
    </div>
  )
}

export function AuthSocial({ onPick }: { onPick: (email: string) => void }) {
  return (
    <div className="auth-social">
      {SOCIAL.map((item) => (
        <button
          key={item.kind}
          type="button"
          className="auth-btn"
          onClick={() => onPick(item.email)}
        >
          <SocialIcon kind={item.kind} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

export function AuthShell({
  children,
  footer
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="auth">
      <div className="auth-drag" />
      <AuthBrand />
      <div className="auth-center">{children}</div>
      {footer ? <div className="auth-legal">{footer}</div> : null}
    </div>
  )
}

export function AuthTitle() {
  return (
    <header className="auth-head">
      <h1>Welcome to Perigee</h1>
      <p>The new way to build software</p>
    </header>
  )
}
