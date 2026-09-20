import { BROWSE_MCP, pluginById } from '../../../shared/plugins'
import { useWorkbench } from '../state'
import { IconSearch, IconX } from './Icons'
import { PluginMark } from './PluginMark'
import { useState } from 'react'

export function BrowseMcpModal() {
  const { state, setModal, goto } = useWorkbench()
  const [q, setQ] = useState('')
  if (!state || state.modal !== 'browse-mcp') return null

  const items = BROWSE_MCP.map((id) => pluginById(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
  const shown = items.filter((p) => {
    const hay = `${p.name} ${p.blurb}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })

  return (
    <div className="modal-back" onClick={() => void setModal(null)}>
      <div className="mcp-modal" role="dialog" aria-label="Browse MCPs" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-x" aria-label="Close" onClick={() => void setModal(null)}>
          <IconX />
        </button>
        <h2>Browse MCPs</h2>
        <label className="plug-search wide">
          <IconSearch />
          <input value={q} placeholder="Search anything" onChange={(e) => setQ(e.target.value)} />
        </label>
        {shown.length === 0 ? (
          <div className="settings-empty">
            <div>No matching MCPs</div>
            <div className="muted">Try another name.</div>
          </div>
        ) : (
          <div className="mcp-grid">
            {shown.map((item) => (
              <button
                key={item.id}
                type="button"
                className="plug-card"
                onClick={() => void goto('settings-plugins-detail', item.id)}
              >
                <PluginMark mark={item.mark} />
                <div className="plug-copy">
                  <div className="plug-name">{item.name}</div>
                  <p>{item.blurb}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
