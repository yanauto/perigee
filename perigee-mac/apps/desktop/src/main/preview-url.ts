/**
 * 预览 URL 校验（波次 Preview）。
 * 默认允许 localhost / 127.0.0.1 的 http，以及 https；禁 file://。
 */

export type PreviewValidate =
  | { ok: true; url: string }
  | { ok: false; reason: string }

export function validatePreviewUrl(raw: string): PreviewValidate {
  const s = (raw ?? '').trim()
  if (!s) return { ok: false, reason: 'empty' }
  let u: URL
  try {
    u = new URL(s)
  } catch {
    // 允许裸 host:port
    try {
      u = new URL(`http://${s}`)
    } catch {
      return { ok: false, reason: 'invalid_url' }
    }
  }
  if (u.protocol === 'file:') {
    return { ok: false, reason: 'file_not_allowed' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: 'protocol_not_allowed' }
  }
  const host = u.hostname.toLowerCase()
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1'
  if (u.protocol === 'http:' && !isLocal) {
    return { ok: false, reason: 'http_only_localhost' }
  }
  // https 任意主机允许（用户显式预览）
  return { ok: true, url: u.toString() }
}
