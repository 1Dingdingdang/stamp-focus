import { describe, expect, it } from 'vitest'
import type { Placement } from './types'
import {
  fitPlacementToTarget,
  mmToPt,
  moveTargetRect,
  ptToMm,
  resizeTargetRect,
  zoomPercentToScale,
} from './utils'

describe('physical size conversion', () => {
  it('round-trips millimetres and PDF points', () => {
    expect(ptToMm(mmToPt(40))).toBeCloseTo(40, 8)
    expect(mmToPt(25.4)).toBeCloseTo(72, 8)
  })
})

describe('target fitting', () => {
  const placement: Placement = {
    id: 'p1',
    assetId: 'a1',
    pageIndex: 0,
    xPt: 0,
    yPt: 0,
    widthPt: 200,
    heightPt: 100,
    rotation: 0,
    opacity: 1,
  }

  it('centres and contains a wide signature', () => {
    const fitted = fitPlacementToTarget(placement, { xPt: 10, yPt: 20, widthPt: 100, heightPt: 80 })
    expect(fitted.widthPt).toBe(100)
    expect(fitted.heightPt).toBe(50)
    expect(fitted.xPt).toBe(10)
    expect(fitted.yPt).toBe(35)
  })
})

describe('zoom percentage input', () => {
  it('converts a typed percentage to a scale', () => {
    expect(zoomPercentToScale('175', 1)).toBe(1.75)
    expect(zoomPercentToScale(' 125% ', 1)).toBe(1.25)
  })

  it('clamps the supported range and keeps the fallback for invalid input', () => {
    expect(zoomPercentToScale('5', 1)).toBe(0.25)
    expect(zoomPercentToScale('900', 1)).toBe(4)
    expect(zoomPercentToScale('abc', 1.08)).toBe(1.08)
    expect(zoomPercentToScale('', 1.08)).toBe(1.08)
  })
})

describe('editable target frame', () => {
  const pageSize = { widthPt: 600, heightPt: 800 }
  const target = { xPt: 100, yPt: 150, widthPt: 200, heightPt: 120 }

  it('moves the whole frame and keeps it inside the page', () => {
    expect(moveTargetRect(target, 25, -40, pageSize)).toEqual({ ...target, xPt: 125, yPt: 110 })
    expect(moveTargetRect(target, 999, 999, pageSize)).toEqual({ ...target, xPt: 400, yPt: 680 })
  })

  it('resizes from edges and corners without crossing the minimum size', () => {
    expect(resizeTargetRect(target, 'se', 30, 20, pageSize)).toEqual({
      xPt: 100,
      yPt: 150,
      widthPt: 230,
      heightPt: 140,
    })
    expect(resizeTargetRect(target, 'nw', 500, 500, pageSize)).toEqual({
      xPt: 292,
      yPt: 262,
      widthPt: 8,
      heightPt: 8,
    })
  })
})
