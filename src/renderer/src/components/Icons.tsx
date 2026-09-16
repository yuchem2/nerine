import type { JSX } from 'react'

interface IconProps {
  size?: number
}

const shape = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
} as const

export function ArrowLeftIcon({ size = 16 }: IconProps = {}): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <path d="M12.5 8h-9M7 3.5 2.5 8 7 12.5" />
    </svg>
  )
}

export function ArrowRightIcon({ size = 16 }: IconProps = {}): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <path d="M3.5 8h9M9 3.5 13.5 8 9 12.5" />
    </svg>
  )
}

export function ReloadIcon({ size = 16 }: IconProps = {}): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13 2v3h-3" />
    </svg>
  )
}

export function SparkIcon({ size = 16 }: IconProps = {}): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <path d="M9 2.5l1.3 3.2 3.2 1.3-3.2 1.3L9 11.5 7.7 8.3 4.5 7l3.2-1.3z" />
      <path d="M4 11l.6 1.4 1.4.6-1.4.6L4 15l-.6-1.4L2 13l1.4-.6z" />
    </svg>
  )
}

interface DockIconProps extends IconProps {
  side: 'left' | 'bottom' | 'right'
}

const DOCKED_PANEL: Record<DockIconProps['side'], string> = {
  left: 'M3 3h3.5v10H3z',
  bottom: 'M3 9.5h10V13H3z',
  right: 'M9.5 3H13v10H9.5z'
}

export function DockIcon({ size = 16, side }: DockIconProps): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="1.5" />
      <path d={DOCKED_PANEL[side]} fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CrossIcon({ size = 16 }: IconProps = {}): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function PlusIcon({ size = 16 }: IconProps = {}): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  )
}

export function MinusIcon({ size = 16 }: IconProps = {}): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <path d="M3.5 8h9" />
    </svg>
  )
}

interface ZoomIconProps extends IconProps {
  direction: 'in' | 'out'
}

/**
 * One element for both directions: swapping in a second icon component unmounts the
 * glass and the button blinks on the way between - and +.
 */
export function ZoomIcon({ size = 16, direction }: ZoomIconProps): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
      <path d="M5 7h4" />
      {direction === 'in' && <path d="M7 5v4" />}
    </svg>
  )
}

export function PageIcon({ size = 16 }: IconProps = {}): JSX.Element {
  return (
    <svg {...shape} width={size} height={size}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M2.5 8h11" />
      <path d="M8 2.5c1.5 1.7 2.3 3.5 2.3 5.5S9.5 11.8 8 13.5C6.5 11.8 5.7 10 5.7 8s.8-3.8 2.3-5.5Z" />
    </svg>
  )
}
