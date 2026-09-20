import { AuthBrand } from '../components/AuthShell'
import { IconDownload } from '../components/Icons'
import { useWorkbench } from '../state'

const NAV = ['Product', 'Enterprise', 'Pricing', 'Resources']

export function Welcome() {
  const { goto } = useWorkbench()

  return (
    <div className="welcome">
      <header className="welcome-bar">
        <AuthBrand />
        <nav className="welcome-nav">
          {NAV.map((label) => (
            <button key={label} type="button" className="welcome-link" tabIndex={-1}>
              {label}
            </button>
          ))}
        </nav>
        <div className="welcome-actions">
          <button type="button" className="welcome-link" onClick={() => void goto('sign-in')}>
            Sign in
          </button>
          <button type="button" className="welcome-ghost" tabIndex={-1}>
            Contact sales
          </button>
          <button type="button" className="welcome-solid" onClick={() => void goto('sign-up')}>
            Download
          </button>
        </div>
      </header>

      <section className="welcome-hero">
        <h1>
          Built to make you extraordinarily productive, Perigee is the best way to code with AI.
        </h1>
        <button type="button" className="welcome-cta" onClick={() => void goto('sign-up')}>
          Download for macOS
          <IconDownload />
        </button>
      </section>

      <section className="welcome-art" aria-hidden="true">
        <div className="welcome-glow" />
        <div className="fake-win">
          <div className="fake-win-bar">
            <span className="fake-dot" />
            <span className="fake-dot" />
            <span className="fake-dot" />
            <span className="fake-win-title">Perigee</span>
          </div>
          <div className="fake-win-body">
            <aside className="fake-side">
              <div className="fake-side-label">Ready</div>
              <div className="fake-row is-on">Build landing page</div>
              <div className="fake-row">Review agent plan</div>
              <div className="fake-row">Check tests</div>
            </aside>
            <div className="fake-chat">
              <div className="fake-bubble">make a landing page for the workspace</div>
              <div className="fake-prose">Drafted the hero, nav, and a three-pane preview.</div>
            </div>
            <div className="fake-preview">
              <div className="fake-url">localhost:3000</div>
              <div className="fake-preview-title">Acme Labs</div>
              <div className="fake-line" />
              <div className="fake-line short" />
              <div className="fake-table">
                <span>Published</span>
                <span>Local preview</span>
              </div>
            </div>
          </div>
          <div className="fake-win-dock">Plan, search, build anything…</div>
        </div>
      </section>
    </div>
  )
}
