/** `grok inspect [--json]` 的展示类型。权威是 CLI 发现结果，不另造一份 settings。 */

export type InspectSource = {
  type?: string
  path?: string
  pluginName?: string
}

export type InspectInstruction = {
  path: string
  scope: string
  fileType: string
  sizeBytes?: number
  approxTokens?: number
  vendor?: string
  disabled?: boolean
  compatibilityStatus?: string
}

export type InspectSkippedRule = {
  rule: string
  reason: string
}

export type InspectEnforced = {
  setting: string
  enabled: boolean
  source: string
}

export type InspectPermissions = {
  sources: string[]
  loaded: number
  skipped: InspectSkippedRule[]
  mcpServerAllowlist: string[]
  marketplaceAllowlist: string[]
  managedSettingsPath?: string | null
  managedSettingsExists?: boolean
  managedSettingsActive?: boolean
  enforced: InspectEnforced[]
}

export type InspectLoginPolicy = {
  disableApiKeyAuth?: boolean | null
  forceLoginTeamUuid?: unknown
  apiKeyAuthDisabled?: boolean
}

export type InspectHook = {
  event: string
  hookType: string
  target?: string
  source?: InspectSource
  matcher?: string | null
  vendor?: string
  disabled?: boolean
}

export type InspectSkill = {
  name: string
  description?: string
  source?: InspectSource
  userInvocable?: boolean
  vendor?: string
  disabled?: boolean
  compatibilityStatus?: string
  collidesWith?: string
  invocableAs?: string
}

export type InspectAgent = {
  name: string
  description?: string
  source?: InspectSource
}

export type InspectPlugin = {
  name: string
  scope: string
  path?: string
  enabled: boolean
  provides?: {
    skills?: number
    agents?: number
    hooks?: boolean
    mcpServers?: number
  }
}

export type InspectMarketplace = {
  name: string
  path?: string
  enabledPlugins?: number
}

export type InspectMcp = {
  name: string
  transport: string
  target?: string
  source?: InspectSource
  disabled?: boolean
  disabledReason?: string
  vendor?: string
}

export type InspectLsp = {
  name: string
  command?: string
  args?: string[]
  source?: InspectSource
  extensions?: string[]
  untrusted?: boolean
}

export type InspectConfigLayer = {
  role: string
  path: string
  note?: string
}

export type InspectCompatCell = {
  vendor: string
  surface: string
  enabled: boolean
  source?: string
}

export type InspectReport = {
  grokVersion: string
  channel: string
  cwd: string
  projectRoot?: string | null
  projectTrusted: boolean
  projectInstructions: InspectInstruction[]
  permissions: InspectPermissions
  loginPolicy?: InspectLoginPolicy
  hooks: InspectHook[]
  skills: InspectSkill[]
  agents: InspectAgent[]
  plugins: InspectPlugin[]
  marketplaces: InspectMarketplace[]
  mcpServers: InspectMcp[]
  lspServers: InspectLsp[]
  configSources: { layers: InspectConfigLayer[] }
  externalCompat?: { remoteSettingsLoaded?: boolean; cells?: InspectCompatCell[] }
  configWarnings?: unknown[]
  mcpConfigProblems?: unknown[]
}

export type InspectErrorCode = 'no-cli' | 'inspect-failed' | 'parse-failed'

export type InspectOk = {
  ok: true
  report: InspectReport
  format: 'json' | 'text'
  bin: string
  cwd: string
}

export type InspectErr = {
  ok: false
  error: string
  code: InspectErrorCode
  detail?: string
  bin?: string
  cwd?: string
}

export type InspectResult = InspectOk | InspectErr

export function sanitizeInspectText(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9]+/g, 'sk-…')
    .replace(/xai-[A-Za-z0-9_-]+/g, 'xai-…')
    .replace(/Bearer\s+\S+/gi, 'Bearer …')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'apikey=…')
    .replace(/Authorization["\s:=]+\S+/gi, 'Authorization=…')
}

export function sanitizeInspectValue<T>(value: T): T {
  if (typeof value === 'string') return sanitizeInspectText(value) as T
  if (Array.isArray(value)) return value.map((item) => sanitizeInspectValue(item)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = sanitizeInspectValue(item)
    }
    return out as T
  }
  return value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined) return raw[key]
  }
  return undefined
}

function notNull<T>(item: T | null | undefined): item is T {
  return item != null
}

