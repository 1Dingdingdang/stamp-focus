import { beforeEach, describe, expect, it } from 'vitest'
import type { PageSize, Placement, StampAsset, StampTemplate } from './types'
import {
  createStampTemplate,
  instantiateStampTemplate,
  loadSavedTemplates,
  saveTemplates,
} from './templateStorage'
import { mmToPt, ptToMm } from './utils'

const values = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
})

const assets: StampAsset[] = [
  {
    id: 'stamp-a',
    name: '合同章',
    kind: 'stamp',
    dataUrl: 'data:image/png;base64,stamp',
    pixelWidth: 200,
    pixelHeight: 200,
    widthMm: 40,
    heightMm: 40,
    createdAt: 1,
  },
  {
    id: 'signature-b',
    name: '负责人签名',
    kind: 'signature',
    dataUrl: 'data:image/png;base64,signature',
    pixelWidth: 400,
    pixelHeight: 120,
    widthMm: 45,
    heightMm: 13.5,
    createdAt: 2,
  },
]

const pageSizes = new Map<number, PageSize>([
  [0, { widthPt: 600, heightPt: 800 }],
  [1, { widthPt: 600, heightPt: 800 }],
])

const placements: Placement[] = [
  {
    id: 'p1',
    assetId: 'stamp-a',
    pageIndex: 0,
    xPt: 300,
    yPt: 400,
    widthPt: mmToPt(40),
    heightPt: mmToPt(40),
    rotation: 5,
    opacity: 0.85,
  },
  {
    id: 'p2',
    assetId: 'signature-b',
    pageIndex: 1,
    xPt: 120,
    yPt: 640,
    widthPt: mmToPt(45),
    heightPt: mmToPt(13.5),
    rotation: -3,
    opacity: 1,
  },
]

describe('stamp template storage and application', () => {
  beforeEach(() => values.clear())

  it('captures multiple assets across pages and persists them', () => {
    const template = createStampTemplate({
      id: 'template-1',
      name: '采购审批范式',
      sourceFileName: '采购审批.pdf',
      sourcePageCount: 2,
      placements,
      assets,
      pageSizes,
      createdAt: 123,
    })

    expect(template?.placements).toHaveLength(2)
    expect(saveTemplates([template!])).toBe(true)
    expect(loadSavedTemplates()).toEqual([template])
  })

  it('keeps physical size while adapting positions to a different page size', () => {
    const template = createStampTemplate({
      id: 'template-1',
      name: '采购审批范式',
      sourceFileName: '采购审批.pdf',
      sourcePageCount: 2,
      placements,
      assets,
      pageSizes,
    })!
    const largerPages = new Map<number, PageSize>([
      [0, { widthPt: 1200, heightPt: 1600 }],
      [1, { widthPt: 1200, heightPt: 1600 }],
    ])

    const applied = instantiateStampTemplate(template, assets, largerPages)

    expect(applied.placements).toHaveLength(2)
    expect(applied.placements[0].xPt).toBe(600)
    expect(applied.placements[0].yPt).toBe(800)
    expect(ptToMm(applied.placements[0].widthPt)).toBeCloseTo(40, 8)
    expect(applied.placements[0]).toMatchObject({ rotation: 5, opacity: 0.85 })
  })

  it('preserves a cropped riding-seam slice in a saved template', () => {
    const seamPlacement: Placement = {
      ...placements[0],
      widthPt: mmToPt(10),
      imageCrop: { xRatio: 0.25, yRatio: 0, widthRatio: 0.25, heightRatio: 1 },
      seam: { groupId: 'seam-group', index: 1, count: 4, edge: 'right', reversed: false },
    }
    const template = createStampTemplate({
      id: 'template-seam',
      name: '骑缝章范式',
      sourceFileName: '合同.pdf',
      sourcePageCount: 2,
      placements: [seamPlacement],
      assets,
      pageSizes,
    })!

    expect(template.placements[0].imageCrop).toEqual(seamPlacement.imageCrop)
    expect(template.placements[0].seam).toEqual(seamPlacement.seam)
    const applied = instantiateStampTemplate(template, assets, pageSizes)
    expect(applied.placements[0].imageCrop).toEqual(seamPlacement.imageCrop)
    expect(applied.placements[0].seam).toEqual(seamPlacement.seam)
  })

  it('falls back to matching asset name and reports missing assets or pages', () => {
    const template: StampTemplate = {
      id: 'template-1',
      name: '范式',
      sourceFileName: 'source.pdf',
      sourcePageCount: 3,
      createdAt: 1,
      updatedAt: 1,
      placements: [
        {
          assetId: 'old-signature-id',
          assetName: '负责人签名',
          assetKind: 'signature',
          pageIndex: 0,
          xRatio: 0.2,
          yRatio: 0.3,
          widthMm: 45,
          heightMm: 13.5,
          rotation: 0,
          opacity: 1,
        },
        {
          assetId: 'missing-stamp',
          assetName: '缺少的章',
          assetKind: 'stamp',
          pageIndex: 0,
          xRatio: 0.4,
          yRatio: 0.5,
          widthMm: 40,
          heightMm: 40,
          rotation: 0,
          opacity: 1,
        },
        {
          assetId: 'stamp-a',
          assetName: '合同章',
          assetKind: 'stamp',
          pageIndex: 2,
          xRatio: 0.4,
          yRatio: 0.5,
          widthMm: 40,
          heightMm: 40,
          rotation: 0,
          opacity: 1,
        },
      ],
    }

    const applied = instantiateStampTemplate(template, assets, new Map([[0, pageSizes.get(0)!]]))

    expect(applied.placements).toHaveLength(1)
    expect(applied.placements[0].assetId).toBe('signature-b')
    expect(applied.missingAssets).toEqual(['缺少的章'])
    expect(applied.missingPages).toEqual([3])
  })
})
