import type { AutoState, AutoTool, AutoTrigger, Automation } from './types.js'

export const AUTO_REPO = 'mini-landing-page'
export const AUTO_REPO_ALT = 'astrowind-lp'
export const AUTO_AUTHOR = 'alex smith'
export const AUTO_MODEL = 'Codex 5.3 High'
export const AUTO_TEST_URL = 'https://github.com/samleemobbin-dot/mini-landing-page/pull/1'

export type TemplateIcon = 'shield' | 'swap' | 'mail' | 'wrench' | 'flask' | 'flag' | 'bug' | 'undo' | 'book' | 'search' | 'pill'

export type AutoTemplate = {
  id: string
  title: string
  blurb: string
  icon: TemplateIcon
  more?: boolean
  prompt: string
  triggers: string[]
  tools: string[]
  slackWarn?: boolean
}

const REVIEW_PROMPT = [
  'Analyze the provided pull request. Review the diffs and generate a summary covering:',
  '1. Files Changed',
  '2. Key Changes',
  '3. Change Type',
  '4. Risk Assessment',
  '5. Summary.'
].join('\n')

const VULN_PROMPT = [
  'You are a security reviewer for pull requests.',
  '',
  '## Goal',
  'Detect and clearly explain real vulnerabilities introduced or exposed by this PR.',
  '',
  '## Security workflow',
  '1. Inspect the PR diff and flag only exploitable issues.',
  '2. For every candidate issue, explain impact and a concrete fix.',
  '3. Verify whether existing controls already block exploitation before reporting.'
].join('\n')

export const TEMPLATES: AutoTemplate[] = [
  {
    id: 'vuln',
    title: 'Find vulnerabilities',
    blurb: 'Review pull requests for exploitable security issues and flag only validated findings before merge.',
    icon: 'shield',
    prompt: VULN_PROMPT,
    triggers: ['PR opened', 'PR pushed'],
    tools: ['PR Comment', 'Send Slack Message'],
    slackWarn: true
  },
  {
    id: 'reviewers',
    title: 'Assign PR reviewers',
    blurb: 'Assign reviewers based on code changes and auto-approve low-risk pull requests.',
    icon: 'swap',
    prompt: 'Assign reviewers from CODEOWNERS and auto-approve low-risk PRs.',
    triggers: ['PR opened'],
    tools: ['PR Comment']
  },
  {
    id: 'digest',
    title: 'Summarize changes daily',
    blurb: 'Post a daily Slack digest summarizing notable repository changes.',
    icon: 'mail',
    prompt: 'Summarize notable repository changes from the last day and post a Slack digest.',
    triggers: ['Every day'],
    tools: ['Send Slack Message']
  },
  {
    id: 'slack-bugs',
    title: 'Fix bugs reported in Slack',
    blurb: 'Monitor a Slack channel for bug reports, investigate the codebase, and open a fix PR.',
    icon: 'wrench',
    prompt: 'Watch the Slack channel for bug reports, reproduce in the repo, and open a fix PR.',
    triggers: ['Slack message'],
    tools: ['Send Slack Message']
  },
  {
    id: 'tests',
    title: 'Add test coverage',
    blurb: 'Adds tests for high-risk logic that recently changed.',
    icon: 'flask',
    more: true,
    prompt: 'Add tests for high-risk logic in the latest changes.',
    triggers: ['PR pushed'],
    tools: ['PR Comment']
  },
  {
    id: 'flags',
    title: 'Clean up feature flags',
    blurb: 'Removes dead code from stale feature flags.',
    icon: 'flag',
    more: true,
    prompt: 'Find stale feature flags and remove the dead code paths.',
    triggers: ['Every week'],
    tools: ['PR Comment']
  },
  {
    id: 'bugs',
    title: 'Find critical bugs',
    blurb: 'Analyzes commits for high-severity bugs before they ship.',
    icon: 'bug',
    more: true,
    prompt: 'Scan recent commits for high-severity bugs.',
    triggers: ['PR opened'],
    tools: ['PR Comment']
  },
  {
    id: 'ci',
    title: 'Fix CI failures',
    blurb: 'Detects CI failures and opens PRs with a proposed fix.',
    icon: 'undo',
    more: true,
    prompt: 'When CI fails, diagnose the log and open a fix PR.',
    triggers: ['PR pushed'],
    tools: ['PR Comment']
  },
  {
    id: 'docs',
    title: 'Generate docs',
    blurb: 'Creates or updates developer documentation for new APIs.',
    icon: 'book',
    more: true,
    prompt: 'Update developer docs to match the latest API changes.',
    triggers: ['PR merged'],
    tools: ['PR Comment']
  },
  {
    id: 'pager',
    title: 'Investigate PagerDuty incidents',
    blurb: 'Uses Datadog and code context for incident investigation.',
    icon: 'search',
    more: true,
    prompt: 'Investigate the PagerDuty incident with Datadog and the repo.',
    triggers: ['PagerDuty'],
    tools: ['Send Slack Message']
  },
  {
    id: 'datadog',
    title: 'Investigate top Datadog errors',
    blurb: 'Proposes fixes for recurring production errors.',
    icon: 'search',
    more: true,
    prompt: 'Look at the top Datadog errors and propose a fix PR.',
    triggers: ['Every day'],
    tools: ['PR Comment']
  },
  {
    id: 'invariants',
    title: 'Monitor engineering invariants',
    blurb: 'Alerts when repository rules regress.',
    icon: 'shield',
    more: true,
    prompt: 'Watch repository invariants and alert when they regress.',
    triggers: ['PR pushed'],
    tools: ['Send Slack Message']
  },
  {
    id: 'deps',
    title: 'Remediate dependency vulnerabilities',
    blurb: 'Triages Linear tickets and opens upgrade PRs.',
    icon: 'pill',
    more: true,
    prompt: 'Triage dependency tickets and open upgrade PRs.',
    triggers: ['Every week'],
    tools: ['PR Comment']
  },
  {
    id: 'scan',
    title: 'Scan codebase for vulnerabilities',
    blurb: 'Schedules full repository security reviews.',
    icon: 'search',
    more: true,
    prompt: 'Run a full repository security review and file findings.',
    triggers: ['Every week'],
    tools: ['PR Comment']
  }
]

