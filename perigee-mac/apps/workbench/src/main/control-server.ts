import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAgentPermMode, parsePlanFlag } from '../shared/agent-mode'
import { CONTROL_FILE, DATA_DIR, DEFAULT_PORT, PRODUCT_NAME } from '../shared/constants'
import { PRIMARY_PAGES } from '../shared/pages'
import { registerGrokCmdRoutes } from './grok-cmd'
import { registerInspectRoutes } from './grok-inspect'
import { registerSessionListRoutes } from './grok-sessions'
import type { Store } from './store'

export type ControlHandlers = {
  store: Store
  shot: (pageId?: string) => Promise<string>
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data)
  })
  res.end(data)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let n = 0
    req.on('data', (c: Buffer) => {
      n += c.length
      if (n > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function parseJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = (await readBody(req)).trim()
  if (!raw) return {}
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') return {}
  return parsed as Record<string, unknown>
}

export async function startControlServer(handlers: ControlHandlers): Promise<number> {
  const preferred = Number(process.env.WORKBENCH_PORT) || DEFAULT_PORT
  const server = createServer(async (req, res) => {
    try {
      const host = req.headers.host || `127.0.0.1:${preferred}`
      const url = new URL(req.url || '/', `http://${host}`)
      const method = req.method || 'GET'

      if (method === 'GET' && url.pathname === '/status') {
        const state = handlers.store.get()
        json(res, 200, {
          ok: true,
          product: PRODUCT_NAME,
          pid: process.pid,
          ready: state.ready,
          shown: state.shown,
          page: state.page,
          sessions: state.sessions.length,
          sessionList: state.sessions
            .filter((s) => !s.kind || s.kind === 'chat')
            .map((s) => ({
              id: s.id,
              title: s.title,
              status: s.status ?? 'idle',
              unread: s.unread === true,
              pending: !!s.pendingAsk,
              workspacePath: s.workspacePath ?? null,
              cliSessionId: s.cliSessionId ?? null,
              worktreeLabel: s.worktreeLabel ?? null
            })),
          activeSessionId: state.activeSessionId,
          signedIn: state.account.signedIn,
          email: state.account.email,
          pendingEmail: state.pendingEmail,
          plan: state.account.plan,
          modal: state.modal,
          tab: state.agentTab,
          phase: state.setupPhase,
          desktopFull: state.desktopFull,
          mcp: state.grok.mcp,
          flyby: state.grok.flyby,
          workspace: state.workspace.path,
          workspaceName: state.workspace.name,
          agentMode: state.agent.mode,
          planMode: state.agent.plan,
          cliMode: state.agent.cliMode,
          followCli: state.agent.followCli,
          coverNote: state.agent.coverNote,
          model: state.models?.current ?? '',
          modelDefault: state.models?.defaultModel ?? '',
          modelFollowCli: state.models?.followCli === true,
          modelApply: state.models?.liveApply ?? '',
          worktrees: state.worktrees.items.length,
          worktreeError: state.worktrees.error,
          routines: state.routines.items.map((r) => ({
            id: r.id,
            name: r.name,
            cron: r.cron,
            enabled: r.enabled,
            running: r.running,
            nextRunAt: r.nextRunAt,
            lastRunAt: r.lastRunAt,
            lastStatus: r.lastStatus,
            lastSessionId: r.lastSessionId
          }))
        })
        return
      }

      if (method === 'GET' && url.pathname === '/pages') {
        json(res, 200, { ok: true, pages: PRIMARY_PAGES })
        return
      }

      if (method === 'GET' && url.pathname === '/state') {
        json(res, 200, { ok: true, state: handlers.store.get() })
        return
      }

      if (method === 'POST' && url.pathname === '/goto') {
        const body = await parseJson(req)
        const id = String(body.id ?? '')
        const extra = body.extra == null || String(body.extra) === '' ? undefined : String(body.extra)
        const state = handlers.store.goto(id, extra)
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/send') {
        const body = await parseJson(req)
        const text = String(body.text ?? '')
        const state = await handlers.store.submit(text)
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/new') {
        const state = handlers.store.newAgent()
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/open') {
        const body = await parseJson(req)
        const state = handlers.store.openSession(String(body.id ?? ''))
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/resume') {
        const body = await parseJson(req)
        const state = await handlers.store.resumeCli(String(body.id ?? ''))
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/cancel') {
        const body = await parseJson(req)
        const id = body.id == null || String(body.id) === '' ? undefined : String(body.id)
        const state = await handlers.store.cancel(id)
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/allow') {
        const body = await parseJson(req)
        const id = body.id == null || String(body.id) === '' ? undefined : String(body.id)
        const state = handlers.store.allow(id)
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/deny') {
        const body = await parseJson(req)
        const id = body.id == null || String(body.id) === '' ? undefined : String(body.id)
        const state = handlers.store.deny(id)
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/enter') {
        const body = await parseJson(req)
        const email = String(body.email ?? '')
        const raw = body.code
        const code = raw == null || String(raw) === '' ? undefined : String(raw)
        const state = handlers.store.enter(email, code)
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/routine/add') {
        const body = await parseJson(req)
        const state = handlers.store.addRoutine({
          name: String(body.name ?? ''),
          instruction: String(body.instruction ?? ''),
          cron: String(body.cron ?? '')
        })
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'GET' && url.pathname === '/routine/list') {
        const state = handlers.store.get()
        json(res, 200, { ok: true, routines: state.routines, state })
        return
      }

      if (method === 'POST' && url.pathname === '/routine/run') {
        const body = await parseJson(req)
        const state = await handlers.store.runRoutine(String(body.id ?? ''))
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/routine/toggle') {
        const body = await parseJson(req)
        const state = handlers.store.toggleRoutine(String(body.id ?? ''), body.enabled !== false)
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/routine/remove') {
        const body = await parseJson(req)
        const state = handlers.store.removeRoutine(String(body.id ?? ''))
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'GET' && url.pathname === '/workspace') {
        const ws = handlers.store.get().workspace
        json(res, 200, { ok: true, path: ws.path, name: ws.name, workspace: ws })
        return
      }

      if (method === 'POST' && url.pathname === '/workspace') {
        const body = await parseJson(req)
        const raw = body.path
        const path = raw == null || String(raw) === '' ? null : String(raw)
        const state = handlers.store.setWorkspace(path)
        json(res, 200, { ok: true, path: state.workspace.path, name: state.workspace.name, state })
        return
      }

      if (method === 'GET' && url.pathname === '/mode') {
        const a = handlers.store.get().agent
        json(res, 200, { ok: true, ...a, state: handlers.store.get() })
        return
      }

      if (method === 'POST' && url.pathname === '/mode') {
        const body = await parseJson(req)
        const raw = body.mode ?? body.perm ?? body.value
        if (raw === 'cli' || raw === 'reset' || raw === 'follow') {
          const state = handlers.store.followCliMode()
          json(res, 200, { ok: true, ...state.agent, state })
          return
        }
        const mode = parseAgentPermMode(raw)
        if (!mode) throw new Error('用法：mode ask|auto|always-approve|cli')
        const state = handlers.store.setAgentMode(mode)
        json(res, 200, { ok: true, ...state.agent, state })
        return
      }

      if (method === 'GET' && url.pathname === '/plan') {
        const a = handlers.store.get().agent
        json(res, 200, { ok: true, ...a, state: handlers.store.get() })
        return
      }

      if (method === 'GET' && url.pathname === '/model') {
        const m = handlers.store.get().models
        json(res, 200, { ok: true, ...m, state: handlers.store.get() })
        return
      }

      if (method === 'POST' && url.pathname === '/model') {
        const body = await parseJson(req)
        const raw = String(body.model ?? body.value ?? body.id ?? '').trim()
        if (!raw) throw new Error('用法：model <id>|cli')
        if (raw === 'cli' || raw === 'reset' || raw === 'default') {
          const state = await handlers.store.followCliModel()
          json(res, 200, { ok: true, ...state.models, state })
          return
        }
        if (raw === 'refresh') {
          const state = await handlers.store.refreshModels()
          json(res, 200, { ok: true, ...state.models, state })
          return
        }
        const state = await handlers.store.setAgentModel(raw)
        json(res, 200, { ok: true, ...state.models, state })
        return
      }

      if (method === 'POST' && url.pathname === '/plan') {
        const body = await parseJson(req)
        const raw = body.plan ?? body.on ?? body.value
        const on = typeof raw === 'boolean' ? raw : parsePlanFlag(raw)
        if (on == null) throw new Error('用法：plan on|off')
        const next = handlers.store.setAgentPlan(on)
        json(res, 200, { ok: true, ...next.agent, state: next })
        return
      }

      if (method === 'GET' && url.pathname === '/worktree') {
        const state = await handlers.store.refreshWorktrees()
        json(res, 200, { ok: true, worktrees: state.worktrees, state })
        return
      }

      if (method === 'POST' && url.pathname === '/worktree/new') {
        const body = await parseJson(req)
        const label = body.label == null || String(body.label) === '' ? undefined : String(body.label)
        const state = await handlers.store.startIsolated(label)
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/worktree/open') {
        const body = await parseJson(req)
        const state = await handlers.store.openWorktree(String(body.path ?? ''))
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/worktree/housekeep') {
        const body = await parseJson(req)
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
        const extra = Array.isArray(body.extra) ? body.extra.map(String) : []
        const state = await handlers.store.housekeepWorktree({
          action: String(body.action ?? ''),
          ids,
          extra,
          confirm: body.confirm === true
        })
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/fork') {
        const body = await parseJson(req)
        const id = body.id == null || String(body.id) === '' ? undefined : String(body.id)
        const isolate = body.isolate === true || body.worktree === true
        const state = await handlers.store.forkSession({ id, isolate })
        json(res, 200, { ok: true, state })
        return
      }

      if (method === 'POST' && url.pathname === '/shot') {
        const body = await parseJson(req)
        const id = body.id ? String(body.id) : undefined
        const path = await handlers.shot(id)
        json(res, 200, { ok: true, path })
        return
      }

      json(res, 404, { ok: false, error: 'not found' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      json(res, 400, { ok: false, error: message })
    }
  })

  const port = await listenLoop(server, preferred)
  writeControl(port)
  registerInspectRoutes({ server, getCwd: () => handlers.store.get().workspace.path })
  registerGrokCmdRoutes({ server, getCwd: () => handlers.store.get().workspace.path })
  registerSessionListRoutes({
    server,
    getCwd: () => handlers.store.get().workspace.path,
    resumeCli: (id) => handlers.store.resumeCli(id),
    renameLocal: (id, title) => handlers.store.renameLocalTitle(id, title),
    dropCli: (id) => handlers.store.dropCliSession(id)
  })
  return port
}

function listenLoop(
  server: ReturnType<typeof createServer>,
  start: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = start
    const max = start + 30

    const tryListen = () => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.off('listening', onListening)
        if (err.code === 'EADDRINUSE' && port < max) {
          port += 1
          tryListen()
          return
        }
        reject(err)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve(port)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, '127.0.0.1')
    }

    tryListen()
  })
}

export function writeControl(port: number): void {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(
    CONTROL_FILE,
    `${JSON.stringify(
      {
        host: '127.0.0.1',
        port,
        pid: process.pid,
        shown: process.env.WORKBENCH_SHOW === '1'
      },
      null,
      2
    )}\n`
  )
}

export function shotPath(page: string): string {
  mkdirSync(DATA_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(DATA_DIR, `${page}-${stamp}.png`)
}
