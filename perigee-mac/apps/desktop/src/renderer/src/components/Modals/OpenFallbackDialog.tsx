import type { JSX } from 'react'
import type { Workbench } from '../../state/useWorkbench'
import { baseName, homeTilde } from '../../lib/format'
import { fallbackReasonText } from '../../lib/openable'
import { useT } from '../../i18n'
import { Icon } from '../ui'

/**
 * 打开兜底确认（T027）：应用内读不了的文件（二进制/不支持格式/读取失败）
 * 给两个真实出口——「用系统默认应用打开」与「在 Finder 中显示」，不再是死胡同。
 */
export function OpenFallbackDialog({ wb }: { wb: Workbench }): JSX.Element | null {
  const t = useT()
  const fb = wb.openFallback
  if (!fb) return null

  return (
    <div className="modal-overlay" onClick={wb.dismissOpenFallback}>
      <div className="modal ofb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ofb-head">
          <Icon name="alert" size={15} />
          <span>{t('无法在应用内打开')}</span>
        </div>
        <div className="ofb-body">
          <div className="ofb-name" title={fb.path}>
            {baseName(fb.path)}
          </div>
          <div className="ofb-path">{homeTilde(fb.path)}</div>
          <div className="ofb-reason">
            {t(fallbackReasonText(fb.reason))}
            {t('要用系统默认应用打开吗？')}
          </div>
        </div>
        <div className="ofb-foot">
          <button type="button" className="re-cancel" onClick={wb.dismissOpenFallback}>
            {t('取消')}
          </button>
          <button
            type="button"
            className="re-cancel"
            onClick={() => wb.revealInFinder(fb.path)}
          >
            {t('在 Finder 中显示')}
          </button>
          <button type="button" className="re-save" onClick={() => wb.openWithSystem(fb.path)}>
            {t('用系统默认应用打开')}
          </button>
        </div>
      </div>
    </div>
  )
}
