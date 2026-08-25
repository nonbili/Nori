import type { ReactNode } from 'react'

// Mirrors the Material icons the Android app uses, so both clients read the same.
const paths: Record<string, ReactNode> = {
  bookmarks: (
    <path
      fill="currentColor"
      stroke="none"
      d="M19 18l2 1V3c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2h10c1.1 0 2 .9 2 2v13zM15 5H5c-1.1 0-2 .9-2 2v16l7-3 7 3V7c0-1.1-.9-2-2-2z"
    />
  ),
  bookmarkBorder: <path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" />,
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.7" />
      <path d="M4 4v4.7h4.7M12 7.5V12l3 1.8" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  add: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  searchOff: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4M4 20 20 4" />
    </>
  ),
  edit: (
    <>
      <path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16Z" />
      <path d="m14.7 6.5 3 3" />
    </>
  ),
  up: <path d="m7 14 5-5 5 5" />,
  down: <path d="m7 10 5 5 5-5" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4 10-10" />,
  checkbox: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m7.5 12 3 3 6-6" />
    </>
  ),
  checkboxEmpty: <rect x="4" y="4" width="16" height="16" rx="2" />,
  move: (
    <>
      <path d="M4 7h7l2 2h7v9H4z" />
      <path d="m11 13 2-2 2 2M13 11v5" />
    </>
  ),
  hide: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-2.1 3.1M6.6 6.6C4.3 8.1 3 12 3 12s3.5 7 9 7a9 9 0 0 0 3-.5" />
    </>
  ),
  show: (
    <>
      <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="m8 11 8-5M8 13l8 5" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  sort: <path d="M4 7h16M6 12h12M9 17h6" />,
  drag: <path d="M4 9h16M4 15h16" />,
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-1 .8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3Z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  translate: (
    <>
      <path d="M3 6h9M7.5 6v-2M9.5 6c0 4-3 7-6 8" />
      <path d="M5 10c1.5 2.5 3.5 4 6 4.6M13 20l4-9 4 9M14.6 17h4.8" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m5 17 4.5-5 3 3.2L15.5 12l3.5 5" />
      <circle cx="8.5" cy="9" r="1.2" />
    </>
  ),
  cloud: (
    <>
      <path d="M7 18a4 4 0 0 1-.4-8A6 6 0 0 1 18 10.5a3.75 3.75 0 0 1-.5 7.5H7Z" />
      <path d="m10 13 2-2 2 2M12 11v5" />
    </>
  ),
  upload: <path d="M12 20V8m-4 4 4-4 4 4M5 4h14" />,
  html: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M8 10v4M8 12h2.5M10.5 10v4M14 10v4h2.5M18.5 10v4" />
    </>
  ),
  text: <path d="M5 6h14M5 10h14M5 14h9M5 18h9" />,
  backup: (
    <>
      <path d="M12 3v10m-4-4 4 4 4-4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  code: <path d="m9 8-4 4 4 4m6-8 4 4-4 4" />,
  heart: <path d="M12 20s-7-4.4-7-9a3.9 3.9 0 0 1 7-2.4A3.9 3.9 0 0 1 19 11c0 4.6-7 9-7 9Z" />,
  external: <path d="M14 5h5v5M19 5l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  open: <path d="M5 12h13m-5-5 5 5-5 5" />,
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}
