import type { PluginItem, PluginState } from './types.js'

export const GH_USER = 'local-demo'

export const CATALOG: PluginItem[] = [
  {
    id: 'slack',
    name: 'Slack',
    publisher: 'Slack',
    blurb: 'Slack MCP server. Search channels, send messages, and perform other Slack actions through MCP-compatible clients.',
    mcp: 'slack',
    mark: 'slack'
  },
  {
    id: 'datadog',
    name: 'Datadog',
    publisher: 'Datadog',
    blurb: 'Use Datadog directly in Perigee through a preconfigured Datadog MCP server and skills.',
    mcp: 'datadog',
    mark: 'datadog'
  },
  {
    id: 'figma',
    name: 'Figma',
    publisher: 'Figma',
    blurb: 'Plugin that includes the Figma MCP server and Skills for comments, files, and design context.',
    mcp: 'figma',
    mark: 'figma'
  },
  {
    id: 'linear',
    name: 'Linear',
    publisher: 'Linear',
    blurb: 'Perigee Plugin for Linear — enables AI assistants to manage issues, projects, and cycles.',
    mcp: 'linear',
    mark: 'linear'
  },
  {
    id: 'render',
    name: 'Render',
    publisher: 'Render',
    blurb: 'Deploy, debug, and monitor applications on Render. Includes MCP tools and deploy skills.',
    mcp: 'render',
    mark: 'render'
  },
  {
    id: 'jfrog',
    name: 'JFrog',
    publisher: 'JFrog',
    blurb: 'JFrog Platform integration with MCP, security skills, and supply-chain context.',
    mcp: 'jfrog',
    mark: 'jfrog'
  },
  {
    id: 'planetscale',
    name: 'PlanetScale',
    publisher: 'PlanetScale',
    blurb: 'An authenticated hosted MCP server that accesses your PlanetScale databases.',
    mcp: 'planetscale',
    mark: 'planetscale'
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    publisher: 'Cloudflare',
    blurb: 'Skills for the Cloudflare developer platform: Workers, Durable Objects, and KV.',
    mcp: 'cloudflare',
    mark: 'cloudflare'
  },
  {
    id: 'pendo',
    name: 'Pendo',
    publisher: 'Pendo',
    blurb: 'Bring Pendo analytics into Perigee with skills for account health and guides.',
    mcp: 'pendo',
    mark: 'pendo'
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    publisher: 'GitLab',
    blurb: 'Connect Perigee to GitLab with the GitLab MCP server. Plan, track, and review.',
    mcp: 'gitlab',
    mark: 'gitlab'
  },
  {
    id: 'langfuse',
    name: 'Langfuse',
    publisher: 'Langfuse',
    blurb: 'Skills for working with Langfuse — the open-source LLM engineering platform.',
    mcp: 'langfuse',
    mark: 'langfuse'
  },
  {
    id: 'create',
    name: 'Create Plugin',
    publisher: 'Perigee',
    blurb: 'Scaffold and validate new Perigee plugins. Handles directory structure and manifests.',
    mcp: 'create-plugin',
    mark: 'plus',
    user: true
  },
  {
    id: 'plain',
    name: 'Plain',
    publisher: 'Plain',
    blurb: 'Connect Perigee to Plain — manage support threads, customers, and threads.',
    mcp: 'plain',
    mark: 'plain'
  },
  {
    id: 'continual',
    name: 'Continual Learning',
    publisher: 'Perigee',
    blurb: 'Incrementally learns durable user preferences and workspace conventions.',
    mcp: 'continual-learning',
    mark: 'learn',
    user: true
  },
  {
    id: 'custom',
    name: 'Custom MCP',
    publisher: 'You',
    blurb: 'Add your own MCP server.',
    mcp: 'custom',
    mark: 'plus',
    user: true
  }
]

export const SUGGEST_EMPTY = ['datadog', 'slack', 'figma', 'linear'] as const
export const SUGGEST_AFTER_SLACK = ['datadog', 'figma', 'linear', 'render'] as const
export const SEARCH_PLA = [
  'jfrog',
  'planetscale',
  'cloudflare',
  'pendo',
  'gitlab',
  'langfuse',
  'create',
  'plain',
  'continual'
] as const
export const BROWSE_MCP = [
  'custom',
  'datadog',
  'slack',
  'linear',
  'pendo',
  'cloudflare',
  'plain',
  'figma',
  'gitlab',
  'langfuse',
  'planetscale',
  'jfrog'
] as const

export function pluginById(id: string): PluginItem | undefined {
  return CATALOG.find((p) => p.id === id)
}

export function pluginsByIds(ids: readonly string[]): PluginItem[] {
  return ids.map((id) => pluginById(id)).filter((p): p is PluginItem => Boolean(p))
}

export function emptyPlugins(): PluginState {
  return {
    installed: [],
    activeId: 'slack',
    query: '',
    tab: 'all',
    market: false,
    visibility: 'private',
    toast: null
  }
}

export function filledPlugins(): PluginState {
  return {
    ...emptyPlugins(),
    installed: ['slack']
  }
}

export function clonePlugins(state: PluginState): PluginState {
  return { ...state, installed: [...state.installed] }
}

export function filterCatalog(query: string, tab: 'all' | 'user'): PluginItem[] {
  const q = query.trim().toLowerCase()
  const base = tab === 'user' ? CATALOG.filter((p) => p.user) : CATALOG.filter((p) => p.id !== 'custom')
  if (!q) return base
  if (q === 'pla' || q.startsWith('pla')) {
    return pluginsByIds(SEARCH_PLA)
  }
  return base.filter((p) => {
    const hay = `${p.name} ${p.publisher} ${p.blurb} ${p.mcp}`.toLowerCase()
    return hay.includes(q)
  })
}

export function suggestedFor(installed: string[]): PluginItem[] {
  const ids = installed.includes('slack') ? SUGGEST_AFTER_SLACK : SUGGEST_EMPTY
  return pluginsByIds(ids).filter((p) => !installed.includes(p.id))
}

export const INTEG_ROWS = [
  {
    id: 'github' as const,
    name: 'GitHub',
    blurb: 'Connect GitHub for Cloud Agents, Bugbot and enhanced codebase context.',
    connected: 'Connected as local-demo to repositories in organizations: local-demo.'
  },
  {
    id: 'gitlab' as const,
    name: 'GitLab',
    blurb: 'Connect GitLab for Cloud Agents, Bugbot and enhanced codebase context.',
    connected: 'Connected as local-demo to GitLab projects.'
  },
  {
    id: 'slack' as const,
    name: 'Slack',
    blurb: 'Work with Cloud Agents from Slack.',
    connected: 'Connected. Cloud Agents can work from Slack.'
  },
  {
    id: 'linear' as const,
    name: 'Linear',
    blurb: 'Connect a Linear workspace to delegate issues to Cloud Agents.',
    connected: 'Connected to a Linear workspace.'
  }
]
