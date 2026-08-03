import type { JSX } from 'react'
import type { PermissionPolicy } from '../../lib/perigee-api'
import { usePopover } from '../../lib/popovers'
import { useT } from '../../i18n'
import { Icon } from '../ui'

/** 权限四态（与 AppSettings.permissionPolicy 一一对应）；文案对齐 claude-design 原型 */
const MODES: { id: PermissionPolicy; label: string; desc: string }[] = [
  { id: 'ask', label: '询问', desc: '每次动手前问你' },
  { id: 'accept_edits', label: '改文件', desc: '编辑免问，命令仍问' },
  { id: 'plan', label: '计划', desc: '只读只想，不落盘' },
  { id: 'yolo', label: '放行', desc: '全部免问 · 谨慎使用' }
]

/**
 * 权限单 chip（r02 A1 收纳：四段平铺 → 只显当前档，点开弹层选档）。
 * yolo 档琥珀底（危险感，对齐 ccd-01 Bypass chip）；Shift+Tab 循环由调用方保留。
 * T013：弹层接入全站统一关闭机制（data-pop / data-pop-trigger），不再有私有开关逻辑。
 */
export function PermChip({
  policy,
  disabled,
  onChange
}: {
  policy: PermissionPolicy
  disabled?: boolean
  onChange: (p: PermissionPolicy) => void
}): JSX.Element {
  const pop = usePopover('perm')
  const t = useT()

  const cur = MODES.find((m) => m.id === policy) ?? MODES[0]!

  return (
    <span className="perm-chip-anchor">
      <button
        type="button"
        className={`chip chip-click perm-chip${policy === 'yolo' ? ' is-yolo' : ''}`}
        data-tip={t('权限模式（点击切换；Shift+Tab 循环）')}
        data-pop-trigger="perm"
        disabled={disabled}
        onClick={pop.toggle}
      >
        <span>{t(cur.label)}</span>
        <Icon name="chevron-down" size={11} />
      </button>
      {pop.open ? (
        <div className="popover perm-menu" role="menu" aria-label={t('权限档')} data-pop="perm">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                onChange(m.id)
                pop.close()
              }}
            >
              <span>{t(m.label)}</span>
              <span className="mi-sub">{t(m.desc)}</span>
              {m.id === policy ? (
                <span className="mi-hint">
                  <Icon name="check" size={12} />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  )
}
