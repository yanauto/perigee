import type { BugbotRepo, BugbotReview, BugbotRule, BugbotState } from './types.js'

export const BUGBOT_ORG = 'samleemobbin-dot'

export const RULE_CONTENT = [
  'Guidelines :',
  '- Use Bugbot to scan and identify issues before making any code changes.',
  '- Review Bugbot suggestions carefully. do not apply blindly.',
  '- Validate fixes by testing the affected functionality.',
  '- After fixing, re-run Bugbot to ensure no new issues are introduced',
  '- Document significant fixes or decisions when needed'
].join('\n')

export const REPO_NAMES = [
  'astrowind-lp',
  'docs',
  'doggy-stickers',
  'mini-landing-page',
  'openreact-lp',
  'tailwind-lp'
] as const

export function cloneRule(rule: BugbotRule): BugbotRule {
  return { ...rule, paths: [...rule.paths] }
}

export function cloneBugbot(state: BugbotState): BugbotState {
  return {
    ...state,
    reviews: state.reviews.map((r) => ({ ...r })),
    rules: state.rules.map(cloneRule),
    repos: state.repos.map((r) => ({ ...r })),
    draft: cloneRule(state.draft)
  }
}

export function blankRule(): BugbotRule {
  return {
    id: 'new',
    name: '',
    repo: '',
    org: BUGBOT_ORG,
    content: '',
    enabled: true,
    paths: []
  }
}

export function demoRule(): BugbotRule {
  return {
    id: 'rule_usage',
    name: 'Bugbot Usage',
    repo: 'docs',
    org: BUGBOT_ORG,
    content: RULE_CONTENT,
    enabled: true,
    paths: []
  }
}

export function demoReview(): BugbotReview {
  return {
    id: 'rev_1',
    title: 'astrowind-lp #1',
    status: 'Open',
    author: BUGBOT_ORG,
    issues: '0/2',
    date: 'Mar 26'
  }
}

export function demoRepos(on: boolean): BugbotRepo[] {
  const onSet = new Set(['astrowind-lp', 'docs', 'mini-landing-page'])
  return REPO_NAMES.map((name) => ({
    id: name,
    name: `${BUGBOT_ORG}/${name}`,
    on: on ? onSet.has(name) : false
  }))
}

export function emptyBugbot(): BugbotState {
  return {
    enabled: false,
    view: 'home',
    reviews: [],
    rules: [],
    repos: demoRepos(false),
    draft: blankRule(),
    toast: null,
    mentionOnly: false,
    runOnce: false,
    draftPrs: 'Use Installation Default',
    summaries: 'Use Installation Defaults',
    autofix: 'Use Installation Default',
    severity: 'Use Installation Default',
    learningOn: false,
    range: '30d'
  }
}

export function readyBugbot(): BugbotState {
  return {
    ...emptyBugbot(),
    enabled: true,
    repos: demoRepos(true),
    draftPrs: 'On'
  }
}

export function filledBugbot(): BugbotState {
  const rule = demoRule()
  return {
    ...readyBugbot(),
    reviews: [demoReview()],
    rules: [cloneRule(rule)],
    draft: cloneRule(rule)
  }
}
