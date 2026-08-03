export function Switch({
  on,
  onChange,
  tip,
  disabled
}: {
  on: boolean
  onChange: (next: boolean) => void
  tip?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`switch${on ? ' is-on' : ''}`}
      data-tip={tip}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      {/*
        T025-返修：旋钮必须是**真实元素**，不能用 ::after。
        `[data-tip]::after` 是全站 CSS tooltip 的伪元素，带 tip 的开关会与它抢同一个 ::after——
        tooltip 的 padding/border 没被 .switch::after 覆盖，border-box 下把 16px 旋钮撑到 18px，
        选中态右移 14px 后顶出 34px 轨道右缘（真机穿模；T022 在主页是靠改复选框绕开的）。
        改成子元素后两者永不相撞，顺带让开关的 tooltip 真正能显示。
      */}
      <span className="sw-knob" aria-hidden />
    </button>
  )
}