function sourceFrom(value: unknown): InspectSource | undefined {
  const rec = asRecord(value)
  if (!rec) {
    if (typeof value === 'string' && value.trim()) return { type: value.trim() }
    return undefined
  }
  return {
    type: str(rec.type) || undefined,
    path: str(rec.path) || undefined,
    pluginName: str(rec.pluginName ?? rec.plugin_name) || undefined
  }
}

export function inspectSourceLabel(source?: InspectSource | null): string {
  if (!source?.type) return '—'
  if (source.type === 'plugin' && source.pluginName) return `plugin: ${source.pluginName}`
  const labels: Record<string, string> = {
    builtin: 'builtin',
    bundled: 'bundled',
    server: 'server',
    project: 'project',
    user: 'user',
    configToml: 'config',
    claudeJson: '~/.claude.json',
    mcpJson: '.mcp.json',
    cli: 'cli',
    managed: 'managed',
    config: 'config'
  }
  return labels[source.type] ?? source.type
}

export function inspectModel(report: InspectReport): string | null {
  const extra = report as InspectReport & {
    defaultModel?: unknown
    currentModel?: unknown
    model?: unknown
    models?: unknown
  }
  for (const value of [extra.defaultModel, extra.currentModel, extra.model]) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const models = extra.models
  if (typeof models === 'string' && models.trim()) return models.trim()
  if (Array.isArray(models)) {
    const first = models.find((item) => typeof item === 'string' && item.trim())
    if (typeof first === 'string') return first
    const rec = models.map(asRecord).find((item) => item && (item.default === true || item.current === true))
    const name = rec ? str(rec.id ?? rec.name ?? rec.model) : ''
    if (name) return name
  }
  const rec = asRecord(models)
  if (rec) {
    const name = str(rec.default ?? rec.current ?? rec.id ?? rec.name)
    if (name) return name
  }
  return null
}

function normalizeInstruction(value: unknown): InspectInstruction | null {
  const rec = asRecord(value)
  if (!rec) return null
  const path = str(rec.path)
  if (!path) return null
  return {
    path,
    scope: str(rec.scope),
    fileType: str(rec.fileType ?? rec.file_type),
    sizeBytes: num(rec.sizeBytes ?? rec.size_bytes, 0) || undefined,
    approxTokens: num(rec.approxTokens ?? rec.approx_tokens, 0) || undefined,
    vendor: str(rec.vendor) || undefined,
    disabled: bool(rec.disabled, false) || undefined,
    compatibilityStatus: str(rec.compatibilityStatus ?? rec.compatibility_status) || undefined
  }
}

function normalizeSkill(value: unknown): InspectSkill | null {
  const rec = asRecord(value)
  if (!rec) return null
  const name = str(rec.name)
  if (!name) return null
  return {
    name,
    description: str(rec.description) || undefined,
    source: sourceFrom(rec.source),
    userInvocable: typeof rec.userInvocable === 'boolean' ? rec.userInvocable : undefined,
    vendor: str(rec.vendor) || undefined,
    disabled: bool(rec.disabled, false) || undefined,
    compatibilityStatus: str(rec.compatibilityStatus ?? rec.compatibility_status) || undefined,
    collidesWith: str(rec.collidesWith ?? rec.collides_with) || undefined,
    invocableAs: str(rec.invocableAs ?? rec.invocable_as) || undefined
  }
}

function normalizePlugin(value: unknown): InspectPlugin | null {
  const rec = asRecord(value)
  if (!rec) return null
  const name = str(rec.name)
  if (!name) return null
  const provides = asRecord(rec.provides)
  return {
    name,
    scope: str(rec.scope),
    path: str(rec.path) || undefined,
    enabled: bool(rec.enabled, false),
    provides: provides
      ? {
          skills: num(provides.skills, 0),
          agents: num(provides.agents, 0),
          hooks: bool(provides.hooks, false),
          mcpServers: num(provides.mcpServers ?? provides.mcp_servers, 0)
        }
      : undefined
  }
}

function normalizeHook(value: unknown): InspectHook | null {
  const rec = asRecord(value)
  if (!rec) return null
  return {
    event: str(rec.event),
    hookType: str(rec.hookType ?? rec.hook_type),
    target: str(rec.target) || undefined,
    source: sourceFrom(rec.source),
    matcher: str(rec.matcher) || undefined,
    vendor: str(rec.vendor) || undefined,
    disabled: bool(rec.disabled, false) || undefined
  }
}

