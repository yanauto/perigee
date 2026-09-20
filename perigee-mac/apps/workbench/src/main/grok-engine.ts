/**
 * 新壳 → 本机 Grok ACP。只接开口：建会话、映气泡。不抄旧桌面 IPC。
 */
import { spawn } from 'node:child_process'
import { GrokAcpEngine, PERIGEE_ACP_CLIENT_ID, type DesktopMcpServer } from '@perigee/engine-grok-acp'
import { resolveGrokBinary, type PermissionPolicy } from '@perigee/engine-protocol'
import type { SessionEvent } from '@perigee/event-schema'
import { loadGrokConfigSnapshot, probeGcu, resolveMcpServersForAcp } from '@perigee/host-core'
import type { ChatStatus, FlybyProbe, GrokProbe, PendingAsk, StreamHint } from '../shared/types'
import {
  createOfficialWorktree,
  forkOfficialSession,
  type CreatedWorktree,
  type ForkedSession
} from './grok-worktree'

export const NO_GROK_TEXT = '本机没有 Grok CLI。装好本机 Grok 后再发。'
export const CANCELLED_TEXT = '这一轮已取消'
export const NO_FLYBY_MCP_TEXT = '本机 Grok 配置里没有 Flyby（grok-computer-use），读不了页。'

const FLYBY_CLICK_RE =
  /page_click|page_type|page_press|page_fill|page_select|page_upload|page_hover|page_drag|page_evaluate|clipboard_write/i
const FLYBY_HINT_RE =
  /浏览器|browser_|tabs_|page_|windows_|workspace_|flyby|computer-use|\bgcu\b/i
const PAGE_READ_RE =
  /https?:\/\/|(读|打开).{0,24}(页|标题|网站|网址)|读.{0,12}标题|page title|\bflyby\b/i

function isDesktopCu(s: { name: string; command?: string }): boolean {
  return /desktop-computer-use|desktop-cu|screen-companion/i.test(`${s.name} ${s.command ?? ''}`)
}

function mcpServersFromSnapshot(): DesktopMcpServer[] {
  const snap = loadGrokConfigSnapshot({ preferCliList: false })
  const mapped = snap.mcpServers
    .filter((s) => !isDesktopCu(s))
    .map((s) => ({
      name: s.name,
      command: s.command || s.url || '',
      enabled: s.enabled,
      args: s.args,
      env: s.env,
      headers: s.headers,
      url: s.url,
      type: (s.url ? 'http' : 'stdio') as 'http' | 'stdio'
    }))
  return resolveMcpServersForAcp(mapped)
}

function isFlybyServer(s: DesktopMcpServer): boolean {
  return (
    s.enabled &&
    (s.name === 'grok-computer-use' ||
      s.name === 'gcu' ||
      /computer-use|flyby|gcu-bridge/i.test(`${s.name} ${s.command} ${s.url ?? ''}`))
  )
}

function wantsPageRead(text: string): boolean {
  return PAGE_READ_RE.test(text)
}

function shouldAutoAllowFlyby(action: string, detail: string): boolean {
  const h = `${action} ${detail}`
  if (!FLYBY_HINT_RE.test(h)) return false
  if (FLYBY_CLICK_RE.test(h)) return false
  return true
}

function flybyFromProbe(): Promise<FlybyProbe> {
  return probeGcu().then((p) => ({
    ok: p.ok,
    bridgeUp: p.bridgeUp,
    extensionConnected: p.extensionConnected,
    detail: p.detail
  }))
}

export function flybyDownText(flyby: FlybyProbe): string {
  if (!flyby.bridgeUp) {
    return 'Flyby 没在跑，读不了页。本机 127.0.0.1:19527 没有 bridge。'
  }
  if (!flyby.extensionConnected) {
    return 'Flyby bridge 在，但 Chrome 扩展没连上，读不了页。'
  }
  return `Flyby 读不了页。${flyby.detail}`
}

export type ChatSink = {
  addUser(sessionId: string, text: string): string
  addAssistant(sessionId: string, text: string): string
  appendAssistant(sessionId: string, messageId: string, chunk: string): void
  replaceMessage(sessionId: string, messageId: string, text: string): void
  setSessionStatus(sessionId: string, status: ChatStatus): void
  setPendingAsk(sessionId: string, ask: PendingAsk | null): void
  bindCliSessionId(sessionId: string, cliId: string): void
  noteStreamHint(sessionId: string, hint: StreamHint): void
}

