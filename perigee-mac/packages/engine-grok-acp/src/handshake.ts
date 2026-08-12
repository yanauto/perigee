/**
 * ACP 握手纯函数（initialize / authenticate / session/new）。
 *
 * 对齐 grok 1.0.x 官方 headless 示例与 vendor：
 * - `xai-grok-test-support` GrokStdioClient：initialize → authenticate → session/new
 * - pager `select_eager_auth_method`：defaultAuthMethodId → cached_token → first
 * - InitializeRequest.meta.clientType / clientVersion（agent 遥测读 meta，不是 clientInfo）
 *
 * Perigee 不声明 `terminal: true`：本仓终端是 node-pty，未实现 ACP `terminal/*`。
 */
export const PERIGEE_ACP_CLIENT_NAME = 'perigee'
export const PERIGEE_ACP_CLIENT_VERSION = '0.3.0'
/** 子进程 env `GROK_CLIENT_VERSION` */
export const PERIGEE_ACP_CLIENT_ID = `${PERIGEE_ACP_CLIENT_NAME}/${PERIGEE_ACP_CLIENT_VERSION}`

export type AcpAuthMethod = { id: string }

export type ParsedAuthMethods = {
  methods: AcpAuthMethod[]
  defaultAuthMethodId?: string
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function versionLabel(clientVersion?: string): string {
  const raw = (clientVersion ?? PERIGEE_ACP_CLIENT_ID).trim() || PERIGEE_ACP_CLIENT_ID
  return raw.replace(/^perigee\//, '')
}

export function buildInitializeParams(opts?: {
  clientVersion?: string
}): Record<string, unknown> {
  const version = versionLabel(opts?.clientVersion)
  return {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: false,
      _meta: {
        'x.ai/incrementalBashOutput': true,
        'x.ai/bashOutputNoColor': true
      }
    },
    clientInfo: {
      name: PERIGEE_ACP_CLIENT_NAME,
      version
    },
    _meta: {
      clientType: PERIGEE_ACP_CLIENT_NAME,
      clientSource: PERIGEE_ACP_CLIENT_NAME,
      clientVersion: version,
      startupHints: { nonInteractive: true }
    }
  }
}

function methodIdOf(item: unknown): string | undefined {
  if (typeof item === 'string' && item.trim()) return item.trim()
  const o = asRecord(item)
  if (!o) return undefined
  const id = o.id
  if (typeof id === 'string' && id.trim()) return id.trim()
  if (id && typeof id === 'object' && '0' in (id as object)) {
    const inner = String((id as { 0?: unknown })[0] ?? '')
    if (inner.trim()) return inner.trim()
  }
  return undefined
}

export function parseAuthMethods(initResult: unknown): ParsedAuthMethods {
  const r = asRecord(initResult) ?? {}
  const raw = r.authMethods ?? r.auth_methods
  const methods: AcpAuthMethod[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = methodIdOf(item)
      if (id) methods.push({ id })
    }
  }
  const meta = asRecord(r._meta) ?? asRecord(r.meta)
  const defaultRaw = meta?.defaultAuthMethodId ?? meta?.default_auth_method_id
  const defaultAuthMethodId =
    typeof defaultRaw === 'string' && defaultRaw.trim() ? defaultRaw.trim() : undefined
  return { methods, defaultAuthMethodId }
}

export function pickAuthMethodId(
  methods: AcpAuthMethod[],
  opts?: { defaultAuthMethodId?: string; hasApiKeyEnv?: boolean }
): string | null {
  if (!methods.length) return null
  const ids = new Set(methods.map((m) => m.id))
  const def = opts?.defaultAuthMethodId?.trim()
  if (def && ids.has(def)) return def
  if (ids.has('cached_token')) return 'cached_token'
  if (opts?.hasApiKeyEnv && ids.has('xai.api_key')) return 'xai.api_key'
  return methods[0]?.id ?? null
}

export function buildAuthenticateParams(methodId: string): Record<string, unknown> {
  return {
    methodId,
    _meta: { headless: true }
  }
}

export function buildSessionNewParams(opts: {
  cwd: string
  mcpServers: unknown[]
  modelId?: string
}): Record<string, unknown> {
  const params: Record<string, unknown> = {
    cwd: opts.cwd,
    mcpServers: opts.mcpServers
  }
  const modelId = opts.modelId?.trim()
  if (modelId) params._meta = { modelId }
  return params
}
