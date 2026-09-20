import type { TeamState } from './types.js'

export function defaultTeam(firstName: string): TeamState {
  const n = firstName.trim() || 'alex'
  return {
    name: `${n}'s Team`,
    seats: '1',
    customSeats: 15,
    yearly: true,
    share: true,
    created: false
  }
}

export function applyTeamExtra(base: TeamState, extra?: string, firstName?: string): TeamState {
  const fresh = defaultTeam(firstName || 'alex')
  if (!extra || extra === 'pro' || extra === 'filled') return { ...fresh, created: base.created }
  if (extra === 'empty') return { ...fresh, name: '', created: false }
  if (extra === 'monthly') return { ...fresh, yearly: false }
  if (extra === 'custom') return { ...fresh, seats: 'custom' }
  return { ...fresh, created: base.created }
}
