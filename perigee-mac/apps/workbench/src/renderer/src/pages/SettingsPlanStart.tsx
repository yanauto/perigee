import { IconMark } from '../components/Icons'
import { useWorkbench } from '../state'

export function SettingsPlanStart() {
  const { state, goto, setPlan } = useWorkbench()
  const email = state?.account.email || state?.pendingEmail || 'you@local.test'

  return (
    <div className="onboard plan-start">
      <div className="onboard-drag" />
      <div className="onboard-center">
        <div className="onboard-mark" aria-hidden="true">
          <IconMark size={28} />
        </div>
        <h1>Start your Pro plan to continue</h1>
        <p className="onboard-lead">Begin using Perigee with the Pro plan. You can cancel at any time.</p>
        <button
          type="button"
          className="onboard-dl"
          onClick={() =>
            void setPlan('pro').then(() => goto('agents-home'))
          }
        >
          Continue
        </button>
        <button type="button" className="onboard-later" onClick={() => void goto('agents-home')}>
          Skip for now
        </button>
        <p className="onboard-who">
          You&apos;re logged in as {email}
          <button type="button" className="account-text" onClick={() => void goto('settings-plan')}>
            Learn more about our plans
          </button>
        </p>
      </div>
    </div>
  )
}