const MEMORIES: AutoTool = { id: 't-mem', kind: 'memories', label: 'Memories' }

function trig(partial: Omit<AutoTrigger, 'id'> & { id: string }): AutoTrigger {
  return partial
}

export function cloneAuto(item: Automation): Automation {
  return {
    ...item,
    triggers: item.triggers.map((t) => ({ ...t, who: [...t.who] })),
    tools: item.tools.map((t) => ({ ...t }))
  }
}

export function blankDraft(author = AUTO_AUTHOR): Automation {
  return {
    id: 'auto_new',
    name: `${author.split(' ')[0]}'s Automation`,
    author,
    created: 'now',
    active: false,
    saved: false,
    instructions: '',
    model: AUTO_MODEL,
    triggers: [],
    tools: [MEMORIES],
    envOn: true,
    slackWarn: false
  }
}

export function creatingReview(author = AUTO_AUTHOR): Automation {
  return {
    id: 'pr-review',
    name: 'pr-review-automation',
    author,
    created: '13h',
    active: false,
    saved: false,
    instructions: REVIEW_PROMPT,
    model: AUTO_MODEL,
    triggers: [
      trig({
        id: 'tr-sched',
        kind: 'schedule',
        repo: AUTO_REPO,
        branch: 'main',
        weekday: 'Monday',
        time: '09:00',
        tz: 'GMT+7',
        who: []
      }),
      trig({
        id: 'tr-push',
        kind: 'pr-pushed',
        repo: AUTO_REPO,
        who: ['jsmith-mbn', 'jdoe']
      }),
      trig({
        id: 'tr-merge',
        kind: 'pr-merged',
        repo: AUTO_REPO,
        who: []
      })
    ],
    tools: [MEMORIES],
    envOn: true,
    slackWarn: false
  }
}

