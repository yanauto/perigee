import { useState } from 'react'
import type { PageId } from '../../../shared/pages'
import { FAVICON_PROMPT, REPO, SETUP_PROMPT, UPDATE_SCRIPT } from '../../../shared/cloud'
import type { AgentTab, AppState } from '../../../shared/types'
import { Composer } from '../components/Composer'
import {
  IconBranch,
  IconCheck,
  IconDots,
  IconLock,
  IconMonitor,
  IconPlay,
  IconSliders,
  IconTerm,
  IconX
} from '../components/Icons'
import { useWorkbench } from '../state'

const TEMPLATES = [
  { title: 'Find PR bugs', blurb: 'Scan your recent PRs for bugs' },
  { title: 'Write testing skill', blurb: 'Create skill for Cloud agents' },
  { title: 'Fix flaky CI', blurb: 'Triage and fix flaky tests' },
  { title: 'Scan dependencies', blurb: 'Find outdated dependencies' }
]

function tabPage(tab: AgentTab, phase: AppState['setupPhase']): PageId {
  if (tab === 'secrets') return 'agent-secrets'
  if (tab === 'git') return 'review-diff'
  if (tab === 'desktop') return 'agent-desktop'
  if (tab === 'terminal') return 'agent-terminal'
  return phase === 'done' ? 'agents-setup-done' : 'agents-setup'
}

function Paradigm({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? 'para para-sm' : 'para'}>
      <div className="para-left">
        <div className="para-kicker">A FREE RESPONSIVE SITE TEMPLATE</div>
        <div className="para-title">Paradigm Shift</div>
        <div className="para-by">DESIGNED BY @AJLKN / HTML5 UP</div>
      </div>
      <div className="para-right" />
    </div>
  )
}

function DesktopPreview({ full, controlling, onToggle, onExpand, onClose }: {
  full?: boolean
  controlling: boolean
  onToggle: () => void
  onExpand?: () => void
  onClose?: () => void
}) {
  return (
    <div className={full ? 'desk desk-full' : 'desk'}>
      <div className="desk-chrome">
        <span className="desk-url">localhost:3000</span>
        {full ? (
          <button type="button" className="btn-ghost pill-ctrl" onClick={onClose}>
            Release control
          </button>
        ) : null}
      </div>
      <div className="desk-scene">
        <Paradigm />
        <button type="button" className="pill-ctrl take" onClick={onToggle}>
          {controlling || full ? 'Release control' : 'Take control'}
        </button>
        <div className="desk-dock">
          <span className="dock-dot" />
          <span />
          <span />
        </div>
      </div>
      {onExpand && !full ? (
        <button type="button" className="desk-expand" onClick={onExpand}>
          Expand
        </button>
      ) : null}
    </div>
  )
}

