import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export type JsonRpcMessage = {
  jsonrpc?: string
  id?: string | number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/**
 * NDJSON JSON-RPC 2.0 over child process stdio.
 * 出站：client → agent；入站：agent 响应 + 通知 + server→client 请求。
 */
export class JsonRpcStdio extends EventEmitter {
  private nextId = 1
  private pending = new Map<
    string | number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()
  private closed = false

  constructor(private child: ChildProcessWithoutNullStreams) {
    super()
    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => this.onLine(line))
    child.stderr.on('data', (buf: Buffer) => {
      this.emit('stderr', buf.toString('utf8'))
    })
    child.on('exit', (code, signal) => {
      this.closed = true
      for (const [, p] of this.pending) {
        p.reject(new Error(`process exited code=${code} signal=${signal}`))
      }
      this.pending.clear()
      this.emit('exit', code, signal)
      rl.close()
    })
    child.on('error', (err) => this.emit('error', err))
  }

  request(method: string, params?: unknown, timeoutMs = 120_000): Promise<unknown> {
    if (this.closed || !this.child.stdin.writable) {
      return Promise.reject(new Error('stdio closed'))
    }
    const id = this.nextId++
    const msg = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`rpc timeout ${method}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        }
      })
      this.child.stdin.write(`${JSON.stringify(msg)}\n`, (err) => {
        if (err) {
          this.pending.delete(id)
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }

  /** 响应 agent 发来的 server→client 请求 */
  respond(id: string | number, result: unknown): void {
    if (this.closed) return
    this.child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`
    )
  }

  respondError(id: string | number, code: number, message: string): void {
    if (this.closed) return
    this.child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`
    )
  }

  private onLine(line: string): void {
    if (!line.trim()) return
    let msg: JsonRpcMessage
    try {
      msg = JSON.parse(line) as JsonRpcMessage
    } catch {
      this.emit('parse_error', line)
      return
    }
    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined) && !msg.method) {
      const p = this.pending.get(msg.id)
      if (p) {
        this.pending.delete(msg.id)
        if (msg.error) {
          p.reject(
            new Error(
              `rpc error ${msg.error.code}: ${msg.error.message}${
                msg.error.data != null ? ` ${JSON.stringify(msg.error.data)}` : ''
              }`
            )
          )
        } else {
          p.resolve(msg.result)
        }
      }
      return
    }
    if (msg.method && msg.id != null) {
      // server → client request
      this.emit('server_request', msg)
      return
    }
    if (msg.method) {
      this.emit('notification', msg.method, msg.params)
    }
  }
}
