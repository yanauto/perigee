import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from './Icon'

export function Button({
  variant,
  icon,
  children,
  className = '',
  ...rest
}: {
  variant?: 'primary' | 'ghost' | 'danger'
  icon?: string
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = variant ? `btn btn-${variant}` : 'btn'
  return (
    <button type="button" className={`${cls} ${className}`.trim()} {...rest}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </button>
  )
}
