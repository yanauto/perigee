import type { CloudState } from './types.js'

export const REPO = 'samleemobbin-dot/mini-landing-page'
export const SETUP_SESSION_ID = 'task_setup'
export const FAVICON_SESSION_ID = 'task_favicon'
export const DEMO_KEY_ONCE = 'crsr_demo_local_only_not_a_real_key'
export const SNAPSHOT_ID = 'snapshot-20260325-f288c292-a7fd-448f-b399-1934382e3cae'
export const UPDATE_SCRIPT = [
  'npm install',
  'mkdir -p public',
  'ln -sf ../index.html public/index.html',
  'ln -sf ../assets public/assets',
  'ln -sf ../images public/images'
].join('\n')

export const SETUP_PROMPT =
  'Please set up the development environment for this codebase. Run the application(s) and demonstrate that the environment is working.'

export const FAVICON_PROMPT = 'can you add this logo as the website favicon?'

export function emptyCloud(): CloudState {
  return {
    envReady: false,
    gitConnected: false,
    selfHosted: false,
    slackLinked: false,
    slackNotify: false,
    testingOn: true,
    network: 'all',
    defaultModel: '',
    defaultRepo: '',
    baseBranch: '',
    branchPrefix: 'cursor/',
    snapshotId: '',
    updateScript: UPDATE_SCRIPT,
    revealedKey: null,
    apiKeys: [],
    secrets: [],
    setupRuns: [],
    routeRule: false,
    gitlabConnected: false,
    linearLinked: false
  }
}

export function configuredCloud(): CloudState {
  return {
    envReady: true,
    gitConnected: true,
    selfHosted: false,
    slackLinked: true,
    slackNotify: true,
    testingOn: true,
    network: 'all',
    defaultModel: 'GPT-5.4 High',
    defaultRepo: REPO,
    baseBranch: '',
    branchPrefix: 'cursor/',
    snapshotId: SNAPSHOT_ID,
    updateScript: UPDATE_SCRIPT,
    revealedKey: null,
    apiKeys: [
      {
        id: 'k1',
        name: 'MAIN_API_KEY',
        tokenHint: 'crsr_...demo',
        scope: 'Admin',
        created: '3/25/2026'
      }
    ],
    secrets: [
      { id: 's1', name: 'local_secret', repos: 'All Repositories', type: 'Secret' },
      { id: 's2', name: 'OPENAI_API_KEY', repos: 'All Repositories', type: 'Redacted' }
    ],
    setupRuns: [
      {
        id: 'bc-cbea0974-08c7-463a-84b2-6',
        status: 'Finished',
        snapshot: 'snapshot-20260326-b635',
        pr: true,
        created: 'Mar 26, 06:40 UTC'
      }
    ],
    routeRule: true,
    gitlabConnected: false,
    linearLinked: false
  }
}
