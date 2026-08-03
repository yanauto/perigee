import { useEffect, useState, type JSX } from 'react'
import { Icon } from '../ui'

/** 预览：系统浏览器打开 URL（≠ GCU Computer Use），记 lastPreviewUrl */
export function PreviewView(): JSX.Element {
  const [url, setUrl] = useState('http://127.0.0.1:3000')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.perigee.settings.get().then((s) => {
      if (s.lastPreviewUrl) setUrl(s.lastPreviewUrl)
    })
  }, [])

  const open = () => {
    setMsg(null)
    void window.perigee.preview
      .open(url)
      .then((r) => {
        if (!r.ok) {
          setMsg(`无法打开：${r.reason ?? '未知'}`)
          return
        }
        setMsg(`已在系统浏览器打开 ${r.url}`)
        void window.perigee.settings.update({ lastPreviewUrl: r.url })
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}
    >
      <p style={{ color: 'var(--tx-3)', fontSize: 12 }}>
        在系统浏览器查看 localhost / https 页面。Agent 操控 Chrome 请用 GCU，不是这个面板。
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && open()}
          placeholder="http://127.0.0.1:3000"
          spellCheck={false}
        />
        <button type="button" className="btn btn-primary" onClick={open}>
          <Icon name="external" size={12} /> 打开
        </button>
      </div>
      {msg ? <div style={{ fontSize: 12, color: 'var(--tx-2)' }}>{msg}</div> : null}
    </div>
  )
}
