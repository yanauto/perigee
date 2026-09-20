import type { SlashItem } from '../../../shared/slash-palette'

type Props = {
  items: SlashItem[]
  active: number
  placement: 'up' | 'down'
  queuePreview?: string
  onPick: (item: SlashItem) => void
  onHover: (index: number) => void
}

export function SlashPalette({ items, active, placement, queuePreview, onPick, onHover }: Props) {
  if (!items.length) return null
  return (
    <div className={`slash-palette is-${placement}`} role="listbox" aria-label="斜杠命令">
      <ul className="slash-list">
        {items.map((item, i) => {
          const on = i === active
          const gray = item.kind === 'tui-only'
          return (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                disabled={gray}
                className={on ? 'slash-item is-on' : 'slash-item'}
                onMouseEnter={() => onHover(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!gray) onPick(item)
                }}
              >
                <span className="slash-item-name">{item.label}</span>
                <span className="slash-item-hint">{item.hint}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {queuePreview ? <div className="slash-queue">已排上：{queuePreview}</div> : null}
    </div>
  )
}
