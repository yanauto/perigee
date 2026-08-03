/**
 * 通用 UI 状态桶（T008）：key → JSON value，schema 归前端。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomic-write.js'

export class UiStateStore {
  constructor(private filePath: string) {}

  static defaultPath(userData: string): string {
    return join(userData, 'ui-state.json')
  }

  private loadAll(): Record<string, unknown> {
    try {
      if (!existsSync(this.filePath)) return {}
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>
      }
      return {}
    } catch {
      return {}
    }
  }

  private saveAll(data: Record<string, unknown>): void {
    writeJsonAtomic(this.filePath, data)
  }

  get(key: string): unknown {
    const k = String(key ?? '')
    if (!k) return undefined
    return this.loadAll()[k]
  }

  set(key: string, value: unknown): void {
    const k = String(key ?? '')
    if (!k) throw new Error('uiState key 不能为空')
    const all = this.loadAll()
    if (value === undefined) {
      delete all[k]
    } else {
      // 确保可 JSON 序列化
      JSON.stringify(value)
      all[k] = value
    }
    this.saveAll(all)
  }
}
