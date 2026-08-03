import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** JSON 原子写：tmp + rename，崩溃不落半截文件 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const body = JSON.stringify(data, null, 2)
  const tmp = `${filePath}.${process.pid}.tmp`
  writeFileSync(tmp, body, 'utf8')
  try {
    renameSync(tmp, filePath)
  } catch {
    try {
      writeFileSync(filePath, body, 'utf8')
    } finally {
      try {
        unlinkSync(tmp)
      } catch {
        /* */
      }
    }
  }
}
