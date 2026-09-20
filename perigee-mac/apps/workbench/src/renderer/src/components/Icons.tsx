type IconProps = { size?: number }

export function IconPlus({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconSearch({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.2 10.2 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconSpark({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 3.5h6.5A1.5 1.5 0 0 1 12 5v6.2L9.4 9.4H4A1.5 1.5 0 0 1 2.5 7.9V5A1.5 1.5 0 0 1 4 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  )
}

export function IconClock({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5.2V8l2 1.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconHome({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 7.2 8 3.4l5 3.8V13a.8.8 0 0 1-.8.8H3.8A.8.8 0 0 1 3 13Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconDots({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  )
}

export function IconImage({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="7" r="1.1" fill="currentColor" />
      <path d="M3.4 11.2 6.6 8.4l2.2 2.1 1.6-1.6 2.2 2.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function IconMic({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="6" y="2.6" width="4" height="6.4" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.4 8.2a3.6 3.6 0 0 0 7.2 0M8 11.8v1.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconSend({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 12.4V3.8M4.6 7.2 8 3.8l3.4 3.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconChevron({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconChevronLeft({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M7.5 3 4.5 6l3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconMark({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.6 14.2 5v6L8 14.4 1.8 11V5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8 1.6V8l6.2 3.1M8 8 1.8 11.1" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

export function IconGoogle({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="#4285F4" d="M14.9 8.18c0-.57-.05-1.12-.15-1.64H8.16v3.1h3.78a3.23 3.23 0 0 1-1.4 2.12v1.76h2.26c1.32-1.22 2.1-3.02 2.1-5.34Z" />
      <path fill="#34A853" d="M8.16 15c1.89 0 3.48-.63 4.64-1.7l-2.26-1.76c-.63.42-1.43.67-2.38.67-1.83 0-3.38-1.24-3.93-2.9H1.89v1.82A6.99 6.99 0 0 0 8.16 15Z" />
      <path fill="#FBBC05" d="M4.23 9.31a4.2 4.2 0 0 1 0-2.62V4.87H1.89a7 7 0 0 0 0 6.26l2.34-1.82Z" />
      <path fill="#EA4335" d="M8.16 3.79c1.03 0 1.95.35 2.68 1.05l2.01-2.01A6.86 6.86 0 0 0 8.16 1a6.99 6.99 0 0 0-6.27 3.87l2.34 1.82c.55-1.66 2.1-2.9 3.93-2.9Z" />
    </svg>
  )
}

export function IconGitHub({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.6A6.4 6.4 0 0 0 1.6 8c0 2.83 1.84 5.23 4.38 6.08.32.06.44-.14.44-.31v-1.1c-1.78.39-2.16-.76-2.16-.76-.29-.74-.71-.94-.71-.94-.58-.4.04-.39.04-.39.64.05.98.66.98.66.57.98 1.5.7 1.87.53.06-.42.22-.7.4-.86-1.42-.16-2.92-.71-2.92-3.16 0-.7.25-1.27.66-1.72-.07-.16-.29-.82.06-1.7 0 0 .54-.17 1.76.66a6.1 6.1 0 0 1 3.2 0c1.22-.83 1.76-.66 1.76-.66.35.88.13 1.54.06 1.7.41.45.66 1.02.66 1.72 0 2.46-1.5 3-2.93 3.16.23.2.44.59.44 1.19v1.76c0 .17.12.37.44.31A6.41 6.41 0 0 0 14.4 8 6.4 6.4 0 0 0 8 1.6Z"
      />
    </svg>
  )
}

export function IconApple({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11.4 8.16c0-1.7 1.39-2.52 1.45-2.56-1.1-1.62-2.82-1.67-3.24-1.67-1.38-.14-2.7.82-3.4.82s-1.77-.8-2.92-.78c-1.5.02-2.89.88-3.66 2.23-1.56 2.71-.4 6.72 1.12 8.92.75 1.08 1.64 2.28 2.81 2.24 1.13-.05 1.55-.72 2.91-.72s1.74.72 2.93.7c1.21-.02 1.98-1.1 2.72-2.18.86-1.26 1.21-2.48 1.23-2.54-.03-.01-2.36-.9-2.36-3.56ZM9.7 2.9c.62-.75 1.04-1.8.92-2.84-.89.04-1.97.6-2.61 1.35-.57.66-1.07 1.73-.94 2.75 1 .08 2.01-.51 2.63-1.26Z"
      />
    </svg>
  )
}

export function IconDownload({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 2.6v7.2M5.2 7.4 8 10.2l2.8-2.8M3.2 13.2h9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconSliders({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 5h10M5.2 3.4v3.2M3 11h10M10.8 9.4v3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconKey({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="5.4" cy="8" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.8 8h5.4v2.2M11.2 8v1.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconChart({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 12.4V8.6M6.4 12.4V4.8M9.8 12.4V7.2M13.2 12.4V3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconGauge({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 11.2a5.4 5.4 0 1 1 9.6 0" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 9.2 10.4 6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconReceipt({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.8h8v10.4l-1.2-.8-1.2.8-1.6-.8-1.6.8-1.2-.8-1.2.8z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 6h4M6 8.4h4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function IconX({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.4 4.4 11.6 11.6M11.6 4.4 4.4 11.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconBook({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.4 3.2h4.4A2 2 0 0 1 9.8 5.2v7.2H5.2A1.8 1.8 0 0 0 3.4 14.2zM12.6 3.2H8.2A2 2 0 0 0 6.2 5.2v7.2h4.6A1.8 1.8 0 0 1 12.6 14.2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function IconExternal({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.2 4.2H4.4A1.2 1.2 0 0 0 3.2 5.4v6.4A1.2 1.2 0 0 0 4.4 13h6.4a1.2 1.2 0 0 0 1.2-1.2V9.8M9 3.4h3.6V7M12.4 3.6 8 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconGift({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="7" width="10" height="6.4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 7h10M8 7v6.4M6.2 4.4c0-1 .8-1.8 1.8-1.8S9.8 3.4 9.8 4.4 8 7 8 7 6.2 5.4 6.2 4.4Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function IconMonitor({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.6" y="3.2" width="10.8" height="7.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.2 12.8h3.6M8 10.6v2.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconCheck({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.6 8.2 6.6 11.2 12.4 4.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCloud({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M5.2 12.2h6.2A2.8 2.8 0 0 0 14 9.6c0-1.4-1-2.5-2.3-2.7A3.3 3.3 0 0 0 5.2 6.2 2.6 2.6 0 0 0 2.4 8.8c0 1.9 1.3 3.4 2.8 3.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  )
}

export function IconLock({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.6" y="7.2" width="8.8" height="6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.4 7.2V5.4a2.6 2.6 0 0 1 5.2 0v1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function IconBranch({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4.4" cy="4.2" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4.4" cy="11.8" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.6" cy="8" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.4 5.6v4.6M5.8 4.4h3.2A2.6 2.6 0 0 1 11.6 7" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function IconTerm({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.4" y="3.2" width="11.2" height="9.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.6 6.2 6.6 8 4.6 9.8M8.2 10.2h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconPlay({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="rgba(0,0,0,0.45)" />
      <path d="M6.6 5.4 11 8 6.6 10.6Z" fill="#fff" />
    </svg>
  )
}

export function IconPencil({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9.6 3.4 12.6 6.4 6 13H3v-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function IconShield({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.4 13 4.2v4.2c0 3.1-2.1 4.8-5 5.6-2.9-.8-5-2.5-5-5.6V4.2Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function IconMail({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.4" y="4" width="11.2" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="m3 4.8 5 3.4 5-3.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function IconWrench({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.4 3.2a2.6 2.6 0 0 0 2.4 3.8L9.2 10.6 5.4 6.8 9 3.2c.4-.1.9-.1 1.4 0Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 11.4 3.4 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconSwap({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.2 6.2 6.4 4l2.2 2.2M6.4 4v8M11.8 9.8 9.6 12 7.4 9.8M9.6 12V4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconWarn({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.6 14.2 13.4H1.8Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.4v3.2M8 11.4v.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconFlask({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.2 2.6h3.6M7 2.6v4.2L3.8 13h8.4L8.8 6.8V2.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function IconFlag({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.2 13.2V3.4h7.2l-1.4 2.4 1.4 2.4H4.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function IconBug({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8.2" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5V3.4M5.2 6.2 3.6 5M10.8 6.2 12.4 5M5.2 10.4 3.6 12M10.8 10.4 12.4 12M3.8 8.2h1M11.2 8.2h1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function IconUndo({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.2 7.2H12a2.2 2.2 0 0 1 0 4.4H8.6M4.2 7.2 6.4 5M4.2 7.2 6.4 9.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPill({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.2" y="5.6" width="9.6" height="4.8" rx="2.4" transform="rotate(-35 8 8)" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function IconSlack({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.2 2.8A1.1 1.1 0 1 0 5 3.9V6.2h1.2ZM9.8 5A1.1 1.1 0 1 0 8.7 3.8H6.4V5ZM13.2 9.8A1.1 1.1 0 1 0 11 8.7V6.4h1.2ZM10 13.2A1.1 1.1 0 1 0 11.1 12H13.4v-1.2ZM3.9 6.2A1.1 1.1 0 1 0 5 5.1H7.3v1.1ZM2.8 10A1.1 1.1 0 1 0 3.9 11.1H6.2V10ZM6.2 13.2A1.1 1.1 0 1 0 7.3 12V9.7H6.2ZM9.8 2.8A1.1 1.1 0 1 0 8.7 3.9V6.2H9.8Z" fill="currentColor" />
    </svg>
  )
}

export function IconPuzzle({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6.2 3.2h3.6v1.4a1.2 1.2 0 1 0 1.6 0V3.2H13a.8.8 0 0 1 .8.8v2.2h-1.4a1.2 1.2 0 1 0 0 1.6H13.8V11a.8.8 0 0 1-.8.8H9.8v-1.3a1.2 1.2 0 1 0-1.6 0V11.8H6.2v-1.4a1.2 1.2 0 1 0-1.6 0v1.4H3.2A.8.8 0 0 1 2.4 11V8.8h1.4a1.2 1.2 0 1 0 0-1.6H2.4V4a.8.8 0 0 1 .8-.8h1.2v1.4a1.2 1.2 0 1 0 1.6 0V3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconUsers({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="6" cy="5.2" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.6 12.4c.3-2.2 1.7-3.4 3.4-3.4s3.1 1.2 3.4 3.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.2" cy="5.6" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.4 9.2c1.4.2 2.5 1.2 2.8 3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function IconNodes({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4.2" cy="4.4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.8" cy="4.8" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="11.4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.4 5.2 10.4 5.4M5.2 5.6 7.2 10.2M10.8 6 8.8 10.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function IconTrash({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.4 5.2h9.2M6.2 5.2V3.8h3.6v1.4M4.8 5.2l.6 7h5.2l.6-7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
