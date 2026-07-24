import { beforeEach, describe, expect, it } from 'vitest'
import type { Placement, StampAsset } from './types'
import { loadSavedAssets, saveAssets, updateAssetDefaultSize } from './assetStorage'
import { fitPlacementToTarget, mmToPt, ptToMm } from './utils'

const values = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
})

const makeAsset = (id: string, widthMm: number, heightMm: number): StampAsset => ({
  id,
  name: id,
  kind: 'signature',
  dataUrl: 'data:image/png;base64,test',
  pixelWidth: 400,
  pixelHeight: 200,
  widthMm,
  heightMm,
  createdAt: 1,
})

describe('asset default size storage', () => {
  beforeEach(() => values.clear())

  it('updates only the matched signature or stamp', () => {
    const assets = [makeAsset('signature-a', 42, 21), makeAsset('stamp-b', 40, 40)]
    const updated = updateAssetDefaultSize(assets, 'signature-a', 55, 27.5)

    expect(updated[0]).toMatchObject({ id: 'signature-a', widthMm: 55, heightMm: 27.5 })
    expect(updated[1]).toBe(assets[1])
  })

  it('persists each asset with its own default dimensions', () => {
    const assets = [makeAsset('signature-a', 55, 27.5), makeAsset('stamp-b', 38, 38)]

    expect(saveAssets(assets)).toBe(true)
    expect(loadSavedAssets().map(({ id, widthMm, heightMm }) => ({ id, widthMm, heightMm }))).toEqual([
      { id: 'signature-a', widthMm: 55, heightMm: 27.5 },
      { id: 'stamp-b', widthMm: 38, heightMm: 38 },
    ])
  })

  it('persists a fitted reference PDF size as the selected asset default', () => {
    const asset = makeAsset('reference-target', 35, 8.14)
    const placement: Placement = {
      id: 'placement-1',
      assetId: asset.id,
      pageIndex: 0,
      xPt: 0,
      yPt: 0,
      widthPt: mmToPt(asset.widthMm),
      heightPt: mmToPt(asset.heightMm),
      rotation: 0,
      opacity: 1,
    }
    const fitted = fitPlacementToTarget(placement, {
      xPt: 0,
      yPt: 0,
      widthPt: mmToPt(50),
      heightPt: mmToPt(20),
    })
    const [updated] = updateAssetDefaultSize(
      [asset],
      asset.id,
      ptToMm(fitted.widthPt),
      ptToMm(fitted.heightPt),
    )

    expect(updated.widthMm).toBeCloseTo(50, 8)
    expect(updated.heightMm).toBeCloseTo(50 / (35 / 8.14), 8)
  })

  it('repairs an older asset that has no saved height', () => {
    const { heightMm: _missingHeight, ...legacyAsset } = makeAsset('legacy', 42, 21)
    values.set('stamp-focus-assets-v1', JSON.stringify([legacyAsset]))

    expect(loadSavedAssets()[0]).toMatchObject({ widthMm: 42, heightMm: 21 })
  })
})
