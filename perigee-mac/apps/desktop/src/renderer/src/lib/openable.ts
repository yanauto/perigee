/**
 * 文件「能不能在应用内打开」的判定（T027 纯函数）。
 *
 * 判定只看扩展名（不读盘）：应用内的查看器是文本/代码编辑器 + Markdown 预览，
 * 二进制与富格式（图片除外——图片没有内置查看器，一并走系统应用）交给系统默认应用。
 * 判不准的（无扩展名、罕见后缀）**倾向于先在应用内试一次**——读失败还有系统打开兜底，
 * 反过来把文本文件推给系统应用才是真的难受。
 */

/** 明确的二进制 / 非文本扩展名（小写，带点） */
const BINARY_EXT = new Set([
  // 图片 / 媒体
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.ico', '.icns', '.heic',
  '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg',
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  // 文档 / 富格式
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.key', '.numbers', '.pages',
  '.sketch', '.fig', '.psd', '.ai',
  // 压缩 / 可执行 / 数据库
  '.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.dmg', '.pkg', '.iso',
  '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.class', '.jar', '.wasm', '.node',
  '.db', '.sqlite', '.sqlite3', '.realm',
  // 字体 / 其它
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.bin', '.dat', '.pyc', '.DS_Store'
])

/** 扩展名（小写，含点）；无扩展名返回 '' */
export function extOf(path: string): string {
  const base = path.split('/').pop() ?? path
  const i = base.lastIndexOf('.')
  if (i <= 0) return '' // 无扩展名，或 .gitignore 这类点开头文件
  return base.slice(i).toLowerCase()
}

/** 是否是应用内查看器打得开的（文本/代码/Markdown） */
export function canOpenInApp(path: string): boolean {
  const p = (path ?? '').trim()
  if (!p) return false
  if (p.endsWith('/')) return false // 目录
  return !BINARY_EXT.has(extOf(p))
}

/** 反向：需要系统默认应用兜底 */
export function needsSystemOpen(path: string): boolean {
  return !canOpenInApp(path)
}

/** 兜底弹窗的原因文案（中文源串，渲染时过 t()） */
export type OpenFallbackReason = 'binary' | 'read_failed'

export function fallbackReasonText(reason: OpenFallbackReason): string {
  return reason === 'binary'
    ? '这个文件不是应用内可读的文本格式。'
    : '应用内读取失败。'
}