export type GrokBridge = {
  talk: (sessionId: string, text: string, workspacePath: string) => Promise<void>
  resume: (sessionId: string, cliSessionId: string, workspacePath: string) => Promise<void>
  cancel: (sessionId: string) => Promise<void>
  resolve: (sessionId: string, engineRequestId: string, approved: boolean) => void
  /** 记下引擎档；活会话尽量 session/set_mode，下一轮生效 */
  applyPolicy: (policy: PermissionPolicy) => string
  /** 记下模型；活会话 session/set_model，新开会话走 session/new _meta.modelId */
  applyModel: (modelId: string) => Promise<string>
  applyEffort: (effort: string) => Promise<string>
  applySandbox: (profile: string) => string
  currentModel: () => string
  /** 只握手 session/new，不发句子。cwd 可以是官方 worktree 路径（grok -w 的桌面等价） */
  ensure: (sessionId: string, workspacePath: string) => Promise<void>
  /** 官方 ACP x.ai/git/worktree/create_from_worktree_sync（桌面等价 grok -w） */
  createWorktree: (opts: { sourcePath: string; label?: string }) => Promise<CreatedWorktree>
  /** 官方 ACP x.ai/session/fork（--fork-session） */
  forkSession: (opts: {
    sourceSessionId: string
    sourceCwd: string
    newCwd: string
    sessionKind?: string
    sourceWorkspaceDir?: string
  }) => Promise<ForkedSession>
}

type Turn = {
  assistantId: string | null
  tools: Map<string, string>
  toolNames: Map<string, string>
  lastToolId: string | null
  abort: (() => void) | null
}

function sanitize(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9]+/g, 'sk-…')
    .replace(/xai-[A-Za-z0-9_-]+/g, 'xai-…')
    .replace(/Bearer\s+\S+/gi, 'Bearer …')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'apikey=…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function clip(text: string): string {
  const t = sanitize(text)
  return t.length > 80 ? `${t.slice(0, 79)}…` : t
}

function shortResult(result: unknown): string {
  if (result == null) return ''
  if (typeof result === 'string') return clip(result)
  if (typeof result === 'object') {
    const o = result as Record<string, unknown>
    if (typeof o.output === 'string') return clip(o.output)
    if (typeof o.text === 'string') return clip(o.text)
    if (typeof o.content === 'string') return clip(o.content)
  }
  try {
    return clip(JSON.stringify(result))
  } catch {
    return ''
  }
}

export function publicError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return sanitize(raw) || 'Grok 这一轮失败了'
}

function parseRpcLine(line: string): {
  id?: number
  result?: Record<string, unknown>
  error?: { message?: string }
} | null {
  const t = line.trim()
  if (!t.startsWith('{')) return null
  try {
    const msg = JSON.parse(t) as {
      id?: number
      result?: Record<string, unknown>
      error?: { message?: string }
    }
    return msg && typeof msg === 'object' ? msg : null
  } catch {
    return null
  }
}

/** 只握手 initialize，不建会话、不发句子。 */
function probeAcpInitialize(bin: string, timeoutMs = 15000): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    let settled = false
    const child = spawn(bin, ['--no-auto-update', 'agent', 'stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' }
    })

    const finish = (ok: boolean, detail: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill('SIGTERM')
      } catch {
        /* */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          /* */
        }
      }, 400)
      resolve({ ok, detail })
    }

    const timer = setTimeout(() => finish(false, 'initialize 超时'), timeoutMs)
    child.on('error', (err) => finish(false, sanitize(err.message)))
    child.on('exit', (code) => {
      if (!settled) finish(false, `进程退出 code=${code ?? '?'}`)
    })

    let buf = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const msg = parseRpcLine(line)
        if (!msg || msg.id !== 1) continue
        if (msg.error) {
          finish(false, sanitize(String(msg.error.message ?? 'initialize 失败')))
          return
        }
        const pv = msg.result?.protocolVersion
        finish(true, pv != null ? `initialize ok  protocol=${String(pv)}` : 'initialize ok')
      }
    })

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: false
        },
        clientInfo: { name: 'perigee', version: 'workbench-probe' },
        _meta: {
          clientType: 'perigee',
          clientSource: 'perigee',
          clientVersion: 'workbench-probe',
          startupHints: { nonInteractive: true }
        }
      }
    }
    child.stdin.write(`${JSON.stringify(req)}\n`, (err) => {
      if (err) finish(false, sanitize(err.message))
    })
  })
}

