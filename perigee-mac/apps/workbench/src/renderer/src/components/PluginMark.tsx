import type { PluginMark as Mark } from '../../../shared/types'
import { IconSlack } from './Icons'

const LETTER: Record<Mark, string> = {
  slack: 'S',
  datadog: 'D',
  figma: 'F',
  linear: 'L',
  render: 'R',
  jfrog: 'J',
  planetscale: 'P',
  cloudflare: 'C',
  pendo: 'P',
  gitlab: 'G',
  langfuse: 'L',
  plus: '+',
  plain: 'P',
  learn: 'C'
}

export function PluginMark({ mark, size = 28 }: { mark: Mark; size?: number }) {
  return (
    <span className={`plug-mark plug-mark-${mark}`} style={{ width: size, height: size }}>
      {mark === 'slack' ? <IconSlack size={Math.round(size * 0.55)} /> : LETTER[mark]}
    </span>
  )
}