function normalizeMcp(value: unknown): InspectMcp | null {
  const rec = asRecord(value)
  if (!rec) return null
  const name = str(rec.name)
  if (!name) return null
  return {
    name,
    transport: str(rec.transport),
    target: str(rec.target) || undefined,
    source: sourceFrom(rec.source),
    disabled: bool(rec.disabled, false) || undefined,
    disabledReason: str(rec.disabledReason ?? rec.disabled_reason) || undefined,
    vendor: str(rec.vendor) || undefined
  }
}

function normalizeAgent(value: unknown): InspectAgent | null {
  const rec = asRecord(value)
  if (!rec) return null
  const name = str(rec.name)
  if (!name) return null
  return {
    name,
    description: str(rec.description) || undefined,
    source: sourceFrom(rec.source)
  }
}

function normalizePermissions(value: unknown): InspectPermissions {
  const rec = asRecord(value)
  if (!rec) {
    return {
      sources: [],
      loaded: 0,
      skipped: [],
      mcpServerAllowlist: [],
      marketplaceAllowlist: [],
      enforced: []
    }
  }
  return {
    sources: asArray(rec.sources).map((item) => str(item)).filter(Boolean),
    loaded: num(rec.loaded, 0),
    skipped: asArray(rec.skipped)
      .map((item) => {
        const row = asRecord(item)
        if (!row) return null
        return { rule: str(row.rule), reason: str(row.reason) }
      })
      .filter(notNull),
    mcpServerAllowlist: asArray(rec.mcpServerAllowlist ?? rec.mcp_server_allowlist)
      .map((item) => str(item))
      .filter(Boolean),
    marketplaceAllowlist: asArray(rec.marketplaceAllowlist ?? rec.marketplace_allowlist)
      .map((item) => str(item))
      .filter(Boolean),
    managedSettingsPath: str(rec.managedSettingsPath ?? rec.managed_settings_path) || null,
    managedSettingsExists: bool(rec.managedSettingsExists ?? rec.managed_settings_exists, false),
    managedSettingsActive: bool(rec.managedSettingsActive ?? rec.managed_settings_active, false),
    enforced: asArray(rec.enforced)
      .map((item) => {
        const row = asRecord(item)
        if (!row) return null
        return {
          setting: str(row.setting),
          enabled: bool(row.enabled, false),
          source: str(row.source)
        }
      })
      .filter(notNull)
  }
}

export function normalizeInspectReport(raw: Record<string, unknown>): InspectReport {
  const layers: InspectConfigLayer[] = asArray(
    asRecord(pick(raw, 'configSources', 'config_sources'))?.layers
  )
    .map((item): InspectConfigLayer | null => {
      const rec = asRecord(item)
      if (!rec) return null
      const path = str(rec.path)
      const role = str(rec.role)
      if (!path && !role) return null
      const note = str(rec.note)
      return note ? { role, path, note } : { role, path }
    })
    .filter(notNull)

  return {
    grokVersion: str(pick(raw, 'grokVersion', 'grok_version')),
    channel: str(raw.channel),
    cwd: str(raw.cwd),
    projectRoot: str(pick(raw, 'projectRoot', 'project_root')) || null,
    projectTrusted: bool(pick(raw, 'projectTrusted', 'project_trusted'), false),
    projectInstructions: asArray(pick(raw, 'projectInstructions', 'project_instructions'))
      .map(normalizeInstruction)
      .filter(notNull),
    permissions: normalizePermissions(raw.permissions),
    loginPolicy: asRecord(pick(raw, 'loginPolicy', 'login_policy'))
      ? {
          disableApiKeyAuth: (() => {
            const v = asRecord(pick(raw, 'loginPolicy', 'login_policy'))?.disableApiKeyAuth
            return typeof v === 'boolean' ? v : null
          })(),
          forceLoginTeamUuid: asRecord(pick(raw, 'loginPolicy', 'login_policy'))?.forceLoginTeamUuid ?? null,
          apiKeyAuthDisabled: bool(
            asRecord(pick(raw, 'loginPolicy', 'login_policy'))?.apiKeyAuthDisabled,
            false
          )
        }
      : undefined,
    hooks: asArray(raw.hooks).map(normalizeHook).filter(notNull),
    skills: asArray(raw.skills).map(normalizeSkill).filter(notNull),
    agents: asArray(raw.agents).map(normalizeAgent).filter(notNull),
    plugins: asArray(raw.plugins).map(normalizePlugin).filter(notNull),
    marketplaces: asArray(raw.marketplaces)
      .map((item): InspectMarketplace | null => {
        const rec = asRecord(item)
        if (!rec || !str(rec.name)) return null
        const row: InspectMarketplace = { name: str(rec.name) }
        const path = str(rec.path)
        if (path) row.path = path
        const enabledPlugins = num(rec.enabledPlugins ?? rec.enabled_plugins, 0)
        if (enabledPlugins) row.enabledPlugins = enabledPlugins
        return row
      })
      .filter(notNull),
    mcpServers: asArray(pick(raw, 'mcpServers', 'mcp_servers')).map(normalizeMcp).filter(notNull),
    lspServers: asArray(pick(raw, 'lspServers', 'lsp_servers'))
      .map((item): InspectLsp | null => {
        const rec = asRecord(item)
        if (!rec || !str(rec.name)) return null
        const row: InspectLsp = { name: str(rec.name) }
        const command = str(rec.command)
        if (command) row.command = command
        row.args = asArray(rec.args).map((a) => str(a))
        row.source = sourceFrom(rec.source)
        row.extensions = asArray(rec.extensions).map((a) => str(a))
        if (bool(rec.untrusted, false)) row.untrusted = true
        return row
      })
      .filter(notNull),
    configSources: { layers },
    externalCompat: asRecord(pick(raw, 'externalCompat', 'external_compat')) ?? undefined,
    configWarnings: asArray(pick(raw, 'configWarnings', 'config_warnings')),
    mcpConfigProblems: asArray(pick(raw, 'mcpConfigProblems', 'mcp_config_problems'))
  }
}

