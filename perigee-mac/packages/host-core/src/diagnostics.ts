import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  copyFileSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'

export interface DiagnosticsBundleInput {
  userDataDir: string
  outDir: string
  settings: unknown
  sessionsMeta: unknown
  engineInfo: unknown
  extraNotes?: string
}

/** 导出诊断包（脱敏 settings，不含 auth 密钥） */
export function exportDiagnostics(input: DiagnosticsBundleInput): string {
  mkdirSync(input.outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(input.outDir, `perigee-diag-${stamp}`)
  mkdirSync(dir, { recursive: true })

  const safeSettings = redact(input.settings)
  writeFileSync(join(dir, 'settings.redacted.json'), JSON.stringify(safeSettings, null, 2))
  writeFileSync(join(dir, 'sessions-meta.json'), JSON.stringify(input.sessionsMeta, null, 2))
  writeFileSync(join(dir, 'engine-info.json'), JSON.stringify(input.engineInfo, null, 2))
  writeFileSync(
    join(dir, 'README.txt'),
    [
      'Perigee diagnostics bundle',
      `created: ${new Date().toISOString()}`,
      'settings.redacted.json — secrets stripped',
      'sessions-meta.json — session list only',
      'engine-info.json — engine mode / grok version',
      input.extraNotes ?? ''
    ].join('\n')
  )

  // 拷贝少量 transcript 头
  const tdir = join(input.userDataDir, 'transcripts')
  if (existsSync(tdir)) {
    const outT = join(dir, 'transcripts-sample')
    mkdirSync(outT, { recursive: true })
    const files = readdirSync(tdir)
      .filter((f) => f.endsWith('.jsonl'))
      .slice(0, 5)
    for (const f of files) {
      const src = join(tdir, f)
      if (statSync(src).size > 2_000_000) {
        const head = readFileSync(src, 'utf8').slice(0, 50_000)
        writeFileSync(join(outT, f + '.head'), head)
      } else {
        copyFileSync(src, join(outT, f))
      }
    }
  }

  return dir
}

function redact(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    if (/key|secret|token|password/i.test(value) && value.length > 8) return '[redacted]'
    return value
  }
  if (Array.isArray(value)) return value.map(redact)
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(o)) {
      if (/key|secret|token|password|auth/i.test(k)) out[k] = '[redacted]'
      else out[k] = redact(v)
    }
    return out
  }
  return value
}
