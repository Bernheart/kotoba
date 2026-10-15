import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 24, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconToday = (p: P) => (
  <Base {...p}>
    <path d="M3 10.5 12 4l9 6.5" />
    <path d="M5 9.5V20h14V9.5" />
    <circle cx="12" cy="14" r="2.5" />
  </Base>
)
export const IconStudy = (p: P) => (
  <Base {...p}>
    <rect x="6" y="4" width="13" height="15" rx="2.5" />
    <path d="M3.5 8v10a3 3 0 0 0 3 3h9" />
    <path d="M10 10.5h5M10 13.5h3" />
  </Base>
)
export const IconLibrary = (p: P) => (
  <Base {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
  </Base>
)
export const IconStats = (p: P) => (
  <Base {...p}>
    <path d="M4 20h16" />
    <rect x="5.5" y="11" width="3" height="6" rx="1" />
    <rect x="10.5" y="6" width="3" height="11" rx="1" />
    <rect x="15.5" y="13" width="3" height="4" rx="1" />
  </Base>
)
export const IconSettings = (p: P) => (
  <Base {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Base>
)
export const IconSpeaker = (p: P) => (
  <Base {...p}>
    <path d="M4 10v4h3.5L12 18V6L7.5 10z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
  </Base>
)
export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Base>
)
export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
)
export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)
export const IconChevron = (p: P) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
)
export const IconBack = (p: P) => (
  <Base {...p}>
    <path d="m15 6-6 6 6 6" />
  </Base>
)
export const IconFilter = (p: P) => (
  <Base {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Base>
)
export const IconFlame = (p: P) => (
  <Base {...p}>
    <path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-3.7-2.7-6-4.1-8.8-.5 2.2-1.6 3.3-2.9 3.9.3-2.4-.6-4.8-2.6-6.4.1 3.3-3.4 5.6-3.4 10.6C5.5 18.2 8 21 12 21z" />
  </Base>
)
export const IconUpload = (p: P) => (
  <Base {...p}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </Base>
)
export const IconDownload = (p: P) => (
  <Base {...p}>
    <path d="M12 4v12M7 11l5 5 5-5" />
    <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </Base>
)
export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
)
export const IconMic = (p: P) => (
  <Base {...p}>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </Base>
)
export const IconSync = (p: P) => (
  <Base {...p}>
    <path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L20 9.5M19.5 12a7.5 7.5 0 0 1-13 5.1L4 14.5" />
    <path d="M20 4.5v5h-5M4 19.5v-5h5" />
  </Base>
)
export const IconLeaf = (p: P) => (
  <Base {...p}>
    <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" />
    <path d="M5 19 13 11" />
  </Base>
)
export const IconEdit = (p: P) => (
  <Base {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Base>
)
export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
  </Base>
)
export const IconShuffle = (p: P) => (
  <Base {...p}>
    <path d="M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3.5M13 9.5c1-1.5 2-2.5 4-2.5h3" />
    <path d="m18 4 2.5 3L18 10M18 14l2.5 3L18 20" />
  </Base>
)
