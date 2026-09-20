import { useEffect, useState } from 'react'
import type { TeamSeats } from '../../../shared/types'
import { IconCheck, IconChevronLeft } from '../components/Icons'
import { useWorkbench } from '../state'

const SEATS: TeamSeats[] = ['1', '5', '10', 'custom']

export function OnboardingTeam() {
  const { state, goto } = useWorkbench()
  const team = state?.team
  const [name, setName] = useState(team?.name ?? '')
  const [seats, setSeats] = useState<TeamSeats>(team?.seats ?? '1')
  const [custom, setCustom] = useState(String(team?.customSeats ?? 15))
  const [yearly, setYearly] = useState(team?.yearly !== false)
  const [share, setShare] = useState(team?.share !== false)

  useEffect(() => {
    if (!team) return
    setName(team.name)
    setSeats(team.seats)
    setCustom(String(team.customSeats))
    setYearly(team.yearly)
    setShare(team.share)
  }, [team])

  return (
    <div className="team-setup">
      <div className="team-setup-drag" />
      <button type="button" className="team-back" onClick={() => void goto('settings-members')}>
        <IconChevronLeft />
        Back
      </button>
      <div className="team-card">
        <h1>Set Up Your Team</h1>

        <label className="team-field">
          <span>Team Name</span>
          <input className="acct-input wide" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="team-field">
          <span>Members</span>
          <div className="seg team-seats">
            {SEATS.map((n) => (
              <button key={n} type="button" className={seats === n ? 'is-on' : ''} onClick={() => setSeats(n)}>
                {n === 'custom' ? 'Custom' : n}
              </button>
            ))}
          </div>
          {seats === 'custom' ? (
            <input
              className="acct-input slim"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-label="Custom seats"
            />
          ) : null}
        </div>

        <div className="team-field">
          <span>Billing Preference</span>
          <div className="team-bills">
            <button
              type="button"
              className={yearly ? 'team-bill is-on' : 'team-bill'}
              onClick={() => setYearly(true)}
            >
              {yearly ? (
                <span className="team-bill-check">
                  <IconCheck />
                </span>
              ) : null}
              <strong>Yearly</strong>
              <div>$32/user/mo.</div>
              <em>Save $96</em>
            </button>
            <button
              type="button"
              className={yearly ? 'team-bill' : 'team-bill is-on'}
              onClick={() => setYearly(false)}
            >
              {!yearly ? (
                <span className="team-bill-check">
                  <IconCheck />
                </span>
              ) : null}
              <strong>Monthly</strong>
              <div>$40/user/mo.</div>
            </button>
          </div>
        </div>

        <div className="team-share">
          <div>
            <div className="settings-row-title">Share Perigee Analytics</div>
            <p className="muted">My team&apos;s data may be used to improve Perigee for all users.</p>
          </div>
          <button
            type="button"
            className={share ? 'toggle is-on' : 'toggle'}
            role="switch"
            aria-checked={share}
            onClick={() => setShare((v) => !v)}
          />
        </div>

        <button type="button" className="btn-solid team-continue" onClick={() => void goto('settings-plan')}>
          Continue
        </button>
      </div>
    </div>
  )
}
