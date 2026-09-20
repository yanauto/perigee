import { DEFAULT_PORT } from '../../shared/constants'
import {
  grokCmdErrorText,
  type GrokCmdRequest,
  type GrokCmdResult
} from '../../shared/grok-cmd'

function emptyFail(error: string): GrokCmdResult {
  return {
    ok: false,
    code: 1,
    stdout: '',
    stderr: '',
    cwd: '',
    cwdSource: 'process',
    argv: [],
    error
  }
}

async function fetchGrokCmd(req: GrokCmdRequest): Promise<GrokCmdResult> {
  const last = DEFAULT_PORT + 12
  let saw = ''
  for (let port = DEFAULT_PORT; port <= last; port += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/grok/cmd`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req)
      })
      const json = (await res.json()) as GrokCmdResult
      if (json && typeof json === 'object') return json
    } catch (err) {
      saw = err instanceof Error ? err.message : String(err)
    }
  }
  return emptyFail(saw || '本机窗控制面没在听，钥匙页的开关发不出去。')
}

export async function runGrokCmd(args: string[], confirm = false): Promise<GrokCmdResult> {
  const api = window.workbench
  if (api && typeof api.grokCmd === 'function') {
    return api.grokCmd({ args, confirm })
  }
  return fetchGrokCmd({ args, confirm })
}

export function cmdText(result: GrokCmdResult): string {
  if (result.ok) {
    return (result.note || result.stdout || result.stderr || '好了。').trim()
  }
  return grokCmdErrorText(result)
}

export function askDanger(message: string): boolean {
  return window.confirm(message)
}
