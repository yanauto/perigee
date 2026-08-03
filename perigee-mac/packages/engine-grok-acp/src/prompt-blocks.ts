/**
 * 将文本 + 媒体组装为 ACP session/prompt 的 ContentBlock 数组。
 * 依据 agent-client-protocol ContentBlock / PromptCapabilities。
 */

export type PromptCapabilities = {
  image: boolean
  audio: boolean
  embeddedContext: boolean
}

export type MediaInput = {
  kind: 'image' | 'pdf' | 'file'
  name: string
  mimeType: string
  uri: string
  dataBase64?: string
}

export type AcpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string; uri?: string }
  | {
      type: 'resource'
      resource: { uri: string; mimeType?: string; blob?: string; text?: string }
    }
  | {
      type: 'resource_link'
      uri: string
      name: string
      mimeType?: string
      title?: string
    }

export const DEFAULT_PROMPT_CAPABILITIES: PromptCapabilities = {
  image: false,
  audio: false,
  embeddedContext: false
}

export function parsePromptCapabilities(initResult: unknown): PromptCapabilities {
  const r = (initResult ?? {}) as Record<string, unknown>
  const caps = (r.agentCapabilities ?? r.capabilities ?? {}) as Record<string, unknown>
  const prompt = (caps.promptCapabilities ?? caps.prompt ?? {}) as Record<string, unknown>
  return {
    image: prompt.image === true,
    audio: prompt.audio === true,
    embeddedContext: prompt.embeddedContext === true || prompt.embedded_context === true
  }
}

/**
 * 组装 prompt blocks：文本在前，媒体随后。
 * - image + caps.image → type:image
 * - pdf/file + caps.embeddedContext + data → type:resource blob
 * - 否则 → resource_link（基线能力，agent 可再读）
 */
export function buildAcpPromptBlocks(
  text: string,
  media: MediaInput[] | undefined,
  caps: PromptCapabilities
): { blocks: AcpContentBlock[]; warnings: string[] } {
  const warnings: string[] = []
  const blocks: AcpContentBlock[] = []
  const t = text.trim()
  if (t) blocks.push({ type: 'text', text: t })

  for (const m of media ?? []) {
    if (m.kind === 'image' && m.dataBase64 && caps.image) {
      blocks.push({
        type: 'image',
        data: m.dataBase64,
        mimeType: m.mimeType,
        uri: m.uri
      })
      continue
    }
    if (
      (m.kind === 'pdf' || m.kind === 'file' || m.kind === 'image') &&
      m.dataBase64 &&
      caps.embeddedContext
    ) {
      blocks.push({
        type: 'resource',
        resource: {
          uri: m.uri,
          mimeType: m.mimeType,
          blob: m.dataBase64
        }
      })
      if (m.kind === 'image' && !caps.image) {
        warnings.push(`image→embedded resource（agent 未声明 image 能力）: ${m.name}`)
      }
      continue
    }
    // 基线 resource_link
    blocks.push({
      type: 'resource_link',
      uri: m.uri,
      name: m.name,
      mimeType: m.mimeType,
      title: m.name
    })
    if (m.kind === 'image' && !caps.image) {
      warnings.push(`image 降级为 resource_link（agent 未声明 promptCapabilities.image）: ${m.name}`)
    } else if (m.kind === 'pdf' && !caps.embeddedContext) {
      warnings.push(`pdf 降级为 resource_link（无 embeddedContext）: ${m.name}`)
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'text', text: text || '' })
  }
  return { blocks, warnings }
}

export function mimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

export function classifyMediaPath(filePath: string): 'image' | 'pdf' | 'file' {
  const m = mimeFromPath(filePath)
  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf') return 'pdf'
  return 'file'
}

/** 单文件上限（字节） */
export const MEDIA_MAX_BYTES = {
  image: 8 * 1024 * 1024,
  pdf: 6 * 1024 * 1024,
  file: 2 * 1024 * 1024
} as const
