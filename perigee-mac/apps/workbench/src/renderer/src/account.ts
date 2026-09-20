import type { Account, PlanId } from '../../shared/types'

export function displayName(account: Account): string {
  const n = `${account.firstName} ${account.lastName}`.trim()
  if (n) return n
  if (account.email) return account.email.split('@')[0] || 'you'
  return 'you'
}

export function displayInitial(account: Account): string {
  return displayName(account).slice(0, 1).toUpperCase() || 'P'
}

export function planLabel(plan: PlanId): string {
  if (plan === 'pro+') return 'Pro+'
  if (plan === 'ultra') return 'Ultra'
  if (plan === 'pro') return 'Pro'
  return 'Free'
}

export function isFreePlan(plan: PlanId): boolean {
  return plan === 'free'
}

export const USAGE_EVENTS = [
  { date: 'Mar 27, 06:14 AM', type: 'Included', model: 'gpt-5.3-codex-high', tokens: '875', cost: 'Included', max: false },
  { date: 'Mar 27, 05:02 AM', type: 'Included', model: 'gpt-5.3-codex-high', tokens: '32K', cost: 'Included', max: true },
  { date: 'Mar 26, 11:41 PM', type: 'Included', model: 'claude-4.6-opus-high-thinking', tokens: '4.7M', cost: 'Included', max: true },
  { date: 'Mar 26, 08:16 PM', type: 'Included', model: 'composer-1.5', tokens: '728.5K', cost: 'Included', max: false },
  { date: 'Mar 25, 04:22 PM', type: 'Free', model: 'gpt-5.4-high', tokens: '12K', cost: 'Free', max: false },
  { date: 'Mar 24, 09:08 AM', type: 'Included', model: 'gpt-5.3-codex-high', tokens: '2.1M', cost: 'Included', max: true }
]

export const USAGE_POINTS = [
  { label: 'Mar 24', gpt53: 0.4, gpt54: 0.15, composer: 0.02 },
  { label: 'Mar 25', gpt53: 1.6, gpt54: 0.35, composer: 0.04 },
  { label: 'Mar 26', gpt53: 3.4, gpt54: 0.62, composer: 0.07 },
  { label: 'Mar 27', gpt53: 4.7, gpt54: 0.86, composer: 0.1 }
]

export const INVOICES = [{ date: 'Mar 24, 2026', item: 'Pro monthly', amount: '$20.00', status: 'Paid' }]
