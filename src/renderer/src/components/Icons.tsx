import type { JSX } from 'react'

const iconProps = {
  viewBox: '0 0 16 16',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
} as const

export function ArrowLeftIcon(): JSX.Element {
  return (
    <svg {...iconProps}>
      <path d="M12.5 8h-9M7 3.5 2.5 8 7 12.5" />
    </svg>
  )
}

export function ArrowRightIcon(): JSX.Element {
  return (
    <svg {...iconProps}>
      <path d="M3.5 8h9M9 3.5 13.5 8 9 12.5" />
    </svg>
  )
}

export function ReloadIcon(): JSX.Element {
  return (
    <svg {...iconProps}>
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13 2v3h-3" />
    </svg>
  )
}

export function StopIcon(): JSX.Element {
  return (
    <svg {...iconProps}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}
