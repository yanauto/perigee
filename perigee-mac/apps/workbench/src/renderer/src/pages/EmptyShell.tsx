type Props = { title: string; note: string }

export function EmptyShell({ title, note }: Props) {
  return (
    <div className="stage-settings">
      <header className="chat-head">
        <div className="chat-title">{title}</div>
      </header>
      <div className="state-msg">{note}</div>
    </div>
  )
}
