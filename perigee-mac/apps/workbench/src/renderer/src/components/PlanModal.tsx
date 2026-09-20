import { useState } from 'react'
import { useWorkbench } from '../state'
import { IconX } from './Icons'
import type { PlanId } from '../../../shared/types'

type Card = {
  id: PlanId | 'team'
  name: string
  month: string
  year: string
  blurb: string
  points: string[]
}

const CARDS: Card[] = [
  {
    id: 'pro',
    name: 'Pro',
    month: '$20 /mo.',
    year: '$16 /mo.',
    blurb: 'Entry-level plan with access to premium models, unlimited Tab completions, and more.',
    points: ['Extended limits on Agent', 'Unlimited Tab completions', 'Background Agents', 'Maximum context windows']
  },
  {
    id: 'pro+',
    name: 'Pro+',
    month: '$60 /mo.',
    year: '$48 /mo.',
    blurb: 'Get 3x more usage than Pro and unlock higher limits on Agent and premium models.',
    points: [
      'Everything in Pro',
      '3x usage on OpenAI, Claude, and Gemini models',
      'Higher Agent limits',
      'Priority access to premium capacity'
    ]
  },
  {
    id: 'ultra',
    name: 'Ultra',
    month: '$200 /mo.',
    year: '$160 /mo.',
    blurb: 'Get maximum value with 20x usage limits and early access to advanced features.',
    points: [
      'Everything in Pro+',
      '20x usage on OpenAI, Claude, and Gemini models',
      'Priority access to new features',
      'Highest throughput and limits'
    ]
  },
  {
    id: 'team',
    name: 'Team',
    month: '$40/user/mo.',
    year: '$32/user/mo.',
    blurb: 'Everything in Pro, plus collaboration and centralized billing.',
    points: [
      'Shared chats, commands, and rules',
      'Centralized team billing',
      'Usage analytics and reporting',
      'Role-based access control',
      'Org-wide privacy mode controls',
      'SAML/OIDC SSO'
    ]
  }
]

export function PlanModal() {
  const { state, setModal, setPlan, goto } = useWorkbench()
  const current = state?.account.plan ?? 'pro'
  const [annual, setAnnual] = useState(false)

  const pick = (id: Card['id']) => {
    if (id === 'team') {
      void goto('onboarding-team')
      return
    }
    void setPlan(id)
  }

  return (
    <div className="modal-back" onClick={() => void setModal(null)}>
      <div className="plan-modal" role="dialog" aria-label="Adjust your plan" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-x" aria-label="Close" onClick={() => void setModal(null)}>
          <IconX />
        </button>
        <header className="plan-head">
          <h2>Adjust your plan</h2>
          <p className="muted">
            Current plan: {current === 'free' ? 'Free' : current === 'pro+' ? 'Pro+' : current === 'ultra' ? 'Ultra' : 'Pro'}
          </p>
          <div className="plan-toggle">
            <button type="button" className={annual ? '' : 'is-on'} onClick={() => setAnnual(false)}>
              Monthly
            </button>
            <button type="button" className={annual ? 'is-on' : ''} onClick={() => setAnnual(true)}>
              Annual
            </button>
          </div>
          <span className="plan-save">Save 20% when billed annually</span>
        </header>
        <div className="plan-grid">
          {CARDS.map((card) => {
            const on = card.id === current
            return (
              <section key={card.id} className={on ? 'plan-card is-current' : 'plan-card'}>
                <div className="plan-card-top">
                  <strong>{card.name}</strong>
                  {on ? <span className="plan-badge">Current plan</span> : null}
                </div>
                <div className="plan-price">{annual ? card.year : card.month}</div>
                <p className="muted">{card.blurb}</p>
                <ul className="plan-points">
                  {card.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                {on ? (
                  <button type="button" className="btn-ghost" disabled>
                    Your current plan
                  </button>
                ) : card.id === 'team' ? (
                  <button type="button" className="btn-ghost" onClick={() => pick(card.id)}>
                    Get Teams
                  </button>
                ) : (
                  <button type="button" className="btn-solid" onClick={() => pick(card.id)}>
                    Choose plan
                  </button>
                )}
              </section>
            )
          })}
        </div>
        <p className="plan-foot muted">Need more capabilities for your business? Enterprise plans stay local (demo).</p>
      </div>
    </div>
  )
}
