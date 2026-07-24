import type { PageSize, Placement, TargetRect, TargetResizeHandle } from './types'

export const MM_PER_INCH = 25.4
export const PDF_POINTS_PER_INCH = 72
export const MIN_ZOOM_PERCENT = 25
export const MAX_ZOOM_PERCENT = 400

export const mmToPt = (mm: number) => (mm / MM_PER_INCH) * PDF_POINTS_PER_INCH
export const ptToMm = (pt: number) => (pt / PDF_POINTS_PER_INCH) * MM_PER_INCH

export const roundTo = (value: number, places = 1) => {
  const power = 10 ** places
  return Math.round((value + Number.EPSILON) * power) / power
}

export const zoomPercentToScale = (value: string, fallbackScale: number) => {
  const normalized = value.trim().replace(/%$/, '').trim()
  if (!normalized) return fallbackScale
  const percentage = Number(normalized)
  if (!Number.isFinite(percentage)) return fallbackScale
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, percentage)) / 100
}

export const normalizeAngle = (angle: number) => {
  const normalized = angle % 360
  return normalized < -180 ? normalized + 360 : normalized > 180 ? normalized - 360 : normalized
}

export const fitPlacementToTarget = (
  placement: Placement,
  target: TargetRect,
  insetRatio = 0,
): Placement => {
  const availableWidth = target.widthPt * (1 - insetRatio * 2)
  const availableHeight = target.heightPt * (1 - insetRatio * 2)
  const ratio = placement.widthPt / placement.heightPt

  let widthPt = availableWidth
  let heightPt = widthPt / ratio
  if (heightPt > availableHeight) {
    heightPt = availableHeight
    widthPt = heightPt * ratio
  }

  return {
    ...placement,
    xPt: target.xPt + (target.widthPt - widthPt) / 2,
    yPt: target.yPt + (target.heightPt - heightPt) / 2,
    widthPt,
    heightPt,
  }
}

export const moveTargetRect = (
  target: TargetRect,
  deltaXPt: number,
  deltaYPt: number,
  pageSize: PageSize,
): TargetRect => ({
  ...target,
  xPt: Math.min(Math.max(0, pageSize.widthPt - target.widthPt), Math.max(0, target.xPt + deltaXPt)),
  yPt: Math.min(Math.max(0, pageSize.heightPt - target.heightPt), Math.max(0, target.yPt + deltaYPt)),
})

export const resizeTargetRect = (
  target: TargetRect,
  handle: TargetResizeHandle,
  deltaXPt: number,
  deltaYPt: number,
  pageSize: PageSize,
  minimumSizePt = 8,
): TargetRect => {
  let left = target.xPt
  let top = target.yPt
  let right = target.xPt + target.widthPt
  let bottom = target.yPt + target.heightPt

  if (handle.includes('w')) left = Math.min(right - minimumSizePt, Math.max(0, left + deltaXPt))
  if (handle.includes('e')) right = Math.max(left + minimumSizePt, Math.min(pageSize.widthPt, right + deltaXPt))
  if (handle.includes('n')) top = Math.min(bottom - minimumSizePt, Math.max(0, top + deltaYPt))
  if (handle.includes('s')) bottom = Math.max(top + minimumSizePt, Math.min(pageSize.heightPt, bottom + deltaYPt))

  return {
    xPt: left,
    yPt: top,
    widthPt: right - left,
    heightPt: bottom - top,
  }
}

export const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const dataUrlToUint8Array = (dataUrl: string) => {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export const formatMm = (points: number) => `${roundTo(ptToMm(points), 1)} mm`
