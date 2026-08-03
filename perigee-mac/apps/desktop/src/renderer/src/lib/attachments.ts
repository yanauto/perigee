/** D1-A 文本路径 + D1-B 媒体路径 */

export type AttachmentRef = {
  path: string
  /** image | pdf | file */
  kind?: 'image' | 'pdf' | 'file'
  label?: string
}

export function classifyAttachPath(filePath: string): 'image' | 'pdf' | 'file' {
  const lower = filePath.toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return 'image'
  if (lower.endsWith('.pdf')) return 'pdf'
  return 'file'
}

/** 文本类附件 → @path 前缀（Host 展开）；媒体单独走 mediaPaths */
export function mergeAttachmentsIntoDraft(userText: string, attachments: AttachmentRef[]): string {
  const body = userText.trim()
  const textOnly = attachments.filter((a) => classifyAttachPath(a.path) === 'file')
  if (textOnly.length === 0) return body
  const tags = textOnly
    .map((a) => {
      const p = a.path.trim().replace(/\\/g, '/')
      if (!p) return ''
      return p.includes(' ') ? `@"${p}"` : `@${p}`
    })
    .filter(Boolean)
  if (tags.length === 0) return body
  if (!body) return tags.join(' ')
  return `${tags.join(' ')}\n\n${body}`
}

export function mediaPathsFromAttachments(attachments: AttachmentRef[]): string[] {
  return attachments
    .filter((a) => {
      const k = classifyAttachPath(a.path)
      return k === 'image' || k === 'pdf'
    })
    .map((a) => a.path.replace(/\\/g, '/'))
}

export const ATTACH_MAX = 8