export function activeReview(author = AUTO_AUTHOR): Automation {
  return { ...creatingReview(author), saved: true, active: true }
}

export function copyVuln(author = AUTO_AUTHOR): Automation {
  const tpl = templateById('vuln')
  return {
    id: 'auto_vuln_copy',
    name: 'Copy of Find vulnerabilities',
    author,
    created: 'now',
    active: false,
    saved: false,
    instructions: tpl?.prompt ?? VULN_PROMPT,
    model: AUTO_MODEL,
    triggers: [
      trig({ id: 'tr-open', kind: 'pr-opened', repo: AUTO_REPO_ALT, who: [] }),
      trig({ id: 'tr-push', kind: 'pr-pushed', repo: AUTO_REPO_ALT, who: [] })
    ],
    tools: [
      { id: 't-slack', kind: 'slack', label: 'Send to Slack', extra: '#teams' },
      { id: 't-pr', kind: 'pr-comment', label: 'Comment on Pull Request', extra: 'Allow PR Approval' }
    ],
    envOn: true,
    slackWarn: true
  }
}

export function demoAutomations(author = AUTO_AUTHOR): Automation[] {
  return [
    { ...activeReview(author), created: '13h' },
    {
      id: 'pr-diff',
      name: 'pr-diff-comments',
      author,
      created: '13h',
      active: true,
      saved: true,
      instructions: 'Comment on PR diffs with a short risk note.',
      model: AUTO_MODEL,
      triggers: [trig({ id: 'tr-diff', kind: 'pr-pushed', repo: AUTO_REPO, who: [] })],
      tools: [MEMORIES],
      envOn: true,
      slackWarn: false
    }
  ]
}

export function draftFromTemplate(tpl: AutoTemplate, author = AUTO_AUTHOR): Automation {
  if (tpl.id === 'vuln') return copyVuln(author)
  const opened = tpl.triggers.some((t) => /opened/i.test(t))
  return {
    id: `auto_${tpl.id}`,
    name: `Copy of ${tpl.title}`,
    author,
    created: 'now',
    active: false,
    saved: false,
    instructions: tpl.prompt,
    model: AUTO_MODEL,
    triggers: [
      trig({
        id: 'tr-1',
        kind: opened ? 'pr-opened' : /merged/i.test(tpl.triggers[0] ?? '') ? 'pr-merged' : 'pr-pushed',
        repo: AUTO_REPO,
        who: []
      })
    ],
    tools: [MEMORIES],
    envOn: true,
    slackWarn: Boolean(tpl.slackWarn)
  }
}

export function templateById(id: string): AutoTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

export function isTemplateId(id: string): boolean {
  return TEMPLATES.some((t) => t.id === id)
}

export function suggestedTemplates(): AutoTemplate[] {
  return TEMPLATES.filter((t) => !t.more)
}

export function moreTemplates(): AutoTemplate[] {
  return TEMPLATES.filter((t) => t.more)
}

export function filledAutoState(): AutoState {
  const items = demoAutomations()
  return {
    items,
    draft: creatingReview(),
    tab: 'settings',
    toast: null,
    previewId: 'vuln',
    testUrl: AUTO_TEST_URL
  }
}

export function emptyAutoState(): AutoState {
  return {
    items: [],
    draft: blankDraft(),
    tab: 'settings',
    toast: null,
    previewId: 'vuln',
    testUrl: AUTO_TEST_URL
  }
}

export function autoStats(items: Automation[]): { total: number; ok: number; okPct: string; fail: number; failPct: string } {
  if (items.length === 0) return { total: 0, ok: 0, okPct: '', fail: 0, failPct: '' }
  return { total: items.length, ok: 2, okPct: '66.7%', fail: 1, failPct: '33.3%' }
}