export async function probeGrok(): Promise<GrokProbe> {
  const bin = resolveGrokBinary()
  const cli = GrokAcpEngine.isAvailable(bin)
  const snap = loadGrokConfigSnapshot({ preferCliList: false })
  const mcp = mcpServersFromSnapshot()
    .filter((s) => s.enabled)
    .map((s) => s.name)
  const flyby = await flybyFromProbe()
  if (!cli) {
    return { cli: false, acp: false, acpDetail: '没有 grok', hasConfig: snap.exists, mcp, flyby }
  }
  const acp = await probeAcpInitialize(bin)
  return { cli: true, acp: acp.ok, acpDetail: acp.detail, hasConfig: snap.exists, mcp, flyby }
}

export function attachGrok(
  store: ChatSink,
  policyOf: () => PermissionPolicy,
  modelOf: () => string,
  extras?: { effortOf?: () => string; sandboxOf?: () => string }
): GrokBridge {
  let engine: GrokAcpEngine | null = null
  const turns = new Map<string, Turn>()
  const aborted = new Set<string>()

  function currentPolicy(): PermissionPolicy {
    return policyOf()
  }

  function currentModelId(): string {
    return modelOf().trim()
  }

  function turnOf(sessionId: string): Turn {
    let t = turns.get(sessionId)
    if (!t) {
      t = { assistantId: null, tools: new Map(), toolNames: new Map(), lastToolId: null, abort: null }
      turns.set(sessionId, t)
    }
    return t
  }

  function mapEvent(event: SessionEvent): void {
    const sid = event.sessionId
    const turn = turnOf(sid)
    if (aborted.has(sid) && event.type !== 'session.status') return

    switch (event.type) {
      case 'user.message': {
        if (event.text.trim()) store.addUser(sid, event.text)
        turn.assistantId = null
        turn.tools.clear()
        turn.toolNames.clear()
        turn.lastToolId = null
        return
      }
      case 'assistant.delta': {
        store.noteStreamHint(sid, 'delta')
        if (!turn.assistantId) {
          turn.assistantId = store.addAssistant(sid, event.text)
        } else {
          store.appendAssistant(sid, turn.assistantId, event.text)
        }
        return
      }
      case 'assistant.message': {
        store.noteStreamHint(sid, 'batch')
        if (!turn.assistantId) {
          turn.assistantId = store.addAssistant(sid, event.text)
        } else {
          store.replaceMessage(sid, turn.assistantId, event.text)
        }
        // 回放可能有多轮：这一轮助手句落地后，下一轮另开气泡
        turn.assistantId = null
        return
      }
      case 'turn.end': {
        if (event.engineSessionId) store.bindCliSessionId(sid, event.engineSessionId)
        return
      }
      case 'lifecycle': {
        if (event.name === 'session.load.ok' && event.detail && typeof event.detail === 'object') {
          const d = event.detail as Record<string, unknown>
          const cli =
            (typeof d.engineSessionId === 'string' && d.engineSessionId) ||
            (typeof d.cliSessionId === 'string' && d.cliSessionId) ||
            ''
          if (cli) store.bindCliSessionId(sid, cli)
        }
        return
      }
      case 'tool.call': {
        const name = event.name || '工具'
        const id = store.addAssistant(sid, `工具 · ${name}`)
        if (event.callId) {
          turn.tools.set(event.callId, id)
          turn.toolNames.set(event.callId, name)
        }
        turn.lastToolId = id
        return
      }
      case 'tool.result': {
        const id = turn.tools.get(event.callId) ?? turn.lastToolId
        const name = turn.toolNames.get(event.callId)
        const bit = shortResult(event.result)
        const prefix = name ? `工具 · ${name}` : '工具'
        const line = event.ok
          ? bit
            ? `${prefix} · 完成 · ${bit}`
            : `${prefix} · 完成`
          : bit
            ? `${prefix} · 失败 · ${bit}`
            : `${prefix} · 失败`
        if (id) store.replaceMessage(sid, id, line)
        else store.addAssistant(sid, line)
        return
      }
      case 'error': {
        if (aborted.has(sid)) return
        store.addAssistant(sid, publicError(event.message))
        return
      }
      case 'session.status': {
        if (aborted.has(sid)) {
          store.setSessionStatus(sid, 'idle')
          return
        }
        if (event.status === 'waiting_approval') {
          store.setSessionStatus(sid, 'waiting')
        } else if (event.status === 'streaming' || event.status === 'tool_running') {
          store.setSessionStatus(sid, 'streaming')
        } else if (event.status === 'error') {
          store.setSessionStatus(sid, 'error')
        } else {
          store.setSessionStatus(sid, 'idle')
        }
        return
      }
      case 'plan': {
        const raw = event.entries
        let text = '计划'
        if (typeof raw === 'string' && raw.trim()) text = raw
        else {
          try {
            const dumped = JSON.stringify(raw, null, 2)
            if (dumped && dumped !== 'null') text = dumped.slice(0, 4000)
          } catch {
            /* */
          }
        }
        store.addAssistant(sid, `计划\n${text}`)
        return
      }
      case 'subagent.spawned': {
        store.addAssistant(
          sid,
          `子 agent · ${event.subagentType || 'general-purpose'}${event.description ? ` · ${event.description}` : ''}`
        )
        return
      }
      case 'subagent.finished': {
        store.addAssistant(
          sid,
          `子 agent 结束 · ${event.status || 'done'}${event.error ? ` · ${event.error}` : ''}`
        )
        return
      }
      case 'approval.requested': {
        const action = sanitize(event.action || '这项操作')
        const detail = sanitize(event.detail || '')
        const engineRequestId = String(event.engineRequestId ?? event.id)
        if (engine && shouldAutoAllowFlyby(action, detail)) {
          engine.acp.resolvePermission(sid, engineRequestId, true)
          store.setSessionStatus(sid, 'streaming')
          return
        }
        const line = `要你批准才能继续 · ${action}`
        const bubbleId = store.addAssistant(sid, line)
        store.setPendingAsk(sid, {
          id: event.id,
          engineRequestId,
          action,
          detail,
          bubbleId
        })
        store.setSessionStatus(sid, 'waiting')
        return
      }
      default:
        return
    }
  }

  function ensureEngine(bin: string): GrokAcpEngine {
    const want = currentPolicy()
    const wantModel = currentModelId()
    if (!engine) {
      engine = new GrokAcpEngine({
        binary: bin,
        clientVersion: PERIGEE_ACP_CLIENT_ID,
        permissionPolicy: want,
        model: wantModel || undefined,
        sandbox: extras?.sandboxOf?.() || undefined,
        mcpServers: mcpServersFromSnapshot()
      })
      engine.onEvent(mapEvent)
      return engine
    }
    if (engine.getPermissionPolicy() !== want) {
      engine.setPermissionPolicy(want)
    }
    if (wantModel && engine.getModel() !== wantModel) {
      void engine.setModel(wantModel, { reasoningEffort: extras?.effortOf?.() || undefined })
    }
    return engine
  }

  function applyPolicy(policy: PermissionPolicy): string {
    if (!engine) {
      return '无活会话，下次新开引擎会话后生效'
    }
    engine.setPermissionPolicy(policy)
    return '已记下。活会话会尽量 session/set_mode，下一轮生效；正在跑的这一轮不改'
  }

  async function applyModel(modelId: string): Promise<string> {
    const id = modelId.trim()
    if (!engine) {
      return id
        ? `无活会话。下一轮 session/new 会带 ${id}（ACP _meta.modelId + set_model）`
        : '无活会话，下次新开会话跟 CLI 默认'
    }
    const r = await engine.setModel(id, { reasoningEffort: extras?.effortOf?.() || undefined })
    if (!id) return r.detail
    return r.ok
      ? r.detail
      : `session/set_model 没加上：${r.detail}。下一轮仍会在 session/new 带 ${id}`
  }

  async function applyEffort(effort: string): Promise<string> {
    const id = currentModelId()
    if (!engine) {
      return effort ? `无活会话。下一轮会带 effort=${effort}` : '无活会话，下次新开会话跟 CLI'
    }
    if (!id) return '先选模型再设 effort'
    const r = await engine.setModel(id, { reasoningEffort: effort || undefined })
    return r.ok ? r.detail : `effort 没加上：${r.detail}`
  }

  function applySandbox(profile: string): string {
    engine = null
    return profile
      ? `沙箱 ${profile}：下一轮新开会话走 GROK_SANDBOX（官方 --sandbox）。活着的这一轮不改。`
      : '沙箱关。下一轮新开会话不再设 GROK_SANDBOX。'
  }

  async function talk(sessionId: string, text: string, workspacePath: string): Promise<void> {
    aborted.delete(sessionId)
    turns.set(sessionId, {
      assistantId: null,
      tools: new Map(),
      toolNames: new Map(),
      lastToolId: null,
      abort: null
    })
    store.setSessionStatus(sessionId, 'streaming')
    store.setPendingAsk(sessionId, null)

    const bin = resolveGrokBinary()
    if (!GrokAcpEngine.isAvailable(bin)) {
      store.addAssistant(sessionId, NO_GROK_TEXT)
      store.setSessionStatus(sessionId, 'error')
      return
    }

    if (wantsPageRead(text)) {
      const mcp = mcpServersFromSnapshot()
      if (!mcp.some(isFlybyServer)) {
        store.addAssistant(sessionId, NO_FLYBY_MCP_TEXT)
        store.setSessionStatus(sessionId, 'error')
        return
      }
      const flyby = await flybyFromProbe()
      if (!flyby.ok) {
        store.addAssistant(sessionId, flybyDownText(flyby))
        store.setSessionStatus(sessionId, 'error')
        return
      }
    }

    const turn = turnOf(sessionId)
    const abortedP = new Promise<void>((resolve) => {
      turn.abort = resolve
    })

    try {
      const acp = ensureEngine(bin)
      const model = currentModelId()
      await acp.startSession({
        sessionId,
        workspacePath,
        meta: {
          permissionPolicy: currentPolicy(),
          ...(model ? { model } : {})
        }
      })
      if (aborted.has(sessionId)) {
        await acp.cancel(sessionId)
        return
      }
      const outcome = await Promise.race([
        acp.send(sessionId, { text }).then(() => 'ok' as const),
        abortedP.then(() => 'abort' as const)
      ])
      if (outcome === 'abort' || aborted.has(sessionId)) return
    } catch (err) {
      if (aborted.has(sessionId)) return
      store.addAssistant(sessionId, publicError(err))
      store.setSessionStatus(sessionId, 'error')
    }
  }

  async function ensure(sessionId: string, workspacePath: string): Promise<void> {
    aborted.delete(sessionId)
    const bin = resolveGrokBinary()
    if (!GrokAcpEngine.isAvailable(bin)) {
      throw new Error(NO_GROK_TEXT)
    }
    const acp = ensureEngine(bin)
    const model = currentModelId()
    await acp.startSession({
      sessionId,
      workspacePath,
      meta: {
        permissionPolicy: currentPolicy(),
        ...(model ? { model } : {})
      }
    })
  }

  async function resume(
    sessionId: string,
    cliSessionId: string,
    workspacePath: string
  ): Promise<void> {
    aborted.delete(sessionId)
    turns.set(sessionId, {
      assistantId: null,
      tools: new Map(),
      toolNames: new Map(),
      lastToolId: null,
      abort: null
    })
    store.setSessionStatus(sessionId, 'streaming')
    store.setPendingAsk(sessionId, null)

    const bin = resolveGrokBinary()
    if (!GrokAcpEngine.isAvailable(bin)) {
      throw new Error(NO_GROK_TEXT)
    }

    const acp = ensureEngine(bin)
    // 已挂上的 ACP 会话再 load 是空操作，旧气泡不会再回放
    if (typeof acp.disposeSession === 'function') {
      await acp.disposeSession(sessionId)
    }
    await acp.loadSession({ sessionId, workspacePath, cliSessionId })
    if (aborted.has(sessionId)) {
      await acp.cancel(sessionId)
      return
    }
    store.setSessionStatus(sessionId, 'idle')
  }

  async function cancel(sessionId: string): Promise<void> {
    aborted.add(sessionId)
    turns.get(sessionId)?.abort?.()
    if (engine) {
      await engine.cancel(sessionId)
    }
  }

  function resolve(sessionId: string, engineRequestId: string, approved: boolean): void {
    if (!engine) return
    engine.acp.resolvePermission(sessionId, engineRequestId, approved)
  }

  return {
    talk,
    resume,
    cancel,
    resolve,
    applyPolicy,
    applyModel,
    applyEffort,
    applySandbox,
    currentModel: () => engine?.getModel() ?? currentModelId(),
    ensure,
    createWorktree: (opts) => createOfficialWorktree(opts),
    forkSession: (opts) => forkOfficialSession(opts)
  }
}
