/**
 * T021 同构证据：审批 resolve 必须命中 JSON-RPC id（或 uiId 兜底），
 * 而不是把 apr_* 当 respond id。
 */
import { describe, expect, it } from 'vitest'
import { findPendingByUiId, mapPermissionKey } from './index.js'

describe('T021 · resolve 键命中（T015 report-c 复现形状）', () => {
  it('Host 正确传 engineRequestId=1 → 直接命中', () => {
    const pendingFs = new Map<string | number, { path: string; content: string; uiId: string }>()
    pendingFs.set(1, {
      path: '/tmp/T015-TEST2.txt',
      content: 'world\n',
      uiId: 'apr_msbavl2f_9a1n613'
    })
    // 正确：main 存 String(req.engineRequestId) === "1"
    const key = mapPermissionKey(pendingFs, '1')
    expect(key).toBe(1)
    expect(pendingFs.get(key!)!.uiId).toBe('apr_msbavl2f_9a1n613')
  })

  it('旧 bug 传 apr_* 时 findPendingByUiId 仍可兜底', () => {
    const pendingFs = new Map<string | number, { path: string; content: string; uiId: string }>()
    pendingFs.set(1, {
      path: '/tmp/T015-TEST2.txt',
      content: 'world\n',
      uiId: 'apr_msbavl2f_9a1n613'
    })
    // 旧 main：engineRequestId: req.id → "apr_msbavl2f_9a1n613"
    expect(mapPermissionKey(pendingFs, 'apr_msbavl2f_9a1n613')).toBeUndefined()
    const key = findPendingByUiId(pendingFs, 'apr_msbavl2f_9a1n613')
    expect(key).toBe(1)
  })

  it('正确 vs 错误键：旧键无法 mapKey、新键可', () => {
    const m = new Map<string | number, { uiId: string }>()
    m.set(1, { uiId: 'apr_x' })
    // 旧写入 ApprovalGate 的错误值
    const wrongStored = 'apr_x' // was req.id
    const rightStored = '1' // String(req.engineRequestId)
    expect(mapPermissionKey(m, wrongStored)).toBeUndefined()
    expect(mapPermissionKey(m, rightStored)).toBe(1)
    // eslint-disable-next-line no-console
    console.log(
      'T021_EVIDENCE',
      JSON.stringify({
        wrongKey: wrongStored,
        wrongHit: mapPermissionKey(m, wrongStored) ?? null,
        rightKey: rightStored,
        rightHit: mapPermissionKey(m, rightStored) ?? null,
        uiIdFallback: findPendingByUiId(m, wrongStored) ?? null
      })
    )
  })
})
