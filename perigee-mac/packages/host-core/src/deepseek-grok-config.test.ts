import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import {
  configureDeepSeekGrokModel,
  DEEPSEEK_GROK_BASE_URL,
  DEEPSEEK_GROK_DISPLAY_NAME,
  DEEPSEEK_GROK_ENV_KEY,
  DEEPSEEK_GROK_MODEL_ID
} from './deepseek-grok-config.js'

function modelEntry(text: string): Record<string, unknown> {
  const data = parseToml(text) as Record<string, unknown>
  const modelRoot = data.model as Record<string, unknown>
  return modelRoot[DEEPSEEK_GROK_MODEL_ID] as Record<string, unknown>
}

describe('configureDeepSeekGrokModel', () => {
  let dir: string
  let cfg: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deepseek-grok-'))
    cfg = join(dir, 'config.toml')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates config.toml with an env-key backed DeepSeek Responses model', () => {
    const r = configureDeepSeekGrokModel({ configPath: cfg })
    expect(r.ok).toBe(true)
    expect(r.bakPath).toBeUndefined()

    const text = readFileSync(cfg, 'utf8')
    const entry = modelEntry(text)
    expect(entry.model).toBe(DEEPSEEK_GROK_MODEL_ID)
    expect(entry.base_url).toBe(DEEPSEEK_GROK_BASE_URL)
    expect(entry.name).toBe(DEEPSEEK_GROK_DISPLAY_NAME)
    expect(entry.api_backend).toBe('responses')
    expect(entry.env_key).toBe(DEEPSEEK_GROK_ENV_KEY)
    expect(entry.api_key).toBeUndefined()
  })

  it('preserves existing Grok config and can set DeepSeek as default', () => {
    writeFileSync(cfg, `[cli]\ninstaller = "internal"\n\n[marketplace]\nofficial_marketplace_auto_installed = true\n`, 'utf8')

    const r = configureDeepSeekGrokModel({
      configPath: cfg,
      makeDefault: true,
      credential: { apiKey: 'sk-test-only' }
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bakPath && existsSync(r.bakPath)).toBe(true)

    const text = readFileSync(cfg, 'utf8')
    const data = parseToml(text) as Record<string, unknown>
    expect((data.cli as Record<string, unknown>).installer).toBe('internal')
    expect((data.marketplace as Record<string, unknown>).official_marketplace_auto_installed).toBe(true)
    expect((data.models as Record<string, unknown>).default).toBe(DEEPSEEK_GROK_MODEL_ID)
    expect(modelEntry(text).api_key).toBe('sk-test-only')
  })

  it('refuses to write when mtime has changed since the caller snapshot', () => {
    writeFileSync(cfg, '[cli]\ninstaller = "internal"\n', 'utf8')
    const r = configureDeepSeekGrokModel({ configPath: cfg, expectedMtimeMs: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('mtime_conflict')
  })
})
