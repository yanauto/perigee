import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * 图标钮（三态铁律 + tooltip 铁律）：tip 必填，等于强制每个图标钮都有 tooltip。
 */
export function IconButton({
  tip,
  tipPos,
  icon,
  on,
  children,
  className = '',
  ...rest
}: {
  tip: string
  tipPos?: 'top' | 'bottom' | 'right'
  icon?: string
  on?: boolean
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`icon-btn${on ? ' is-on' : ''} ${className}`.trim()}
      data-tip={tip}
      data-tip-pos={tipPos}
      aria-label={tip}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : children}
    </button>
  )
}
