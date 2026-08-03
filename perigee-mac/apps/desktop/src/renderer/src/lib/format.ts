/** 展示用小工具：时间、数字、路径 */

export function relativeTime(iso: string | number | Date): string {
  const t = typeof iso === 'string' || typeof iso === 'number' ? new Date(iso) : iso
  const diff = Date.now() - t.getTime()
  const abs = Math.abs(diff)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (abs < 30_000) return '刚刚'
  if (abs < minute) return `${Math.round(abs / 1000)} 秒前`
  if (abs < hour) return `${Math.round(abs / minute)} 分钟前`
  if (abs < day) return `${Math.round(abs / hour)} 小时前`
  if (abs < 7 * day) return `${Math.round(abs / day)} 天前`
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getMonth() + 1}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`
}

export function formatTokens(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '–'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
}

export function formatBytes(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function baseName(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p
}

export function dirName(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.slice(0, -1).join('/')
}

export function homeTilde(p: string): string {
  const home = '/Users/'
  if (p.startsWith(home)) {
    const rest = p.slice(home.length)
    const idx = rest.indexOf('/')
    if (idx > 0) return `~${rest.slice(idx)}`
  }
  return p
}

/**
 * 模型名显示化（T026 · ADR-0015 只动显示层）：剥掉尾部 `-build` 后缀。
 * `grok-4.5-build` → `grok-4.5`；不改账本 / 事件 / 契约里的真实值，
 * 也不碰可编辑字段（设置里的「默认模型」输入框、Routine 编辑模态的模型输入框存的仍是原值）。
 */
export function displayModel(model: string | null | undefined): string {
  const s = (model ?? '').trim()
  if (!s) return ''
  return s.replace(/-build$/i, '')
}
