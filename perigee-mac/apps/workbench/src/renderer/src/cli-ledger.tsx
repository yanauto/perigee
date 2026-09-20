import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { GrokSessionRow, GrokSessionsResult } from '../../shared/grok-sessions'

type Ledger = {
  pack: GrokSessionsResult | null
  loading: boolean
  query: string
  selected: GrokSessionRow | null
  select: (row: GrokSessionRow | null) => void
  setQuery: (q: string) => void
  reload: () => void
}

const Ctx = createContext<Ledger | null>(null)

function loadList(query: string): Promise<GrokSessionsResult> {
  const api = window.workbench
  if (!api || typeof api.listGrokSessions !== 'function') {
    return Promise.resolve({
      ok: false,
      source: 'none',
      items: [],
      cwd: '',
      error: '这个窗口还没有会话列表接口'
    })
  }
  const q = query.trim()
  return api.listGrokSessions({ limit: 40, query: q || undefined })
}

export function CliLedgerProvider({
  children,
  workspacePath
}: {
  children: ReactNode
  workspacePath?: string | null
}) {
  const [pack, setPack] = useState<GrokSessionsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GrokSessionRow | null>(null)
  const [query, setQueryState] = useState('')

  const reload = useCallback(() => {
    setLoading(true)
    void loadList(query)
      .then(setPack)
      .catch((err: unknown) => {
        setPack({
          ok: false,
          source: 'none',
          items: [],
          cwd: '',
          error: err instanceof Error ? err.message : String(err)
        })
      })
      .finally(() => setLoading(false))
  }, [query])

  useEffect(() => {
    const t = window.setTimeout(() => reload(), query.trim() ? 280 : 0)
    return () => window.clearTimeout(t)
  }, [reload, workspacePath, query])

  const setQuery = useCallback((q: string) => {
    setQueryState(q)
  }, [])

  return (
    <Ctx.Provider value={{ pack, loading, query, selected, select: setSelected, setQuery, reload }}>
      {children}
    </Ctx.Provider>
  )
}

export function useCliLedger(): Ledger {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('CliLedgerProvider missing')
  return ctx
}
