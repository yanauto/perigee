import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppState, PageId } from '../../../shared/types'
import { accountNavId, isBugbotPage, isPluginPage } from '../../../shared/pages'
import { displayInitial, displayName, planLabel } from '../account'
import { BugbotBanner } from '../pages/SettingsBugbot'
import { LOGOUT_CONFIRM } from '../../../shared/grok-cmd'
import { askDanger, cmdText, runGrokCmd } from '../grok-cmd-client'
import { useWorkbench } from '../state'
import { BugbotModals, BugbotToast } from './BugbotModals'
import { CloudModals } from './CloudModals'
import { DeactivateModal } from './DeactivateModal'
import { IconChevron, IconChevronLeft, IconDots, IconHome, IconKey, IconPuzzle } from './Icons'
import { PlanModal } from './PlanModal'

const NAV: { id: PageId; label: string; icon: typeof IconHome }[] = [
  { id: 'settings-general', label: 'Settings', icon: IconKey },
  { id: 'settings-plugins', label: 'Plugins', icon: IconPuzzle }
]

export function AccountShell({ state, children }: { state: AppState; children: ReactNode }) {
  const { goto, logout } = useWorkbench()
  const [menu, setMenu] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = accountNavId(state.page)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toast = (text: string) => {
    setFlash(text)
    window.setTimeout(() => setFlash(null), 1800)
  }

  return (
    <div className="account">
      <header className="account-top">
        <button type="button" className="account-back" onClick={() => void goto('agents-home')}>
          <IconChevronLeft />
          Back to Agents
        </button>
      </header>
      <div className="account-body">
        <aside className="account-side">
          <div className="account-who" ref={menuRef}>
            <div className="avatar">{displayInitial(state.account)}</div>
            <div className="who">
              <div className="who-name">{displayName(state.account)}</div>
              <div className="who-plan">{planLabel(state.account.plan)}</div>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Account menu"
              onClick={() => setMenu((v) => !v)}
            >
              <IconDots />
            </button>
            {menu ? (
              <div className="account-menu">
                <button type="button" className="account-menu-row" onClick={() => toast('Theme stays System (demo)')}>
                  <span>Appearance</span>
                  <span className="muted">
                    System <IconChevron />
                  </span>
                </button>
                <button type="button" className="account-menu-row" onClick={() => toast('Docs stay local (demo)')}>
                  Cursor Docs
                </button>
                <button type="button" className="account-menu-row" onClick={() => toast('Contact stays local (demo)')}>
                  Contact Us
                </button>
                <button
                  type="button"
                  className="account-menu-row"
                  onClick={() => {
                    setMenu(false)
                    if (!askDanger(LOGOUT_CONFIRM)) return
                    void runGrokCmd(['logout'], true).then((r) => toast(cmdText(r)))
                  }}
                >
                  退出 grok.com
                </button>
                <button
                  type="button"
                  className="account-menu-row"
                  onClick={() => {
                    setMenu(false)
                    void logout()
                  }}
                >
                  退出本窗演示账号
                </button>
              </div>
            ) : null}
          </div>
          <nav className="account-nav">
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  className={current === item.id ? 'nav-item is-on' : 'nav-item'}
                  onClick={() => void goto(item.id)}
                >
                  <Icon />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>
        <main className="account-main">
          {isBugbotPage(state.page) ? <BugbotBanner /> : null}
          {children}
        </main>
      </div>
      {state.modal === 'plan' ? <PlanModal /> : null}
      {state.modal === 'deactivate' ? <DeactivateModal /> : null}
      <CloudModals />
      <BugbotModals />
      {isBugbotPage(state.page) ? <BugbotToast /> : null}
      {isPluginPage(state.page) && state.plugins.toast ? (
        <div className="account-toast">{state.plugins.toast}</div>
      ) : null}
      {flash ? <div className="account-toast">{flash}</div> : null}
    </div>
  )
}