function SetupPane({ state }: { state: AppState }) {
  const { goto } = useWorkbench()
  const phase = state.setupPhase
  const [notify, setNotify] = useState(false)
  const [slack, setSlack] = useState(false)

  return (
    <div className="side-scroll">
      {phase === 'running' ? (
        <>
          <h3>Agent is setting things up.</h3>
          <p className="muted">This run prepares a reusable development environment.</p>
        </>
      ) : phase === 'savable' ? (
        <>
          <h3>Setup is ready to save.</h3>
          <p className="muted">The agent has finished preparing the environment. Save it now so future agents can reuse it.</p>
        </>
      ) : (
        <>
          <h3>Setup is done</h3>
          <p className="muted">Review the saved snapshot below.</p>
        </>
      )}

      <ol className="setup-steps">
        <li className={phase === 'running' && !notify ? 'is-now' : ''}>
          <span className={notify || phase === 'done' ? 'step-ok' : 'step-dot'}>
            {notify || phase === 'done' ? <IconCheck /> : null}
          </span>
          <div>
            <div>Get notified when finished</div>
            {phase === 'running' && !notify ? (
              <button type="button" className="btn-ghost" onClick={() => setNotify(true)}>
                Turn On Notifications
              </button>
            ) : null}
          </div>
        </li>
        <li>
          <span className={slack || phase === 'done' ? 'step-ok' : 'step-dot'}>
            {slack || phase === 'done' ? <IconCheck /> : null}
          </span>
          <div>
            <div>Connect to Slack</div>
            {phase !== 'done' && !slack ? (
              <button type="button" className="btn-ghost" onClick={() => setSlack(true)}>
                Connect
              </button>
            ) : null}
          </div>
        </li>
        <li>
          <span className={phase !== 'running' ? 'step-ok' : 'step-dot'}>
            {phase !== 'running' ? <IconCheck /> : null}
          </span>
          <div>Setting up environment</div>
        </li>
        <li className={phase === 'savable' ? 'is-now' : ''}>
          <span className={phase === 'done' ? 'step-ok' : 'step-dot'}>
            {phase === 'done' ? <IconCheck /> : null}
          </span>
          <div>
            <div>Save environment</div>
            {phase === 'savable' ? (
              <>
                <div className="caps">Update Script</div>
                <pre className="script-box">{UPDATE_SCRIPT}</pre>
                <div className="row-actions end">
                  <button type="button" className="btn-solid" onClick={() => void goto('agents-setup-done')}>
                    Save
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </li>
        <li>
          <span className="step-dot" />
          <div>
            <div>Start your first agent</div>
            {phase === 'done' ? (
              <div className="tpl-grid">
                <button type="button" className="btn-solid" onClick={() => void goto('agent-task')}>
                  Start new agent
                </button>
                {TEMPLATES.map((t) => (
                  <button key={t.title} type="button" className="tpl-card" onClick={() => void goto('agent-task')}>
                    <strong>{t.title}</strong>
                    <span className="muted">{t.blurb}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </li>
      </ol>

      {phase === 'running' ? (
        <button type="button" className="btn-ghost" onClick={() => void goto('agents-setup', 'save')}>
          Mark environment ready
        </button>
      ) : null}

      <div className="learn-card">
        <div>Learn about Cloud Agents</div>
        <button type="button" className="btn-ghost">
          Read docs
        </button>
      </div>
    </div>
  )
}

function SecretsPane({ state }: { state: AppState }) {
  const { setModal } = useWorkbench()
  const secrets = state.cloud.secrets
  return (
    <div className="side-scroll">
      <div className="card-head">
        <h3>Secrets</h3>
        <button type="button" className="btn-ghost" onClick={() => void setModal('secret')}>
          Add
        </button>
      </div>
      {secrets.length === 0 ? (
        <div className="settings-empty">No secrets yet.</div>
      ) : (
        <ul className="secret-list">
          {secrets.map((s) => (
            <li key={s.id}>
              <code>{s.name}</code>
              <span className="muted">{s.repos}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function GitPane({ kind }: { kind: AppState['taskKind'] }) {
  const setup = kind === 'setup'
  return (
    <div className="side-scroll">
      <div className="git-head">
        <div>
          <div className="chat-title">
            {setup ? 'Add development environment setup (AGENTS.md) #8' : 'Add AS_MOB logo as site favicon #10'}
          </div>
          <div className="muted">
            <span className={setup ? 'ok-badge' : 'plan-badge'}>{setup ? 'Open' : 'Draft'}</span>{' '}
            {setup ? 'cursor/development-environment-setup-27f1' : 'cursor/asmobbinwebsite-favicon-integration-bd3a'} → main
          </div>
        </div>
        <button type="button" className="btn-solid">
          {setup ? 'Squash and merge' : 'Mark as ready'}
        </button>
      </div>
      <div className="seg">
        <button type="button" className="is-on">
          Diff
        </button>
        <button type="button">Review</button>
        <button type="button">Commits 2</button>
      </div>
      {setup ? (
        <>
          <article className="diff-file">
            <header>
              .gitignore <span className="diff-plus">+2</span>
            </header>
            <pre className="diff-body">
              <span className="diff-add">+ node_modules/</span>
              <span className="diff-add">+ .DS_Store</span>
            </pre>
          </article>
          <article className="diff-file">
            <header>
              AGENTS.md <span className="diff-plus">+21</span>
            </header>
            <pre className="diff-body">
              <span className="diff-add">+ # Cursor Cloud specific instructions</span>
              <span className="diff-add">+ ## Overview</span>
              <span className="diff-add">+ Use the public/ directory via symlinks.</span>
              <span className="diff-add">+ Run the app with `npm start`.</span>
            </pre>
          </article>
          <article className="diff-file">
            <header>
              package-lock.json <span className="diff-plus">+830</span> <span className="plan-badge">Generated</span>
            </header>
          </article>
        </>
      ) : (
        <>
          <article className="diff-file">
            <header>
              favicon.ico <span className="ok-badge">Added</span>
            </header>
            <div className="fav-preview">AS</div>
          </article>
          <article className="diff-file">
            <header>
              images/favicon-16.png <span className="ok-badge">Added</span> <span className="plan-badge">New</span>
            </header>
          </article>
        </>
      )}
    </div>
  )
}

function TerminalPane() {
  return (
    <div className="term-pane">
      <div className="term-line">
        workspace $ <span className="term-caret" />
      </div>
    </div>
  )
}

function Walkthrough({ caption }: { caption: string }) {
  return (
    <section className="walk">
      <div className="walk-hero">
        <Paradigm />
        <span className="walk-play">
          <IconPlay />
        </span>
      </div>
      <p>{caption}</p>
      <div className="walk-thumbs">
        <Paradigm compact />
        <Paradigm compact />
        <Paradigm compact />
      </div>
    </section>
  )
}

function TaskMid({ state }: { state: AppState }) {
  const { submit, goto, newAgent } = useWorkbench()
  const setup = state.taskKind === 'setup'
  const phase = state.setupPhase
  const session = state.sessions.find((s) => s.id === state.activeSessionId)
  const title = setup ? 'Development environment setup' : 'Website favicon integration'

  return (
    <div className="task-mid">
      <header className="chat-head">
        <div>
          <div className="chat-title">{title}</div>
          <div className="chat-sub">{REPO}</div>
        </div>
        <button type="button" className="icon-btn" aria-label="更多">
          <IconDots />
        </button>
      </header>
      <div className="chat-scroll">
        <div className="chat-col wide">
          <article className="msg msg-user">
            <div className="bubble">
              {setup ? SETUP_PROMPT : FAVICON_PROMPT}
              {!setup ? <span className="fav-chip">AS</span> : null}
            </div>
          </article>

          {setup && phase === 'running' ? (
            <>
              <div className="muted">Searched files · CLAUDE.md · AGENTS.md · .cursor/environment.json</div>
              <div className="status-card">Setup scripts discovery · Worked for 17s</div>
            </>
          ) : null}

          {setup && phase === 'savable' ? (
            <>
              <p>Created `public/` directory with symlinks so the static server can see the landing page assets.</p>
              <table className="acct-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Command</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Express.js static server</td>
                    <td className="mono">npm start</td>
                    <td>
                      <span className="ok-badge">Running on http://localhost:3000</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <ul className="check-list">
                <li>
                  <IconCheck /> npm install · 68 packages installed
                </li>
                <li>
                  <IconCheck /> npm start · server running on port 3000
                </li>
                <li>
                  <IconCheck /> curl http://localhost:3000/assets/css/main.css
                </li>
                <li>
                  <IconCheck /> Manual browser test
                </li>
              </ul>
              <div className="muted">Worked for 37s</div>
              <details className="files-box" open>
                <summary>Files changed</summary>
                <div>.gitignore +2</div>
                <div>AGENTS.md +21</div>
                <div>package-lock.json +830</div>
              </details>
            </>
          ) : null}

          {!setup || phase === 'done' ? (
            <>
              <div className="ready-line">Environment ready</div>
              <div className="muted">{setup ? 'Worked for 16m 44s' : 'Worked for 18m 6s'}</div>
              {setup && phase === 'done' ? (
                <div className="saved-bar">
                  <span>This environment is saved. New agents start from the current snapshot.</span>
                  <div className="row-actions">
                    <button type="button" className="btn-ghost" onClick={() => void goto('review-diff')}>
                      Review
                    </button>
                    <button type="button" className="btn-solid" onClick={() => void newAgent()}>
                      Start new agent
                    </button>
                  </div>
                </div>
              ) : null}
              <Walkthrough
                caption={
                  setup
                    ? 'Landing page with scrolling, gallery modal interaction, and contact form section all working.'
                    : 'AS_MOB favicon now renders in the browser tab after a hard refresh.'
                }
              />
              {setup ? (
                <>
                  <p>Added `AGENTS.md` documenting the `public/` symlink workaround, how to run the app, and noting no lint/test/build tooling exists.</p>
                  <p>Node.js dependencies via `npm install` (Express.js ^4.18.2 + 67 transitive packages).</p>
                </>
              ) : (
                <>
                  <p>Added AS_MOB favicon assets (favicon.ico, PNG sizes, and SVG) and updated index.html.</p>
                  <p>Updated server.js so /favicon.ico serves the real icon file.</p>
                </>
              )}
            </>
          ) : null}

          {session?.messages.map((m) => (
            <article key={m.id} className={`msg msg-${m.role}`}>
              {m.role === 'user' ? <div className="bubble">{m.text}</div> : <div className="prose">{m.text}</div>}
            </article>
          ))}
        </div>
      </div>
      <div className="chat-dock">
        <Composer
          variant="dock"
          placeholder={setup ? 'Add follow up for setup agent' : 'Add a follow up'}
          onSubmit={submit}
        />
      </div>
    </div>
  )
}

export function AgentWorkspace({ state }: { state: AppState }) {
  const { goto } = useWorkbench()
  const setup = state.taskKind === 'setup'
  const tabs: { id: AgentTab; label: string; icon: typeof IconSliders }[] = setup
    ? [
        { id: 'setup', label: 'Setup', icon: IconSliders },
        { id: 'secrets', label: 'Secrets', icon: IconLock },
        { id: 'git', label: 'Git', icon: IconBranch },
        { id: 'desktop', label: 'Desktop', icon: IconMonitor },
        { id: 'terminal', label: 'Terminal', icon: IconTerm }
      ]
    : [
        { id: 'git', label: 'Git', icon: IconBranch },
        { id: 'desktop', label: 'Desktop', icon: IconMonitor },
        { id: 'terminal', label: 'Terminal', icon: IconTerm }
      ]

  const [controlling, setControlling] = useState(state.desktopFull)

  if (state.desktopFull) {
    return (
      <div className="task-work full">
        <div className="desk-top">
          <nav className="task-tabs">
            {tabs.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  className={state.agentTab === t.id ? 'task-tab is-on' : 'task-tab'}
                  onClick={() => void goto(tabPage(t.id, state.setupPhase))}
                >
                  <Icon /> {t.label}
                </button>
              )
            })}
          </nav>
          <div className="chat-title">Development environment setup</div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => void goto('agent-desktop')}>
            <IconX />
          </button>
        </div>
        <DesktopPreview full controlling onToggle={() => void goto('agent-desktop')} onClose={() => void goto('agent-desktop')} />
      </div>
    )
  }

  return (
    <div className="task-work">
      <TaskMid state={state} />
      <aside className="task-side">
        <div className="task-side-head">
          <nav className="task-tabs">
            {tabs.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  className={state.agentTab === t.id ? 'task-tab is-on' : 'task-tab'}
                  onClick={() => void goto(tabPage(t.id, state.setupPhase))}
                >
                  <Icon /> {t.label}
                </button>
              )
            })}
          </nav>
          <button
            type="button"
            className="icon-btn"
            aria-label="Expand"
            onClick={() => void goto('agent-desktop', 'full')}
          >
            <IconMonitor />
          </button>
        </div>
        {state.agentTab === 'setup' ? <SetupPane state={state} /> : null}
        {state.agentTab === 'secrets' ? <SecretsPane state={state} /> : null}
        {state.agentTab === 'git' ? <GitPane kind={state.taskKind} /> : null}
        {state.agentTab === 'desktop' ? (
          <DesktopPreview
            controlling={controlling}
            onToggle={() => setControlling((v) => !v)}
            onExpand={() => void goto('agent-desktop', 'full')}
          />
        ) : null}
        {state.agentTab === 'terminal' ? <TerminalPane /> : null}
      </aside>
    </div>
  )
}
