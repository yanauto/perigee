import type { JSX } from 'react'
import { IconButton } from '../ui'
import { useT } from '../../i18n'
import { shortcutRowsForPlatform } from '../../state/shortcuts'

/**
 * 快捷键一览（纲领 §3 v3 键盘流）：全局键走 state/keymap，Composer 局部键自行处理。
 * T017：总表移到 state/shortcuts 与设置「快捷键」页共用；文案全量走 i18n。
 */
export function ShortcutsModal({
  open,
  onClose,
  platform = 'darwin'
}: {
  open: boolean
  onClose: () => void
  /** process.platform；非 darwin 显示 Ctrl */
  platform?: string
}): JSX.Element | null {
  const t = useT()
  const rows = shortcutRowsForPlatform(platform)
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{t('快捷键')}</span>
          <IconButton tip={t('关闭')} icon="x" onClick={onClose} />
        </div>
        <div className="modal-body">
          {rows.map((r) => (
            <div className="set-row" key={r.action}>
              <div className="sr-label">
                <div className="sr-name">{t(r.action)}</div>
                {r.note ? <div className="sr-desc">{t(r.note)}</div> : null}
              </div>
              {r.keys.map((k, i) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {i > 0 ? <span className="sr-desc">·</span> : null}
                  <kbd>{k}</kbd>
                </span>
              ))}
            </div>
          ))}
          <div className="composer-hint" style={{ paddingTop: 10 }}>
            {t('终端支持 PTY / shell-c / echo 三档；PTY 需 node-pty。预览用系统浏览器，与 GCU 分离。')}
          </div>
        </div>
      </div>
    </div>
  )
}
