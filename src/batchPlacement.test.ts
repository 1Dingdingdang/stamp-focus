import { describe, expect, it } from 'vitest'
import type { Placement } from './types'
import {
  isRepeatedPlacementDuplicate,
  parsePageSelection,
  projectPlacementToPage,
} from './batchPlacement'

const sourcePlacement: Placement = {
  id: 'source',
  assetId: 'signature-a',
  pageIndex: 0,
  xPt: 500,
  yPt: 730,
  widthPt: 80,
  heightPt: 40,
  rotation: -6,
  opacity: 0.82,
}

describe('batch page selection', () => {
  it('parses pages, ranges and Chinese separators without duplicates', () => {
    expect(parsePageSelection('2-4，4、7; 9 至 10', 12)).toEqual({
      pageIndices: [1, 2, 3, 6, 8, 9],
      invalidTokens: [],
    })
  })

  it('supports all, odd and even page shortcuts', () => {
    expect(parsePageSelection('全部页', 5).pageIndices).toEqual([0, 1, 2, 3, 4])
    expect(parsePageSelection('奇数页', 6).pageIndices).toEqual([0, 2, 4])
    expect(parsePageSelection('偶数页', 6).pageIndices).toEqual([1, 3, 5])
  })

  it('reports reversed, malformed and out-of-range entries', () => {
    expect(parsePageSelection('0, 6-3, abc, 12', 10)).toEqual({
      pageIndices: [],
      invalidTokens: ['0', '6-3', 'abc', '12'],
    })
  })
})

describe('batch placement projection', () => {
  it('keeps a corner signature at the same relative page position and physical size', () => {
    const projected = projectPlacementToPage(
      sourcePlacement,
      { widthPt: 600, heightPt: 800 },
      { widthPt: 700, heightPt: 900 },
      3,
    )

    expect(projected).toMatchObject({
      assetId: sourcePlacement.assetId,
      pageIndex: 3,
      widthPt: 80,
      heightPt: 40,
      rotation: -6,
      opacity: 0.82,
    })
    expect(projected.xPt).toBeCloseTo(620 * (500 / 520), 8)
    expect(projected.yPt).toBeCloseTo(860 * (730 / 760), 8)
  })

  it('detects the same asset already placed at the projected position', () => {
    const candidate = { ...sourcePlacement, id: 'candidate', pageIndex: 2 }
    const nearby = { ...candidate, id: 'nearby', xPt: candidate.xPt + 1, yPt: candidate.yPt - 1 }

    expect(isRepeatedPlacementDuplicate(candidate, [nearby])).toBe(true)
    expect(isRepeatedPlacementDuplicate(candidate, [{ ...nearby, assetId: 'other' }])).toBe(false)
  })
})