export function parseInspectJson(text: string): InspectReport | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  try {
    const parsed: unknown = JSON.parse(text.slice(start))
    const rec = asRecord(parsed)
    if (!rec) return null
    const report = normalizeInspectReport(rec)
    const looksLike =
      Boolean(report.grokVersion) ||
      report.skills.length > 0 ||
      report.mcpServers.length > 0 ||
      report.plugins.length > 0 ||
      report.projectInstructions.length > 0 ||
      Boolean(report.cwd)
    return looksLike ? sanitizeInspectValue(report) : null
  } catch {
    return null
  }
}

function stripTree(line: string): string {
  return line.replace(/^.*[\u2514\u251C]\s*/, '').trim()
}

export function parseInspectText(text: string): InspectReport | null {
  const lines = text.split(/\r?\n/)
  let grokVersion = ''
  let channel = ''
  let cwd = ''
  let projectRoot: string | null = null
  let projectTrusted = false
  let section = ''
  const projectInstructions: InspectInstruction[] = []
  const skills: InspectSkill[] = []
  const plugins: InspectPlugin[] = []
  const hooks: InspectHook[] = []
  const mcpServers: InspectMcp[] = []
  const agents: InspectAgent[] = []
  const permissions: InspectPermissions = {
    sources: [],
    loaded: 0,
    skipped: [],
    mcpServerAllowlist: [],
    marketplaceAllowlist: [],
    enforced: []
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const sec = line.match(
      /^\s+(Environment|Project Instructions|Permissions|Login Policy|Skills|Agents|Plugins|Marketplaces|MCP Servers|LSP Servers|Hooks|Config Sources)\s*(?:\((\d+)\))?/
    )
    if (sec) {
      section = sec[1]
      continue
    }

    const ver = line.match(/Version:\s+(\S+)(?:\s+\[([^\]]+)\])?/)
    if (ver) {
      grokVersion = ver[1]
      channel = ver[2] ?? ''
      continue
    }
    const cwdM = line.match(/CWD:\s+(.+)/)
    if (cwdM) {
      cwd = cwdM[1].trim()
      continue
    }
    const rootM = line.match(/Git root:\s+(.+)/)
    if (rootM) {
      projectRoot = rootM[1].trim()
      continue
    }
    const trustM = line.match(/Project trusted:\s+(yes|no)/i)
    if (trustM) {
      projectTrusted = trustM[1].toLowerCase() === 'yes'
      continue
    }
    const loadedM = line.match(/(\d+)\s+loaded,\s+(\d+)\s+skipped/)
    if (loadedM && section === 'Permissions') {
      permissions.loaded = Number(loadedM[1])
      continue
    }
    const srcM = line.match(/Source:\s+(.+)/)
    if (srcM && section === 'Permissions') {
      const src = srcM[1].trim()
      if (src && src !== '(none)') permissions.sources.push(src)
      continue
    }

    if (!/[\u2514\u251C]/.test(line)) continue
    const item = stripTree(line)
    if (!item || item === '(none)' || item.startsWith('(none)')) continue

    if (section === 'Project Instructions') {
      const m = item.match(/^(.*?)\s+\(([^,]+),\s*~(\d+)\s+tokens\)/)
      projectInstructions.push({
        path: m ? m[1] : item,
        scope: m ? m[2] : '',
        fileType: '',
        approxTokens: m ? Number(m[3]) : undefined
      })
      continue
    }
    if (section === 'Skills') {
      const parts = item.split(/\s{2,}/)
      skills.push({
        name: parts[0] ?? item,
        source: parts[1] ? { type: parts[1].replace(/\[disabled\]/g, '').trim() } : undefined,
        disabled: /\[disabled\]/.test(item) || undefined
      })
      continue
    }
    if (section === 'Plugins') {
      const m = item.match(/^(.+?)\s+\(([^,]+),\s*(enabled|disabled)\)/i)
      plugins.push({
        name: m ? m[1] : item,
        scope: m ? m[2] : '',
        enabled: m ? m[3].toLowerCase() === 'enabled' : false
      })
      continue
    }
    if (section === 'Hooks') {
      const matcher = item.match(/matcher=(\S+)/)
      hooks.push({
        event: '',
        hookType: item.replace(/\s+matcher=\S+/, '').trim(),
        matcher: matcher?.[1]
      })
      continue
    }
    if (section === 'MCP Servers') {
      const m = item.match(/^(\S+)\s+\(([^)]+)\)/)
      mcpServers.push({
        name: m ? m[1] : item,
        transport: m ? m[2] : '',
        disabled: /\[BLOCKED/.test(item) || undefined
      })
      continue
    }
    if (section === 'Agents') {
      const parts = item.split(/\s{2,}/)
      agents.push({ name: parts[0] ?? item, source: parts[1] ? { type: parts[1] } : undefined })
    }
  }

  if (!grokVersion && !cwd && skills.length === 0 && mcpServers.length === 0) return null
  return sanitizeInspectValue({
    grokVersion,
    channel,
    cwd,
    projectRoot,
    projectTrusted,
    projectInstructions,
    permissions,
    hooks,
    skills,
    agents,
    plugins,
    marketplaces: [],
    mcpServers,
    lspServers: [],
    configSources: { layers: [] }
  })
}

