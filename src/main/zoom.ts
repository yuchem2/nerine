// The percentage shows on screen, so these are the familiar steps rather than 1.2^level.
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
// Chromium hands back the factor it was given, but a hair of float drift still breaks a compare.
const EPSILON = 0.001

export const DEFAULT_ZOOM = 1

/** The next step up or down from where the page is, or null at either end of the range. */
export function nextZoom(current: number, direction: 1 | -1): number | null {
  if (direction === 1) return STEPS.find((step) => step > current + EPSILON) ?? null

  const below = STEPS.filter((step) => step < current - EPSILON)
  return below.length === 0 ? null : below[below.length - 1]
}
