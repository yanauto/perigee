/**
 * Desktop 权限四态（CCD-MEGA §12.2）——全仓唯一 type + normalize。
 * 分类器 / ACP mode 映射仍在 engine-grok-acp。
 */

export type PermissionPolicy = 'ask' | 'accept_edits' | 'plan' | 'yolo'

/**
 * 合并原 host-core 与 acp 的别名：
 * acceptEdits · bypass · bypassPermissions · default · manual
 */
export function normalizePermissionPolicy(raw: unknown): PermissionPolicy {
  if (raw === 'accept_edits' || raw === 'acceptEdits') return 'accept_edits'
  if (raw === 'plan') return 'plan'
  if (raw === 'yolo' || raw === 'bypass' || raw === 'bypassPermissions') return 'yolo'
  if (raw === 'ask' || raw === 'default' || raw === 'manual') return 'ask'
  return 'ask'
}
