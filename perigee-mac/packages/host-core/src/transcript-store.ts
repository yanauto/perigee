import { appendFileSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionEvent } from '@perigee/event-schema'

export class TranscriptStore {
  /** delta 批合：sessionId → 待刷行 */
  private pendingLines = new Map<string, string[]>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly flushMs: number

  constructor(
    private baseDir: string,
    opts?: { flushMs?: number }
  ) {
    mkdirSync(baseDir, { recursive: true })
    this.flushMs = opts?.flushMs ?? 40
  }

  pathFor(sessionId: string): string {
    return join(this.baseDir, `${sessionId}.jsonl`)
  }

  /**
   * 追加事件。高频 assistant.delta / thought.delta 批合刷盘（审计 C2-01），
   * 其它类型立即 flush 该会话，保证关键边界落盘。
   */
  append(sessionId: string, event: SessionEvent): void {
    const line = `${JSON.stringify(event)}\n`
    const highFreq =
      event.type === 'assistant.delta' || event.type === 'thought.delta'
    if (!highFreq) {
      this.flushSession(sessionId)
      appendFileSync(this.pathFor(sessionId), line, 'utf8')
      return
    }
    let buf = this.pendingLines.get(sessionId)
    if (!buf) {
      buf = []
      this.pendingLines.set(sessionId, buf)
    }
    buf.push(line)
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.flushAll()
      }, this.flushMs)
    }
  }

  /** 同步刷盘（删除会话 / 进程退出前调用） */
  flushSession(sessionId: string): void {
    const buf = this.pendingLines.get(sessionId)
    if (!buf?.length) {
      this.pendingLines.delete(sessionId)
      return
    }
    this.pendingLines.delete(sessionId)
    appendFileSync(this.pathFor(sessionId), buf.join(''), 'utf8')
  }

  flushAll(): void {
    for (const id of [...this.pendingLines.keys()]) this.flushSession(id)
  }

  /**
   * T030：物理删除该会话的 transcript（确认删除 = 物理删除）。
   * 安全闸：只删本 store 目录下 `<id>.jsonl` 这一个文件，id 必须是单段安全名。
   */
  remove(sessionId: string): boolean {
    const id = (sessionId ?? '').trim()
    if (!id || !/^[A-Za-z0-9._-]+$/.test(id) || id === '.' || id === '..') return false
    this.pendingLines.delete(id)
    const p = this.pathFor(id)
    if (!existsSync(p)) return false
    rmSync(p, { force: true })
    return true
  }

  readAll(sessionId: string): SessionEvent[] {
    this.flushSession(sessionId)
    const p = this.pathFor(sessionId)
    if (!existsSync(p)) return []
    return readFileSync(p, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionEvent)
  }

  exportMarkdown(sessionId: string, title: string): string {
    const events = this.readAll(sessionId)
    const lines = [`# ${title}`, '', `session: \`${sessionId}\``, '']
    for (const ev of events) {
      if (ev.type === 'user.message') {
        lines.push('## User', '', ev.text, '')
      } else if (ev.type === 'assistant.message') {
        lines.push('## Assistant', '', ev.text, '')
      } else if (ev.type === 'tool.call') {
        lines.push(
          `### Tool \`${ev.name}\``,
          '',
          '```json',
          JSON.stringify(ev.args, null, 2),
          '```',
          ''
        )
      } else if (ev.type === 'tool.result') {
        lines.push(
          `#### Result (${ev.ok ? 'ok' : 'fail'})`,
          '',
          '```',
          typeof ev.result === 'string' ? ev.result : JSON.stringify(ev.result, null, 2),
          '```',
          ''
        )
      }
    }
    return lines.join('\n')
  }

  writeExport(sessionId: string, title: string, destPath: string): string {
    const md = this.exportMarkdown(sessionId, title)
    writeFileSync(destPath, md, 'utf8')
    return destPath
  }
}
