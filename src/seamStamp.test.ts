import { describe, expect, it } from 'vitest'
import type { PageSize, Placement } from './types'
import { createSeamStampPlacements } from './seamStamp'

const source: Placement = {
  id: 'source',
  assetId: 'stamp',
  pageIndex: 0,
  xPt: 300,
  yPt: 320,
  widthPt: 120,
  heightPt: 120,
  rotation: 7,
  opacity: 0.8,
}

const sourcePageSize: PageSize = { widthPt: 600, heightPt: 800 }
const pageSizes = new Map<number, PageSize>([
  [0, sourcePageSize],
  [1, { widthPt: 600, heightPt: 800 }],
  [2, { widthPt: 720, heightPt: 1000 }],
])

describe('seam stamp placement planning', () => {
  it('splits the full stamp in page order and pins slices to the right edge', () => {
    const result = createSeamStampPlacements({
      source,
      sourcePageSize,
      targetPageIndices: [2, 0, 1],
      pageSizes,
      edge: 'right',
      reversed: false,
      groupId: 'seam-1',
    })

    expect(result).toHaveLength(3)
    expect(result.map((placement) => placement.pageIndex)).toEqual([0, 1, 2])
    expect(result.map((placement) => placement.imageCrop?.xRatio)).toEqual([0, 1 / 3, 2 / 3])
    expect(result.every((placement) => placement.widthPt === 40 && placement.heightPt === 120)).toBe(true)
    expect(result[0].xPt).toBe(560)
    expect(result[2].xPt).toBe(680)
    expect(result[0].yPt).toBe(320)
    expect(result[2].yPt).toBe(415)
    expect(result.every((placement) => placement.rotation === 0)).toBe(true)
    expect(result.every((placement) => placement.seam?.groupId === 'seam-1')).toBe(true)
  })

  it('supports the left edge and reversed image order', () => {
    const result = createSeamStampPlacements({
      source,
      sourcePageSize,
      targetPageIndices: [0, 1, 2],
      pageSizes,
      edge: 'left',
      reversed: true,
      groupId: 'seam-2',
    })

    expect(result.map((placement) => placement.xPt)).toEqual([0, 0, 0])
    expect(result.map((placement) => placement.imageCrop?.xRatio)).toEqual([2 / 3, 1 / 3, 0])
    expect(result.map((placement) => placement.seam?.index)).toEqual([0, 1, 2])
  })

  it('does not create a seam stamp for fewer than two pages', () => {
    expect(createSeamStampPlacements({
      source,
      sourcePageSize,
      targetPageIndices: [0],
      pageSizes,
      edge: 'right',
      reversed: false,
    })).toEqual([])
  })
})