export function parseInspectOutput(text: string): { report: InspectReport; format: 'json' | 'text' } | null {
  const json = parseInspectJson(text)
  if (json) return { report: json, format: 'json' }
  const human = parseInspectText(text)
  if (human) return { report: human, format: 'text' }
  return null
}

function joinNames(names: string[], limit = 8): string {
  if (!names.length) return '(none)'
  if (names.length <= limit) return names.join(', ')
  return `${names.slice(0, limit).join(', ')} … +${names.length - limit}`
}

export function formatInspectSummary(result: InspectResult): string[] {
  if (!result.ok) {
    return [`inspect: no   ${result.error}`]
  }
  const r = result.report
  const model = inspectModel(r)
  const lines = [
    `inspect: yes  v${r.grokVersion || '?'}  skills=${r.skills.length} plugins=${r.plugins.length} hooks=${r.hooks.length} mcp=${r.mcpServers.length} rules=${r.projectInstructions.length} perms=${r.permissions.loaded}`,
    `  model   ${model ?? 'inspect 未报（以 grok models 默认标记为准）'}`
  ]
  lines.push(`  skills  ${joinNames(r.skills.map((s) => s.name))}`)
  lines.push(
    `  plugins ${
      r.plugins.length
        ? r.plugins.map((p) => `${p.name} (${p.scope || '?'}, ${p.enabled ? 'on' : 'off'})`).join(', ')
        : '(none)'
    }`
  )
  lines.push(
    `  hooks   ${joinNames(
      r.hooks.map((h) => (h.event && h.event !== '(plugin)' ? h.event : h.hookType)).filter(Boolean)
    )}`
  )
  lines.push(`  mcp     ${joinNames(r.mcpServers.map((m) => m.name))}`)
  lines.push(
    `  rules   ${r.projectInstructions.length} files · ${r.permissions.loaded} permission rules`
  )
  return lines
}

export function pathBaseName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}
