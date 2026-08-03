import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function EmptyState({
  icon,
  title,
  sub,
  children
}: {
  icon: string
  title: string
  sub?: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <div className="empty-title">{title}</div>
      {sub ? <div className="empty-sub">{sub}</div> : null}
      {children}
    </div>
  )
}
