import type { ReactNode, SVGProps } from 'react'

/** 内联 SVG 图标（Lucide 风格，stroke=currentColor），零依赖 */
const PATHS: Record<string, ReactNode> = {
  folder: (
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3l1.5 2h5.5A1.5 1.5 0 0 1 16 8.5v6a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 3 14.5v-8Z" />
  ),
  'folder-open': (
    <>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3l1.5 2h5.5A1.5 1.5 0 0 1 16 8.5V9" />
      <path d="M3 9.5h13.5l-1.6 5.2a1.5 1.5 0 0 1-1.4 1.1H4.5A1.5 1.5 0 0 1 3 14.3V9.5Z" />
    </>
  ),
  file: (
    <>
      <path d="M8 2.5H5.5A1.5 1.5 0 0 0 4 4v11a1.5 1.5 0 0 0 1.5 1.5h8A1.5 1.5 0 0 0 15 15V6.5L8 2.5Z" />
      <path d="M8 2.5V7h4.5" />
    </>
  ),
  'file-text': (
    <>
      <path d="M8 2.5H5.5A1.5 1.5 0 0 0 4 4v11a1.5 1.5 0 0 0 1.5 1.5h8A1.5 1.5 0 0 0 15 15V6.5L8 2.5Z" />
      <path d="M8 2.5V7h4.5" />
      <path d="M6.5 10h6M6.5 12.5h6" />
    </>
  ),
  chevron: <path d="M6.5 4.5 10 8l-3.5 3.5" />,
  'chevron-down': <path d="m4.5 6.5 5 5 5-5" />,
  plus: <path d="M9.5 4v11M4 9.5h11" />,
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.5 12.5 3.5 3.5" />
    </>
  ),
  settings: (
    /* T022：改真齿轮（旧「圆+光芒」与主题切换太阳图标语义撞车）；heroicons cog 24→19 缩放 */
    <g transform="scale(0.8)">
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h1.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 0 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-1.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </g>
  ),
  terminal: (
    <>
      <rect x="2.5" y="3.5" width="14" height="12" rx="1.5" />
      <path d="m6 7.5 2.5 2.5L6 12.5M10.5 12.5H13" />
    </>
  ),
  diff: (
    <>
      <circle cx="5.5" cy="5" r="2" />
      <circle cx="5.5" cy="14" r="2" />
      <circle cx="13.5" cy="9.5" r="2" />
      <path d="M5.5 7v5M5.5 12.5c0 2 2.5 2 4 .5M13.5 7.5c0-2.5-2.5-3-4.5-3" />
    </>
  ),
  x: <path d="m5 5 9 9M14 5l-9 9" />,
  check: <path d="m4 10 3.5 3.5L15 6" />,
  copy: (
    <>
      <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
      <path d="M12.5 3.5h-8A1.5 1.5 0 0 0 3 5v8" />
    </>
  ),
  send: <path d="M9.5 15.5v-11M4.5 9l5-5 5 5" />,
  stop: <rect x="5" y="5" width="9" height="9" rx="1.5" fill="currentColor" stroke="none" />,
  alert: (
    <>
      <path d="M9.5 3 2.8 14.5a1 1 0 0 0 .9 1.5h11.6a1 1 0 0 0 .9-1.5L9.5 3Z" />
      <path d="M9.5 7.5v3.5M9.5 13.5v.01" />
    </>
  ),
  spark: <path d="M9.5 2.5 11 7l4.5 1.5L11 10l-1.5 4.5L8 10 3.5 8.5 8 7l1.5-4.5Z" />,
  wrench: (
    <path d="M12.8 3.2a3.6 3.6 0 0 0-4.6 4.6L3 13l2.8 2.8 5.2-5.2a3.6 3.6 0 0 0 4.6-4.6L13 8.6 10.4 6l2.4-2.8Z" />
  ),
  brain: (
    <>
      <path d="M8 4a2.5 2.5 0 0 0-2.5 2.5c-1.2.3-2 1.3-2 2.5 0 .9.5 1.7 1.2 2.2A2.5 2.5 0 0 0 7 15.6c.6.3 1.3-.1 1.3-.8V5.5A1.5 1.5 0 0 0 8 4Z" />
      <path d="M11 4a2.5 2.5 0 0 1 2.5 2.5c1.2.3 2 1.3 2 2.5 0 .9-.5 1.7-1.2 2.2a2.5 2.5 0 0 1-2.3 4.4c-.6.3-1.3-.1-1.3-.8V5.5A1.5 1.5 0 0 1 11 4Z" />
    </>
  ),
  list: (
    <>
      <path d="M6.5 5.5h10M6.5 9.5h10M6.5 13.5h10" />
      <path d="m3 5 .8.8L5.3 4M3 9l.8.8L5.3 8M3 13l.8.8 1.5-1.8" />
    </>
  ),
  clock: (
    <>
      <circle cx="9.5" cy="9.5" r="6.5" />
      <path d="M9.5 5.5v4l2.8 1.7" />
    </>
  ),
  external: (
    <>
      <path d="M8 4H5a1.5 1.5 0 0 0-1.5 1.5V14A1.5 1.5 0 0 0 5 15.5h8.5A1.5 1.5 0 0 0 15 14v-3" />
      <path d="M11 3.5h4.5V8M15.5 3.5 9 10" />
    </>
  ),
  refresh: <path d="M15.5 9.5a6 6 0 1 1-1.8-4.3M15.5 3v3h-3" />,
  save: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h6L15 6.5V14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 14V5.5" />
      <path d="M6.5 3.5V7h5V3.5M6.5 15.5V11h6v4.5" />
    </>
  ),
  message: (
    <path d="M16 11.5a1.5 1.5 0 0 1-1.5 1.5H7L3 16.5V4.5A1.5 1.5 0 0 1 4.5 3h10A1.5 1.5 0 0 1 16 4.5v7Z" />
  ),
  download: <path d="M9.5 3v9M5.5 8.5l4 4 4-4M3.5 15.5h12" />,
  eye: (
    <>
      <path d="M2.5 9.5S5 4.5 9.5 4.5 16.5 9.5 16.5 9.5 14 14.5 9.5 14.5 2.5 9.5 2.5 9.5Z" />
      <circle cx="9.5" cy="9.5" r="2.2" />
    </>
  ),
  zap: <path d="M10.5 2 4 10.5h4L8 17l6.5-8.5h-4l2-6.5Z" />,
  trash: <path d="M4 5.5h11M7 5.5V4h5v1.5M6 5.5l.8 10h5.4l.8-10" />,
  columns: (
    <>
      <rect x="2.5" y="3.5" width="5.5" height="12" rx="1" />
      <rect x="11" y="3.5" width="5.5" height="12" rx="1" />
    </>
  ),
  git: (
    <>
      <circle cx="5.5" cy="5" r="2" />
      <circle cx="5.5" cy="14" r="2" />
      <circle cx="13.5" cy="9.5" r="2" />
      <path d="M5.5 7v5M5.5 12c0 2 3 2.5 5 .5" />
    </>
  ),
  dot: <circle cx="9.5" cy="9.5" r="3.5" fill="currentColor" stroke="none" />,
  /* v3 新增 */
  history: (
    <>
      <path d="M3.5 9.5a6 6 0 1 1 1.8 4.3M3.5 9.5V5.5M3.5 9.5h4" />
      <path d="M9.5 6.5v3l2.2 1.3" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="13" height="11" rx="1.5" />
      <circle cx="7" cy="8" r="1.4" />
      <path d="m4.5 14 3.5-3.5 2.5 2.5 2-2 3 3" />
    </>
  ),
  attach: (
    <path d="m12 8.5-4.8 4.8a2.4 2.4 0 0 1-3.4-3.4l5.5-5.5a1.6 1.6 0 0 1 2.3 2.3l-5.2 5.2a.8.8 0 0 1-1.2-1.2l4.6-4.6" />
  ),
  command: (
    <path d="M6.5 6.5h6v6h-6zM6.5 6.5H5a1.5 1.5 0 1 1 1.5-1.5zm6 0H14A1.5 1.5 0 1 0 12.5 5zm0 6H14a1.5 1.5 0 1 1-1.5 1.5zm-6 0H5a1.5 1.5 0 1 0 1.5 1.5z" />
  ),
  'panel-right': (
    <>
      <rect x="2.5" y="3.5" width="14" height="12" rx="1.5" />
      <path d="M12 3.5v12" />
    </>
  ),
  'panel-left': (
    <>
      <rect x="2.5" y="3.5" width="14" height="12" rx="1.5" />
      <path d="M7 3.5v12" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="5" width="14" height="9.5" rx="1.5" />
      <path d="M5.5 8h.01M9.5 8h.01M13.5 8h.01M5.5 11.5h.01M13.5 11.5h.01M7.5 11.5h4" />
    </>
  ),
  branch: (
    <>
      <circle cx="5" cy="4.5" r="2" />
      <circle cx="5" cy="14.5" r="2" />
      <circle cx="14" cy="6.5" r="2" />
      <path d="M5 6.5v6M14 8.5c0 2.5-2.5 3-4.5 3" />
    </>
  ),
  plug: (
    <>
      <path d="M7 3.5v3M12 3.5v3M5.5 6.5h8V9a4 4 0 0 1-8 0zM9.5 13v2.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="9.5" cy="9.5" r="3.2" />
      <path d="M9.5 2.5v1.5M9.5 15v1.5M2.5 9.5H4M15 9.5h1.5M4.6 4.6l1 1M13.4 13.4l1 1M14.4 4.6l-1 1M5.6 13.4l-1 1" />
    </>
  ),
  moon: <path d="M15.5 11A6 6 0 0 1 8 3.5a6 6 0 1 0 7.5 7.5Z" />,
  /* T017：设置导航与 Routines 用图标（路径取自 claude-design 原型） */
  user: (
    <>
      <circle cx="9.5" cy="6.5" r="3" />
      <path d="M3.5 16c.6-3 3-4.5 6-4.5s5.4 1.5 6 4.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="8.5" width="11" height="7.5" rx="1.5" />
      <path d="M6.5 8.5V6a3 3 0 0 1 6 0v2.5" />
    </>
  ),
  chart: <path d="M4 15V8M9.5 15V4M15 15v-5" />,
  server: (
    <>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h10A1.5 1.5 0 0 1 16 6.5v8A1.5 1.5 0 0 1 14.5 16h-10A1.5 1.5 0 0 1 3 14.5v-8Z" />
      <path d="M3 9h13" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="14" height="9.5" rx="1.5" />
      <path d="M6 16h7" />
    </>
  ),
  play: <path d="M6 4.5 14 9.5 6 14.5Z" fill="currentColor" stroke="none" />,
  /* T026：归档（带盖收纳箱） */
  archive: (
    <>
      <rect x="2.5" y="3.5" width="14" height="4" rx="1" />
      <path d="M4 7.5v7A1.5 1.5 0 0 0 5.5 16h8a1.5 1.5 0 0 0 1.5-1.5v-7M7.5 10.5h4" />
    </>
  ),
  /* T025：行尾「更多」竖三点 */
  more: (
    <>
      <circle cx="9.5" cy="4.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="9.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="14.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  'arrow-up': <path d="M9.5 15.5v-11M4.5 9l5-5 5 5" />,
  'arrow-down': <path d="M9.5 3.5v11M4.5 10l5 5 5-5" />,
  bot: (
    <>
      <rect x="3.5" y="7" width="12" height="8" rx="1.5" />
      <path d="M9.5 7V4M9.5 4h3M7 10.5h.01M12 10.5h.01M7 13h5" />
    </>
  )
}

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 14,
  ...rest
}: { name: IconName | string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 19 19"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {PATHS[name as string] ?? PATHS.dot}
    </svg>
  )
}
