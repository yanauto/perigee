import { useCallback, useEffect, useState } from 'react'
import type { RoutineView } from '../lib/perigee-api'

/**
 * Routines 数据源（T019）：挂载拉一次 list()，之后跟 onChanged 全量推送（T018 契约）。
 * 桥未就绪（features.routines=false）时不调用、不报错，返回空列表——入口由调用方隐藏。
 */
export type RoutinesStore = {
  routines: RoutineView[]
  /** 首次 list() 已回来（区分「还没拉」与「真的没有」） */
  ready: boolean
  error: string | null
  refresh: () => void
}

export function useRoutines(enabled: boolean): RoutinesStore {
  const [routines, setRoutines] = useState<RoutineView[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((v) => v + 1), [])

  useEffect(() => {
    if (!enabled) {
      setRoutines([])
      setReady(false)
      return
    }
    let alive = true
    void window.perigee.routines
      .list()
      .then((list) => {
        if (!alive) return
        setRoutines(Array.isArray(list) ? list : [])
        setReady(true)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setReady(true)
        setError(e instanceof Error ? e.message : String(e))
      })
    const off = window.perigee.routines.onChanged((list) => {
      setRoutines(Array.isArray(list) ? list : [])
      setReady(true)
    })
    return () => {
      alive = false
      off()
    }
  }, [enabled, tick])

  return { routines, ready, error, refresh }
}
