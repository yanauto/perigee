import type { ReactNode } from 'react'
import { isAccountPage, isGatePage, isTaskPage, pageById } from '../../shared/pages'
import { CliLedgerProvider, useCliLedger } from './cli-ledger'
import { AccountShell } from './components/AccountShell'
import { CloudModals } from './components/CloudModals'
import { Sidebar } from './components/Sidebar'
import { AgentWorkspace } from './pages/AgentWorkspace'
import { AgentsHome } from './pages/AgentsHome'
import { Automations, AutomationsGallery } from './pages/Automations'
import { AutomationsDetail } from './pages/AutomationsDetail'
import { Chat } from './pages/Chat'
import { DashboardOverview } from './pages/DashboardOverview'
import { EmptyShell } from './pages/EmptyShell'
import { GrokSessionPreview } from './pages/GrokSessionPreview'
import { OnboardingDownload } from './pages/OnboardingDownload'
import { OnboardingTeam } from './pages/OnboardingTeam'
import { SettingsMembers } from './pages/SettingsMembers'
import { SettingsPlanStart } from './pages/SettingsPlanStart'
import { Settings } from './pages/Settings'
import { SettingsBilling } from './pages/SettingsBilling'
import { SettingsBugbot } from './pages/SettingsBugbot'
import { SettingsBugbotRuleEdit, SettingsBugbotRules } from './pages/SettingsBugbotRules'
import { BrowseMcpModal } from './components/PluginModals'
import { SettingsCloudAgents } from './pages/SettingsCloudAgents'
import { SettingsIntegrations } from './pages/SettingsIntegrations'
import { SettingsPlugins, SettingsPluginsDetail } from './pages/SettingsPlugins'
import { SettingsGeneral } from './pages/SettingsGeneral'
import { SettingsSpending } from './pages/SettingsSpending'
import { SettingsUsage } from './pages/SettingsUsage'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'
import { VerifyEmail } from './pages/VerifyEmail'
import { Welcome } from './pages/Welcome'
import { Worktrees } from './pages/Worktrees'
import { WorkbenchProvider, useWorkbench } from './state'

function Stage() {
  const { state } = useWorkbench()
  const { selected } = useCliLedger()
  if (!state) return null
  if (selected) return <GrokSessionPreview row={selected} />

  if (state.page === 'agents-home') return <AgentsHome />
  if (state.page === 'chat') return <Chat state={state} />
  if (state.page === 'settings-models') return <Settings />
  if (state.page === 'welcome') return <Welcome />
  if (state.page === 'sign-in') return <SignIn />
  if (state.page === 'sign-up') return <SignUp />
  if (state.page === 'verify-email') return <VerifyEmail />
  if (state.page === 'onboarding-download') return <OnboardingDownload />
  if (state.page === 'onboarding-team') return <OnboardingTeam />
  if (state.page === 'settings-plan' && !state.modal) return <SettingsPlanStart />
  if (state.page === 'dashboard-overview' || state.page === 'settings-plan') return <DashboardOverview />
  if (state.page === 'settings-members') return <SettingsMembers />
  if (state.page === 'settings-general' || state.page === 'settings-deactivate') return <SettingsGeneral />
  if (state.page === 'settings-usage') return <SettingsUsage />
  if (state.page === 'settings-spending') return <SettingsSpending />
  if (state.page === 'settings-billing') return <SettingsBilling />
  if (state.page === 'settings-cloud-agents') return <SettingsCloudAgents />
  if (state.page === 'settings-bugbot') return <SettingsBugbot />
  if (state.page === 'settings-bugbot-rules') return <SettingsBugbotRules />
  if (state.page === 'settings-bugbot-rule-edit') return <SettingsBugbotRuleEdit />
  if (state.page === 'settings-plugins') return <SettingsPlugins />
  if (state.page === 'settings-plugins-detail') return <SettingsPluginsDetail />
  if (state.page === 'settings-integrations') return <SettingsIntegrations />
  if (state.page === 'automations') return <Automations />
  if (state.page === 'automations-gallery') return <AutomationsGallery />
  if (state.page === 'automations-detail') return <AutomationsDetail />
  if (state.page === 'worktrees') return <Worktrees />
  if (isTaskPage(state.page)) return <AgentWorkspace state={state} />

  const meta = pageById(state.page)
  return <EmptyShell title={meta.title} note="空壳。以后再接。" />
}

function Shell() {
  const { state, error } = useWorkbench()

  if (!state) {
    return (
      <div className="app">
        <aside className="sidebar" />
        <main className="stage">
          <div className="state-msg">{error ?? '加载中…'}</div>
        </main>
      </div>
    )
  }

  if (state.page === 'settings-plan' && !state.modal) {
    return (
      <div className={`app app-gate page-${state.page}`}>
        <Stage />
        {error && <div className="error-bar">{error}</div>}
      </div>
    )
  }

  if (isGatePage(state.page)) {
    return (
      <div className={`app app-gate page-${state.page}`}>
        <Stage />
        {error && <div className="error-bar">{error}</div>}
      </div>
    )
  }

  if (isAccountPage(state.page)) {
    return (
      <div className={`app app-account page-${state.page}`}>
        <AccountShell state={state}>
          <Stage />
        </AccountShell>
        {error && <div className="error-bar">{error}</div>}
      </div>
    )
  }

  if (isTaskPage(state.page) && state.desktopFull) {
    return (
      <div className={`app app-desktop-full page-${state.page}`}>
        <main className="stage">
          <Stage />
          <CloudModals />
          {error && <div className="error-bar">{error}</div>}
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar state={state} />
      <main className="stage">
        <Stage />
        <CloudModals />
        <BrowseMcpModal />
        {error && <div className="error-bar">{error}</div>}
      </main>
    </div>
  )
}

function LedgerGate({ children }: { children: ReactNode }) {
  const { state } = useWorkbench()
  return <CliLedgerProvider workspacePath={state?.workspace.path ?? null}>{children}</CliLedgerProvider>
}

export function App() {
  return (
    <WorkbenchProvider>
      <LedgerGate>
        <Shell />
      </LedgerGate>
    </WorkbenchProvider>
  )
}
