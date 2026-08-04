import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { type ConfigWriteResult, userConfigPath } from './grok-config-store.js'

export const DEEPSEEK_GROK_MODEL_ID = 'deepseek-v4-flash'
export const DEEPSEEK_GROK_DISPLAY_NAME = 'DeepSeek V4 Flash'
export const DEEPSEEK_GROK_BASE_URL = 'https://api.deepseek.com/v1'
export const DEEPSEEK_GROK_ENV_KEY = 'DEEPSEEK_API_KEY'

const BAK_KEEP = 8

export type DeepSeekGrokCredential =
  | { apiKey: string; envKey?: never }
  | { apiKey?: never; envKey?: string }

export type ConfigureDeepSeekGrokModelOptions = {
  configPath?: string
  expectedMtimeMs?: number
  makeDefault?: boolean
  credential?: DeepSeekGrokCredential
}

export type DeepSeekGrokModelConfig = {
  model: typeof DEEPSEEK_GROK_MODEL_ID
  base_url: typeof DEEPSEEK_GROK_BASE_URL
  name: typeof DEEPSEEK_GROK_DISPLAY_NAME
  description: string
  api_backend: 'responses'
  context_window: number
  max_completion_tokens: number
  api_key?: string
  env_key?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function ensureRecord(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = asRecord(root[key])
  if (existing) return existing
  const next: Record<string, unknown> = {}
  root[key] = next
  return next
}

function backupConfig(configPath: string): string | undefined {
  if (!existsSync(configPath)) return undefined
  const dir = dirname(configPath)
  mkdirSync(dir, { recursive: true })
  const bak = `${configPath}.bak.${Date.now()}`
  copyFileSync(configPath, bak)
  try {
    const base = configPath.split('/').pop()!
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(base + '.bak.'))
      .sort()
    while (files.length > BAK_KEEP) {
      const f = files.shift()
      if (f) unlinkSync(join(dir, f))
    }
  } catch {
    // Best-effort backup pruning only.
  }
  return bak
}

export function buildDeepSeekGrokModelConfig(
  credential: DeepSeekGrokCredential = { envKey: DEEPSEEK_GROK_ENV_KEY }
): DeepSeekGrokModelConfig {
  const config: DeepSeekGrokModelConfig = {
    model: DEEPSEEK_GROK_MODEL_ID,
    base_url: DEEPSEEK_GROK_BASE_URL,
    name: DEEPSEEK_GROK_DISPLAY_NAME,
    description: 'DeepSeek V4 Flash via OpenAI Responses API',
    api_backend: 'responses',
    context_window: 1_048_576,
    max_completion_tokens: 8_192
  }
  if (credential.apiKey != null) {
    config.api_key = credential.apiKey.trim()
  } else {
    config.env_key = (credential.envKey ?? DEEPSEEK_GROK_ENV_KEY).trim() || DEEPSEEK_GROK_ENV_KEY
  }
  return config
}

/**
 * Adds the DeepSeek V4 Flash custom model to Grok CLI's own config.toml.
 * This keeps Perigee on the Grok runtime path instead of replacing Grok with another CLI.
 */
export function configureDeepSeekGrokModel(
  opts: ConfigureDeepSeekGrokModelOptions = {}
): ConfigWriteResult {
  const configPath = opts.configPath ?? userConfigPath()
  if (existsSync(configPath)) {
    const st = statSync(configPath)
    if (
      opts.expectedMtimeMs != null &&
      Math.abs(st.mtimeMs - opts.expectedMtimeMs) > 1
    ) {
      return {
        ok: false,
        reason: 'mtime_conflict',
        detail: 'config.toml was changed externally; aborted to avoid overwriting user config'
      }
    }
  }

  let bakPath: string | undefined
  try {
    mkdirSync(dirname(configPath), { recursive: true })
    bakPath = backupConfig(configPath)
    const data = existsSync(configPath)
      ? (parseToml(readFileSync(configPath, 'utf8')) as Record<string, unknown>)
      : {}

    const modelRoot = ensureRecord(data, 'model')
    modelRoot[DEEPSEEK_GROK_MODEL_ID] = buildDeepSeekGrokModelConfig(opts.credential)

    if (opts.makeDefault === true) {
      const modelsRoot = ensureRecord(data, 'models')
      modelsRoot.default = DEEPSEEK_GROK_MODEL_ID
    }

    const tmp = `${configPath}.tmp`
    writeFileSync(tmp, stringifyToml(data), 'utf8')
    parseToml(readFileSync(tmp, 'utf8'))
    renameSync(tmp, configPath)
    return {
      ok: true,
      detail: opts.makeDefault === true
        ? `${DEEPSEEK_GROK_MODEL_ID} configured and set as Grok default model`
        : `${DEEPSEEK_GROK_MODEL_ID} configured as a Grok custom model`,
      bakPath
    }
  } catch (e) {
    if (bakPath && existsSync(bakPath)) {
      try {
        copyFileSync(bakPath, configPath)
      } catch {
        // Keep the original error; rollback is best effort.
      }
    }
    return {
      ok: false,
      reason: 'write_failed',
      detail: e instanceof Error ? e.message : String(e),
      bakPath
    }
  }
}
